const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { authorize, facultyStaff } = require('../middleware/role.middleware');
const c = require('../controllers/academic.controller');

const router = express.Router();
router.use(protect);

const hodAdmin = authorize('hod', 'admin');
const adminOnly = authorize('admin');

// Terms: staff read them, the Admin creates and activates them.
router.get('/terms', facultyStaff, c.listTerms);
router.post('/terms', adminOnly, c.createTerm);
router.post('/terms/:termId/activate', adminOnly, c.activateTerm);

// Classes and who is in them (HOD for their department, Admin for all; the service checks the department).
router.get('/terms/:termId/classes', hodAdmin, c.listClasses);
router.post('/terms/:termId/generate', hodAdmin, c.generateClasses);
router.post('/terms/:termId/placements', hodAdmin, c.importPlacements);
router.post('/terms/:termId/electives', hodAdmin, c.createElective);
router.get('/terms/:termId/consistency', hodAdmin, c.consistency);
router.get('/classes/:classId/roster', hodAdmin, c.classRoster);
router.post('/classes/:classId/students', hodAdmin, c.moveStudent);
router.put('/classes/:classId/teacher', hodAdmin, c.setClassTeacher);
router.put('/classes/:classId/sub-mentors', hodAdmin, c.setSubMentors);
router.post('/classes/:classId/assignments', hodAdmin, c.assignTeacher);
router.post('/assignments/:assignmentId/reallocate', hodAdmin, c.reallocate);
router.post('/assignments/:assignmentId/end', hodAdmin, c.endAssignment);

// A student's own class, and a faculty member's own classes.
router.get('/me', authorize('student'), c.myClass);
router.get('/my-classes', authorize('faculty', 'hod'), c.myClasses);

// Access requests: faculty ask, HOD or Admin decide.
router.post('/requests', authorize('faculty'), c.requestAccess);
router.get('/requests', facultyStaff, c.listRequests);
router.post('/requests/:requestId/decide', hodAdmin, c.decideRequest);

module.exports = router;
