const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { submissionsQueue } = require('../config/queue');
const jwt = require('jsonwebtoken');
const { submitBurstLimiter, submitSustainedLimiter } = require('../middleware/rateLimiter');
const { enforceExamIP } = require('../middleware/cidrCheck');
const problemRepo = require('../repositories/problemRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const submissionRepo = require('../repositories/submissionRepository');

const router = express.Router();

// Helper: extract user_id from JWT (optional auth)
const extractUserId = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      return decoded.id;
    } catch {
      return null;
    }
  }
  return null;
};

// Allowed Judge0 language IDs (C++, Java, Python3, JavaScript, C, Go, Rust, TypeScript)
const ALLOWED_LANGUAGE_IDS = new Set([50, 51, 52, 54, 62, 63, 71, 72, 73, 74, 75, 76]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CODE_BYTES = 64 * 1024; // 64 KB
const MAX_INPUT_BYTES = 8 * 1024; // 8 KB

// POST /api/submit — enqueue submission
router.post('/submit', submitBurstLimiter, submitSustainedLimiter, enforceExamIP, async (req, res) => {
  try {
    const { source_code, language_id, problem_id, custom_input, contest_id, assignment_id } = req.body;

    if (!source_code || !language_id || !problem_id) {
      return res.status(400).json({ success: false, error: 'source_code, language_id, and problem_id are required' });
    }
    if (contest_id && !UUID_RE.test(String(contest_id))) {
      return res.status(400).json({ success: false, error: 'Invalid contest_id format.' });
    }
    if (assignment_id && !UUID_RE.test(String(assignment_id))) {
      return res.status(400).json({ success: false, error: 'Invalid assignment_id format.' });
    }
    if (typeof source_code !== 'string' || Buffer.byteLength(source_code, 'utf8') > MAX_CODE_BYTES) {
      return res.status(400).json({ success: false, error: 'source_code exceeds 64 KB limit.' });
    }
    if (!ALLOWED_LANGUAGE_IDS.has(Number(language_id))) {
      return res.status(400).json({ success: false, error: 'Unsupported language_id.' });
    }
    if (!UUID_RE.test(String(problem_id))) {
      return res.status(400).json({ success: false, error: 'Invalid problem_id format.' });
    }
    if (custom_input && typeof custom_input === 'string' && Buffer.byteLength(custom_input, 'utf8') > MAX_INPUT_BYTES) {
      return res.status(400).json({ success: false, error: 'custom_input exceeds 8 KB limit.' });
    }

    const user_id = extractUserId(req);
    const jobId = uuidv4();

    try {
      await submissionsQueue.add('judge-submission', {
        jobId, source_code, language_id, problem_id, user_id,
        custom_input: custom_input || null,
        contest_id: custom_input ? null : (contest_id || null),
        // Only graded submits (not custom runs) are recorded against an assignment/exam.
        assignment_id: custom_input ? null : (assignment_id || null),
      }, { jobId });
    } catch (queueErr) {
      console.error('Queue add failed:', queueErr.message);
      // Distinguish "Redis/queue is offline" from "queue is full" so the user
      // gets an accurate message (retrying won't help if the queue is down).
      const offline = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connection is closed|stream isn'?t writeable|enableofflinequeue/i
        .test(queueErr.message || '');
      return res.status(503).json({
        success: false,
        queue_full: !offline,
        error: offline
          ? 'The submission service is offline — the job queue (Redis) is unreachable. Please ensure the backend services are running and try again.'
          : 'The judge is currently overloaded. Please try again in a moment.',
      });
    }

    return res.json({ success: true, jobId, message: 'Submission queued successfully' });
  } catch (error) {
    console.error('Queueing Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to queue submission' });
  }
});

// NOTE: the GET /api/submit/status/:jobId polling endpoint was removed —
// verdicts are now delivered in real time via Socket.IO job rooms.

// GET /api/submit/history/:problemId — per-problem submission history for current user
router.get('/submit/history/:problemId', async (req, res) => {
  try {
    const user_id = extractUserId(req);
    if (!user_id) return res.json({ success: true, data: [] });

    const subs = (await submissionRepo.listByUserAndProblem(user_id, req.params.problemId))
      .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0))
      .slice(0, 20)
      .map(s => ({
        id: s.id, verdict: s.verdict, language: s.language, runtime: s.runtime, memory: s.memory,
        submitted_at: s.submittedAt?.toDate?.() ?? s.submittedAt, code: s.code,
      }));

    res.json({ success: true, data: subs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/submissions?scope=graded|practice|all — submission history (last 50).
// Default `graded`: only submissions made under an assignment/exam (assignment_id set),
// so students see assessed work rather than every practice run.
router.get('/submissions', async (req, res) => {
  try {
    const user_id = extractUserId(req);
    if (!user_id) return res.json({ success: true, data: [] });

    const scope = ['graded', 'practice', 'all'].includes(req.query.scope) ? req.query.scope : 'graded';

    let subs = await submissionRepo.listByUser(user_id);
    if (scope === 'graded') subs = subs.filter(s => s.assignmentId != null);
    else if (scope === 'practice') subs = subs.filter(s => s.assignmentId == null);
    subs = subs
      .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0))
      .slice(0, 50);

    const problemsMap = await problemRepo.getMapByIds(subs.map(s => s.problemId));
    const assignmentIds = [...new Set(subs.map(s => s.assignmentId).filter(Boolean))];
    const assignmentsMap = new Map((await Promise.all(assignmentIds.map(id => assignmentRepo.getById(id)))).filter(Boolean).map(a => [a.id, a]));
    const data = subs.map(s => ({
      id: s.id, verdict: s.verdict, language: s.language, runtime: s.runtime, memory: s.memory,
      submitted_at: s.submittedAt?.toDate?.() ?? s.submittedAt,
      problem_id: s.problemId, assignment_id: s.assignmentId,
      problem_title: problemsMap.get(s.problemId)?.title || 'Unknown',
      assignment_title: s.assignmentId ? (assignmentsMap.get(s.assignmentId)?.title || 'Unknown') : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
