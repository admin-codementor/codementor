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
// 'tnp' is the Training & Placement office: its own routes under /api/placement, and nothing under /api/faculty.

const ANY = 'any';
const STAFF = ['faculty', 'hod', 'admin'];
const ROLES = ['student', 'faculty', 'hod', 'admin', 'tnp'];

const rules = [
  // ── Admin only ────────────────────────────────────────────────────────────────
  { path: '/api/faculty/permissions/**', roles: ['admin'], note: 'who holds which staff permission' },
  { path: '/api/admin/**', roles: ['admin'], note: 'people, college settings, the audit log and login history, the college overview' },
  { path: '/api/faculty/audit-logs', roles: ['admin'], note: 'the audit trail' },
  { path: '/api/faculty/faculty-list', roles: ['admin'], note: 'all staff accounts' },
  { path: '/api/faculty/analytics', roles: ['admin'], note: 'college-wide class analytics' },

  // ── Academic structure: terms, classes, mentors, assignments, access requests ───
  { methods: ['POST'], path: '/api/academic/terms', roles: ['admin'], note: 'only the Admin creates a term' },
  { methods: ['POST'], path: '/api/academic/terms/*/activate', roles: ['admin'], note: 'only the Admin makes a term the active one' },
  { methods: ['GET'], path: '/api/academic/terms', roles: STAFF },
  { path: '/api/academic/terms/**', roles: ['hod', 'admin'], note: 'classes, placements, electives, consistency: a HOD for their department (checked inside), the Admin for all' },
  { path: '/api/academic/classes/**', roles: ['hod', 'admin'], note: 'roster, class teacher, sub-mentors, assignments' },
  { path: '/api/academic/assignments/**', roles: ['hod', 'admin'], note: 'reallocate or end a teaching assignment' },
  { methods: ['GET'], path: '/api/academic/staff', roles: ['hod', 'admin'], note: 'department staff to pick a class teacher or mentor from' },
  { methods: ['GET'], path: '/api/academic/class-directory', roles: ['faculty', 'hod'], note: 'class names and sizes of the own department of the caller, to ask for access' },
  { methods: ['GET'], path: '/api/academic/me', roles: ['student'], note: 'a student\'s own class, class teacher and sub-mentor' },
  { methods: ['GET'], path: '/api/academic/my-classes', roles: ['faculty', 'hod'], note: 'a faculty member\'s own classes this term' },
  { methods: ['POST'], path: '/api/academic/requests', roles: ['faculty'], note: 'a faculty member asks for access to another class' },
  { methods: ['GET'], path: '/api/academic/requests', roles: STAFF, note: 'own requests (faculty), the department\'s (HOD), all (Admin)' },
  { methods: ['POST'], path: '/api/academic/requests/*/decide', roles: ['hod', 'admin'], note: 'approve or decline, for the class\'s department (checked inside)' },

  // ── Placement: the Training & Placement office manages, an HOD reads their department, a student sees their own ──
  { path: '/api/placement/me', roles: ['student'], note: "a student's own drives, record and offers" },
  { path: '/api/placement/me/**', roles: ['student'], note: 'apply to a drive, withdraw' },
  { methods: ['GET'], path: '/api/placement/drives', roles: ['tnp', 'hod', 'admin'], note: "an HOD sees only their department's published drives (checked inside)" },
  { methods: ['GET'], path: '/api/placement/drives/*', roles: ['tnp', 'hod', 'admin'], note: "applicants and results; an HOD only their own department's students" },
  { methods: ['GET'], path: '/api/placement/meta', roles: ['tnp', 'hod', 'admin'], note: 'department and year names for the pickers' },
  { methods: ['GET'], path: '/api/placement/analytics', roles: ['tnp', 'hod', 'admin'] },
  { methods: ['GET'], path: '/api/placement/readiness', roles: ['tnp', 'hod', 'admin'] },
  { methods: ['GET'], path: '/api/placement/records', roles: ['tnp', 'hod', 'admin'], note: "CGPA and backlogs: the student, T&P, Admin and the HOD of the student's department" },
  { methods: ['GET'], path: '/api/placement/outside', roles: ['tnp', 'hod', 'admin'] },
  { path: '/api/placement/**', roles: ['tnp', 'admin'], note: 'everything else changes data or leaves the system: drives, results, CGPA uploads, outside offers, notices, exports' },

  // ── HOD and Admin ─────────────────────────────────────────────────────────────
  { path: '/api/messages/reported', roles: ['hod', 'admin'], note: 'reviewing reported conversations' },
  { path: '/api/messages/reported/**', roles: ['hod', 'admin'], note: 'reviewing reported conversations' },
  { path: '/api/faculty/cohort-topics', roles: ['hod', 'admin'], note: 'department-wide topic comparison' },
  { path: '/api/faculty/analytics/cohorts', roles: ['hod', 'admin'], note: 'department-wide cohort comparison' },
  { path: '/api/faculty/analytics/cohort-students', roles: ['hod', 'admin'], note: 'ranked students of a department cohort' },
  { path: '/api/faculty/alumni', roles: ['hod', 'admin'] },
  { path: '/api/faculty/alumni/**', roles: ['hod', 'admin'] },
  { path: '/api/faculty/department', roles: ['hod', 'admin'], note: 'department dashboard' },
  { path: '/api/faculty/department/**', roles: ['hod', 'admin'] },
  { path: '/api/faculty/department-leaderboard', roles: ['hod', 'admin'] },
  { path: '/api/faculty/labs', roles: ['hod', 'admin'] },
  { path: '/api/faculty/mentors', roles: ['hod', 'admin'] },
  { path: '/api/faculty/mentors/**', roles: ['hod', 'admin'] },
  { path: '/api/faculty/platform-scores/refresh', roles: ['hod', 'admin'], note: 're-reads linked coding profiles' },
  { path: '/api/faculty/department-export', roles: ['hod', 'admin'], note: 'the audited department export; a HOD only their own department' },
  { path: '/api/faculty/department-export/fields', roles: ['hod', 'admin'] },
  { path: '/api/faculty/practice-analytics', roles: ['hod', 'admin'], note: 'department practice analytics; a HOD only their own department' },
  { path: '/api/faculty/batches', roles: ['hod', 'admin'], note: 'the batches present in the department, for the pickers' },
  { path: '/api/faculty/platform-unverified', roles: ['hod', 'admin'], note: 'typed platform numbers waiting to be checked' },
  { path: '/api/faculty/platform-verify', roles: ['hod', 'admin'], note: 'verify or reject one typed number; a HOD only for their own department' },
  { path: '/api/faculty/platform-thresholds', roles: ['hod', 'admin'], note: 'college red/green thresholds' },
  { path: '/api/faculty/portfolio', roles: ['hod', 'admin'] },

  // ── Student only ──────────────────────────────────────────────────────────────
  { path: '/api/career/**', roles: ['student'], note: 'resume check, mock interview, own readiness' },
  { path: '/api/student/portfolio', roles: ['student'] },
  { path: '/api/student/portfolio/**', roles: ['student'] },

  // ── Any signed-in role ────────────────────────────────────────────────────────
  { path: '/api/student/**', roles: ANY, note: 'student pages. Handlers act on the caller\'s own id. Staff reuse PUT /profile (their own name) and the problem pages (preview), so this is not restricted to students yet' },
  { methods: ['POST'], path: '/api/problem-reports', roles: ANY, note: 'a person sends "Report a problem" from an error screen; a few an hour' },
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

  // The Training & Placement office helps a student who was cut off in an exam: the list of exams, who is in one, and resuming them. Nothing more.
  { methods: ['GET'], path: '/api/exams', roles: [...STAFF, 'tnp'], note: 'T&P sees published exams only' },
  { methods: ['GET'], path: '/api/exams/*/roster', roles: [...STAFF, 'tnp'], note: 'who is in the exam and in what state' },
  { methods: ['POST'], path: '/api/exams/*/attempts/*/reopen', roles: [...STAFF, 'tnp'], note: 'resume a student; a reason is required and kept' },

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
  { methods: ['GET'], path: '/api/system-status', note: 'platform status for uptime monitors (api, database, judge: reachable or not, nothing else)' },
];

// Invariants: true however the rules above are edited. Each is checked against the REAL routes.
const invariants = [
  { id: 'admin-area-is-admin-only', text: 'Everything under /api/admin, whatever the method, is callable by an Admin and nobody else.',
    appliesTo: (r) => r.path.startsWith('/api/admin'), exactRoles: ['admin'] },
  { id: 'placement-data-never-open-to-faculty', text: 'Placement routes (CGPA, backlogs, offers) are never callable by a faculty member.',
    appliesTo: (r) => r.path.startsWith('/api/placement'), forbidRole: 'faculty' },
  { id: 'placement-office-routes-never-open-to-students', text: 'Only /api/placement/me is a student route; nothing else under /api/placement is callable by a student.',
    appliesTo: (r) => r.path.startsWith('/api/placement') && !r.path.startsWith('/api/placement/me'), forbidRole: 'student' },
  { id: 'placement-changes-need-the-office', text: "Anything under /api/placement that changes data or exports, other than a student's own apply and withdraw, is only for T&P and the Admin.",
    appliesTo: (r) => r.path.startsWith('/api/placement') && !r.path.startsWith('/api/placement/me') && (r.method !== 'GET' || /\/(batches|export)/.test(r.path)), exactRoles: ['tnp', 'admin'] },
  { id: 'tnp-has-no-staff-console', text: 'The Training & Placement office never has access to the faculty console.',
    appliesTo: (r) => r.path.startsWith('/api/faculty'), forbidRole: 'tnp' },
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
