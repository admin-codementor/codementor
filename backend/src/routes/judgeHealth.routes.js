const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const { getHealth } = require('../controllers/judgeHealth.controller');

const router = express.Router();

// GET /api/judge-health — teaching staff only
router.get('/', protect, facultyStaff, getHealth);

module.exports = router;
