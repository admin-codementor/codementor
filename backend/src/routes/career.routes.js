const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { blockDuringExam } = require('../middleware/examLock');
const { createLimiter } = require('../middleware/rateLimiter');
const career = require('../controllers/career.controller');

const router = express.Router();

// A mock interview is 5 questions and a scorecard: 12 AI calls a minute is generous for one person and stops a loop.
const interviewLimiter = createLimiter({
  windowMs: 60 * 1000, max: 12, prefix: 'career-interview',
  keyGenerator: (req) => `user:${req.user?.id || req.ip}`,
  message: 'Too many interview requests. Please wait a moment.',
});

router.use(protect, authorize('student'));

router.get('/me', career.getMine);
router.post('/resume', career.checkResume);
router.post('/interview/next', interviewLimiter, blockDuringExam, career.nextQuestion);
router.post('/interview/finish', interviewLimiter, blockDuringExam, career.finishInterview);

module.exports = router;
