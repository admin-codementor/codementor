// The platform status check (services/systemStatus.js): roll-up, timeouts, sharing one check between callers, and that nothing leaks.
const { createStatusService, rollUp, probe } = require('../../src/services/systemStatus');

module.exports = async function (s) {
  s.check('everything reachable is ok', rollUp({ firestore: 'ok', judge0: 'ok' }) === 'ok');
  s.check('a judge that is not configured does not make the platform unhealthy', rollUp({ firestore: 'ok', judge0: 'not_configured' }) === 'ok');
  s.check('judge down but database up is "degraded" (multiple-choice exams still work)', rollUp({ firestore: 'ok', judge0: 'down' }) === 'degraded');
  s.check('database down is "down", whatever the judge says', rollUp({ firestore: 'down', judge0: 'ok' }) === 'down' && rollUp({ firestore: 'down', judge0: 'down' }) === 'down');

  s.check('a probe that works is ok', (await probe(async () => 1)) === 'ok');
  s.check('a probe that throws is down', (await probe(async () => { throw new Error('ECONNREFUSED 10.0.0.5:2358 secret-token'); })) === 'down');
  s.check('a probe that never answers is down after the timeout', (await probe(() => new Promise(() => {}), 50)) === 'down');
  s.check('no probe given means not configured', (await probe(null)) === 'not_configured');

  let t = 1_000_000;
  let dbCalls = 0; let judgeCalls = 0;
  const svc = createStatusService({
    firestorePing: async () => { dbCalls += 1; },
    judgePing: async () => { judgeCalls += 1; },
    now: () => t, cacheMs: 30_000,
  });
  const a = await svc.get();
  s.check('the answer has only the safe fields', JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['api', 'checked_at', 'firestore', 'judge0', 'status']) && a.status === 'ok');
  await svc.get(); await svc.get();
  s.check('callers within 30 seconds share one check (no extra database or judge calls)', dbCalls === 1 && judgeCalls === 1);
  t += 31_000;
  await svc.get();
  s.check('after 30 seconds it checks again', dbCalls === 2 && judgeCalls === 2);

  // a burst at the same moment still makes one check
  let burstDb = 0;
  const burst = createStatusService({ firestorePing: async () => { burstDb += 1; await new Promise((r) => setTimeout(r, 30)); }, judgePing: null, now: () => 5, cacheMs: 30_000 });
  await Promise.all(Array.from({ length: 50 }, () => burst.get()));
  s.check('50 simultaneous callers cause one database check', burstDb === 1);

  // failures do not leak details and are reported by name only
  const failing = createStatusService({
    firestorePing: async () => { throw new Error('PERMISSION_DENIED service-account abc123'); },
    judgePing: async () => { throw new Error('connect ECONNREFUSED 10.1.2.3:2358'); },
  });
  const f = await failing.get();
  s.check('a failing database gives "down" and the body has no error text', f.status === 'down' && f.firestore === 'down' && f.judge0 === 'down' && !/PERMISSION|ECONNREFUSED|10\.1|abc123/.test(JSON.stringify(f)));
};
