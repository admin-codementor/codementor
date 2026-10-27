// Alumni (graduated students leave the active views) and the percentile baseline
// toggle on the department rankings. Pure checks use hand-computed fixtures; API
// checks use throwaway records in a scratch department that are deleted afterwards.
const { tokenFor, userId, get, put, Suite, db } = require('../harness');
const { validateGraduation, buildAlumniOverview, MAX_GRADUATE } = require('../../src/utils/alumni');
const { isActive, activeStudents } = require('../../src/utils/students');
const { buildDepartmentAnalytics } = require('../../src/utils/departmentAnalytics');

const now = Date.UTC(2026, 9, 1, 12, 0, 0);

function pure(s) {
  s.check('graduation: a non-boolean flag is rejected', !!validateGraduation({ graduated: 'yes' }, now).error && !!validateGraduation({}, now).error);
  s.check('graduation: graduating defaults to the current year', validateGraduation({ graduated: true }, now).graduationYear === 2026);
  s.check('graduation: an explicit year is kept', validateGraduation({ graduated: true, graduation_year: 2024 }, now).graduationYear === 2024);
  s.check('graduation: a numeric string year is accepted', validateGraduation({ graduated: true, graduation_year: '2025' }, now).graduationYear === 2025);
  s.check('graduation: a year before 2000 or far in the future is rejected', !!validateGraduation({ graduated: true, graduation_year: 1999 }, now).error && !!validateGraduation({ graduated: true, graduation_year: 2040 }, now).error);
  s.check('graduation: a non-integer year is rejected', !!validateGraduation({ graduated: true, graduation_year: 2025.5 }, now).error && !!validateGraduation({ graduated: true, graduation_year: 'abc' }, now).error);
  s.check('graduation: next year is allowed (a final-year student marked ahead)', validateGraduation({ graduated: true, graduation_year: 2027 }, now).graduationYear === 2027);
  s.check('graduation: restoring clears the year', (() => { const v = validateGraduation({ graduated: false, graduation_year: 2025 }, now); return v.graduated === false && v.graduationYear === null; })());

  s.check('active: a student is active unless graduated is exactly true', isActive({}) && isActive({ graduated: false }) && !isActive({ graduated: true }));
  s.check('active: the filter removes only graduated students', activeStudents([{ id: 1 }, { id: 2, graduated: true }, { id: 3, graduated: false }]).map((x) => x.id).join() === '1,3');

  const alumni = [
    { id: 'a', name: 'Asha', section: 'A', graduationYear: 2025 }, { id: 'b', name: 'Bala', section: 'A', graduationYear: 2025 },
    { id: 'c', name: 'Chitra', section: 'B', graduationYear: 2024 },
  ];
  const submissions = [
    { userId: 'a', problemId: 'p1', verdict: 'Accepted' }, { userId: 'a', problemId: 'p2', verdict: 'Accepted' }, { userId: 'a', problemId: 'p1', verdict: 'Accepted' },
    { userId: 'b', problemId: 'p1', verdict: 'Accepted' }, { userId: 'b', problemId: 'p9', verdict: 'Wrong Answer' },
    { userId: 'zzz', problemId: 'p1', verdict: 'Accepted' },
  ];
  const drives = [{ id: 'd1', company: 'Beta' }, { id: 'd2', company: 'Acme' }];
  const applications = [
    { driveId: 'd1', studentId: 'a', status: 'selected' }, { driveId: 'd2', studentId: 'a', status: 'selected' },
    { driveId: 'd1', studentId: 'b', status: 'rejected' }, { driveId: 'd3', studentId: 'c', status: 'selected' }, // d3 is not one of this department's drives
  ];
  const o = buildAlumniOverview({ alumni, submissions, applications, drives });
  s.check('alumni: totals count placed alumni once each', o.totals.alumni === 3 && o.totals.placed === 1 && o.totals.placement_rate === 33, JSON.stringify(o.totals));
  s.check('alumni: the span runs from the first to the last graduation year', o.totals.first_year === 2024 && o.totals.last_year === 2025 && o.totals.batches === 2);
  s.check('alumni: batches are newest first with placement and average solved', o.batches[0].year === 2025 && o.batches[0].students === 2 && o.batches[0].placed === 1 && o.batches[0].placement_rate === 50 && o.batches[0].avg_solved === 1.5, JSON.stringify(o.batches));
  s.check('alumni: solved counts distinct problems, ignoring repeats and failures', o.alumni.find((x) => x.id === 'a').solved === 2 && o.alumni.find((x) => x.id === 'b').solved === 1);
  s.check('alumni: companies are listed sorted and only for this department\'s drives', JSON.stringify(o.alumni.find((x) => x.id === 'a').placed_at) === '["Acme","Beta"]' && o.alumni.find((x) => x.id === 'c').placed_at.length === 0);
  s.check('alumni: an empty set does not throw', (() => { try { const e = buildAlumniOverview({ alumni: [], submissions: [], applications: [], drives: [] }); return e.totals.alumni === 0 && e.totals.first_year === null; } catch { return false; } })());

  // ── Percentile baseline ────────────────────────────────────────────────────
  const students = [{ id: 'x', name: 'X', section: 'A', year: 3 }, { id: 'y', name: 'Y', section: 'A', year: 3 }];
  const acc = (userId_, p) => ({ userId: userId_, problemId: p, verdict: 'Accepted', submittedAt: new Date(now - 86400000) });
  const subs = [acc('x', 'p1'), acc('x', 'p2')]; // x solved 2, y solved 0
  const view = buildDepartmentAnalytics({ students, submissions: subs, now });
  s.check('percentile: by default a student is ranked within the view', view.students.find((r) => r.id === 'x').percentile === 50 && view.students.find((r) => r.id === 'y').percentile === 0);
  const wide = buildDepartmentAnalytics({ students, submissions: subs, now, baseline: () => [0, 0, 1, 2, 2, 3, 5, 5, 6, 7] });
  s.check('percentile: a wider baseline changes the percentile, not the solved count', wide.students.find((r) => r.id === 'x').percentile === 30 && wide.students.find((r) => r.id === 'x').solved === 2, String(wide.students.find((r) => r.id === 'x').percentile));
  s.check('percentile: an empty baseline gives 0, not NaN', buildDepartmentAnalytics({ students, submissions: subs, now, baseline: () => [] }).students.every((r) => r.percentile === 0));
  s.check('percentile: badge counts still add up to the view with a baseline', wide.badges.reduce((n, b) => n + b.count, 0) === students.length);
}

module.exports = async function hodAlumniSuite() {
  const s = new Suite('HOD alumni & percentile baseline');
  pure(s);

  const AL = '/api/faculty/alumni';
  const GR = `${AL}/graduation`;
  s.check('alumni: unauthenticated → 401', (await get(AL)).status === 401);
  s.check('alumni: student → 403', (await get(AL, tokenFor('al-student', 'student'))).status === 403);
  s.check('alumni: faculty → 403', (await get(AL, tokenFor('al-faculty', 'faculty'))).status === 403);
  s.check('graduation: faculty → 403', (await put(GR, tokenFor('al-faculty', 'faculty'), { student_ids: ['x'], graduated: true })).status === 403);

  const D = 'SMOKEALUM';
  const made = [];
  const mk = async (id, data) => { await db().collection('students').doc(id).set({ ...data, isSmokeTest: true }); made.push(id); };
  s.onCleanup(async () => { for (const id of made) await db().collection('students').doc(id).delete().catch(() => {}); }, 'temporary alumni records');
  const ids = [1, 2, 3].map((n) => userId(`alu-${n}`));
  for (const [i, id] of ids.entries()) await mk(id, { name: `Smoke Alum ${i + 1}`, role: 'student', department: D, section: 'A', year: 4 });
  await mk(userId('alu-out'), { name: 'Smoke Alum Outsider', role: 'student', department: 'SMOKEOTHER2', section: 'A', year: 4 });

  const head = tokenFor('al-hod', 'hod', { department: D });
  const other = tokenFor('al-hod-other', 'hod', { department: 'SMOKEOTHER2' });
  const roster = async () => (await get('/api/faculty/department', head)).body?.data?.totals?.students;

  s.check('start: three active students and no alumni', (await roster()) === 3 && (await get(AL, head)).body?.data?.totals?.alumni === 0);

  s.check('graduation: no students → 400', (await put(GR, head, { student_ids: [], graduated: true })).status === 400);
  s.check('graduation: a missing flag → 400', (await put(GR, head, { student_ids: [ids[0]] })).status === 400);
  s.check('graduation: a bad year → 400', (await put(GR, head, { student_ids: [ids[0]], graduated: true, graduation_year: 1900 })).status === 400);
  s.check('graduation: an unknown student → 400', (await put(GR, head, { student_ids: ['nope'], graduated: true })).status === 400);
  s.check('graduation: another department student → 400', (await put(GR, head, { student_ids: [userId('alu-out')], graduated: true })).status === 400);
  s.check(`graduation: more than ${MAX_GRADUATE} students → 400`, (await put(GR, head, { student_ids: Array.from({ length: MAX_GRADUATE + 1 }, (_, i) => `x${i}`), graduated: true })).status === 400);
  s.check('graduation: a refused request changed nothing', (await roster()) === 3);

  const grad = await put(GR, head, { student_ids: [ids[0], ids[1]], graduated: true, graduation_year: 2025 });
  s.check('graduation: the HOD graduates two students', grad.status === 200 && grad.body?.data?.updated === 2, `status ${grad.status}`);

  const al = await get(AL, head);
  s.check('alumni: they appear in the alumni view with their batch', al.body?.data?.totals?.alumni === 2 && al.body.data.batches[0]?.year === 2025 && al.body.data.batches[0].students === 2, JSON.stringify(al.body?.data?.totals));
  s.check('alumni: each row carries a graduation year', (al.body?.data?.alumni || []).every((a) => a.graduation_year === 2025));

  // Every HOD view drops graduated students straight away (cached rosters are refreshed).
  s.check('active views: the department roster drops them', (await roster()) === 1);
  s.check('active views: mentors count only the active student', (await get('/api/faculty/mentors', head)).body?.data?.total_students === 1);
  s.check('active views: portfolio completeness drops them', (await get('/api/faculty/portfolio', head)).body?.data?.totals?.students === 1);
  s.check('active views: department activity drops them', (await get('/api/faculty/department/activity?kind=students&days=30', head)).body?.data?.totals?.people === 1);
  s.check('active views: the placement pool drops them', (await get('/api/placement/analytics', head)).body?.data?.overview?.pool === 1);

  s.check('alumni: another department HOD sees none of them', (await get(AL, other)).body?.data?.totals?.alumni === 0);

  const back = await put(GR, head, { student_ids: [ids[1]], graduated: false });
  s.check('graduation: restoring a student works', back.status === 200);
  s.check('graduation: the restored student is active again and the other is still an alumnus', (await roster()) === 2 && (await get(AL, head)).body?.data?.totals?.alumni === 1);
  s.check('graduation: restoring cleared the year (no row left in the old batch for them)', (await get(AL, head)).body?.data?.alumni?.every((a) => a.id !== ids[1]));
  await put(GR, head, { student_ids: [ids[0]], graduated: false });
  s.check('end: everyone is active again', (await roster()) === 3);

  // ── Percentile baseline over the API ───────────────────────────────────────
  const base = (q) => get(`/api/faculty/department${q}`, head);
  const v1 = await base('?percentile=view');
  const v2 = await base('?percentile=year');
  const v3 = await base('?percentile=institution');
  const v4 = await base('?percentile=nonsense');
  s.check('percentile: view, year and institution are all accepted', v1.status === 200 && v2.status === 200 && v3.status === 200);
  s.check('percentile: the chosen baseline is echoed back', v1.body?.data?.scope?.percentile === 'view' && v2.body?.data?.scope?.percentile === 'year' && v3.body?.data?.scope?.percentile === 'institution');
  s.check('percentile: an unknown value falls back to the view baseline', v4.status === 200 && v4.body?.data?.scope?.percentile === 'view');
  s.check('percentile: every row still has a 0 to 100 percentile and a badge', (v3.body?.data?.students || []).every((r) => Number.isInteger(r.percentile) && r.percentile >= 0 && r.percentile <= 100 && typeof r.badge === 'string'));
  s.check('percentile: badge counts add up to the roster under every baseline', [v1, v2, v3].every((v) => v.body.data.badges.reduce((n, b) => n + b.count, 0) === v.body.data.totals.students));
  s.check('percentile: the baseline never changes who is in the roster', v1.body.data.totals.students === v3.body.data.totals.students);

  return s;
};
