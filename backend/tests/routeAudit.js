// Loads the Express app with its mount paths recorded.
//
// Express 5 compiles `app.use('/api/student', router)` into a matcher closure
// and keeps no readable copy of the path, so the only way to know where a
// router hangs is to watch it being mounted. This patches `use` before the app
// module is required, records the pairs, and puts `use` back.
//
// It lives under tests/ on purpose: the patch has to happen before app.js is
// evaluated, and that load-order dependence has no business in src/.
const express = require('express');
const { auditRoutes } = require('../src/middleware/routeGuard');

let cached = null;

function loadAppWithMounts() {
  if (cached) return cached;

  const mounts = new WeakMap();
  const original = express.application.use;

  express.application.use = function patchedUse(...args) {
    if (typeof args[0] === 'string') {
      for (const arg of args.slice(1)) {
        // A router is a function with its own layer stack; plain middleware is not.
        if (typeof arg === 'function' && arg.stack) mounts.set(arg, args[0]);
      }
    }
    return original.apply(this, args);
  };

  try {
    const app = require('../src/app');
    cached = { app, mounts };
    return cached;
  } finally {
    express.application.use = original;
  }
}

/** Every route in the app, with whether it is guarded and why it is open. */
function routeTable() {
  const { app, mounts } = loadAppWithMounts();
  return auditRoutes(app, mounts);
}

module.exports = { loadAppWithMounts, routeTable };
