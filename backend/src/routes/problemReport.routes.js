// "Report a problem": any signed-in person may send one from an error screen. A few an hour each, so it cannot be used to fill the database.
const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const reports = require('../services/problemReportService');
const { logAction } = require('../middleware/audit');

const perAddress = (req) => ipKeyGenerator(req.ip || '');
const perPerson = (req) => req.user?.id || ipKeyGenerator(req.ip || '');
const limiter = ({ windowMs, limit, message, key = perPerson }) => rateLimit({
  windowMs, limit, keyGenerator: key, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', error: message },
});
const beforeSignIn = limiter({ windowMs: 60 * 1000, limit: 600, key: perAddress, message: 'Too many requests from this network. Wait a minute and try again.' });
const fewAnHour = limiter({ windowMs: 60 * 60 * 1000, limit: 6, message: 'You have sent several reports already. Please wait a while before sending another.' });

const router = express.Router();
router.use(beforeSignIn);
router.use(protect);

router.post('/', fewAnHour, async (req, res) => {
  try {
    const out = await reports.submit(req.user, req.body);
    logAction(req, 'problem.report', `reference ${out.requestId || 'none'}`);
    res.status(201).json({ success: true, data: out });
  } catch (e) {
    if (e instanceof reports.ReportError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });
    console.error('problem report error:', String(e?.message || e).slice(0, 160));
    res.status(500).json({ success: false, error: 'Your report could not be sent just now. Please try again in a minute.' });
  }
});

module.exports = router;
