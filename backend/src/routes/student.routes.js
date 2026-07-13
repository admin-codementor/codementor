const express = require('express');
const {
  getDashboardData,
  getAssignments,
  getNotifications,
  getRecommendations,
  getLeaderboard,
  getSolvedProblems,
  getDailyChallenge,
  updateProfile,
  getPlacementReadiness,
  getBadges,
  getProblemSolutions,
  getStats,
  getSkills
} = require('../controllers/student.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboardData);
router.get('/stats', getStats);
router.get('/skills', getSkills);
router.get('/assignments', getAssignments);
router.get('/notifications', getNotifications);
router.get('/recommendations', getRecommendations);
router.get('/leaderboard', getLeaderboard);
router.get('/solved-problems', getSolvedProblems);
router.get('/daily-challenge', getDailyChallenge);
router.get('/placement', getPlacementReadiness);
router.get('/badges', getBadges);
router.get('/problems/:id/solutions', getProblemSolutions);
router.put('/profile', updateProfile);

module.exports = router;
