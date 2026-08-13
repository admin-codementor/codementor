const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { blockDuringExam } = require('../middleware/examLock');
const aiController = require('../controllers/ai.controller');

const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  prefix: 'ai',
  message: 'Too many AI requests. Please wait a moment.',
});

// Every AI endpoint is exam-locked (finding F26). The history route is included
// deliberately: replaying an earlier conversation during an exam is the same leak
// as starting a new one.
router.post('/tutor', authMiddleware.protect, aiLimiter, blockDuringExam, aiController.askTutor);
router.get('/tutor/:problemId', authMiddleware.protect, blockDuringExam, aiController.getHistory);
router.post('/explain-error', authMiddleware.protect, aiLimiter, blockDuringExam, aiController.explainError);
router.post('/review-code', authMiddleware.protect, aiLimiter, blockDuringExam, aiController.reviewCode);

module.exports = router;
