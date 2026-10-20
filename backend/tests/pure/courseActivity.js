// Course activity: time spent from the per-student roll-up, window columns per student, and the insights hook-up.
const { buildCourseAnalytics } = require('../../src/utils/courseAnalytics');

const DAY = 86400000;
// 2026-10-21 12:00 IST (06:30 UTC), a Wednesday.
const NOW = Date.UTC(2026, 9, 21, 6, 30);
const ist = (offsetDays) => new Date(NOW + offsetDays * DAY + 330 * 60000).toISOString().slice(0, 10);

module.exports = function (s) {
  const modules = [{ id: 'm1', title: 'Loops', problemIds: ['p1', 'p2'] }];
  const students = [
    { id: 'a', name: 'Asha', rollNo: 'R1', section: 'A', year: 3 },
    { id: 'b', name: 'Bala', rollNo: 'R2', section: 'A', year: 3 },
    { id: 'c', name: 'Chitra', rollNo: 'R3', section: 'A', year: 3 },
  ];
  const ago = (d) => new Date(NOW - d * DAY);
  const submissions = [
    { userId: 'a', problemId: 'p1', verdict: 'Accepted', submittedAt: ago(1) },
    { userId: 'a', problemId: 'p1', verdict: 'Accepted', submittedAt: ago(1) },
    { userId: 'a', problemId: 'p2', verdict: 'Wrong Answer', submittedAt: ago(0) },
    { userId: 'b', problemId: 'p1', verdict: 'Wrong Answer', submittedAt: ago(2) },
    { userId: 'b', problemId: 'p1', verdict: 'Wrong Answer', submittedAt: ago(2) },
    { userId: 'a', problemId: 'other', verdict: 'Accepted', submittedAt: ago(1) }, // not in this course
  ];
  const courseTimes = [
    { userId: 'a', seconds: 9000, byDay: { [ist(0)]: 1800, [ist(-1)]: 3600, [ist(-20)]: 3600 } }, // the last is outside a 7 day window
    { userId: 'b', seconds: 600, byDay: { [ist(-2)]: 600 } },
    { userId: 'zzz', seconds: 99999, byDay: { [ist(0)]: 99999 } }, // not in scope
  ];
  const r = buildCourseAnalytics({ modules, students, groups: [], submissions, proctorEvents: [], plagiarismPairs: [], courseTimes, days: 7, now: NOW });
  const row = (id) => r.students.find((x) => x.id === id);

  s.check('total time per student comes from the roll-up; students out of scope are ignored', row('a').timeSeconds === 9000 && row('b').timeSeconds === 600 && row('c').timeSeconds === 0);
  s.check('time in the window excludes days before it', row('a').timeInWindowSeconds === 5400 && row('b').timeInWindowSeconds === 600, JSON.stringify([row('a').timeInWindowSeconds, row('b').timeInWindowSeconds]));
  s.check('average active time is over students who spent time in the window', r.kpis.avgActiveSeconds.value === Math.round((5400 + 600) / 2), r.kpis.avgActiveSeconds.value);
  s.check('time data is reported as present, and absent when there are no records',
    r.time.hasData === true && buildCourseAnalytics({ modules, students, groups: [], submissions, proctorEvents: [], plagiarismPairs: [], days: 7, now: NOW }).time.hasData === false);

  // Wed (today) 1800s = 30 min; Tue (yesterday) 3600s = 60 min; Mon (2 days ago) 600s = 10 min
  s.check('minutes by weekday, Sunday first, over the window only', r.time.weekdayMinutes[3] === 30 && r.time.weekdayMinutes[2] === 60 && r.time.weekdayMinutes[1] === 10 && r.time.weekdayMinutes.reduce((a, b) => a + b, 0) === 100, JSON.stringify(r.time.weekdayMinutes));
  s.check('the daily series carries minutes and is zero-filled', r.daily.length === 7 && r.daily[6].minutes === 30 && r.daily[5].minutes === 60 && r.daily[0].minutes === 0);

  s.check('window columns: submissions and distinct problems solved, this course only', row('a').subsInWindow === 3 && row('a').solvedInWindow === 1 && row('b').subsInWindow === 2 && row('b').solvedInWindow === 0 && row('c').subsInWindow === 0);
  s.check('suspicious is false when nothing flags the student', r.students.every((x) => x.suspicious === false));
  s.check('insights are part of the result', Array.isArray(r.insights) && r.insights.length >= 1);

  const sus = buildCourseAnalytics({ modules, students, groups: [], submissions, proctorEvents: [{ userId: 'b', eventType: 'tab_switch' }, { userId: 'b', eventType: 'tab_switch' }, { userId: 'b', eventType: 'tab_switch' }], plagiarismPairs: [], courseTimes, days: 7, now: NOW });
  s.check('a flagged student is marked suspicious in the table', sus.students.find((x) => x.id === 'b').suspicious === true && sus.students.find((x) => x.id === 'a').suspicious === false);
};
