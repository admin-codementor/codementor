const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff, examSupport } = require('../middleware/role.middleware');
const { createLimiter } = require('../middleware/rateLimiter');
const c = require('../controllers/exam.controller');

// Sending integrity mail again is rare; a hard limit keeps a stuck button from mailing a student over and over.
const resendLimiter = createLimiter({ windowMs: 60 * 1000, max: 10, prefix: 'exam-integrity-resend', keyGenerator: (req) => req.user?.id || 'anon', message: 'Too many resend attempts. Wait a minute.' });

const router = express.Router();
router.use(protect);

// ── Student endpoints ────────────────────────────────────────────────────────
// '/available' must be registered before the faculty 'GET /:id' below —
// otherwise Express would treat "available" as an :id.
router.get('/available', c.listAvailable);
router.get('/:id/instructions', c.getInstructions);
router.post('/:id/start', c.startAttempt);
router.get('/:id/attempt', c.getAttemptState);
router.patch('/:id/attempt/questions/:qid', c.answerQuestion);
router.patch('/:id/attempt/visit/:qid', c.markVisited);
router.post('/:id/submit', c.submitExam);

// ── Faculty/HOD/admin endpoints ──────────────────────────────────────────────
router.get('/', examSupport, c.listExams);
router.post('/', facultyStaff, c.createExam);
router.get('/:id', facultyStaff, c.getExamFaculty);
router.put('/:id', facultyStaff, c.updateExam);
router.patch('/:id/publish', facultyStaff, c.publishExam);
router.delete('/:id', facultyStaff, c.deleteExam);

router.post('/:id/sections', facultyStaff, c.createSection);
// 'reorder' must be registered before the ':sid' routes below, or it would be
// swallowed as a section id.
router.put('/:id/sections/reorder', facultyStaff, c.reorderSections);
router.put('/:id/sections/:sid', facultyStaff, c.updateSection);
router.delete('/:id/sections/:sid', facultyStaff, c.deleteSection);
router.put('/:id/sections/:sid/questions', facultyStaff, c.setSectionQuestions);
router.put('/:id/sections/:sid/problems', facultyStaff, c.attachProblems);

router.get('/:id/roster', examSupport, c.getRoster);
router.post('/:id/attempts/:userId/reopen', examSupport, c.reopenAttempt);
router.get('/:id/integrity', facultyStaff, c.getIntegrity);
router.post('/:id/integrity/:userId/resend', facultyStaff, resendLimiter, c.resendIntegrity);
router.get('/:id/results', facultyStaff, c.getResults);
router.get('/:id/results/:userId', facultyStaff, c.getAttemptDetail);

module.exports = router;
