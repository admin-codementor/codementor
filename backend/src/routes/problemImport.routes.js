const express = require('express');
const multer = require('multer');
const { createLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth.middleware');
const { facultyStaff } = require('../middleware/role.middleware');
const { requirePermission } = require('../middleware/permissions');
const c = require('../controllers/problemImport.controller');
const { importZip, upload, uploadDoc } = c;

const router = express.Router();

// ZIP imports parse archives and write many rows — cap per faculty to prevent abuse.
const importLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  prefix: 'problemImport',
  keyGenerator: (req) => req.user?.id || 'anon',
  message: 'Too many imports. Please wait a few minutes before importing again.',
});

// Wrap multer so its errors (file too large, wrong type) become clean JSON
// responses instead of being swallowed by the generic error handler.
const wrapUpload = (uploader, sizeMessage) => (req, res, next) => {
  uploader.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError
          ? err.code === 'LIMIT_FILE_SIZE'
            ? sizeMessage
            : `Upload error: ${err.message}`
          : err.message || 'Upload failed';
      return res.status(400).json({ success: false, error: message });
    }
    next();
  });
};

const handleUpload = wrapUpload(upload, 'ZIP file is too large (max 20 MB).');
// The parse endpoint accepts a file OR a pasted-text JSON body, so the file is
// optional here — the controller decides which path was used.
const handleDocUpload = wrapUpload(uploadDoc, 'File is too large (max 10 MB).');

// POST /api/problem-import/zip — teaching staff with manage_problems may import.
router.post(
  '/zip',
  protect,
  facultyStaff,
  requirePermission('manage_problems'),
  importLimiter,
  handleUpload,
  importZip
);

// ── Staged import: parse → review → commit ───────────────────────────────────
// Nothing here publishes to the live catalogue except /commit.
const staff = [protect, facultyStaff, requirePermission('manage_problems')];

router.post('/parse', ...staff, importLimiter, handleDocUpload, c.parseImport);
router.get('/drafts', ...staff, c.listDrafts);
router.patch('/drafts/:id', ...staff, c.updateDraft);
router.delete('/drafts/:id', ...staff, c.deleteDraft);
router.post('/commit', ...staff, c.commitDrafts);

module.exports = router;
