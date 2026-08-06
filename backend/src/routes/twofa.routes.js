const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth.middleware');
const {
  setup2FA,
  enable2FA,
  disable2FA,
  verify2FA,
} = require('../controllers/twofa.controller');

const router = express.Router();

// Throttle the public verification / OAuth endpoints to slow down brute force.
const twofaLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  prefix: 'twofa',
  message: 'Too many attempts, please try again after 15 minutes.',
});

// Authenticated management endpoints.
router.post('/setup', protect, setup2FA);
router.post('/enable', protect, enable2FA);
router.post('/disable', protect, disable2FA);

// Public login-flow endpoint.
router.post('/verify', twofaLimiter, verify2FA);

module.exports = router;
