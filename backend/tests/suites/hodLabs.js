// Labs: the department's classes and the assignments set for them, read-only.
// Pure checks use hand-computed fixtures; API checks use throwaway classes,
// assignments and submissions in scratch departments, deleted afterwards.
const { tokenFor, userId, get, Suite, db } = require('../harness');
const { buildLabs } = require('../../src/utils/labs');

const now = Date.UTC(2026, 9, 1, 12, 0, 0);
const past = new Date(now - 5 * 86400000).toISOString();
const future = new Date(now + 5 * 86400000).toISOString();

function fixture() {
  const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  const submissions = [
    { userId: 's1', problemId: 'p1', verdict: 'Accepted' }, { userId: 's1', problemId: 'p2', verdict: 'Accepted' }, { userId: 's1', problemId: 'p2', verdict: 'Accepted' },
    { userId: 's2', problemId: 'p1', verdict: 'Wrong Answer' },
    { userId: 's4', problemId: 'p1', verdict: 'Accepted' }, // graduated: not in `students`
    { userId: 's3', problemId: 'p3', verdict: 'Accepted' },
  ];
  const assignments = [
    { id: 'a1', title: 'Loops', deadline: past, problemIds: ['p1', 'p2'], classroomIds: ['c1'], facultyId: 'f1' },
    { id: 'a2', title: 'Arrays', deadline: future, problemIds: ['p3'], classroomIds: ['c1'], facultyId: 'f1', proctored: true },
    { id: 'a3', title: 'For everyone', deadline: future, problemIds: ['p3'], classroomIds: [], facultyId: 'f1' },
    { id: 'a4', title: 'Another teacher, no class', deadline: future, problemIds: ['p3'], classroomIds: [], facultyId: 'other' },
  ];
  return buildLabs({
    classrooms: [{ id: 'c1', name: 'Lab A', section: 'A', facultyId: 'f1' }, { id: 'c0', name: 'Empty lab', facultyId: 'f1' }],
    membersByClass: new Map([['c1', ['s1', 's2', 's4']], ['c0', []]]), // s4 has graduated
    assignments, students, submissions, ownerNames: new Map([['f1', 'Teacher One']]), now,
  });
}

function pure(s) {
  const r = fixture();
  const c1 = r.classes.find((c) => c.id === 'c1');
  s.check('labs: graduated members are not counted in a class', c1.students === 2);
  s.check('labs: the class names its instructor', c1.instructor === 'Teacher One');
  const a1 = c1.assignments.find((a) => a.id === 'a1');
  s.check('labs: attempted counts students who tried any problem', a1.attempted === 2, JSON.stringify(a1));
  s.check('labs: completed needs every problem solved', a1.completed === 1);
  s.check('labs: average completion is solved over students x problems, repeats counted once', a1.avg_pct === 50);
  s.check('labs: a deadline in the past is closed, in the future is open', a1.status === 'closed' && c1.assignments.find((a) => a.id === 'a2').status === 'open');
  s.check('labs: a proctored assignment is flagged as an exam', c1.assignments.find((a) => a.id === 'a2').exam === true && a1.exam === false);
  s.check('labs: nobody having solved anything gives 0%, not NaN', c1.assignments.find((a) => a.id === 'a2').avg_pct === 0);
  s.check('labs: a class average is the mean of its assignments', c1.avg_completion === 25, String(c1.avg_completion));
  s.check('labs: a class with no students has no average', r.classes.find((c) => c.id === 'c0').avg_completion === null);
  s.check('labs: assignments are listed latest deadline first', c1.assignments[0].id === 'a2');
  s.check('labs: an untargeted assignment is reported once, against the whole cohort', r.everyone.length === 1 && r.everyone[0].id === 'a3' && r.everyone[0].students === 3 && r.everyone[0].completed === 1);
  s.check('labs: another teacher untargeted assignment is not shown', !r.everyone.some((a) => a.id === 'a4'));
  s.check('labs: totals', r.totals.classes === 2 && r.totals.students_in_classes === 2 && r.totals.students_not_in_any_class === 1 && r.totals.assignments === 2 && r.totals.open_assignments === 1 && r.totals.avg_completion === 25, JSON.stringify(r.totals));
  s.check('labs: empty input does not throw', (() => { try { const e = buildLabs({ classrooms: [], membersByClass: new Map(), assignments: [], students: [], submissions: [], ownerNames: new Map(), now }); return e.totals.classes === 0 && e.totals.avg_completion === null; } catch { return false; } })());
}

module.exports = async function hodLabsSuite() {
  const s = new Suite('HOD labs');
  pure(s);

  const L = '/api/faculty/labs';
  s.check('labs: unauthenticated → 401', (await get(L)).status === 401);
  s.check('labs: student → 403', (await get(L, tokenFor('lab-student', 'student'))).status === 403);
  s.check('labs: faculty → 403', (await get(L, tokenFor('lab-faculty', 'faculty'))).status === 403);

  // A fresh department name per run, so the 60-second cache of an earlier run can never answer this one.
  const run = Date.now().toString(36).toUpperCase();
  const D = `SMOKELAB${run}`;
  const O = `SMOKELABX${run}`;
  const made = []; // [collection, id]
  const mk = async (col, id, data) => { await db().collection(col).doc(id).set({ ...data, isSmokeTest: true }); made.push([col, id]); };
  s.onCleanup(async () => {
    for (const [col, id] of made) {
      if (col === 'classrooms') { const m = await db().collection('classrooms').doc(id).collection('members').get(); for (const d of m.docs) await d.ref.delete().catch(() => {}); }
      await db().collection(col).doc(id).delete().catch(() => {});
    }
  }, 'temporary lab records');

  const teacher = userId('lab-teacher');
  const stranger = userId('lab-stranger');
  await mk('faculty', teacher, { name: 'Smoke Lab Teacher', role: 'faculty', department: D });
  await mk('faculty', stranger, { name: 'Smoke Other Teacher', role: 'faculty', department: O });
  const stu = [1, 2, 3, 4].map((n) => userId(`lab-s${n}`));
  for (const [i, id] of stu.entries()) await mk('students', id, { name: `Smoke Lab Student ${i + 1}`, role: 'student', department: D, section: 'A', year: 2, ...(i === 3 ? { graduated: true, graduationYear: 2025 } : {}) });
  const outsider = userId('lab-out');
  await mk('students', outsider, { name: 'Smoke Lab Outsider', role: 'student', department: O });

  const c1 = userId('lab-class-1');
  const c2 = userId('lab-class-2');
  await mk('classrooms', c1, { name: 'Smoke Lab A', section: 'A', facultyId: teacher, department: D, joinCode: 'SMKLAB1' });
  await mk('classrooms', c2, { name: 'Smoke Other Lab', facultyId: stranger, department: O, joinCode: 'SMKLAB2' });
  for (const id of [stu[0], stu[1], stu[3], outsider]) await db().collection('classrooms').doc(c1).collection('members').doc(id).set({ joinedAt: new Date() });
  await db().collection('classrooms').doc(c2).collection('members').doc(outsider).set({ joinedAt: new Date() });

  const realFuture = new Date(Date.now() + 30 * 86400000).toISOString(); // the live server uses the real clock
  const realPast = new Date(Date.now() - 30 * 86400000).toISOString();
  const pa = userId('lab-p1');
  const pb = userId('lab-p2');
  const pc = userId('lab-p3');
  const a1 = userId('lab-a1');
  const a2 = userId('lab-a2');
  const a3 = userId('lab-a3');
  const a4 = userId('lab-a4');
  await mk('assignments', a1, { title: 'Smoke Loops', deadline: realPast, problemIds: [pa, pb], classroomIds: [c1], facultyId: teacher });
  await mk('assignments', a2, { title: 'Smoke Arrays', deadline: realFuture, problemIds: [pc], classroomIds: [c1], facultyId: teacher });
  await mk('assignments', a3, { title: 'Smoke For Everyone', deadline: realFuture, problemIds: [pc], classroomIds: [], facultyId: teacher });
  await mk('assignments', a4, { title: 'Smoke Other Department Work', deadline: realFuture, problemIds: [pc], classroomIds: [c2], facultyId: stranger });

  const sub = (n, user, problem, verdict) => mk('submissions', userId(`lab-sub-${n}`), { userId: user, problemId: problem, verdict, submittedAt: new Date(now) });
  await sub(1, stu[0], pa, 'Accepted');
  await sub(2, stu[0], pb, 'Accepted');
  await sub(3, stu[1], pa, 'Wrong Answer');
  await sub(4, stu[3], pa, 'Accepted');
  await sub(5, stu[2], pc, 'Accepted');
  await sub(6, outsider, pa, 'Accepted');

  const head = tokenFor('lab-hod', 'hod', { department: D });
  const res = await get(L, head);
  const d = res.body?.data;
  s.check('labs: the HOD gets their labs', res.status === 200 && !!d, `status ${res.status}`);
  s.check('labs: only the department own class is listed', d?.classes?.length === 1 && d.classes[0].id === c1, JSON.stringify((d?.classes || []).map((c) => c.name)));
  const c = d?.classes?.[0];
  s.check('labs: the instructor is named from the class owner', c?.instructor === 'Smoke Lab Teacher');
  s.check('labs: graduated and other-department members are not counted', c?.students === 2, String(c?.students));
  const r1 = c?.assignments?.find((a) => a.id === a1);
  s.check('labs: the class assignment shows who attempted and who finished', r1?.attempted === 2 && r1?.completed === 1 && r1?.avg_pct === 50 && r1?.status === 'closed', JSON.stringify(r1));
  s.check('labs: the open assignment is open and untouched', c?.assignments?.find((a) => a.id === a2)?.status === 'open' && c.assignments.find((a) => a.id === a2).avg_pct === 0);
  s.check('labs: another department assignment is not visible', !JSON.stringify(d || {}).includes('Smoke Other Department Work'));
  s.check('labs: an untargeted assignment is reported against the active cohort', d?.everyone?.some((a) => a.id === a3 && a.students === 3 && a.completed === 1), JSON.stringify(d?.everyone));
  s.check('labs: the student not in any class is counted', d?.totals?.students_not_in_any_class === 1 && d.totals.students_in_classes === 2, JSON.stringify(d?.totals));
  s.check('labs: the scope names the department from the token', d?.scope?.department === D);
  s.check('labs: a ?department= override is ignored', (await get(`${L}?department=${O}`, head)).body?.data?.classes?.[0]?.id === c1);
  s.check('labs: no student names or emails appear in the response', !/Smoke Lab Student|@/.test(JSON.stringify(d || {})));

  const otherHod = (await get(L, tokenFor('lab-hod2', 'hod', { department: O }))).body?.data;
  s.check('labs: the other department sees only its own class and member', otherHod?.classes?.length === 1 && otherHod.classes[0].id === c2 && otherHod.classes[0].students === 1, JSON.stringify(otherHod?.classes?.map((x) => [x.name, x.students])));

  return s;
};
