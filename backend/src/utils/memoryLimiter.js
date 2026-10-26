// A small in-memory sliding-window limiter. It is the safety net behind the Redis limiters: when Redis is unreachable the API used
// to let every request through (fail open), which also switched off the submission limits. With this, a Redis outage degrades to
// per-instance limits instead of no limits. With N API copies the effective limit is up to N times higher, which is still bounded.
//
// Pure apart from the clock, which is injectable for tests. Memory is bounded: expired keys are dropped as we go, and past maxKeys the
// oldest half is dropped, so a flood of distinct keys cannot grow the process without limit.

function createMemoryLimiter({ max, windowMs, maxKeys = 50000, now = Date.now }) {
  const hits = new Map(); // key -> ascending timestamps inside the window

  function prune(t) {
    const cutoff = t - windowMs;
    for (const [k, arr] of hits) {
      while (arr.length && arr[0] <= cutoff) arr.shift();
      if (!arr.length) hits.delete(k);
    }
    if (hits.size > maxKeys) {
      let drop = Math.ceil(hits.size / 2);
      for (const k of hits.keys()) { if (drop-- <= 0) break; hits.delete(k); }
    }
  }

  let lastPrune = 0;
  return {
    /** @returns {{success: boolean, remaining: number}} */
    check(key) {
      const t = now();
      if (t - lastPrune >= windowMs || hits.size > maxKeys) { prune(t); lastPrune = t; }
      const arr = hits.get(key) || [];
      const cutoff = t - windowMs;
      while (arr.length && arr[0] <= cutoff) arr.shift();
      if (arr.length >= max) { hits.set(key, arr); return { success: false, remaining: 0 }; }
      arr.push(t);
      hits.set(key, arr);
      return { success: true, remaining: max - arr.length };
    },
    size: () => hits.size,
  };
}

module.exports = { createMemoryLimiter };
