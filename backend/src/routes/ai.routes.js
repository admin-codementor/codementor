const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { blockDuringExam } = require('../middleware/examLock');
const aiController = require('../controllers/ai.controller');
const aiAccess = require('../middleware/aiAccess');

// A plain per-person ceiling in front of everything else on these routes (the finer limit and the college's AI switch follow it).
const aiCeiling = rateLimit({
  windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || ''),
  message: { success: false, code: 'RATE_LIMITED', error: 'Too many AI requests. Please wait a moment.' },
});

const aiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  prefix: 'ai',
  keyGenerator: (req) => `user:${req.user?.id || req.ip}`, // runs after protect; a class shares one IP
  message: 'Too many AI requests. Please wait a moment.',
});

// Every AI endpoint is exam-locked (finding F26). The history route is included
// deliberately: replaying an earlier conversation during an exam is the same leak
// as starting a new one.
router.post('/tutor', authMiddleware.protect, aiCeiling, aiLimiter, aiAccess, blockDuringExam, aiController.askTutor);
router.get('/tutor/:problemId', authMiddleware.protect, aiCeiling, blockDuringExam, aiController.getHistory);
router.post('/explain-error', authMiddleware.protect, aiCeiling, aiLimiter, aiAccess, blockDuringExam, aiController.explainError);
router.post('/review-code', authMiddleware.protect, aiCeiling, aiLimiter, aiAccess, blockDuringExam, aiController.reviewCode);

module.exports = router;
