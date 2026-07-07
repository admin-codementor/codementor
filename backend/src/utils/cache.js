const { connection } = require('../config/queue');

/**
 * Small read-through cache for expensive analytics aggregates, backed by the same
 * Redis (ioredis) connection the job queue uses. Fails open: if Redis is down or
 * errors, it just runs `fn` and returns the fresh value (no throw). Keep TTLs short
 * (60–300s) — analytics can be slightly stale but must stay fast under load.
 *
 *   const data = await cached(`cohorts:${dept}:${dim}`, 120, () => runQuery());
 */
exports.cached = async (key, ttlSeconds, fn) => {
  try {
    const hit = await connection.get(key);
    if (hit != null) return JSON.parse(hit);
  } catch {
    /* cache miss / Redis unavailable — fall through to compute */
  }
  const value = await fn();
  try {
    await connection.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* best-effort cache write */
  }
  return value;
};
