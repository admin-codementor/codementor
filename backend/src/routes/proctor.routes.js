const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const c = require('../controllers/proctor.controller');

const router = express.Router();
router.use(protect);

router.post('/event', c.recordEvent);
router.get('/assignment/:id', facultyStaff, c.getAssignmentReport);

module.exports = router;
