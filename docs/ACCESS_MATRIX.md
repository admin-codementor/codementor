# Access matrix: who may call which API route

**Generated** from `backend/src/config/accessMatrix.js` by `npm run docs:access` in `backend/`. Do not edit by hand: change the matrix and regenerate.

The test `backend/tests/pure/accessMatrix.js` reads the real role checks on every route and fails the build if a route is missing from this
policy, differs from it, or breaks an invariant below. This covers the **route layer** (who passes sign-in and role checks). Checks inside a
handler (own data only, own department, own class) are not shown here.

Rules are read top to bottom and the first match wins. `*` is one path segment, `**` is the rest.

## Routes that need a token

| Path | Methods | Who may call it | Why |
|---|---|---|---|
| `/api/faculty/permissions/**` | all | admin | who holds which staff permission |
| `/api/admin/**` | all | admin | people, college settings, the audit log and login history, the college overview |
| `/api/faculty/audit-logs` | all | admin | the audit trail |
| `/api/faculty/faculty-list` | all | admin | all staff accounts |
| `/api/faculty/analytics` | all | admin | college-wide class analytics |
| `/api/academic/terms` | POST | admin | only the Admin creates a term |
| `/api/academic/terms/*/activate` | POST | admin | only the Admin makes a term the active one |
| `/api/academic/terms` | GET | faculty, hod, admin |  |
| `/api/academic/terms/**` | all | hod, admin | classes, placements, electives, consistency: a HOD for their department (checked inside), the Admin for all |
| `/api/academic/classes/**` | all | hod, admin | roster, class teacher, sub-mentors, assignments |
| `/api/academic/assignments/**` | all | hod, admin | reallocate or end a teaching assignment |
| `/api/academic/staff` | GET | hod, admin | department staff to pick a class teacher or mentor from |
| `/api/academic/class-directory` | GET | faculty, hod | class names and sizes of the own department of the caller, to ask for access |
| `/api/academic/me` | GET | student | a student's own class, class teacher and sub-mentor |
| `/api/academic/my-classes` | GET | faculty, hod | a faculty member's own classes this term |
| `/api/academic/requests` | POST | faculty | a faculty member asks for access to another class |
| `/api/academic/requests` | GET | faculty, hod, admin | own requests (faculty), the department's (HOD), all (Admin) |
| `/api/academic/requests/*/decide` | POST | hod, admin | approve or decline, for the class's department (checked inside) |
| `/api/placement/me` | all | student | a student's own drives, record and offers |
| `/api/placement/me/**` | all | student | apply to a drive, withdraw |
| `/api/placement/drives` | GET | tnp, hod, admin | an HOD sees only their department's published drives (checked inside) |
| `/api/placement/drives/*` | GET | tnp, hod, admin | applicants and results; an HOD only their own department's students |
| `/api/placement/meta` | GET | tnp, hod, admin | department and year names for the pickers |
| `/api/placement/analytics` | GET | tnp, hod, admin |  |
| `/api/placement/readiness` | GET | tnp, hod, admin |  |
| `/api/placement/records` | GET | tnp, hod, admin | CGPA and backlogs: the student, T&P, Admin and the HOD of the student's department |
| `/api/placement/outside` | GET | tnp, hod, admin |  |
| `/api/placement/**` | all | tnp, admin | everything else changes data or leaves the system: drives, results, CGPA uploads, outside offers, notices, exports |
| `/api/messages/reported` | all | hod, admin | reviewing reported conversations |
| `/api/messages/reported/**` | all | hod, admin | reviewing reported conversations |
| `/api/faculty/cohort-topics` | all | hod, admin | department-wide topic comparison |
| `/api/faculty/analytics/cohorts` | all | hod, admin | department-wide cohort comparison |
| `/api/faculty/analytics/cohort-students` | all | hod, admin | ranked students of a department cohort |
| `/api/faculty/alumni` | all | hod, admin |  |
| `/api/faculty/alumni/**` | all | hod, admin |  |
| `/api/faculty/department` | all | hod, admin | department dashboard |
| `/api/faculty/department/**` | all | hod, admin |  |
| `/api/faculty/department-leaderboard` | all | hod, admin |  |
| `/api/faculty/labs` | all | hod, admin |  |
| `/api/faculty/mentors` | all | hod, admin |  |
| `/api/faculty/mentors/**` | all | hod, admin |  |
| `/api/faculty/platform-scores/refresh` | all | hod, admin | re-reads linked coding profiles |
| `/api/faculty/department-export` | all | hod, admin | the audited department export; a HOD only their own department |
| `/api/faculty/department-export/fields` | all | hod, admin |  |
| `/api/faculty/practice-analytics` | all | hod, admin | department practice analytics; a HOD only their own department |
| `/api/faculty/batches` | all | hod, admin | the batches present in the department, for the pickers |
| `/api/faculty/platform-unverified` | all | hod, admin | typed platform numbers waiting to be checked |
| `/api/faculty/platform-verify` | all | hod, admin | verify or reject one typed number; a HOD only for their own department |
| `/api/faculty/platform-thresholds` | all | hod, admin | college red/green thresholds |
| `/api/faculty/portfolio` | all | hod, admin |  |
| `/api/career/**` | all | student | resume check, mock interview, own readiness |
| `/api/student/portfolio` | all | student |  |
| `/api/student/portfolio/**` | all | student |  |
| `/api/student/**` | all | any signed-in role | student pages. Handlers act on the caller's own id. Staff reuse PUT /profile (their own name) and the problem pages (preview), so this is not restricted to students yet |
| `/api/problem-reports` | POST | any signed-in role | a person sends "Report a problem" from an error screen; a few an hour |
| `/api/2fa/**` | all | any signed-in role | each person manages their own two-factor sign-in |
| `/api/ai/**` | all | any signed-in role | AI tutor, error explainer, code review; exam-locked inside |
| `/api/auth/set-password` | all | any signed-in role | first-login password change |
| `/api/calendar` | all | any signed-in role | scoped to the viewer inside the handler |
| `/api/courses` | all | any signed-in role | published courses; scoped inside |
| `/api/courses/*` | all | any signed-in role |  |
| `/api/profiles/**` | all | any signed-in role | own coding profiles and the leaderboard |
| `/api/rating/leaderboard` | all | any signed-in role |  |
| `/api/rating/user/*` | all | any signed-in role |  |
| `/api/roadmaps` | all | any signed-in role |  |
| `/api/roadmaps/*` | all | any signed-in role |  |
| `/api/messages/**` | all | any signed-in role | direct messages; participation is checked inside |
| `/api/proctor/event` | all | any signed-in role | a student client records an event for itself |
| `/api/classrooms` | GET | any signed-in role | a student lists their classes; staff list theirs |
| `/api/classrooms/join` | POST | any signed-in role | join with a code |
| `/api/exams/available` | all | any signed-in role |  |
| `/api/exams/*/instructions` | all | any signed-in role |  |
| `/api/exams/*/start` | all | any signed-in role |  |
| `/api/exams/*/submit` | all | any signed-in role |  |
| `/api/exams/*/attempt` | all | any signed-in role |  |
| `/api/exams/*/attempt/**` | all | any signed-in role |  |
| `/api/mcq/available` | all | any signed-in role |  |
| `/api/mcq/*/start` | all | any signed-in role |  |
| `/api/mcq/*/submit` | all | any signed-in role |  |
| `/api/contests` | POST | faculty, hod, admin | needs the manage_contests permission too |
| `/api/contests/*/scoreboard-mode` | all | faculty, hod, admin | needs the manage_contests permission too |
| `/api/contests` | all | any signed-in role |  |
| `/api/contests/**` | all | any signed-in role |  |
| `/api/exams` | GET | faculty, hod, admin, tnp | T&P sees published exams only |
| `/api/exams/*/roster` | GET | faculty, hod, admin, tnp | who is in the exam and in what state |
| `/api/exams/*/attempts/*/reopen` | POST | faculty, hod, admin, tnp | resume a student; a reason is required and kept |
| `/api/faculty/**` | all | faculty, hod, admin | the staff console; further limited by department and class inside |
| `/api/classrooms` | all | faculty, hod, admin |  |
| `/api/classrooms/**` | all | faculty, hod, admin |  |
| `/api/exams` | all | faculty, hod, admin | authoring and results |
| `/api/exams/**` | all | faculty, hod, admin |  |
| `/api/mcq/tests` | all | faculty, hod, admin |  |
| `/api/mcq/tests/**` | all | faculty, hod, admin |  |
| `/api/pdf/**` | all | faculty, hod, admin |  |
| `/api/problem-import/**` | all | faculty, hod, admin | needs the manage_problems permission too |
| `/api/judge-health` | all | faculty, hod, admin |  |
| `/api/proctor/assignment/*` | all | faculty, hod, admin |  |
| `/api/rating/contest/*/recompute` | all | faculty, hod, admin | needs the manage_contests permission too |

## Routes open without a token (on purpose)

| Path | Methods | Why |
|---|---|---|
| `/api/auth/refresh` | POST | exchange a refresh token |
| `/api/auth/firebase` | POST | sign in |
| `/api/2fa/verify` | POST | second step of sign in |
| `/api/submit` | POST | run and submit code; optional sign-in, limited by address |
| `/api/submit/status/*` | GET | poll a verdict |
| `/api/submit/history/*` | GET | own history when signed in |
| `/api/submissions` | GET | own submissions when signed in |
| `/api/problems` | GET | the problem list |
| `/api/problems/*` | GET | one problem (hidden tests are never returned) |
| `/api/problems/*/adjacent` | GET | previous and next problem |
| `/api/public/profile/*` | GET | a student's published profile |
| `/api/public/csp-report` | POST | browser security reports |
| `/health` | GET | liveness probe |
| `/api/system-status` | GET | platform status for uptime monitors (api, database, judge: reachable or not, nothing else) |

## Invariants (true however the rules are edited)

- **admin-area-is-admin-only**: Everything under /api/admin, whatever the method, is callable by an Admin and nobody else.
- **placement-data-never-open-to-faculty**: Placement routes (CGPA, backlogs, offers) are never callable by a faculty member.
- **placement-office-routes-never-open-to-students**: Only /api/placement/me is a student route; nothing else under /api/placement is callable by a student.
- **placement-changes-need-the-office**: Anything under /api/placement that changes data or exports, other than a student's own apply and withdraw, is only for T&P and the Admin.
- **tnp-has-no-staff-console**: The Training & Placement office never has access to the faculty console.
- **staff-console-never-open-to-students**: No route under /api/faculty may be callable by a student or by every role.
- **admin-only-stays-admin-only**: Permissions, the audit log and the staff list are Admin only.
- **authoring-never-open-to-students**: Importing problems, exporting PDFs and the judge health page are never callable by a student.
- **changes-to-staff-data-need-staff**: Any route that changes data under /api/faculty must have a role check.
