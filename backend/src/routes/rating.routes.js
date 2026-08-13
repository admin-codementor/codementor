const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const { requirePermission } = require('../middleware/permissions');
const c = require('../controllers/rating.controller');

const router = express.Router();

// All rating routes require an authenticated user.
router.use(protect);

// ── Teaching staff: recompute ratings for a finished contest ───────────────────
router.post('/contest/:id/recompute',
  facultyStaff,
  requirePermission('manage_contests'),
  c.recomputeForContest
);

// ── Public (authenticated) ─────────────────────────────────────────────────────
router.get('/leaderboard', c.getRatingLeaderboard);
router.get('/user/:userId', c.getUserRating);

module.exports = router;
