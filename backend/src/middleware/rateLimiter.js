// Rate limiting backed by Upstash Redis (@upstash/ratelimit) instead of
// express-rate-limit's default in-memory store. In-memory counters only work
// within a single long-lived process — under Vercel's many-stateless-
// instances model each instance would get its own counters, letting a user
// burn through several times the intended limit. @upstash/ratelimit's REST
// client shares state across every instance and works identically locally.
const { Ratelimit } = require('@upstash/ratelimit');
const { redis } = require('../config/redis');
const jwt = require('jsonwebtoken');
const { createMemoryLimiter } = require('../utils/memoryLimiter');

// Extract user_id from JWT without throwing — used as the rate-limit key.
const getUserId = (req) => {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      return decoded.id;
    }
  } catch { /* invalid/expired token — treat as anonymous */ }
  return null;
};

// Key: authenticated users keyed by userId, anonymous by IP.
// This prevents a student from burning through limits by switching IPs,
// and stops one anonymous IP from blocking other users on the same network.
const submissionKey = (req) => {
  const userId = getUserId(req);
  return userId ? `user:${userId}` : `ip:${req.ip}`;
};

// ── Limiters ─────────────────────────────────────────────────────────────────

// Layer 1 — burst: at most 1 submission every 10 s per user/IP.
const submitBurst = new Ratelimit({ redis, prefix: 'rl:submit:burst', limiter: Ratelimit.slidingWindow(1, '10 s') });
const submitBurstFallback = createMemoryLimiter({ max: 1, windowMs: 10_000 });

// Layer 2 — sustained: 20/min for authenticated users, 10/min for anonymous.
const submitSustainedAuth = new Ratelimit({ redis, prefix: 'rl:submit:sustained', limiter: Ratelimit.slidingWindow(20, '60 s') });
const submitSustainedAnon = new Ratelimit({ redis, prefix: 'rl:submit:sustained', limiter: Ratelimit.slidingWindow(10, '60 s') });
const submitSustainedAuthFallback = createMemoryLimiter({ max: 20, windowMs: 60_000 });
const submitSustainedAnonFallback = createMemoryLimiter({ max: 10, windowMs: 60_000 });

// General API limiter — protects non-submission endpoints from scraping/brute-force.
//
// Keyed by USER when the request carries a valid token, by IP only when it does not. A whole class
// sits behind one campus IP, so a per-IP budget of 200 calls a minute would lock students out of their
// own dashboards as soon as the class opened it together. Anonymous traffic (the sign-in page, public
// profiles) stays per IP, with room for a classroom. Override with API_LIMIT_USER_PER_MIN / API_LIMIT_IP_PER_MIN.
const API_LIMIT_USER = Number(process.env.API_LIMIT_USER_PER_MIN) || 300;
const API_LIMIT_IP = Number(process.env.API_LIMIT_IP_PER_MIN) || 1500;
const apiRlUser = new Ratelimit({ redis, prefix: 'rl:api:user', limiter: Ratelimit.slidingWindow(API_LIMIT_USER, '60 s') });
const apiRlIp = new Ratelimit({ redis, prefix: 'rl:api:ip', limiter: Ratelimit.slidingWindow(API_LIMIT_IP, '60 s') });
const apiRlUserFallback = createMemoryLimiter({ max: API_LIMIT_USER, windowMs: 60_000 });
const apiRlIpFallback = createMemoryLimiter({ max: API_LIMIT_IP, windowMs: 60_000 });

// Wraps a Ratelimit instance as Express middleware.
//
// If Redis is unreachable we no longer fail OPEN (which used to switch off every limit, including the submission limits that
// protect the code runner). Instead each limiter has an in-memory fallback with the same budget, per API copy: a Redis outage
// degrades to "limited per instance", never to "unlimited". The warning is logged at most once every 30 seconds.
let lastWarn = 0;
const warnOnce = (err) => {
  const t = Date.now();
  if (t - lastWarn > 30_000) { lastWarn = t; console.warn('Rate limiter: Redis unavailable, using the in-memory fallback:', err.message); }
};

const asMiddleware = (limiter, keyFn, message, fallback) => async (req, res, next) => {
  try {
    const { success } = await limiter.limit(keyFn(req));
    if (!success) return res.status(429).json({ success: false, error: message });
    return next();
  } catch (err) {
    warnOnce(err);
    if (!fallback) return next();
    if (!fallback.check(keyFn(req)).success) return res.status(429).json({ success: false, error: message });
    return next();
  }
};

const submitBurstLimiter = asMiddleware(submitBurst, submissionKey, 'Please wait 10 seconds between submissions.', submitBurstFallback);

const submitSustainedLimiter = (req, res, next) => {
  const authed = !!getUserId(req);
  return asMiddleware(authed ? submitSustainedAuth : submitSustainedAnon, submissionKey, 'Submission rate limit exceeded. Please wait before trying again.', authed ? submitSustainedAuthFallback : submitSustainedAnonFallback)(req, res, next);
};

const apiLimiter = (req, res, next) => {
  const userId = getUserId(req);
  return asMiddleware(userId ? apiRlUser : apiRlIp, () => (userId ? `user:${userId}` : `ip:${req.ip}`), 'Too many requests. Please slow down.', userId ? apiRlUserFallback : apiRlIpFallback)(req, res, next);
};

// Reusable factory for the route-local limiters scattered across
// routes/*.routes.js (auth, faculty, profiles, problemImport, twofa, ai) —
// each used to build its own express-rate-limit instance with the same
// in-memory-only problem submitBurst/submitSustained/apiRl above were built
// to fix. One Ratelimit instance per call site (keyed by `prefix`), same
// in-memory fallback as every other limiter in this file.
//
//   createLimiter({ windowMs: 60_000, max: 20, prefix: 'ai', message: '...' })
//   createLimiter({ windowMs: 300_000, max: 5, prefix: 'plagiarism',
//     keyGenerator: (req) => req.user?.id || 'anon', message: '...' })
function createLimiter({ windowMs, max, prefix, message, keyGenerator }) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const limiter = new Ratelimit({ redis, prefix: `rl:${prefix}`, limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`) });
  const keyFn = keyGenerator || ((req) => `ip:${req.ip}`);
  return asMiddleware(limiter, keyFn, message, createMemoryLimiter({ max, windowMs }));
}

module.exports = { submitBurstLimiter, submitSustainedLimiter, apiLimiter, createLimiter };
