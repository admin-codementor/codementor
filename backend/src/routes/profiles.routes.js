const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth.middleware');
const c = require('../controllers/profiles.controller');

const router = express.Router();
router.use(protect);

// Live syncs hit external APIs — cap per user to be a good citizen.
const syncLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  prefix: 'profiles:sync',
  keyGenerator: (req) => req.user?.id || 'anon',
  message: 'Too many syncs. Please wait a few minutes.',
});

router.get('/me', c.getMine);
router.put('/me', c.setHandle);
router.post('/me/sync', syncLimiter, c.syncMine);
router.get('/leaderboard', c.getLeaderboard);

module.exports = router;
