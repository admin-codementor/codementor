// Course progress: one definition shared by faculty analytics, the per-student card and the student pages.
const { percentOf, resolveCourse, tally, studentProgress, summarise, median } = require('../../src/utils/courseProgress');
const { buildCourseAnalytics, completionBucketIndex, COMPLETION_BUCKETS } = require('../../src/utils/courseAnalytics');

module.exports = function (s) {
  // ── percentOf ───────────────────────────────────────────────────────────────
  s.check('percent: nothing solved, or an empty course, is 0', percentOf(0, 10) === 0 && percentOf(0, 0) === 0 && percentOf(5, 0) === 0);
  s.check('percent: 199 of 200 is 99, never 100 (it must not round up to "finished")', percentOf(199, 200) === 99);
  s.check('percent: one problem of 500 is 1, not 0 (they have started)', percentOf(1, 500) === 1);
  s.check('percent: exactly everything is 100', percentOf(3, 3) === 100 && percentOf(200, 200) === 100);
  s.check('percent: a third and two thirds round down', percentOf(1, 3) === 33 && percentOf(2, 3) === 66);

  // ── resolveCourse: deleted and draft problems do not count ───────────────────
  const modules = [
    { id: 'm1', title: 'Basics', problemIds: ['a', 'b', 'gone'] },
    { id: 'm2', title: 'Loops', problemIds: ['b', 'c', 'draft1'] },
    { id: 'm3', title: 'Empty', problemIds: [] },
    { id: 'm4', title: 'All gone', problemIds: ['gone'] },
  ];
  const problemsById = new Map([['a', {}], ['b', {}], ['c', {}], ['draft1', { status: 'draft' }]]);
  const r = resolveCourse(modules, problemsById);
  s.check('resolve: the required set is the existing, published problems, each once', [...r.problems].sort().join() === 'a,b,c', [...r.problems].join());
  s.check('resolve: a problem in two modules stays in both units but counts once for the course', r.units[0].problemIds.includes('b') && r.units[1].problemIds.includes('b') && r.problems.size === 3);
  s.check('resolve: a deleted problem and a draft problem are dropped from their units', !r.units[0].problemIds.includes('gone') && !r.units[1].problemIds.includes('draft1'));
  s.check('resolve: skipped problems are counted once each, split into deleted and draft', r.skipped.deleted === 1 && r.skipped.draft === 1, JSON.stringify(r.skipped));
  s.check('resolve: a unit whose problems are all gone is left empty', r.units[3].problemIds.length === 0);
  s.check('resolve: a course with a deleted problem can still reach 100%', (() => {
    const sv = new Set(['a', 'b', 'c']);
    return studentProgress(r.problems.size, sv, sv, r.units).status === 'completed';
  })());

  // ── tally + studentProgress: three states that always add up ─────────────────
  const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];
  const t0 = Date.UTC(2026, 9, 1);
  const sub = (u, p, v, d = 0) => ({ userId: u, problemId: p, verdict: v, submittedAt: new Date(t0 + d * 86400000) });
  const subs = [
    sub('s1', 'a', 'Accepted', 1), sub('s1', 'b', 'Accepted', 2), sub('s1', 'c', 'Accepted', 5), sub('s1', 'a', 'Accepted', 6), // repeat solves count once
    sub('s2', 'a', 'Accepted', 3),
    sub('s3', 'a', 'Wrong Answer', 4), // tried, solved nothing
    sub('s1', 'gone', 'Accepted', 9), // not a required problem
  ];
  const tl = tally(r.problems, students, subs);
  const rows = students.map((st) => ({ st, ...studentProgress(r.problems.size, tl.solved.get(st.id), tl.attempted.get(st.id), r.units) }));
  const byId = Object.fromEntries(rows.map((x) => [x.st.id, x]));
  s.check('progress: solving every required problem is completed at 100%', byId.s1.status === 'completed' && byId.s1.percent === 100 && byId.s1.solved === 3);
  s.check('progress: re-submitting a solved problem or solving a non-required one adds nothing', byId.s1.solved === 3);
  s.check('progress: one of three solved is in progress at 33%', byId.s2.status === 'in_progress' && byId.s2.percent === 33);
  s.check('progress: tried but solved nothing is in progress at 0%, NOT "not started"', byId.s3.status === 'in_progress' && byId.s3.percent === 0);
  s.check('progress: never submitted is not started', byId.s4.status === 'not_started');
  s.check('progress: last active is the latest course submission, ignoring non-required problems', tl.lastActiveMs.get('s1') === t0 + 6 * 86400000 && tl.lastActiveMs.get('s4') === 0);
  s.check('progress: units done counts only units that have work in them', byId.s1.unitsDone === 2 && byId.s1.unitsTotal === 2 && byId.s2.unitsDone === 0);

  // ── summarise ────────────────────────────────────────────────────────────────
  const sm = summarise(rows, r.problems.size);
  s.check('summary: completed + in progress + not started is the class size', sm.completed + sm.inProgress + sm.notStarted === sm.students && sm.completed === 1 && sm.inProgress === 2 && sm.notStarted === 1, JSON.stringify(sm));
  s.check('summary: average is the mean of exact shares (100, 33.3, 0, 0 → 33)', sm.avgPercent === 33, String(sm.avgPercent));
  s.check('summary: median of 0, 0, 33, 100 is 17', sm.medianPercent === 17 && median([0, 0, 33, 100]) === 17 && median([]) === 0 && median([4, 8, 9]) === 8);
  s.check('summary: the average never reads 100 unless everyone is complete', summarise([{ solved: 199, status: 'in_progress', percent: 99 }, { solved: 200, status: 'completed', percent: 100 }], 200).avgPercent === 99 && summarise([{ solved: 3, status: 'completed', percent: 100 }], 3).avgPercent === 100);
  s.check('summary: an empty class or course gives zeros, not NaN', summarise([], 5).avgPercent === 0 && summarise([{ solved: 0, status: 'not_started', percent: 0 }], 0).avgPercent === 0);

  // ── buildCourseAnalytics on the same fixture ────────────────────────────────
  const now = Date.UTC(2026, 9, 20, 12);
  const people = [
    { id: 's1', name: 'A', section: 'A', year: 2 }, { id: 's2', name: 'B', section: 'A', year: 2 },
    { id: 's3', name: 'C', section: 'B', year: 3 }, { id: 's4', name: 'D', section: 'B', year: 3 },
  ];
  const an = buildCourseAnalytics({
    modules: r.units, students: people, groups: [], submissions: subs, proctorEvents: [], plagiarismPairs: [], days: 30, now,
  });
  s.check('analytics: completed / in progress / not started KPIs add up to the students', an.kpis.completedUsers.value + an.kpis.inProgressUsers.value + an.kpis.notStartedUsers.value === 4 && an.kpis.inProgressUsers.value === 2);
  s.check('analytics: the distribution buckets always sum to the class size', an.completion.buckets.reduce((n, b) => n + b.count, 0) === 4 && an.completion.buckets[0].count === 2 && an.completion.buckets[5].count === 1);
  s.check('analytics: a unit with no required problems is "empty", not unstarted work', (() => { const e = an.units.find((u) => u.title === 'Empty'); return e.empty === true && e.solved === 0 && e.partial === 0 && e.notStarted === 0; })());
  s.check('analytics: unit counts and average (Basics: 1 done, 2 partial, 1 not started, avg 38%)', (() => { const b = an.units[0]; return b.solved === 1 && b.partial === 2 && b.notStarted === 1 && b.avgPercent === 38; })(), JSON.stringify(an.units[0]));
  s.check('analytics: the student table has one row per student, lowest percent first', an.students.length === 4 && an.students[0].percent <= an.students[3].percent && an.students[3].name === 'A');
  s.check('analytics: each row carries its class label and status', an.students.find((x) => x.name === 'C').classLabel === 'Year 3 · B' && an.students.find((x) => x.name === 'C').status === 'in_progress');
  s.check('analytics: completion by class is grouped by year and section', an.byClass.map((c) => `${c.label} ${c.completed}/${c.inProgress}/${c.notStarted}`).join(' ; ') === 'Year 2 · A 1/1/0 ; Year 3 · B 0/1/1', JSON.stringify(an.byClass));
  s.check('analytics: bucket index agrees with percentOf at the edges', completionBucketIndex(199, 200) === 4 && completionBucketIndex(200, 200) === 5 && completionBucketIndex(0, 5) === 0 && COMPLETION_BUCKETS.length === 6);
}
