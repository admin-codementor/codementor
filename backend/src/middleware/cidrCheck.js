const assignmentRepo = require('../repositories/assignmentRepository');
const examRepo = require('../repositories/examRepository');

// Convert IPv4 address string to a 32-bit integer.
function ipToInt(ip) {
  // Handle IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4 = ip.replace(/^::ffff:/, '');
  const parts = v4.split('.');
  if (parts.length !== 4) return null;
  return parts.reduce((acc, octet) => {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255) throw new Error('Invalid IP');
    return (acc << 8) | n;
  }, 0) >>> 0;
}

// Returns true if ip falls within the CIDR block (e.g. "192.168.1.0/24").
function ipInCIDR(ip, cidr) {
  try {
    const [range, bits] = cidr.split('/');
    const mask = bits === undefined ? 32 : parseInt(bits, 10);
    if (isNaN(mask) || mask < 0 || mask > 32) return false;
    const ipInt = ipToInt(ip);
    const rangeInt = ipToInt(range);
    if (ipInt === null || rangeInt === null) return false;
    const shift = 32 - mask;
    return (ipInt >>> shift) === (rangeInt >>> shift);
  } catch {
    return false;
  }
}

// Returns true if the IP is allowed by at least one CIDR in the list.
// An empty list means no restriction (allow all).
function isAllowed(ip, cidrs) {
  if (!cidrs || cidrs.length === 0) return true;
  return cidrs.some(c => ipInCIDR(ip, c.trim()));
}

// Validate a CIDR string (used in assignment creation).
function validateCIDR(cidr) {
  const [ip, bits] = cidr.split('/');
  if (!ip) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  if (!parts.every(p => /^\d+$/.test(p) && +p >= 0 && +p <= 255)) return false;
  if (bits !== undefined) {
    const n = parseInt(bits, 10);
    if (isNaN(n) || n < 0 || n > 32) return false;
  }
  return true;
}

// Shared window/CIDR check once a target doc (assignment or Exam) is loaded.
// `deadline` is the moment submissions close for that doc — an assignment's
// `deadline`, or an Exam's `windowEnd`.
function checkWindowAndCidr(res, { deadline, allowedCidrs, closedMessage }, req) {
  if (deadline && new Date() > new Date(deadline)) {
    res.status(403).json({ success: false, error: closedMessage, exam_closed: true });
    return false;
  }
  if (allowedCidrs && allowedCidrs.length > 0) {
    const clientIP = req.ip || req.socket?.remoteAddress || '';
    if (!isAllowed(clientIP, allowedCidrs)) {
      res.status(403).json({
        success: false,
        error: 'Submissions for this exam are restricted to the designated network. Connect to the exam network and try again.',
        ip_restricted: true,
      });
      return false;
    }
  }
  return true;
}

// Express middleware — enforces exam integrity at submit time (server-side):
//   1. Exam window: rejects submissions after the deadline/window close.
//   2. IP allowlist: rejects submissions from outside the designated CIDR blocks.
// Attach to the submit route AFTER the user is authenticated.
//
// Expects req.body.assignment_id (exam assignments) and/or req.body.exam_id
// (multi-section Exams, from a coding section's deep-link submit) — the client
// sends at most one, for whichever context this submission belongs to. Plain
// practice submissions omit both and are skipped entirely.
//
// IMPORTANT: once either id IS supplied we are in a graded context, so we FAIL
// CLOSED on a DB error — a database blip must not silently disable exam
// restrictions. (Practice submissions with neither id are unaffected.)
async function enforceExamIP(req, res, next) {
  const { assignment_id, exam_id } = req.body;
  if (!assignment_id && !exam_id) return next(); // plain practice submission — skip

  try {
    if (assignment_id) {
      const assignment = await assignmentRepo.getById(assignment_id);
      if (assignment) {
        // Deadline-closed only applies to exam assignments (isExam) — an
        // ordinary assignment past its deadline is handled elsewhere (late
        // submission policy), not here. The CIDR allowlist, if configured,
        // still applies regardless of isExam — unchanged from before this
        // function also learned about the exams collection.
        const deadline = assignment.isExam ? (assignment.deadline?.toDate?.() ?? assignment.deadline) : null;
        if (!checkWindowAndCidr(res, { deadline, allowedCidrs: assignment.allowedCidrs, closedMessage: 'This exam has ended. Submissions are closed.' }, req)) return;
      } // unknown assignment — let the controller handle it
    }

    if (exam_id) {
      const exam = await examRepo.getById(exam_id);
      if (!exam) return next(); // unknown exam — let the controller handle it
      const windowEnd = exam.windowEnd?.toDate?.() ?? exam.windowEnd;
      if (!checkWindowAndCidr(res, { deadline: windowEnd, allowedCidrs: exam.allowedCidrs, closedMessage: 'This exam’s window has closed. Submissions are no longer accepted.' }, req)) return;
    }
  } catch (e) {
    console.error('Exam access check DB error:', e.message);
    return res.status(503).json({
      success: false,
      error: 'Unable to verify exam access right now. Please try again in a moment.',
    });
  }

  next();
}

module.exports = { enforceExamIP, isAllowed, validateCIDR };
