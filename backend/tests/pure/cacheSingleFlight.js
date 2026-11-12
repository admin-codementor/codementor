// cached(): simultaneous requests for a missing key share ONE computation; a failure is not cached; a stored value is served.
const path = require('path');

module.exports = async function (s) {
  const redisPath = require.resolve('../../src/config/redis');
  const cachePath = require.resolve('../../src/utils/cache');
  const store = new Map();
  const fakeRedis = {
    get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
    set: async (k, v) => { store.set(k, JSON.stringify(v)); },
    incr: async () => 1,
  };
  const savedRedis = require.cache[redisPath];
  const savedCache = require.cache[cachePath];
  require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { redis: fakeRedis } };
  delete require.cache[cachePath];
  try {
    const { cached } = require(path.resolve(cachePath));

    let calls = 0;
    const slow = async () => { calls += 1; await new Promise((r) => setTimeout(r, 20)); return { n: calls }; };
    const results = await Promise.all(Array.from({ length: 50 }, () => cached('k1', 60, slow)));
    s.check('50 simultaneous requests share one computation', calls === 1 && results.every((r) => r.n === 1));

    const again = await cached('k1', 60, slow);
    s.check('a stored value is served without computing again', calls === 1 && again.n === 1);

    let attempts = 0;
    const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error('boom'); return 'ok'; };
    let failed = false;
    try { await cached('k2', 60, flaky); } catch { failed = true; }
    s.check('a failed computation is reported, not cached', failed === true);
    s.check('the next request tries again and succeeds', (await cached('k2', 60, flaky)) === 'ok' && attempts === 2);

    let other = 0;
    await Promise.all([cached('a', 60, async () => { other += 1; return 1; }), cached('b', 60, async () => { other += 1; return 2; })]);
    s.check('different keys are computed separately', other === 2);
  } finally {
    delete require.cache[cachePath];
    if (savedCache) require.cache[cachePath] = savedCache;
    if (savedRedis) require.cache[redisPath] = savedRedis; else delete require.cache[redisPath];
  }
};
