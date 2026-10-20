// Faculty reports: daily activity, late work and the summary.
const { buildDailyReport, buildLateRows, buildSummary, istDay, istClock } = require('../../src/utils/reports');

const DAY = 86400000;
// 2026-10-21 10:00 IST = 04:30 UTC
const T = Date.UTC(2026, 9, 21, 4, 30);

module.exports = function (s) {
  s.check('IST day and clock are cut on Indian time (23:30 UTC is already tomorrow in IST)', istDay(Date.UTC(2026, 9, 21, 23, 30)) === '2026-10-22' && istClock(T) === '10:00' && istDay(T) === '2026-10-21');

  const students = [
    { id: 'a', name: 'Asha', rollNo: 'R1', section: 'A', year: 3 },
    { id: 'b', name: 'Bala', rollNo: 'R2', section: 'A', year: 3 },
    { id: 'c', name: 'Chitra', rollNo: 'R3', section: 'A', year: 3 },
  ];
  const subs = [
    { userId: 'a', problemId: 'p1', verdict: 'Wrong Answer', submittedAt: T },
    { userId: 'a', problemId: 'p1', verdict: 'Accepted', submittedAt: T + 3600000 },
    { userId: 'a', problemId: 'p2', verdict: 'Accepted', submittedAt: T + 7200000 },
    { userId: 'a', problemId: 'p2', verdict: 'Accepted', submittedAt: T + 8000000 },       // solved again: not a new first solve
    { userId: 'a', problemId: 'p3', verdict: 'Accepted', submittedAt: T - 2 * DAY },       // solved earlier: not a first solve today
    { userId: 'a', problemId: 'p3', verdict: 'Accepted', submittedAt: T + 100 },           // re-solve today
    { userId: 'b', problemId: 'p1', verdict: 'Wrong Answer', submittedAt: T + 10 },
    { userId: 'b', problemId: 'p1', verdict: 'Accepted', submittedAt: T - DAY },           // another day
    { userId: 'zzz', problemId: 'p1', verdict: 'Accepted', submittedAt: T },               // not in scope
  ];
  const r = buildDailyReport({ students, submissions: subs, day: '2026-10-21' });
  const a = r.rows.find((x) => x.id === 'a');
  s.check('only students with a submission that day get a row; out of scope is ignored', r.rows.length === 2 && !r.rows.some((x) => x.id === 'c' || x.id === 'zzz'));
  s.check('submissions, accepted and problems tried for the day', a.submissions === 5 && a.accepted === 4 && a.problemsTried === 3, JSON.stringify(a));
  s.check('first-time solves count a problem once and only on the day it was first solved', a.solvedForFirstTime === 2, a.solvedForFirstTime);
  s.check('a student whose only accepted run was the day before has no first solve today', r.rows.find((x) => x.id === 'b').solvedForFirstTime === 0);
  s.check('first and last submission time of the day', a.firstAt === '10:00' && a.lastAt === '12:13', `${a.firstAt}-${a.lastAt}`);
  s.check('totals add up from the rows', r.totals.students === 3 && r.totals.active === 2 && r.totals.submissions === 6 && r.totals.solvedForFirstTime === 2);
  s.check('a quiet day is an empty, safe report', buildDailyReport({ students, submissions: subs, day: '2026-01-01' }).rows.length === 0);

  // ── late rows ──
  const deadline = T;
  const marks = [
    { id: 'a', problems: [{ status: 'late', solvedAt: T + 5 * 3600000 }, { status: 'on_time', solvedAt: T - 1 }] },
    { id: 'b', problems: [{ status: 'not_attempted', solvedAt: null }, { status: 'not_solved', solvedAt: null }] },
    { id: 'c', problems: [{ status: 'late', solvedAt: T + 30 * 3600000 }, { status: 'late', solvedAt: T + 40 * 3600000 }] },
  ];
  const late = buildLateRows({ students, marks, deadline });
  s.check('late rows list only students who solved after the cut-off, worst first', late.rows.map((x) => x.id).join() === 'c,a' && late.rows[0].hoursLate === 30 && late.rows[1].hoursLate === 5, JSON.stringify(late.rows));
  s.check('late and on-time problem counts', late.rows[1].lateProblems === 1 && late.rows[1].onTimeProblems === 1 && late.rows[0].lateProblems === 2 && late.rows[0].onTimeProblems === 0);
  s.check('students who never solved anything are counted separately', late.neverSolved === 1 && late.students === 3);

  // ── summary ──
  const NOW = T + 2 * DAY;
  const sum = buildSummary({ students, submissions: subs, now: NOW, overdueAssignments: 2, pendingReopen: 1 });
  s.check('summary counts only the students in scope', sum.students === 3 && sum.neverSubmitted === 1 && sum.overdueAssignments === 2 && sum.pendingReopen === 1);
  s.check('summary windows: submissions in the last 7 days and distinct problems solved per student', sum.submissions7 === 8 && sum.active7 === 2 && sum.active30 === 2 && sum.solvedDistinct7 === 4, JSON.stringify(sum));
};
