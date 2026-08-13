const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const { exportProblemPdf, exportQuestionPaper, exportClassReport } = require('../controllers/pdfExport.controller');

const router = express.Router();

// Teaching staff only — export problems and question papers as PDF.
router.get('/problems/:id/pdf', protect, facultyStaff, exportProblemPdf);
router.post('/question-paper', protect, facultyStaff, exportQuestionPaper);
router.get('/class-report', protect, facultyStaff, exportClassReport);

module.exports = router;
