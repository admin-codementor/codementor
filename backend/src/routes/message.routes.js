const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const c = require('../controllers/message.controller');

const router = express.Router();
router.use(protect);

const keyByUser = (req) => req.user?.id || 'anon';
const sendLimiter = createLimiter({ windowMs: 60 * 1000, max: 30, prefix: 'messages:send', keyGenerator: keyByUser, message: 'You are sending messages too fast. Please wait a minute.' });
// New conversations are the spam vector (a first message to someone who has not agreed to hear from you).
const startLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 15, prefix: 'messages:start', keyGenerator: keyByUser, message: 'You have started a lot of conversations. Please wait a few minutes.' });

// Everyone signed in may read and answer their own conversations; starting one is staff-only (enforced per recipient).
router.get('/unread-count', c.unreadCount);
router.get('/threads', c.listThreads);
router.get('/threads/:id', c.getThread);
router.post('/threads', startLimiter, c.startThread);
router.post('/threads/:id/messages', sendLimiter, c.sendMessage);
router.patch('/threads/:id', c.updateThread);
router.get('/contacts', c.searchContacts);

// Reported conversations: reviewable by an HOD (own department) or an admin.
router.get('/reported', authorize('hod', 'admin'), c.listReported);
router.patch('/reported/:id', authorize('hod', 'admin'), c.resolveReport);

module.exports = router;
