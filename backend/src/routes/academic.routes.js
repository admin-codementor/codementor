const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { authorize, facultyStaff } = require('../middleware/role.middleware');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const c = require('../controllers/academic.controller');

// Limits on top of the app-wide one (middleware/rateLimiter.js), per signed-in person. Per API copy, in memory.
const perPerson = (req) => req.user?.id || ipKeyGenerator(req.ip || '');
const limiter = ({ windowMs, limit, message }) => rateLimit({
  windowMs, limit, keyGenerator: perPerson, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', error: message },
});
// Everything on these routes: generous, for a HOD working through a screen.
const general = limiter({ windowMs: 60 * 1000, limit: 240, message: 'Too many requests. Wait a minute and try again.' });
// Building a department's classes or applying an uploaded list reads every student, so it is limited much harder.
const heavy = limiter({ windowMs: 10 * 60 * 1000, limit: 12, message: 'That takes a lot of work for the server. Wait a few minutes before running it again.' });

const router = express.Router();
router.use(protect);
router.use(general);

const hodAdmin = authorize('hod', 'admin');
const adminOnly = authorize('admin');

// Terms: staff read them, the Admin creates and activates them.
router.get('/terms', facultyStaff, c.listTerms);
router.post('/terms', adminOnly, c.createTerm);
router.post('/terms/:termId/activate', adminOnly, c.activateTerm);

// Classes and who is in them (HOD for their department, Admin for all; the service checks the department).
router.get('/terms/:termId/classes', hodAdmin, c.listClasses);
router.post('/terms/:termId/generate', hodAdmin, heavy, c.generateClasses);
router.post('/terms/:termId/placements', hodAdmin, heavy, c.importPlacements);
router.post('/terms/:termId/electives', hodAdmin, c.createElective);
router.get('/terms/:termId/consistency', hodAdmin, c.consistency);
router.get('/classes/:classId/roster', hodAdmin, c.classRoster);
router.post('/classes/:classId/students', hodAdmin, c.moveStudent);
router.put('/classes/:classId/teacher', hodAdmin, c.setClassTeacher);
router.put('/classes/:classId/sub-mentors', hodAdmin, c.setSubMentors);
router.post('/classes/:classId/assignments', hodAdmin, c.assignTeacher);
router.post('/assignments/:assignmentId/reallocate', hodAdmin, c.reallocate);
router.post('/assignments/:assignmentId/end', hodAdmin, c.endAssignment);

// People and classes to pick from.
router.get('/staff', hodAdmin, c.listStaff);
router.get('/class-directory', authorize('faculty', 'hod'), c.classDirectory);

// A student's own class, and a faculty member's own classes.
router.get('/me', authorize('student'), c.myClass);
router.get('/my-classes', authorize('faculty', 'hod'), c.myClasses);

// Access requests: faculty ask, HOD or Admin decide.
router.post('/requests', authorize('faculty'), c.requestAccess);
router.get('/requests', facultyStaff, c.listRequests);
router.post('/requests/:requestId/decide', hodAdmin, c.decideRequest);

module.exports = router;
