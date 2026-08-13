const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const c = require('../controllers/classroom.controller');

const router = express.Router();
router.use(protect);

router.get('/', c.listClassrooms);                 // role-aware (faculty: own; student: enrolled)
router.post('/join', c.joinClassroom);             // students enroll by code
router.post('/', facultyStaff, c.createClassroom);
router.get('/:id/members', facultyStaff, c.getMembers);

module.exports = router;
