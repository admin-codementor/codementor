// Faculty permission flags.
// Stored as JSONB on users.permissions.
// Empty object ({}) means "use defaults" — all faculty start fully enabled
// except run_plagiarism and manage_contests which must be explicitly granted.

const ALL_PERMISSIONS = [
  'manage_problems',    // create / edit / delete problems
  'manage_assignments', // create / edit assignments and deadlines
  'manage_students',    // view student profiles and submission history
  'export_data',        // download CSV marks and reports
  'generate_ai_tests',  // use AI test-case generator
  'run_plagiarism',     // run JPlag plagiarism analysis
  'manage_contests',    // create / manage contests and scoreboards
];

const DEFAULT_FACULTY_PERMISSIONS = {
  manage_problems:    true,
  manage_assignments: true,
  manage_students:    true,
  export_data:        true,
  generate_ai_tests:  true,
  run_plagiarism:     true,
  manage_contests:    true,
};

// Resolve effective permissions for a user.
// Admin has all permissions. Faculty with empty {} gets defaults.
const resolvePermissions = (user) => {
  if (user.role === 'admin') {
    return Object.fromEntries(ALL_PERMISSIONS.map(p => [p, true]));
  }
  if (!user.permissions || Object.keys(user.permissions).length === 0) {
    return { ...DEFAULT_FACULTY_PERMISSIONS };
  }
  return user.permissions;
};

// Middleware factory — gates a route on a single permission flag.
// Usage: router.post('/problems', requirePermission('manage_problems'), handler)
const requirePermission = (perm) => {
  const middleware = (req, res, next) => {
  const effective = resolvePermissions(req.user || {});
  if (!effective[perm]) {
    return res.status(403).json({
      success: false,
      error: `Permission denied — '${perm}' is required for this action.`,
    });
  }
  next();
  };
  // Readable by the route audit; does not change behavior.
  middleware._authz = { permission: perm };
  return middleware;
};

module.exports = { ALL_PERMISSIONS, DEFAULT_FACULTY_PERMISSIONS, resolvePermissions, requirePermission };
