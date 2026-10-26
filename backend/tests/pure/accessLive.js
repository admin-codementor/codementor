// Live check of the role gates. accessMatrix.js proves the matrix agrees with the role tags on each route; this proves the tags tell the
// truth by sending real requests to the real app on a local port (no database is reached: a request refused by the role check never
// gets as far as a handler).
//
//   - no token                       -> 401 on every route that needs a token
//   - a token signed with a wrong key -> 401
//   - a role the POLICY does not allow -> 403, for every role outside the matrix's list for that route
require('../hermeticEnv'); // before anything loads the app: no real Redis, database or signing key
const jwt = require('jsonwebtoken');
const { loadAppWithMounts, routeTable } = require('../routeAudit');
const matrix = require('../../src/config/accessMatrix');
const { firstRule } = require('../../src/utils/accessMatrixCheck');

const { ROLES } = matrix;

module.exports = async function (s) {
  const { app } = loadAppWithMounts();
  const rows = routeTable().filter((r) => r.guarded);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const token = (role, secret = process.env.JWT_SECRET) => jwt.sign({ id: `live-test-${role}`, role, permissions: {}, department: 'CSE', tv: 0 }, secret, { expiresIn: '5m' });
  const call = async (method, path, bearer) => {
    const url = base + path.replace(/:[A-Za-z]+/g, 'x');
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? '{}' : undefined,
        signal: AbortSignal.timeout(5000),
      });
      return res.status;
    } catch (e) {
      return `error:${e.name}`;
    }
  };

  try {
    const noToken = [];
    const badKey = [];
    const wrongRole = [];
    let denials = 0;
    const tokens = Object.fromEntries(ROLES.map((r) => [r, token(r)]));
    const forged = token('admin', 'not-the-real-secret');

    // Requests run in parallel batches: each one is independent and the whole check is otherwise slow.
    const jobs = [];
    for (const r of rows) {
      jobs.push(async () => { const st = await call(r.method, r.path, null); if (st !== 401) noToken.push(`${r.method} ${r.path} -> ${st}`); });
      jobs.push(async () => { const st = await call(r.method, r.path, forged); if (st !== 401) badKey.push(`${r.method} ${r.path} -> ${st}`); });
      // What each role SHOULD get comes from the policy (the matrix), not from the route's own tags, so a removed role check cannot
      // hide itself by also removing its tag.
      const rule = firstRule(matrix.rules, r);
      if (rule && Array.isArray(rule.roles)) {
        for (const role of ROLES.filter((x) => !rule.roles.includes(x))) {
          denials += 1;
          jobs.push(async () => { const st = await call(r.method, r.path, tokens[role]); if (st !== 403) wrongRole.push(`${role} ${r.method} ${r.path} -> ${st}`); });
        }
      }
    }
    const POOL = 24;
    let next = 0;
    await Promise.all(Array.from({ length: POOL }, async () => {
      while (next < jobs.length) { const job = jobs[next]; next += 1; await job(); }
    }));

    s.check(`all ${rows.length} routes that need a token answer 401 to a request with no token`, noToken.length === 0, noToken.slice(0, 6).join(' | '));
    s.check('a token signed with the wrong key is refused with 401 on every route', badKey.length === 0, badKey.slice(0, 6).join(' | '));
    s.check(`every role a route does not allow is refused with 403 (${denials} role and route pairs tried)`, denials > 100 && wrongRole.length === 0, wrongRole.slice(0, 6).join(' | '));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};
