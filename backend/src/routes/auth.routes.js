const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { publicRoute } = require('../middleware/routeGuard');
const { refresh } = require('../controllers/auth.controller');
const { firebaseLogin } = require('../controllers/firebaseAuth.controller');
const { setPassword } = require('../controllers/password.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Sign-in. Wrong passwords never reach this route (Firebase checks them and throttles them itself); this
// receives a valid Firebase token. Per IP, so it has to allow a class signing in together from one campus address.
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  prefix: 'auth',
  message: 'Too many attempts, please try again after 15 minutes.',
});

// Tokens issued to a class at the same moment expire at the same moment, so they all refresh together.
const refreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
  prefix: 'auth:refresh',
  message: 'Too many refresh attempts.',
});

router.post('/refresh', publicRoute('exchanges a refresh token for an access token — the caller has no access token yet'), refreshLimiter, refresh);
const setPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: 'auth:set-password',
  keyGenerator: (req) => req.user?.id || `ip:${req.ip}`,
  message: 'Too many attempts. Please wait a few minutes.',
});

// First-login password change. Needs a signed-in session; refuses anyone who is not waiting for it.
router.post('/set-password', protect, setPasswordLimiter, setPassword);
router.post('/firebase', publicRoute('sign-in: trades a Firebase ID token for ours'), authLimiter, firebaseLogin);

module.exports = router;
