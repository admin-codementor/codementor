const express = require('express');
const {
  getDashboardData,
  getAssignments,
  getNotifications,
  getRecommendations,
  getLeaderboard,
  getSolvedProblems,
  getSolvedHistory,
  getMistakes,
  saveMistakeNote,
  getDailyChallenge,
  updateProfile,
  getPlacementReadiness,
  getBadges,
  getProblemSolutions,
  getStats,
  getSkills
} = require('../controllers/student.controller');
const { setActiveRoadmap } = require('../controllers/roadmaps.controller');
const { getJobReadiness } = require('../controllers/jobReadiness.controller');
const { getSettings, updateSettings } = require('../controllers/publicProfile.controller');
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
router.get('/solved', getSolvedHistory);
router.get('/mistakes', getMistakes);
router.put('/mistakes/:problemId/note', saveMistakeNote);
router.get('/daily-challenge', getDailyChallenge);
router.get('/placement', getPlacementReadiness);
router.get('/job-ready', getJobReadiness);
router.get('/badges', getBadges);
router.get('/problems/:id/solutions', getProblemSolutions);
router.put('/profile', updateProfile);
// Lives with the student's own settings rather than under /api/roadmaps: it
// writes to the user, not to a roadmap.
router.put('/active-roadmap', setActiveRoadmap);
// The student's own view of their public link. The page itself is served by
// /api/public/profile/:handle, which takes no token.
router.get('/public-profile', getSettings);
router.put('/public-profile', updateSettings);

module.exports = router;
