const { redis } = require('../config/redis');

/**
 * Small read-through cache for expensive analytics aggregates, backed by
 * Upstash Redis. Fails open: if Upstash is down or errors, it just runs `fn`
 * and returns the fresh value (no throw). Keep TTLs short (60–300s) —
 * analytics can be slightly stale but must stay fast under load.
 *
 *   const data = await cached(`cohorts:${dept}:${dim}`, 120, () => runQuery());
 */
exports.cached = async (key, ttlSeconds, fn) => {
  try {
    const hit = await redis.get(key);
    if (hit != null) return hit;
  } catch {
    /* cache miss / Upstash unavailable — fall through to compute */
  }
  const value = await fn();
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    /* best-effort cache write */
  }
  return value;
};
