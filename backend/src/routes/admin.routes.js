// The Admin's own routes. Everything here is Admin only, whatever the method.
const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const c = require('../controllers/admin.controller');

const perAddress = (req) => ipKeyGenerator(req.ip || '');
const perPerson = (req) => req.user?.id || ipKeyGenerator(req.ip || '');
const limiter = ({ windowMs, limit, message, key = perPerson }) => rateLimit({
  windowMs, limit, keyGenerator: key, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', error: message },
});
// In front of sign-in checking, by address, then a per-person limit once signed in.
const beforeSignIn = limiter({ windowMs: 60 * 1000, limit: 600, key: perAddress, message: 'Too many requests from this network. Wait a minute and try again.' });
const general = limiter({ windowMs: 60 * 1000, limit: 180, message: 'Too many requests. Wait a minute and try again.' });
// Things that send email or read a lot are held much tighter.
const heavy = limiter({ windowMs: 10 * 60 * 1000, limit: 30, message: 'That takes a lot of work for the server. Wait a few minutes before running it again.' });
const mailing = limiter({ windowMs: 10 * 60 * 1000, limit: 20, message: 'Too many emails sent in a short time. Wait a few minutes.' });

const router = express.Router();
router.use(beforeSignIn);
router.use(protect);
router.use(authorize('admin'));
router.use(general);

router.get('/overview', heavy, c.overview);

// People: one account at a time, never in bulk.
router.get('/people', c.listPeople);
router.post('/people', mailing, c.createAccount);
router.get('/people/:id', c.getPerson);
router.post('/people/:id/reset-link', mailing, c.sendResetLink);
router.post('/people/:id/disabled', c.setDisabled);
router.post('/people/:id/role', c.changeRole);
router.post('/people/:id/department', c.changeDepartment);

router.get('/settings', c.getSettings);
router.put('/settings', c.saveSettings);

router.get('/audit', heavy, c.listAudit);
router.get('/audit/export', heavy, c.exportAudit);
router.get('/logins', c.recentLogins);

// Health: the judge connection, the self-check (running it is a heavy read, so it is held tight), and problem reports.
router.get('/health', c.health);
router.post('/health/self-check', heavy, c.runSelfCheck);
router.get('/problem-reports', c.listReports);
router.post('/problem-reports/:id/status', c.setReportStatus);

module.exports = router;
