// Training & Placement. T&P and the Admin manage; an HOD reads their own department; a student sees and applies to their own drives.
const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const c = require('../controllers/placement.controller');

// Same layering as the academic routes: a generous per-address limit in front of the sign-in check, then a per-person limit.
const perAddress = (req) => ipKeyGenerator(req.ip || '');
const perPerson = (req) => req.user?.id || ipKeyGenerator(req.ip || '');
const limiter = ({ windowMs, limit, message, key = perPerson }) => rateLimit({
  windowMs, limit, keyGenerator: key, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', error: message },
});
const beforeSignIn = limiter({ windowMs: 60 * 1000, limit: 1500, key: perAddress, message: 'Too many requests from this network. Wait a minute and try again.' });
const general = limiter({ windowMs: 60 * 1000, limit: 240, message: 'Too many requests. Wait a minute and try again.' });
// Reading every student, or applying a long list, is limited much harder.
const heavy = limiter({ windowMs: 10 * 60 * 1000, limit: 30, message: 'That takes a lot of work for the server. Wait a few minutes before running it again.' });
// A drive opens and a whole year applies within minutes, so students get their own, more generous, limit for applying.
const applying = limiter({ windowMs: 60 * 1000, limit: 30, message: 'Too many applications in a short time. Wait a minute and try again.' });

const router = express.Router();
router.use(beforeSignIn);
router.use(protect);
router.use(general);

const manager = authorize('tnp', 'admin');
const staffRead = authorize('tnp', 'admin', 'hod');
const student = authorize('student');

// A student's own page.
router.get('/me', student, c.myPlacements);
router.post('/me/drives/:id/apply', student, applying, c.apply);
router.delete('/me/drives/:id/apply', student, applying, c.withdraw);

// Drives: T&P and Admin change them, an HOD reads their department's.
router.get('/drives', staffRead, c.listDrives);
router.post('/drives', manager, c.createDrive);
router.get('/drives/:id', staffRead, c.getDrive);
router.patch('/drives/:id', manager, c.updateDrive);
router.delete('/drives/:id', manager, c.deleteDrive);
router.put('/drives/:id/applications', manager, c.saveApplications);
router.post('/drives/:id/notify', manager, heavy, c.notify);

router.get('/meta', staffRead, c.meta);
router.get('/analytics', staffRead, heavy, c.analytics);
router.get('/readiness', staffRead, heavy, require('../controllers/career.controller').getReadiness);

// CGPA and backlogs.
router.get('/records', staffRead, c.listRecords);
router.post('/records/preview', manager, heavy, c.previewRecords);
router.post('/records', manager, heavy, c.applyRecords);
router.get('/records/batches', manager, c.listBatches);
router.post('/records/batches/:id/rollback', manager, heavy, c.rollbackBatch);

// Applications made outside the portal.
router.get('/outside', staffRead, c.listOutside);
router.post('/outside', manager, c.createOutside);
router.patch('/outside/:id', manager, c.updateOutside);
router.delete('/outside/:id', manager, c.removeOutside);

// Export.
router.get('/export/fields', manager, c.exportFields);
router.post('/export', manager, heavy, c.exportStudents);

module.exports = router;
