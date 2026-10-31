// The circuit breaker (utils/circuitBreaker.js): when it opens, what it refuses, how it tests the service again, and what counts as a failure.
const { createBreaker, CircuitOpenError, defaultIsFailure } = require('../../src/utils/circuitBreaker');

const net = () => Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
const http = (status) => Object.assign(new Error(`status ${status}`), { response: { status } });

module.exports = async function (s) {
  let t = 1_000_000;
  const mk = (o) => createBreaker({ now: () => t, ...o });
  const fail = async (b, err = net) => { try { await b.exec(async () => { throw err(); }); } catch { /* counted */ } };
  const ok = (b) => b.exec(async () => 'fine');

  // ── what counts ──
  s.check('no answer, a timeout and a server error count as failures', defaultIsFailure(net()) && defaultIsFailure(Object.assign(new Error('x'), { code: 'ECONNABORTED' })) && defaultIsFailure(http(500)) && defaultIsFailure(http(503)));
  s.check('our own bad request (4xx) does not count, and neither does the breaker\'s own refusal', !defaultIsFailure(http(400)) && !defaultIsFailure(http(404)) && !defaultIsFailure(new CircuitOpenError(0)));

  // ── closing and opening ──
  const b = mk();
  s.check('a new breaker is closed and lets calls through', b.state() === 'closed' && (await ok(b)) === 'fine' && b.retryAtMs() === null);
  for (let i = 0; i < 4; i += 1) await fail(b);
  s.check('four failures are not enough to open it', b.state() === 'closed' && b.snapshot().recent_failures === 4);
  await fail(b);
  s.check('the fifth failure inside the window opens it', b.state() === 'open' && b.retryAtMs() === t + 20_000);

  let called = 0;
  const refused = await b.exec(async () => { called += 1; }).then(() => null, (e) => e);
  s.check('while open a call is refused at once without being made, with a code and a time to try again', refused instanceof CircuitOpenError && refused.code === 'JUDGE_OPEN' && called === 0 && refused.retryAtMs === t + 20_000);

  // ── the test call ──
  t += 19_999;
  s.check('just before the time is up it is still open', b.state() === 'open');
  t += 1;
  s.check('when the time is up it is half-open', b.state() === 'half-open');
  let release; let gate = new Promise((r) => { release = r; });
  const probe = b.exec(async () => { await gate; return 'probe ok'; });
  const second = await b.exec(async () => 'second').then(() => null, (e) => e);
  s.check('only ONE test call goes through at a time; others are refused', second instanceof CircuitOpenError);
  release(); await probe;
  s.check('a test call that works closes the breaker', b.state() === 'closed' && (await ok(b)) === 'fine');

  // ── a failed test call ──
  const b2 = mk();
  for (let i = 0; i < 5; i += 1) await fail(b2);
  t += 20_000;
  await fail(b2);
  s.check('a test call that fails opens it again for a whole new period', b2.state() === 'open' && b2.retryAtMs() === t + 20_000);

  // ── the window ──
  const b3 = mk();
  for (let i = 0; i < 4; i += 1) await fail(b3);
  t += 31_000;
  await fail(b3);
  s.check('failures older than the window are forgotten, so slow trickles never open it', b3.state() === 'closed' && b3.snapshot().recent_failures === 1);

  // ── success clears the count; 4xx does not open it ──
  const b4 = mk();
  for (let i = 0; i < 4; i += 1) await fail(b4);
  await ok(b4);
  await fail(b4);
  s.check('one success wipes the failure count', b4.state() === 'closed' && b4.snapshot().recent_failures === 1);
  const b5 = mk();
  for (let i = 0; i < 20; i += 1) await fail(b5, () => http(400));
  s.check('twenty bad requests (4xx) never open it', b5.state() === 'closed');

  // ── the original error still reaches the caller ──
  const e = await mk().exec(async () => { throw http(500); }).then(() => null, (x) => x);
  s.check('the caller still gets the original error from a failed call', e?.response?.status === 500);
  const half = mk();
  for (let i = 0; i < 5; i += 1) await fail(half);
  t += 20_000;
  await fail(half, () => http(400));
  s.check('a half-open test that comes back with a 4xx proves the service answers, and lets the next call try', half.state() === 'half-open' && (await ok(half)) === 'fine' && half.state() === 'closed');

  // ── snapshot and reset ──
  const b6 = mk();
  for (let i = 0; i < 5; i += 1) await fail(b6);
  s.check('the snapshot says the state and when it will try again, and reset closes it', b6.snapshot().state === 'open' && b6.snapshot().retry_at_ms === t + 20_000 && (b6.reset(), b6.state() === 'closed'));
  s.check('settings can be changed (a threshold of 2)', await (async () => { const x = mk({ failureThreshold: 2 }); await fail(x); await fail(x); return x.state() === 'open'; })());
};
