// Weekly "solved" (per student + problem), attempts per solve (up to the first accept), shared proctor rule.
const { weeklyActivity } = require('../../src/utils/studentState');
const { attemptsUntilFirstAccept } = require('../../src/utils/attempts');
const { BENIGN_PROCTOR_EVENTS, isFlagEvent } = require('../../src/utils/proctorEvents');
const { proctorSummary } = require('../../src/utils/examReport');
const { buildDepartmentAnalytics } = require('../../src/utils/departmentAnalytics');

module.exports = function (s) {
  const DAY = 86400000;
  const now = Date.UTC(2026, 9, 20, 12);
  const at = (daysAgo) => new Date(now - daysAgo * DAY);
  const sub = (userId, problemId, verdict, daysAgo) => ({ userId, problemId, verdict, submittedAt: at(daysAgo) });

  // ── weekly solved ───────────────────────────────────────────────────────────
  // Three students each solve the SAME problem p1 two days ago: that is 3 solves this week, not 1.
  const dept = ['a', 'b', 'c'].map((u) => sub(u, 'p1', 'Accepted', 2));
  const w = weeklyActivity(dept, 2, now);
  s.check('weekly: three students solving the same problem in one week is 3 solved, not 1', w[1].solved === 3 && w[1].accepted === 3, JSON.stringify(w[1]));

  // One student solves p1 three weeks ago and again today: the first week owns it.
  const resolve = [sub('a', 'p1', 'Accepted', 20), sub('a', 'p1', 'Accepted', 1)];
  const w2 = weeklyActivity(resolve, 4, now);
  s.check('weekly: re-solving an old problem does not count in the later week', w2[3].solved === 0 && w2.reduce((n, x) => n + x.solved, 0) === 1);
  s.check('weekly: the same student solving two different problems counts both', weeklyActivity([sub('a', 'p1', 'Accepted', 1), sub('a', 'p2', 'Accepted', 2)], 2, now)[1].solved === 2);
  s.check('weekly: the per-student view (no userId on the rows) still counts distinct problems once', weeklyActivity([{ problemId: 'p1', verdict: 'Accepted', submittedAt: at(1) }, { problemId: 'p1', verdict: 'Accepted', submittedAt: at(2) }], 2, now)[1].solved === 1);

  // The department builder passes everyone's submissions through the same function.
  const students = ['a', 'b', 'c'].map((id) => ({ id, name: id, section: 'A', year: 2 }));
  const d = buildDepartmentAnalytics({ students, submissions: dept, now });
  s.check('weekly: the department chart reads 3 solved for those three students', d.weekly[d.weekly.length - 1].solved === 3, JSON.stringify(d.weekly[d.weekly.length - 1]));

  // ── attempts per solve ──────────────────────────────────────────────────────
  const t = (n) => n * 1000;
  s.check('attempts: solved on the first try, then re-submitted five times, is 1 attempt (not 6)', attemptsUntilFirstAccept([t(1), t(2), t(3), t(4), t(5), t(6)], t(1)) === 1);
  s.check('attempts: two failures then the accept is 3 attempts', attemptsUntilFirstAccept([t(1), t(2), t(3), t(9)], t(3)) === 3);
  s.check('attempts: never solved has no attempts-per-solve', attemptsUntilFirstAccept([t(1), t(2)], null) === null && attemptsUntilFirstAccept([t(1)], 0) === null);
  s.check('attempts: always at least 1', attemptsUntilFirstAccept([], t(5)) === 1);
  s.check('attempts: submissions after the accept are ignored, whatever their order', attemptsUntilFirstAccept([t(8), t(1), t(7), t(2)], t(2)) === 2);

  // ── proctor events: one rule ────────────────────────────────────────────────
  s.check('proctor: copy, fullscreen_enter and exam_start are not flags', ['copy', 'fullscreen_enter', 'exam_start'].every((e) => !isFlagEvent(e) && BENIGN_PROCTOR_EVENTS.has(e)));
  s.check('proctor: tab switches, paste and fullscreen exit are flags', ['tab_switch', 'paste', 'fullscreen_exit'].every(isFlagEvent));
  const sum = proctorSummary([{ userId: 'u', eventType: 'copy' }, { userId: 'u', eventType: 'copy' }, { userId: 'u', eventType: 'copy' }, { userId: 'u', eventType: 'tab_switch' }]);
  s.check('proctor: three copies and one tab switch is one flag in the exam report (it used to be four)', sum.get('u').total === 1, JSON.stringify(sum.get('u')));
};
