const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const c = require('../controllers/mcq.controller');

const router = express.Router();
router.use(protect);

// ── Student endpoints ───────────────────────────────────────────────────────────
router.get('/available', c.listAvailable);
router.get('/:id/start', c.startTest);
router.post('/:id/submit', c.submitTest);

// ── Faculty/HOD/admin endpoints ─────────────────────────────────────────────────
router.get('/tests', facultyStaff, c.listTests);
router.post('/tests', facultyStaff, c.createTest);
router.get('/tests/:id', facultyStaff, c.getTestFaculty);
router.put('/tests/:id', facultyStaff, c.updateTest);
router.put('/tests/:id/questions', facultyStaff, c.setQuestions);
router.patch('/tests/:id/publish', facultyStaff, c.publishTest);
router.delete('/tests/:id', facultyStaff, c.deleteTest);
router.get('/tests/:id/results', facultyStaff, c.getResults);

module.exports = router;
