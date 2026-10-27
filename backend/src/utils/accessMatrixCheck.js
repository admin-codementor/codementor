// Compares the real routes (from middleware/routeGuard.js) with the access matrix (config/accessMatrix.js). Pure: rows and a matrix in,
// a list of problems out, so every rule of the check is itself testable.

const ANY = 'any';

/** '/api/x/*' matches one segment, '/api/x/**' the rest (including nothing). */
function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '**') return i === p.length - 1;
    if (i >= s.length) return false;
    if (p[i] !== '*' && p[i] !== s[i]) return false;
  }
  return p.length === s.length;
}

const methodOk = (rule, method) => !rule.methods || rule.methods.includes(method);
const firstRule = (rules, row) => rules.find((r) => methodOk(r, row.method) && matchPath(r.path, row.path)) || null;

/** The row's real role set as a sorted list, or 'any' when no role check applies to it. */
const realRoles = (row) => (row.roles === null || row.roles === undefined ? ANY : [...row.roles].sort());
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * @param {{method, path, guarded, publicReason, roles}[]} rows  from auditRoutes
 * @param {{rules, publicRoutes, invariants}} matrix
 */
function checkAccess(rows, matrix) {
  const problems = [];
  const add = (kind, row, detail) => problems.push({ kind, route: `${row.method} ${row.path}`, detail });

  for (const row of rows) {
    // Open routes: must be declared in the matrix (the route audit already insists on a publicRoute reason in the code).
    if (!row.guarded) {
      if (!firstRule(matrix.publicRoutes, row)) add('public-not-listed', row, 'reachable without a token but not listed in publicRoutes');
      continue;
    }
    // A public rule must not also be guarded and vice versa is handled above; now the role policy for guarded routes.
    const rule = firstRule(matrix.rules, row);
    if (!rule) { add('unclassified', row, 'no rule in accessMatrix.rules: decide who may call it and add one'); continue; }
    const real = realRoles(row);
    const want = rule.roles === ANY ? ANY : [...rule.roles].sort();
    const ok = want === ANY ? real === ANY : (real !== ANY && sameSet(real, want));
    if (!ok) add('mismatch', row, `real roles ${real === ANY ? 'any' : real.join('+')}, matrix says ${want === ANY ? 'any' : want.join('+')} (rule ${rule.path})`);
  }

  for (const inv of matrix.invariants) {
    for (const row of rows.filter((r) => r.guarded && inv.appliesTo(r))) {
      const real = realRoles(row);
      if (inv.forbidAny && real === ANY) add(`invariant:${inv.id}`, row, `${inv.text} (no role check)`);
      if (inv.forbidRole && (real === ANY || real.includes(inv.forbidRole))) add(`invariant:${inv.id}`, row, `${inv.text} (callable by ${real === ANY ? 'any role' : real.join('+')})`);
      if (inv.exactRoles && (real === ANY || !sameSet(real, [...inv.exactRoles].sort()))) add(`invariant:${inv.id}`, row, `${inv.text} (callable by ${real === ANY ? 'any role' : real.join('+')})`);
    }
  }

  // Rules that match no route are dead policy: they hide a removed route or a typo.
  const unused = matrix.rules.filter((rule) => !rows.some((row) => row.guarded && firstRule(matrix.rules, row) === rule));
  const unusedPublic = matrix.publicRoutes.filter((rule) => !rows.some((row) => !row.guarded && firstRule(matrix.publicRoutes, row) === rule));
  return { problems, unusedRules: unused.map((r) => r.path), unusedPublic: unusedPublic.map((r) => r.path) };
}

module.exports = { checkAccess, matchPath, firstRule };
