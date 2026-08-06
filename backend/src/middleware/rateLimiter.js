// Rate limiting backed by Upstash Redis (@upstash/ratelimit) instead of
// express-rate-limit's default in-memory store. In-memory counters only work
// within a single long-lived process — under Vercel's many-stateless-
// instances model each instance would get its own counters, letting a user
// burn through several times the intended limit. @upstash/ratelimit's REST
// client shares state across every instance and works identically locally.
const { Ratelimit } = require('@upstash/ratelimit');
const { redis } = require('../config/redis');
const jwt = require('jsonwebtoken');

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

// Layer 2 — sustained: 20/min for authenticated users, 10/min for anonymous.
const submitSustainedAuth = new Ratelimit({ redis, prefix: 'rl:submit:sustained', limiter: Ratelimit.slidingWindow(20, '60 s') });
const submitSustainedAnon = new Ratelimit({ redis, prefix: 'rl:submit:sustained', limiter: Ratelimit.slidingWindow(10, '60 s') });

// General API limiter — protects non-submission endpoints from scraping/brute-force.
const apiRl = new Ratelimit({ redis, prefix: 'rl:api', limiter: Ratelimit.slidingWindow(200, '60 s') });

// Wraps a Ratelimit instance as Express middleware. Fails OPEN if Upstash is
// unreachable — matching utils/cache.js's philosophy: a rate limiter outage
// should degrade to "unlimited", not take the API down.
const asMiddleware = (limiter, keyFn, message) => async (req, res, next) => {
  try {
    const { success } = await limiter.limit(keyFn(req));
    if (!success) return res.status(429).json({ success: false, error: message });
    return next();
  } catch (err) {
    console.warn('Rate limiter unavailable, failing open:', err.message);
    return next();
  }
};

const submitBurstLimiter = asMiddleware(submitBurst, submissionKey, 'Please wait 10 seconds between submissions.');

const submitSustainedLimiter = (req, res, next) => {
  const limiter = getUserId(req) ? submitSustainedAuth : submitSustainedAnon;
  return asMiddleware(limiter, submissionKey, 'Submission rate limit exceeded. Please wait before trying again.')(req, res, next);
};

const apiLimiter = asMiddleware(apiRl, (req) => `ip:${req.ip}`, 'Too many requests. Please slow down.');

// Reusable factory for the route-local limiters scattered across
// routes/*.routes.js (auth, faculty, profiles, problemImport, twofa, ai) —
// each used to build its own express-rate-limit instance with the same
// in-memory-only problem submitBurst/submitSustained/apiRl above were built
// to fix. One Ratelimit instance per call site (keyed by `prefix`), same
// fail-open behavior as every other limiter in this file.
//
//   createLimiter({ windowMs: 60_000, max: 20, prefix: 'ai', message: '...' })
//   createLimiter({ windowMs: 300_000, max: 5, prefix: 'plagiarism',
//     keyGenerator: (req) => req.user?.id || 'anon', message: '...' })
function createLimiter({ windowMs, max, prefix, message, keyGenerator }) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const limiter = new Ratelimit({ redis, prefix: `rl:${prefix}`, limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`) });
  const keyFn = keyGenerator || ((req) => `ip:${req.ip}`);
  return asMiddleware(limiter, keyFn, message);
}

module.exports = { submitBurstLimiter, submitSustainedLimiter, apiLimiter, createLimiter };
