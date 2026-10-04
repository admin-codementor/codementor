const express = require('express');
const { listRoadmaps, getRoadmap } = require('../controllers/roadmaps.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Read-only for now. Authoring moves here when faculty and T&P get their own
// phases; the content already lives as data rather than code for that reason.
router.use(protect);

router.get('/', listRoadmaps);
router.get('/:id', getRoadmap);

module.exports = router;
