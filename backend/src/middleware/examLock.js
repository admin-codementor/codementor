// Blocks AI assistance while a student is sitting a graded exam.
//
// Finding F26 (docs/scale-readiness/14-ai-features.md §14.3): nothing in
// ai.routes.js checked exam context, so a student in a proctored assessment could
// ask the tutor for help. Without this guard the AI tutor is a cheating tool with
// a login.
//
// Two layers, because the client cannot be trusted to declare its own exam state:
//   1. Explicit — the request names an assignment/exam that is currently live.
//   2. Implicit — the student has an `exam_start` proctor event for a live
//      assignment/exam and no later `auto_submit` for it, i.e. they are in it now.
// Layer 2 is what makes the guard real: layer 1 alone is bypassed by omitting the id.
//
// Two DIFFERENT exam concepts feed this, kept explicit throughout rather than
// merged into one shape:
//   - "exam assignment" — the older `assignments` collection's `isExam: true` flag
//     (a single coding assignment marked proctored).
//   - "Exam" (capital) — the newer multi-section `exams` collection. A student
//     sitting an Exam's coding section is proctored for the WHOLE exam, not just
//     while the IDE tab is open, so this needs the same implicit-detection layer.
const assignmentRepo = require('../repositories/assignmentRepository');
const examRepo = require('../repositories/examRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// An exam assignment still inside its window. A past deadline means the exam is
// over and there is nothing left to protect.
const isLiveExamAssignment = (assignment) => {
  if (!assignment || assignment.isExam !== true) return false;
  const deadline = toMillis(assignment.deadline);
  return deadline == null || deadline > Date.now();
};

// An Exam (exams collection) still inside its window. Publish state isn't
// re-checked here: a student who legitimately started before an unpublish
// shouldn't lose the AI lock mid-attempt just because faculty pulled it down.
const isLiveExamDoc = (exam) => {
  if (!exam) return false;
  const end = toMillis(exam.windowEnd);
  return end == null || end > Date.now();
};

// Returns the live exam (either kind) the requester is currently sitting, as
// { kind: 'assignment' | 'exam', doc }, or null.
async function findActiveExam(req) {
  const explicitAssignmentId = req.body?.assignmentId || req.body?.assignment_id || req.query?.assignmentId;
  if (explicitAssignmentId) {
    const assignment = await assignmentRepo.getById(String(explicitAssignmentId));
    if (isLiveExamAssignment(assignment)) return { kind: 'assignment', doc: assignment };
  }
  const explicitExamId = req.body?.examId || req.body?.exam_id || req.query?.examId;
  if (explicitExamId) {
    const exam = await examRepo.getById(String(explicitExamId));
    if (isLiveExamDoc(exam)) return { kind: 'exam', doc: exam };
  }

  const starts = await proctorEventRepo.listByUserAndType(req.user.id, 'exam_start');
  if (starts.length === 0) return null;

  const submits = await proctorEventRepo.listByUserAndType(req.user.id, 'auto_submit');
  const lastSubmitAt = new Map();
  for (const s of submits) {
    const key = s.examId ? `exam:${s.examId}` : s.assignmentId ? `assignment:${s.assignmentId}` : null;
    if (!key) continue;
    const at = toMillis(s.createdAt) ?? 0;
    if (at > (lastSubmitAt.get(key) ?? 0)) lastSubmitAt.set(key, at);
  }

  // `starts` is newest-first, so the first unfinished live exam wins.
  const checked = new Set();
  for (const start of starts) {
    const key = start.examId ? `exam:${start.examId}` : start.assignmentId ? `assignment:${start.assignmentId}` : null;
    if (!key || checked.has(key)) continue;
    checked.add(key);

    const startedAt = toMillis(start.createdAt) ?? 0;
    if ((lastSubmitAt.get(key) ?? 0) > startedAt) continue; // already submitted

    if (start.examId) {
      const exam = await examRepo.getById(start.examId);
      if (isLiveExamDoc(exam)) return { kind: 'exam', doc: exam };
    } else if (start.assignmentId) {
      const assignment = await assignmentRepo.getById(start.assignmentId);
      if (isLiveExamAssignment(assignment)) return { kind: 'assignment', doc: assignment };
    }
  }
  return null;
}

// Express middleware. Faculty/admin/HOD are never blocked — they use the AI tools
// for authoring, not for sitting exams.
const blockDuringExam = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'student') return next();

    const active = await findActiveExam(req);
    if (active) {
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

module.exports = { blockDuringExam, findActiveExam, isLiveExamAssignment, isLiveExamDoc };
