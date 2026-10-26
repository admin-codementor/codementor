// The error shape end to end: real requests to the real app (no database or Redis is reached).
require('../hermeticEnv');
const express = require('express');
const { loadAppWithMounts } = require('../routeAudit');
const { requestContext, errorHandler, notFound } = require('../../src/middleware/requestContext');

module.exports = async function (s) {
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const send = async (method, path, { body, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body, signal: AbortSignal.timeout(8000) });
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json, headers: res.headers };
  };
  const shaped = (r) => r.json && r.json.success === false && typeof r.json.error === 'string' && r.json.error && r.json.code && r.json.hint && /^[A-Za-z0-9._-]{8,64}$/.test(r.json.requestId || '');

  try {
    const nf = await send('GET', '/api/this-does-not-exist');
    s.check('an unknown address is a 404 in the standard shape', nf.status === 404 && shaped(nf) && nf.json.code === 'NOT_FOUND');
    s.check('the plain 404 message does not echo the address back', !/this-does-not-exist/.test(nf.json.error));
    s.check('the reference in the body is the same as the X-Request-Id header', nf.headers.get('x-request-id') === nf.json.requestId);

    const noTok = await send('GET', '/api/student/dashboard');
    s.check('no token is a 401 in the standard shape', noTok.status === 401 && shaped(noTok) && noTok.json.code === 'UNAUTHORIZED');

    const badJson = await send('POST', '/api/auth/refresh', { body: '{"refreshToken": ' });
    s.check('broken JSON is a 400 BAD_JSON with no parser text in the answer', badJson.status === 400 && shaped(badJson) && badJson.json.code === 'BAD_JSON' && !/Unexpected|position|token/i.test(badJson.json.error));

    const big = await send('POST', '/api/auth/refresh', { body: JSON.stringify({ refreshToken: 'x'.repeat(200 * 1024) }) });
    s.check('a body over 128 KB is a 413 in the standard shape', big.status === 413 && shaped(big) && big.json.code === 'TOO_LARGE');

    const withId = await send('GET', '/api/this-does-not-exist', { headers: { 'x-request-id': 'browser-1234abcd' } });
    s.check('a caller-supplied reference is used and echoed', withId.json.requestId === 'browser-1234abcd' && withId.headers.get('x-request-id') === 'browser-1234abcd');
    const evil = await send('GET', '/api/this-does-not-exist', { headers: { 'x-request-id': '<script>alert(1)</script>' } });
    s.check('an unsafe reference is replaced', /^[0-9A-F]{8}$/.test(evil.json.requestId));

    const refresh = await send('POST', '/api/auth/refresh', { body: JSON.stringify({}) });
    s.check('a refresh with no token is a 401 with a plain message', refresh.status === 401 && shaped(refresh));

    const ok = await send('GET', '/health');
    s.check('a successful response is untouched (no error fields added)', ok.status === 200 && ok.json.status === 'ok' && ok.json.requestId === undefined && ok.headers.get('x-request-id'));
    s.check('every response carries a reference header, success or not', !!ok.headers.get('x-request-id') && !!nf.headers.get('x-request-id'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // ── handlers that crash, on a small app that uses the same handlers ──
  const mini = express();
  mini.use(requestContext);
  mini.get('/throws', () => { throw new TypeError("Cannot read properties of undefined (reading 'id')"); });
  mini.get('/rejects', async () => { await Promise.resolve(); const e = new Error('connect ECONNREFUSED 10.0.0.5:5432'); e.code = 'ECONNREFUSED'; throw e; });
  mini.get('/raw-500', (req, res) => res.status(500).json({ success: false, error: 'FirebaseError: 7 PERMISSION_DENIED: Missing or insufficient permissions.' }));
  mini.get('/db-down', async () => { const e = new Error('14 UNAVAILABLE: No connection established'); e.code = 14; throw e; });
  mini.use(notFound);
  mini.use(errorHandler);
  const msrv = mini.listen(0, '127.0.0.1');
  await new Promise((resolve) => msrv.once('listening', resolve));
  const mbase = `http://127.0.0.1:${msrv.address().port}`;
  const logged = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...a) => logged.push(a.map(String).join(' '));
  console.warn = (...a) => logged.push(a.map(String).join(' '));
  try {
    const get = async (path) => { const r = await fetch(mbase + path); return { status: r.status, json: await r.json(), id: r.headers.get('x-request-id') }; };
    const t = await get('/throws');
    s.check('a handler that throws gives a 500 in the standard shape with none of the error text', t.status === 500 && t.json.code === 'SERVER_ERROR' && t.json.success === false && !JSON.stringify(t.json).includes('Cannot read') && t.json.requestId === t.id);
    const r = await get('/rejects');
    s.check('an async handler that fails is caught too, and a refused connection is a 503', r.status === 503 && r.json.code === 'UPSTREAM_UNAVAILABLE' && !JSON.stringify(r.json).includes('10.0.0.5'));
    const raw = await get('/raw-500');
    s.check('an endpoint that sends a raw database message on a 500 has it replaced', raw.status === 500 && !JSON.stringify(raw.json).includes('PERMISSION_DENIED') && raw.json.error && raw.json.requestId);
    const db = await get('/db-down');
    s.check('a database outage is a 503 that tells the person their work is safe', db.status === 503 && db.json.code === 'DATABASE_UNAVAILABLE' && /safe/.test(db.json.hint));
    s.check('the full technical error is logged together with the same reference the person was shown', logged.some((l) => l.includes(`[${t.json.requestId}]`) && l.includes('GET /throws') && l.includes('500')) && logged.some((l) => l.includes('Cannot read properties')));
  } finally {
    console.error = origError;
    console.warn = origWarn;
    await new Promise((resolve) => msrv.close(resolve));
  }
};
