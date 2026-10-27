// Who may call which API route. The single written record of the route-level access policy.
//
// tests/pure/accessMatrix.js loads the real Express app, reads every route's REAL role list (from the `authorize(...)` calls on it
// and on the routers above it) and compares it with this file. So:
//   - a new route that is not covered by a rule fails the build (you must decide who may call it, and write it down here);
//   - a route whose real roles differ from its rule fails the build (someone loosened or tightened it without changing the policy);
//   - the INVARIANTS at the bottom cannot be loosened by editing a rule above them.
//
// What this covers and what it does not: it checks the ROUTE layer (who gets past `protect` and `authorize`). Inside a handler there
// are further checks (own data only, own department, own class) that are not visible here and are covered by the smoke suite.
//
// Rules are matched top to bottom, first match wins, so put specific rules above general ones.
//   path      '/api/x/*' matches ONE segment, '/api/x/**' matches the rest (including nothing). Route parameters (:id) match '*'.
//   methods   optional; omitted means every method
//   roles     a list of roles that may call it, or ANY for "any signed-in role"
//   note      why, for the person reading this file
//
// T&P is added here (role 'tnp') when stream S5 lands.

const ANY = 'any';
const STAFF = ['faculty', 'hod', 'admin'];
const ROLES = ['student', 'faculty', 'hod', 'admin'];

const rules = [
  // ── Admin only ────────────────────────────────────────────────────────────────
  { path: '/api/faculty/permissions/**', roles: ['admin'], note: 'who holds which staff permission' },
  { path: '/api/faculty/audit-logs', roles: ['admin'], note: 'the audit trail' },
  { path: '/api/faculty/faculty-list', roles: ['admin'], note: 'all staff accounts' },
  { path: '/api/faculty/analytics', roles: ['admin'], note: 'college-wide class analytics' },

  // ── HOD and Admin ─────────────────────────────────────────────────────────────
  { path: '/api/messages/reported', roles: ['hod', 'admin'], note: 'reviewing reported conversations' },
  { path: '/api/messages/reported/**', roles: ['hod', 'admin'], note: 'reviewing reported conversations' },
  { path: '/api/faculty/alumni', roles: ['hod', 'admin'] },
  { path: '/api/faculty/alumni/**', roles: ['hod', 'admin'] },
  { path: '/api/faculty/department', roles: ['hod', 'admin'], note: 'department dashboard' },
  { path: '/api/faculty/department/**', roles: ['hod', 'admin'] },
  { path: '/api/faculty/department-leaderboard', roles: ['hod', 'admin'] },
  { path: '/api/faculty/labs', roles: ['hod', 'admin'] },
  { path: '/api/faculty/mentors', roles: ['hod', 'admin'] },
  { path: '/api/faculty/mentors/**', roles: ['hod', 'admin'] },
  { path: '/api/faculty/placement/**', roles: ['hod', 'admin'], note: 'drives, applications, analytics, readiness (T&P joins in S5)' },
  { path: '/api/faculty/platform-scores/refresh', roles: ['hod', 'admin'], note: 're-reads linked coding profiles' },
  { path: '/api/faculty/platform-thresholds', roles: ['hod', 'admin'], note: 'college red/green thresholds' },
  { path: '/api/faculty/portfolio', roles: ['hod', 'admin'] },

  // ── Student only ──────────────────────────────────────────────────────────────
  { path: '/api/career/**', roles: ['student'], note: 'resume check, mock interview, own readiness' },
  { path: '/api/student/portfolio', roles: ['student'] },
  { path: '/api/student/portfolio/**', roles: ['student'] },

  // ── Any signed-in role ────────────────────────────────────────────────────────
  { path: '/api/student/**', roles: ANY, note: 'student pages. Handlers act on the caller\'s own id. Staff reuse PUT /profile (their own name) and the problem pages (preview), so this is not restricted to students yet' },
  { path: '/api/2fa/**', roles: ANY, note: 'each person manages their own two-factor sign-in' },
  { path: '/api/ai/**', roles: ANY, note: 'AI tutor, error explainer, code review; exam-locked inside' },
  { path: '/api/auth/set-password', roles: ANY, note: 'first-login password change' },
  { path: '/api/calendar', roles: ANY, note: 'scoped to the viewer inside the handler' },
  { path: '/api/courses', roles: ANY, note: 'published courses; scoped inside' },
  { path: '/api/courses/*', roles: ANY },
  { path: '/api/profiles/**', roles: ANY, note: 'own coding profiles and the leaderboard' },
  { path: '/api/rating/leaderboard', roles: ANY },
  { path: '/api/rating/user/*', roles: ANY },
  { path: '/api/roadmaps', roles: ANY },
  { path: '/api/roadmaps/*', roles: ANY },
  { path: '/api/messages/**', roles: ANY, note: 'direct messages; participation is checked inside' },
  { path: '/api/proctor/event', roles: ANY, note: 'a student client records an event for itself' },
  { methods: ['GET'], path: '/api/classrooms', roles: ANY, note: 'a student lists their classes; staff list theirs' },
  { methods: ['POST'], path: '/api/classrooms/join', roles: ANY, note: 'join with a code' },
  // Sitting an exam or a test: ownership and visibility are checked inside the handlers.
  { path: '/api/exams/available', roles: ANY },
  { path: '/api/exams/*/instructions', roles: ANY },
  { path: '/api/exams/*/start', roles: ANY },
  { path: '/api/exams/*/submit', roles: ANY },
  { path: '/api/exams/*/attempt', roles: ANY },
  { path: '/api/exams/*/attempt/**', roles: ANY },
  { path: '/api/mcq/available', roles: ANY },
  { path: '/api/mcq/*/start', roles: ANY },
  { path: '/api/mcq/*/submit', roles: ANY },
  // Contests: staff create and configure, everyone else takes part.
  { methods: ['POST'], path: '/api/contests', roles: STAFF, note: 'needs the manage_contests permission too' },
  { path: '/api/contests/*/scoreboard-mode', roles: STAFF, note: 'needs the manage_contests permission too' },
  { path: '/api/contests', roles: ANY },
  { path: '/api/contests/**', roles: ANY },

  // ── Staff (faculty, HOD, Admin) ───────────────────────────────────────────────
  { path: '/api/faculty/**', roles: STAFF, note: 'the staff console; further limited by department and class inside' },
  { path: '/api/classrooms', roles: STAFF },
  { path: '/api/classrooms/**', roles: STAFF },
  { path: '/api/exams', roles: STAFF, note: 'authoring and results' },
  { path: '/api/exams/**', roles: STAFF },
  { path: '/api/mcq/tests', roles: STAFF },
  { path: '/api/mcq/tests/**', roles: STAFF },
  { path: '/api/pdf/**', roles: STAFF },
  { path: '/api/problem-import/**', roles: STAFF, note: 'needs the manage_problems permission too' },
  { path: '/api/judge-health', roles: STAFF },
  { path: '/api/proctor/assignment/*', roles: STAFF },
  { path: '/api/rating/contest/*/recompute', roles: STAFF, note: 'needs the manage_contests permission too' },
];

// Routes reachable without a token on purpose. Adding one means adding it here, so the change shows up in review.
const publicRoutes = [
  { methods: ['POST'], path: '/api/auth/refresh', note: 'exchange a refresh token' },
  { methods: ['POST'], path: '/api/auth/firebase', note: 'sign in' },
  { methods: ['POST'], path: '/api/2fa/verify', note: 'second step of sign in' },
  { methods: ['POST'], path: '/api/submit', note: 'run and submit code; optional sign-in, limited by address' },
  { methods: ['GET'], path: '/api/submit/status/*', note: 'poll a verdict' },
  { methods: ['GET'], path: '/api/submit/history/*', note: 'own history when signed in' },
  { methods: ['GET'], path: '/api/submissions', note: 'own submissions when signed in' },
  { methods: ['GET'], path: '/api/problems', note: 'the problem list' },
  { methods: ['GET'], path: '/api/problems/*', note: 'one problem (hidden tests are never returned)' },
  { methods: ['GET'], path: '/api/problems/*/adjacent', note: 'previous and next problem' },
  { methods: ['GET'], path: '/api/public/profile/*', note: 'a student\'s published profile' },
  { methods: ['POST'], path: '/api/public/csp-report', note: 'browser security reports' },
  { methods: ['GET'], path: '/health', note: 'liveness probe' },
];

// Invariants: true however the rules above are edited. Each is checked against the REAL routes.
const invariants = [
  { id: 'staff-console-never-open-to-students', text: 'No route under /api/faculty may be callable by a student or by every role.',
    appliesTo: (r) => r.path.startsWith('/api/faculty'), forbidRole: 'student' },
  { id: 'admin-only-stays-admin-only', text: 'Permissions, the audit log and the staff list are Admin only.',
    appliesTo: (r) => /^\/api\/faculty\/(permissions|audit-logs|faculty-list)/.test(r.path), exactRoles: ['admin'] },
  { id: 'authoring-never-open-to-students', text: 'Importing problems, exporting PDFs and the judge health page are never callable by a student.',
    appliesTo: (r) => /^\/api\/(problem-import|pdf|judge-health)/.test(r.path), forbidRole: 'student' },
  { id: 'changes-to-staff-data-need-staff', text: 'Any route that changes data under /api/faculty must have a role check.',
    appliesTo: (r) => r.path.startsWith('/api/faculty') && r.method !== 'GET', forbidAny: true },
];

module.exports = { ANY, STAFF, ROLES, rules, publicRoutes, invariants };
