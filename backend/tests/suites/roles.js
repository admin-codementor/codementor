// Role × route authorization.
//
// This is the suite that would have caught the bug behind every "it's not working"
// report: the HOD role was rejected by every route outside /api/faculty/*, while
// the faculty UI happily showed those pages. It fails if any staff route forgets a
// role, or if a student route stops being locked down.
const { tokenFor, get, post, Suite, purge, userId } = require('../harness');

const STAFF = ['faculty', 'admin', 'hod'];

// Staff-only endpoints. A student must be refused; every staff role must pass the
// authorize() gate (any non-403 counts — 400/404/500 from missing fixtures is fine,
// this suite tests the gate, not the handler).
const STAFF_ROUTES = [
  ['GET', '/api/mcq/tests', 'list MCQ tests'],
  ['GET', '/api/judge-health', 'judge health'],
  ['GET', '/api/faculty/problems', 'list problems'],
  ['GET', '/api/faculty/dashboard', 'faculty dashboard'],
  ['GET', '/api/faculty/analytics/overview', 'analytics overview'],
  ['GET', '/api/faculty/question-bank', 'question bank'],
  ['GET', '/api/problem-import/drafts', 'import drafts'],
];

// Admin-only endpoints: faculty and HOD must NOT get in.
const ADMIN_ONLY = [
  ['GET', '/api/faculty/audit-logs', 'audit log'],
];

module.exports = async function rolesSuite() {
  const s = new Suite('Roles & authorization');
  const created = [];

  s.onCleanup(async () => {
    await purge('classrooms', 'facultyId', created.filter((c) => c.kind === 'class').map((c) => c.owner));
    await purge('mcqTests', 'facultyId', created.filter((c) => c.kind === 'mcq').map((c) => c.owner));
  }, 'probe classes and MCQ tests');

  // ── Read gates ──────────────────────────────────────────────────────────────
  for (const [method, path, label] of STAFF_ROUTES) {
    for (const role of STAFF) {
      const r = await get(path, tokenFor(`role-${role}`, role));
      s.check(`${label} — ${role} passes the gate`, r.status !== 403, `status ${r.status}`);
    }
    const student = await get(path, tokenFor('role-student', 'student'));
    s.check(`${label} — student is blocked`, student.status === 403, `status ${student.status}`);
  }

  for (const [, path, label] of ADMIN_ONLY) {
    const admin = await get(path, tokenFor('role-admin', 'admin'));
    s.check(`${label} — admin passes`, admin.status !== 403, `status ${admin.status}`);
    for (const role of ['faculty', 'hod']) {
      const r = await get(path, tokenFor(`role-${role}`, role));
      s.check(`${label} — ${role} is blocked`, r.status === 403, `status ${r.status}`);
    }
  }

  // ── Write gates: the flows that were reported broken ────────────────────────
  for (const role of STAFF) {
    const r = await post('/api/classrooms', tokenFor(`role-${role}`, role), { name: `SMOKE class ${role}` });
    s.check(`create a class — ${role}`, r.status === 201, `status ${r.status}`);
    if (r.status === 201) created.push({ kind: 'class', owner: userId(`role-${role}`) });

    const m = await post('/api/mcq/tests', tokenFor(`role-${role}`, role), {
      title: `SMOKE test ${role}`, category: 'aptitude', duration_minutes: 10,
    });
    s.check(`create an MCQ test — ${role}`, m.status === 201, `status ${m.status}`);
    if (m.status === 201) created.push({ kind: 'mcq', owner: userId(`role-${role}`) });
  }

  const studentClass = await post('/api/classrooms', tokenFor('role-student', 'student'), { name: 'SMOKE forbidden' });
  s.check('create a class — student is blocked', studentClass.status === 403, `status ${studentClass.status}`);

  // ── Unauthenticated access ──────────────────────────────────────────────────
  const anon = await get('/api/faculty/problems');
  s.check('unauthenticated request rejected', anon.status === 401, `status ${anon.status}`);

  const publicCatalogue = await get('/api/problems?limit=1');
  s.check('public problem catalogue stays public', publicCatalogue.status === 200, `status ${publicCatalogue.status}`);

  return s;
};
