const { redis } = require('../config/redis');

/**
 * Small read-through cache for expensive analytics aggregates, backed by
 * Upstash Redis. Fails open: if Upstash is down or errors, it just runs `fn`
 * and returns the fresh value (no throw). Keep TTLs short (60–300s) —
 * analytics can be slightly stale but must stay fast under load.
 *
 *   const data = await cached(`cohorts:${dept}:${dim}`, 120, () => runQuery());
 */
// One build per key at a time in this process: when a cache entry is missing (a cold start, or the minute it expires) and a hundred
// requests arrive together, they all wait for ONE computation instead of starting a hundred. Measured on the read-cost harness:
// ten simultaneous requests for the class analytics used to cost ten full scans.
const inflight = new Map();

exports.cached = async (key, ttlSeconds, fn) => {
  try {
    const hit = await redis.get(key);
    if (hit != null) return hit;
  } catch {
    /* cache miss / Upstash unavailable — fall through to compute */
  }
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const value = await fn();
      try {
        await redis.set(key, value, { ex: ttlSeconds });
      } catch {
        /* best-effort cache write */
      }
      return value;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
};

/**
 * Version counters for invalidating cached aggregates when the data under them
 * changes (e.g. a mentor assignment). Include the version in the cache key and
 * bump it on write; old entries simply expire. Fails open like `cached`: if
 * Redis is unavailable nothing is cached either, so there is nothing stale.
 */
exports.getVersion = async (name) => {
  try {
    return Number(await redis.get(`version:${name}`)) || 0;
  } catch {
    return 0;
  }
};

exports.bumpVersion = async (name) => {
  try {
    await redis.incr(`version:${name}`);
  } catch {
    /* best-effort */
  }
};
