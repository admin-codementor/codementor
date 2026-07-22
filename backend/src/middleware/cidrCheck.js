const assignmentRepo = require('../repositories/assignmentRepository');

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

// Express middleware — enforces exam integrity at submit time (server-side):
//   1. Exam window: rejects submissions after the deadline for exam assignments.
//   2. IP allowlist: rejects submissions from outside the designated CIDR blocks.
// Attach to the submit route AFTER the user is authenticated.
//
// Expects req.body.assignment_id, which the client sends ONLY for assignment/exam
// submissions. Plain practice submissions omit it and are skipped entirely.
//
// IMPORTANT: when an assignment_id IS supplied we are in an exam/assignment context,
// so we FAIL CLOSED on a DB error — a database blip must not silently disable exam
// restrictions. (Practice submissions without assignment_id are unaffected.)
async function enforceExamIP(req, res, next) {
  const { assignment_id } = req.body;
  if (!assignment_id) return next(); // not an assignment/exam submission — skip

  let assignment;
  try {
    assignment = await assignmentRepo.getById(assignment_id);
  } catch (e) {
    console.error('Exam access check DB error:', e.message);
    return res.status(503).json({
      success: false,
      error: 'Unable to verify exam access right now. Please try again in a moment.',
    });
  }

  if (!assignment) return next(); // unknown assignment — let the controller handle it

  const allowed_cidrs = assignment.allowedCidrs;
  const is_exam = assignment.isExam;
  const deadline = assignment.deadline?.toDate?.() ?? assignment.deadline;

  // 1. Exam window — closed after the deadline.
  if (is_exam && deadline && new Date() > new Date(deadline)) {
    return res.status(403).json({
      success: false,
      error: 'This exam has ended. Submissions are closed.',
      exam_closed: true,
    });
  }

  // 2. IP allowlist (applies whenever CIDRs are configured).
  if (allowed_cidrs && allowed_cidrs.length > 0) {
    const clientIP = req.ip || req.socket?.remoteAddress || '';
    if (!isAllowed(clientIP, allowed_cidrs)) {
      return res.status(403).json({
        success: false,
        error: 'Submissions for this exam are restricted to the designated network. Connect to the exam network and try again.',
        ip_restricted: true,
      });
    }
  }

  next();
}

module.exports = { enforceExamIP, isAllowed, validateCIDR };
