// The access matrix against the REAL routes, plus the checker's own rules.
// The real-route part loads the Express app (no database, no network) and reads each route's actual role list.
require('../hermeticEnv'); // before anything loads the app: no real Redis, database or signing key
const { checkAccess, matchPath } = require('../../src/utils/accessMatrixCheck');
const matrix = require('../../src/config/accessMatrix');

module.exports = function (s) {
  // ── the checker itself, on small fixtures ──
  s.check('path patterns: * is one segment, ** is the rest', matchPath('/api/x/*', '/api/x/1') && !matchPath('/api/x/*', '/api/x/1/2') && matchPath('/api/x/**', '/api/x') && matchPath('/api/x/**', '/api/x/1/2') && !matchPath('/api/x', '/api/x/1') && !matchPath('/api/*/start', '/api/exams/1/start') && matchPath('/api/*/start', '/api/exams/start'));
  s.check('route parameters (:id) match a single *', matchPath('/api/exams/*/start', '/api/exams/:id/start'));

  const fx = {
    rules: [{ path: '/api/a/**', roles: ['admin'] }, { path: '/api/b/**', roles: 'any' }, { methods: ['GET'], path: '/api/c', roles: ['faculty', 'hod', 'admin'] }, { path: '/api/dead', roles: ['admin'] }],
    publicRoutes: [{ methods: ['GET'], path: '/health' }, { path: '/api/gone' }],
    invariants: [
      { id: 'no-student', text: 'no student under /api/a', appliesTo: (r) => r.path.startsWith('/api/a'), forbidRole: 'student' },
      { id: 'writes-need-role', text: 'writes under /api/c need a role', appliesTo: (r) => r.path.startsWith('/api/c') && r.method !== 'GET', forbidAny: true },
    ],
  };
  const row = (method, path, roles, guarded = true) => ({ method, path, roles, guarded });
  const kinds = (rows) => checkAccess(rows, fx).problems.map((p) => p.kind).sort().join();

  s.check('a route with the right roles passes', kinds([row('GET', '/api/a/x', ['admin']), row('GET', '/api/b/y', null), row('GET', '/api/c', ['admin', 'faculty', 'hod'])]) === '');
  s.check('a new route with no rule is reported as unclassified', kinds([row('GET', '/api/new', ['admin'])]) === 'unclassified');
  s.check('a route whose real roles differ from its rule is a mismatch', kinds([row('GET', '/api/a/x', ['admin', 'hod'])]).includes('mismatch'));
  s.check('a route with no role check where the rule names roles is a mismatch', kinds([row('GET', '/api/a/x', null)]).includes('mismatch'));
  s.check('a route restricted where the rule says any role is a mismatch', kinds([row('GET', '/api/b/y', ['student'])]) === 'mismatch');
  s.check('rules are first match wins and can be limited to a method', kinds([row('POST', '/api/c', ['faculty', 'hod', 'admin'])]) === 'unclassified');
  s.check('an open route not in publicRoutes is reported', kinds([row('GET', '/api/secret', null, false)]) === 'public-not-listed' && kinds([row('GET', '/health', null, false)]) === '');
  s.check('an invariant fails even if the rule was loosened to match', (() => {
    const loosened = { ...fx, rules: [{ path: '/api/a/**', roles: ['student', 'admin'] }, ...fx.rules] };
    return checkAccess([row('GET', '/api/a/x', ['student', 'admin'])], loosened).problems.some((p) => p.kind === 'invariant:no-student');
  })());
  s.check('an invariant on writes catches a route with no role check', checkAccess([row('POST', '/api/c', null)], { ...fx, rules: [{ path: '/api/c', roles: 'any' }] }).problems.some((p) => p.kind === 'invariant:writes-need-role'));
  const unused = checkAccess([row('GET', '/api/a/x', ['admin'])], fx);
  s.check('rules and public entries that match nothing are listed so dead policy is visible', unused.unusedRules.includes('/api/dead') && unused.unusedPublic.includes('/api/gone'));

  // ── the real application ──
  const { routeTable } = require('../routeAudit');
  const rows = routeTable();
  const result = checkAccess(rows, matrix);
  s.check(`every one of the ${rows.length} real routes is covered by the access matrix and matches it`, result.problems.length === 0, result.problems.slice(0, 8).map((p) => `${p.kind}: ${p.route} (${p.detail})`).join(' | '));
  s.check('the matrix has no dead rules', result.unusedRules.length === 0 && result.unusedPublic.length === 0, [...result.unusedRules, ...result.unusedPublic].join(', '));
  s.check('no guarded route is callable by a role the matrix does not know', rows.filter((r) => r.guarded && r.roles).every((r) => r.roles.every((x) => matrix.ROLES.includes(x))));
  const staffAdmin = rows.filter((r) => /^\/api\/faculty\/(permissions|audit-logs|faculty-list)/.test(r.path));
  s.check('the permissions, audit-log and staff-list routes exist and are Admin only', staffAdmin.length >= 4 && staffAdmin.every((r) => r.roles && r.roles.length === 1 && r.roles[0] === 'admin'));
};
