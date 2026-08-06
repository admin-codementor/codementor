const express = require('express');
const multer = require('multer');
const { createLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { requirePermission } = require('../middleware/permissions');
const { importZip, upload } = require('../controllers/problemImport.controller');

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
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError
          ? err.code === 'LIMIT_FILE_SIZE'
            ? 'ZIP file is too large (max 20 MB).'
            : `Upload error: ${err.message}`
          : err.message || 'Upload failed';
      return res.status(400).json({ success: false, error: message });
    }
    next();
  });
};

// POST /api/problem-import/zip — faculty/admin with manage_problems may import.
router.post(
  '/zip',
  protect,
  authorize('faculty', 'admin'),
  requirePermission('manage_problems'),
  importLimiter,
  handleUpload,
  importZip
);

module.exports = router;
