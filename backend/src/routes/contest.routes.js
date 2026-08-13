const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const { requirePermission } = require('../middleware/permissions');
const c = require('../controllers/contest.controller');

const router = express.Router();

// ── Public (authenticated) ────────────────────────────────────────────────────
router.get('/',          protect, c.listContests);
router.get('/:id',       protect, c.getContest);
router.post('/:id/register',         protect, c.register);
router.get('/:id/scoreboard',        protect, c.getScoreboard);
router.post('/:id/virtual',          protect, c.startVirtual);
router.get('/:id/virtual/scoreboard', protect, c.getVirtualScoreboard);

// ── Teaching staff only ───────────────────────────────────────────────────────
router.post('/',
  protect, facultyStaff, requirePermission('manage_contests'),
  c.createContest
);
router.patch('/:id/scoreboard-mode',
  protect, facultyStaff, requirePermission('manage_contests'),
  c.updateScoreboardMode
);

module.exports = router;
