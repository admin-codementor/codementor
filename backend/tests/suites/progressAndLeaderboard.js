// Course/module progress and the scoped leaderboard.
//
// Both exist to answer "where am I?" with a number a student can act on, so the
// checks here assert the arithmetic and the scoping, not just HTTP 200. A
// leaderboard that confidently ranks a student against the wrong cohort is
// worse than one that errors.
const { tokenFor, get, Suite, purge, userId, db } = require('../harness');

const HOUR = 3600_000;

module.exports = async function progressAndLeaderboardSuite() {
  const s = new Suite('Course progress & scoped leaderboard');

  // ── Fixtures: three students, two in one class, one in another ─────────────
  const ME = userId('pl-me');
  const CLASSMATE = userId('pl-classmate');
  const OTHER_SECTION = userId('pl-other-section');
  const OTHER_DEPT = userId('pl-other-dept');

  const TOKEN = tokenFor('pl-me', 'student', { department: 'SMOKE_DEPT' });

  const students = [
    { id: ME, name: 'PL Me', department: 'SMOKE_DEPT', section: 'A' },
    { id: CLASSMATE, name: 'PL Classmate', department: 'SMOKE_DEPT', section: 'A' },
    { id: OTHER_SECTION, name: 'PL Other Section', department: 'SMOKE_DEPT', section: 'B' },
    { id: OTHER_DEPT, name: 'PL Other Dept', department: 'SMOKE_OTHER', section: 'A' },
  ];

  s.onCleanup(async () => {
    for (const st of students) await db().collection('students').doc(st.id).delete();
    return students.length;
  }, 'probe students');
  s.onCleanup(() => purge('submissions', 'userId', students.map((st) => st.id)), 'probe submissions');

  for (const st of students) {
    await db().collection('students').doc(st.id).set({ ...st, role: 'student' });
  }

  // Give the classmate more solves than me, so ordering is observable.
  const problemsBody = (await get('/api/problems?page=1', TOKEN)).body?.data;
  const problems = Array.isArray(problemsBody) ? problemsBody : (problemsBody?.problems ?? []);
  if (problems.length < 3) {
    s.skip('leaderboard ordering', `needs 3 problems, found ${problems.length}`);
  } else {
    const [p1, p2, p3] = problems.map((p) => String(p.id));
    const now = Date.now();
    const seed = [
      { userId: ME, problemId: p1, verdict: 'Accepted', language: 'python', submittedAt: new Date(now - HOUR) },
      { userId: CLASSMATE, problemId: p1, verdict: 'Accepted', language: 'python', submittedAt: new Date(now - HOUR) },
      { userId: CLASSMATE, problemId: p2, verdict: 'Accepted', language: 'python', submittedAt: new Date(now - HOUR) },
      { userId: OTHER_SECTION, problemId: p3, verdict: 'Accepted', language: 'python', submittedAt: new Date(now - HOUR) },
      { userId: OTHER_DEPT, problemId: p3, verdict: 'Accepted', language: 'python', submittedAt: new Date(now - HOUR) },
    ];
    for (const row of seed) await db().collection('submissions').add(row);

    // ── Scoping ──────────────────────────────────────────────────────────────
    const cls = (await get('/api/student/leaderboard?scope=class', TOKEN)).body?.data;
    const dept = (await get('/api/student/leaderboard?scope=department', TOKEN)).body?.data;
    const college = (await get('/api/student/leaderboard?scope=college', TOKEN)).body?.data;

    s.check('every scope returns the documented shape',
      [cls, dept, college].every((b) => b && typeof b.total === 'number' && Array.isArray(b.top)),
      'missing scope/total/top');

    const names = (b) => (b?.top ?? []).map((r) => r.name);
    s.check('class scope keeps my own section only',
      names(cls).includes('PL Classmate') && !names(cls).includes('PL Other Section'),
      names(cls).join(', '));
    s.check('class scope excludes other departments',
      !names(cls).includes('PL Other Dept'));
    s.check('department scope includes the other section',
      names(dept).includes('PL Other Section'), names(dept).join(', '));
    s.check('department scope still excludes other departments',
      !names(dept).includes('PL Other Dept'));
    s.check('college scope includes every department',
      names(college).includes('PL Other Dept'));

    s.check('each wider scope has at least as many students',
      cls.total <= dept.total && dept.total <= college.total,
      `class ${cls.total}, dept ${dept.total}, college ${college.total}`);

    // ── Ranking ──────────────────────────────────────────────────────────────
    const clsNames = names(cls);
    s.check('more solved ranks higher',
      clsNames.indexOf('PL Classmate') < clsNames.indexOf('PL Me'), clsNames.join(' > '));
    s.check('my own row comes back so it can be pinned',
      cls.me?.name === 'PL Me', `got ${cls.me?.name}`);
    s.check('my row carries my rank', cls.me?.rank >= 1, `rank ${cls.me?.rank}`);
    s.check('ranks start at 1 with no gaps',
      cls.top.every((r, i) => r.rank === i + 1));
    s.check('an unknown scope falls back to college',
      (await get('/api/student/leaderboard?scope=nonsense', TOKEN)).body?.data?.scope === 'college');
  }

  // ── Course + module progress ───────────────────────────────────────────────
  const courses = (await get('/api/courses', TOKEN)).body?.data ?? [];
  s.check('course list returns 200 with an array', Array.isArray(courses));

  if (courses.length === 0) {
    s.skip('module progress checks', 'no published courses');
    return s;
  }

  const summary = courses[0];
  s.check('course summaries carry per-module progress', Array.isArray(summary.modules), typeof summary.modules);
  s.check('module percent matches solved/total',
    (summary.modules ?? []).every((m) => m.total === 0 || m.percent === Math.round((m.solved / m.total) * 100)),
    'a module percent disagrees with its counts');
  s.check('module status agrees with its counts',
    (summary.modules ?? []).every((m) => {
      if (m.total === 0) return m.status === 'empty';
      if (m.solved >= m.total) return m.status === 'done';
      return ['not_started', 'in_progress', 'overdue'].includes(m.status);
    }), 'a module status disagrees with its counts');

  const detail = (await get(`/api/courses/${summary.id}`, TOKEN)).body?.data;
  s.check('course detail returns 200', !!detail);
  if (detail) {
    s.check('detail and list agree on the course total',
      detail.problemCount === summary.problemCount,
      `${detail.problemCount} vs ${summary.problemCount}`);
    s.check('detail and list agree on solved count',
      detail.solvedCount === summary.solvedCount,
      `${detail.solvedCount} vs ${summary.solvedCount}`);
    s.check('course percent matches its own counts',
      detail.problemCount === 0 || detail.percent === Math.round((detail.solvedCount / detail.problemCount) * 100));
    s.check('nextUp points at an unsolved problem when one exists', (() => {
      if (!detail.nextUp?.problemId) return true;
      const mod = detail.modules.find((m) => m.id === detail.nextUp.moduleId);
      return !!mod && mod.problems.some((p) => String(p.id) === String(detail.nextUp.problemId) && !p.is_solved);
    })(), 'nextUp points at a solved or missing problem');
    s.check('a finished course offers no next step',
      detail.solvedCount < detail.problemCount || detail.nextUp === null);
  }

  return s;
};
