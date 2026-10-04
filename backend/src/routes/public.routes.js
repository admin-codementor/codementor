const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { publicRoute } = require('../middleware/routeGuard');
const { getPublicProfile } = require('../controllers/publicProfile.controller');

const router = express.Router();

// The only unauthenticated data route in the app. It reads a student's whole
// submission history to build the page, so it is capped well below what a
// person clicking a link could ever need — enough for a recruiter opening a few
// profiles, not enough to walk the handle space or to be used as a scraper's
// free API.
const publicProfileLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  prefix: 'public:profile',
  message: 'Too many requests. Please slow down.',
});

router.get(
  '/profile/:handle',
  publicRoute('published student profiles — the shareable link, verified data only'),
  publicProfileLimiter,
  getPublicProfile,
);

module.exports = router;
