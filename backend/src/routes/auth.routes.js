const express = require('express');
const rateLimit = require('express-rate-limit');
const { refresh } = require('../controllers/auth.controller');
const { firebaseLogin } = require('../controllers/firebaseAuth.controller');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts, please try again after 15 minutes.' }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many refresh attempts.' }
});

router.post('/refresh', refreshLimiter, refresh);
router.post('/firebase', authLimiter, firebaseLogin);

module.exports = router;
