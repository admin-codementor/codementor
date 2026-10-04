// Authorization you cannot forget.
//
// Every route in this app is either behind `protect` or deliberately open. The
// problem is that "deliberately" has, until now, been a matter of whoever wrote
// the file remembering — and the failure is silent: a route mounted without
// `protect` works perfectly, serves everyone, and looks exactly like a route
// that is meant to. Nothing fails, so nothing tells you.
//
// So: a route meant to be open must say so with `publicRoute()`, and
// `auditRoutes()` walks the mounted Express stack and reports anything that is
// neither guarded nor declared. The smoke suite fails on any such route, so a
// new unguarded endpoint cannot reach production unnoticed.
//
// This is the cheap version of what a framework like NestJS gives you with
// guards — see Appendix D of the student persona plan for why we are not
// migrating for it.
const { protect } = require('./auth.middleware');

/**
 * Marks a route as intentionally reachable without a token.
 *
 * The reason is required and is printed by the audit, so the list of open
 * endpoints can be reviewed by reading one report rather than by reading every
 * route file.
 *
 *   router.get('/profile/:handle', publicRoute('published student profiles'), handler)
 */
function publicRoute(reason) {
  if (!reason || typeof reason !== 'string') {
    throw new Error('publicRoute(reason) needs a reason — it is shown in the route audit.');
  }
  const mw = (req, res, next) => next();
  mw._authz = { public: true, reason };
  return mw;
}

// Compared by reference, not by name: `protect` is an arrow function assigned to
// an export, so it has no inferred name and `fn.name === ''`. Matching on a name
// would have silently reported every route in the app as unguarded.
const isProtect = (fn) => fn === protect;
const isPublicMarker = (fn) => typeof fn === 'function' && fn._authz?.public === true;

/**
 * Flattens an Express app's router tree into one row per route.
 *
 * `mounts` maps a sub-router's handle to the path it was mounted at. Express 5
 * keeps that path only inside a compiled matcher closure, so it cannot be read
 * back off the layer; `tests/routeAudit.js` records it at mount time instead.
 * Without it the audit still finds every route and still judges every route
 * correctly — the paths it prints are just missing their prefix.
 */
function auditRoutes(app, mounts = new WeakMap()) {
  const rows = [];

  const walk = (stack, prefix, inherited) => {
    // `router.use(protect)` applies to everything after it in the same stack, so
    // this is carried forward as the walk proceeds rather than computed upfront.
    let guardedHere = inherited.guarded;
    let publicHere = inherited.publicReason;

    for (const layer of stack) {
      const handle = layer.handle;

      if (!layer.route && typeof handle === 'function' && !handle.stack) {
        if (isProtect(handle)) guardedHere = true;
        if (isPublicMarker(handle)) publicHere = handle._authz.reason;
        continue;
      }

      if (layer.route) {
        const chain = layer.route.stack.map((s) => s.handle);
        const marker = chain.find(isPublicMarker);
        const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
        for (const method of methods) {
          rows.push({
            method: method.toUpperCase(),
            path: joinPath(prefix, layer.route.path),
            guarded: guardedHere || chain.some(isProtect),
            publicReason: marker ? marker._authz.reason : publicHere,
          });
        }
        continue;
      }

      if (handle?.stack) {
        walk(handle.stack, joinPath(prefix, mounts.get(handle) ?? ''), {
          guarded: guardedHere,
          publicReason: publicHere,
        });
      }
    }
  };

  walk(app.router?.stack || app._router?.stack || [], '', { guarded: false, publicReason: null });
  return rows;
}

/** Routes that are neither behind `protect` nor declared with `publicRoute`. */
function undeclaredRoutes(app, mounts) {
  return auditRoutes(app, mounts).filter((r) => !r.guarded && !r.publicReason);
}

/** Routes that are open on purpose — the list worth reviewing before a release. */
function declaredPublicRoutes(app, mounts) {
  return auditRoutes(app, mounts).filter((r) => !r.guarded && r.publicReason);
}

function joinPath(prefix, path) {
  const p = typeof path === 'string' ? path : '';
  const joined = `${prefix}${p}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined || '/';
}

module.exports = { publicRoute, auditRoutes, undeclaredRoutes, declaredPublicRoutes };
