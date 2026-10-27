// Upstash Redis — REST-based, so there's no persistent TCP connection to
// manage (unlike the old ioredis client in config/queue.js). That's what
// makes it safe to use from a stateless Vercel serverless function: every
// call is a plain HTTPS request, reusable across any number of concurrent
// instances. Used by utils/cache.js (analytics cache) and
// middleware/rateLimiter.js (shared rate-limit counters).
const { Redis } = require('@upstash/redis');

// The client's default is 5 retries with growing waits (about 4 seconds in all). While Redis is down that would delay EVERY API request by
// that long before the rate limiters and the cache fall back to their in-memory behavior. One quick retry keeps a transient glitch
// invisible and an outage cheap. (REDIS_RETRIES=0 is for the load-test sandbox, which has no Redis at all: with one retry every request
// would wait 100 ms for a Redis that is never there, and the measurements would show that wait instead of the server's own cost.)
const retries = Number.isInteger(Number(process.env.REDIS_RETRIES)) && process.env.REDIS_RETRIES !== '' && process.env.REDIS_RETRIES !== undefined ? Number(process.env.REDIS_RETRIES) : 1;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
  retry: { retries, backoff: () => 100 },
});

module.exports = { redis };
