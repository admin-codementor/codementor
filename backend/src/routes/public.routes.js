const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { publicRoute } = require('../middleware/routeGuard');
const { getPublicProfile } = require('../controllers/publicProfile.controller');
const { summariseCspReport } = require('../utils/cspReport');

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

// Browsers post Content-Security-Policy violations here (report-only for now). No login can be attached to a browser's own report,
// so it is public, limited per address, size-capped, and answered with nothing; only a short, query-free line is logged.
const cspReportLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  prefix: 'public:csp-report',
  message: 'Too many reports.',
});
router.post(
  '/csp-report',
  publicRoute('browser Content-Security-Policy violation reports — no data returned, one safe line logged'),
  cspReportLimiter,
  express.json({ type: ['application/json', 'application/csp-report', 'application/reports+json'], limit: '16kb' }),
  (req, res) => {
    const r = summariseCspReport(req.body);
    if (r) console.warn('[CSP]', JSON.stringify(r));
    res.status(204).end();
  },
);

module.exports = router;
