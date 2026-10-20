const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { getCalendar } = require('../controllers/calendar.controller');

const router = express.Router();
router.use(protect);

// GET /api/calendar?from=ISO&to=ISO — dated things for the signed-in user (students: set for them; staff: what they run).
router.get('/', getCalendar);

module.exports = router;
