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
  getProblemLearning,
  getProblemPerformance,
  getProblemTime,
  listMyReopenRequests,
  createReopenRequest,
  addProblemTime,
  getStats,
  getSkills
} = require('../controllers/student.controller');
const { setActiveRoadmap } = require('../controllers/roadmaps.controller');
const { getJobReadiness } = require('../controllers/jobReadiness.controller');
const { getSettings, updateSettings } = require('../controllers/publicProfile.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { blockDuringExam } = require('../middleware/examLock');
const portfolio = require('../controllers/portfolio.controller');

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
// Hints are help: switched off, like the AI tutor, while a graded exam is in progress.
router.get('/problems/:id/learning', blockDuringExam, getProblemLearning);
router.get('/problems/:id/performance', getProblemPerformance);
router.get('/problems/:id/time', getProblemTime);
router.get('/reopen-requests', listMyReopenRequests);
router.post('/reopen-requests', createReopenRequest);
router.post('/problems/:id/time', addProblemTime);
router.put('/profile', updateProfile);
// Lives with the student's own settings rather than under /api/roadmaps: it
// writes to the user, not to a roadmap.
router.put('/active-roadmap', setActiveRoadmap);
// The student's own view of their public link. The page itself is served by
// /api/public/profile/:handle, which takes no token.
router.get('/public-profile', getSettings);
router.put('/public-profile', updateSettings);

// A student's own portfolio (certifications, projects, achievements). Students only,
// and every handler scopes to the caller's own id.
router.get('/portfolio', authorize('student'), portfolio.list);
router.post('/portfolio', authorize('student'), portfolio.create);
router.patch('/portfolio/:id', authorize('student'), portfolio.update);
router.delete('/portfolio/:id', authorize('student'), portfolio.remove);

module.exports = router;
