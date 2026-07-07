const express = require('express');
const { getCourses, getCourseById } = require('../controllers/courses.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Read-only course catalogue for students. Course authoring (create/update) will
// live under authenticated faculty routes later.
router.use(protect);

router.get('/', getCourses);
router.get('/:id', getCourseById);

module.exports = router;
