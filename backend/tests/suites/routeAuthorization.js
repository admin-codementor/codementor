// Every route says who may call it.
//
// This is the check that makes the rest of the authorization work hold. A route
// mounted without `protect` fails in the worst possible way: it works, for
// everyone, silently. No test fails, no log line appears, and it looks exactly
// like a route that was meant to be open. So rather than trusting that nobody
// forgets, the audit walks the real mounted app and this suite fails if any
// route is neither guarded nor explicitly declared with `publicRoute(reason)`.
//
// Unlike the other suites this one runs in-process against the app module. It
// has to: the question is about how routes are wired, not about what they
// return, and over HTTP an unguarded route is indistinguishable from a guarded
// one until you happen to call it without a token.
const { Suite, get } = require('../harness');
const { routeTable } = require('../routeAudit');

// The endpoints that are meant to be reachable without a token. Anything open
// and not on this list fails the suite; anything on the list that is no longer
// open fails it too, so the file cannot rot into a list of things that used to
// be true.
const EXPECTED_PUBLIC = [
  'POST /api/auth/refresh',
  'POST /api/auth/firebase',
  'POST /api/2fa/verify',
  'GET /health',
  'GET /api/problems',
  'GET /api/problems/:id',
  'GET /api/problems/:id/adjacent',
  'POST /api/submit',
  'GET /api/submit/status/:jobId',
  'GET /api/submit/history/:problemId',
  'GET /api/submissions',
  'GET /api/public/profile/:handle',
];

module.exports = async function routeAuthorizationSuite() {
  const s = new Suite('Route authorization: nothing open by accident');

  let rows;
  try {
    rows = routeTable();
  } catch (e) {
    s.check('the route table can be read', false, e.message);
    return s;
  }

  s.check('the audit sees the whole app', rows.length > 100, `${rows.length} routes`);

  const undeclared = rows.filter((r) => !r.guarded && !r.publicReason);
  s.check('no route is open without saying so', undeclared.length === 0,
    undeclared.map((r) => `${r.method} ${r.path}`).join(', '));

  const open = rows.filter((r) => !r.guarded).map((r) => `${r.method} ${r.path}`);
  const unique = [...new Set(open)];

  const unexpected = unique.filter((r) => !EXPECTED_PUBLIC.includes(r));
  s.check('no endpoint became public without being added to this list',
    unexpected.length === 0, unexpected.join(', '));

  const missing = EXPECTED_PUBLIC.filter((r) => !unique.includes(r));
  s.check('every endpoint on the public list is still mounted',
    missing.length === 0, `gone or now guarded: ${missing.join(', ')}`);

  s.check('every public route explains itself',
    rows.filter((r) => !r.guarded).every((r) => typeof r.publicReason === 'string' && r.publicReason.length > 10),
    'a publicRoute() reason is missing or too short to be useful');

  // The audit reads how the app is wired; this confirms the wiring behaves. If
  // these two ever disagree, trust this one.
  const guardedSample = ['/api/student/dashboard', '/api/roadmaps', '/api/courses', '/api/exams/available'];
  for (const path of guardedSample) {
    const res = await get(path);
    s.check(`${path} refuses an anonymous caller`, res.status === 401, `status ${res.status}`);
  }

  return s;
};
