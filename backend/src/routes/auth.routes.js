const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { refresh } = require('../controllers/auth.controller');
const { firebaseLogin } = require('../controllers/firebaseAuth.controller');

const router = express.Router();

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  prefix: 'auth',
  message: 'Too many attempts, please try again after 15 minutes.',
});

const refreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  prefix: 'auth:refresh',
  message: 'Too many refresh attempts.',
});

router.post('/refresh', refreshLimiter, refresh);
router.post('/firebase', authLimiter, firebaseLogin);

module.exports = router;
