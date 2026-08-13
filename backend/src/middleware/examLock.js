// Blocks AI assistance while a student is sitting a graded exam.
//
// Finding F26 (docs/scale-readiness/14-ai-features.md §14.3): nothing in
// ai.routes.js checked exam context, so a student in a proctored assessment could
// ask the tutor for help. Without this guard the AI tutor is a cheating tool with
// a login.
//
// Two layers, because the client cannot be trusted to declare its own exam state:
//   1. Explicit — the request names an assignment that is a currently-live exam.
//   2. Implicit — the student has an `exam_start` proctor event for a live exam
//      and no later `auto_submit` for it, i.e. they are in an exam right now.
// Layer 2 is what makes the guard real: layer 1 alone is bypassed by omitting the
// assignment id.
const assignmentRepo = require('../repositories/assignmentRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// An exam still inside its window. A past deadline means the exam is over and
// there is nothing left to protect.
const isLiveExam = (assignment) => {
  if (!assignment || assignment.isExam !== true) return false;
  const deadline = toMillis(assignment.deadline);
  return deadline == null || deadline > Date.now();
};

// Returns the live exam the requester is currently sitting, or null.
async function findActiveExam(req) {
  const explicitId = req.body?.assignmentId || req.body?.assignment_id || req.query?.assignmentId;
  if (explicitId) {
    const assignment = await assignmentRepo.getById(String(explicitId));
    if (isLiveExam(assignment)) return assignment;
  }

  const starts = await proctorEventRepo.listByUserAndType(req.user.id, 'exam_start');
  if (starts.length === 0) return null;

  const submits = await proctorEventRepo.listByUserAndType(req.user.id, 'auto_submit');
  const lastSubmitAt = new Map();
  for (const s of submits) {
    if (!s.assignmentId) continue;
    const at = toMillis(s.createdAt) ?? 0;
    if (at > (lastSubmitAt.get(s.assignmentId) ?? 0)) lastSubmitAt.set(s.assignmentId, at);
  }

  // `starts` is newest-first, so the first unfinished live exam wins.
  const checked = new Set();
  for (const start of starts) {
    const assignmentId = start.assignmentId;
    if (!assignmentId || checked.has(assignmentId)) continue;
    checked.add(assignmentId);

    const startedAt = toMillis(start.createdAt) ?? 0;
    if ((lastSubmitAt.get(assignmentId) ?? 0) > startedAt) continue; // already submitted

    const assignment = await assignmentRepo.getById(assignmentId);
    if (isLiveExam(assignment)) return assignment;
  }
  return null;
}

// Express middleware. Faculty/admin/HOD are never blocked — they use the AI tools
// for authoring, not for sitting exams.
const blockDuringExam = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'student') return next();

    const exam = await findActiveExam(req);
    if (exam) {
      return res.status(403).json({
        success: false,
        error: 'AI assistance is disabled during a graded exam.',
        code: 'EXAM_IN_PROGRESS',
      });
    }
    next();
  } catch (e) {
    // Fail closed: if we cannot prove the student is *not* in an exam, deny.
    // A student losing tutor access for one request is a far smaller problem than
    // AI help leaking into a graded assessment.
    console.error('Exam lock check failed:', e.message);
    res.status(503).json({
      success: false,
      error: 'Could not verify exam status — AI assistance is unavailable right now.',
      code: 'EXAM_CHECK_FAILED',
    });
  }
};

module.exports = { blockDuringExam, findActiveExam, isLiveExam };
