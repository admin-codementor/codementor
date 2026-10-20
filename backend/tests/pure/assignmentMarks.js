// Assignment marks: best on-time mark, late solves kept apart, every targeted student listed.
const { buildAssignmentMarks, markFor } = require('../../src/utils/assignmentMarks');

module.exports = function (s) {
  const DAY = 86400000;
  const deadline = Date.UTC(2026, 9, 10, 18);
  const assignment = { problemIds: ['p1', 'p2', 'p1'], deadline: new Date(deadline) }; // p1 listed twice on purpose
  const students = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const sub = (u, p, v, offsetMs, score) => ({ userId: u, problemId: p, verdict: v, score, submittedAt: new Date(deadline + offsetMs) });
  const submissions = [
    sub('a', 'p1', 'Accepted', -2 * DAY), sub('a', 'p2', 'Accepted', -1 * DAY),              // a: both on time
    sub('b', 'p1', 'Wrong Answer', -3 * DAY), sub('b', 'p1', 'Accepted', 5 * DAY),            // b: p1 only after the deadline
    sub('b', 'p2', 'Accepted', -DAY),
    sub('c', 'p1', 'Wrong Answer', -DAY),                                                    // c: tried, never solved
    sub('x', 'p1', 'Accepted', -DAY),                                                        // x: not set this assignment
    sub('a', 'other', 'Accepted', -DAY),                                                     // not an assignment problem
  ];
  const rows = buildAssignmentMarks({ assignment, students, submissions });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const st = (id, pid) => by[id].problems.find((p) => p.problemId === pid);

  s.check('marks: only the students it was set for are listed (a student outside the list is ignored)', rows.length === 4 && !by.x);
  s.check('marks: a problem listed twice counts once', by.a.problems.length === 2);
  s.check('marks: solved before the deadline is on time and worth 100', st('a', 'p1').status === 'on_time' && st('a', 'p1').mark === 100 && by.a.marks === 200 && by.a.solvedOnTime === 2);
  s.check('marks: solved only after the deadline is late and earns nothing', st('b', 'p1').status === 'late' && st('b', 'p1').mark === 0 && by.b.solvedLate === 1 && by.b.solvedOnTime === 1 && by.b.marks === 100, JSON.stringify(by.b));
  s.check('marks: late solves still count as solved, so faculty can see who did the work eventually', by.b.solved === 2);
  s.check('marks: tried but never solved is not solved, and a student who never submitted still has a row at 0', st('c', 'p1').status === 'not_solved' && st('c', 'p2').status === 'not_attempted' && by.d.marks === 0 && by.d.solved === 0);
  s.check('marks: submissions to problems outside the assignment are ignored', by.a.solved === 2);

  // ── partial scores ──────────────────────────────────────────────────────────
  s.check('markFor: Accepted with no stored score is 100', markFor({ verdict: 'Accepted' }) === 100);
  s.check('markFor: a stored score is kept for Accepted and for partial credit', markFor({ verdict: 'Accepted', score: 80 }) === 80 && markFor({ verdict: 'Partial', score: 35 }) === 35);
  s.check('markFor: a failed submission with no score is 0', markFor({ verdict: 'Wrong Answer' }) === 0 && markFor({ verdict: 'Compilation Error', score: 0 }) === 0);
  const oi = buildAssignmentMarks({
    assignment: { problemIds: ['p1'], deadline: new Date(deadline) }, students: [{ id: 'a' }],
    submissions: [sub('a', 'p1', 'Partial', -2 * DAY, 30), sub('a', 'p1', 'Partial', -DAY, 60), sub('a', 'p1', 'Partial', -3 * DAY, 10)],
  });
  s.check('marks: the best on-time partial score is kept (60, not the latest or the sum)', oi[0].marks === 60 && oi[0].problems[0].status === 'not_solved');
  const late = buildAssignmentMarks({
    assignment: { problemIds: ['p1'], deadline: new Date(deadline) }, students: [{ id: 'a' }],
    submissions: [sub('a', 'p1', 'Partial', -DAY, 40), sub('a', 'p1', 'Accepted', DAY, 100)],
  });
  s.check('marks: a late accept does not replace the on-time mark', late[0].marks === 40 && late[0].problems[0].status === 'late');

  // ── no deadline ─────────────────────────────────────────────────────────────
  const open = buildAssignmentMarks({ assignment: { problemIds: ['p1'] }, students: [{ id: 'a' }], submissions: [sub('a', 'p1', 'Accepted', 400 * DAY)] });
  s.check('marks: with no deadline everything is on time', open[0].problems[0].status === 'on_time' && open[0].marks === 100);
  s.check('marks: an exact-deadline submission is on time', buildAssignmentMarks({ assignment, students: [{ id: 'a' }], submissions: [sub('a', 'p1', 'Accepted', 0)] })[0].problems[0].status === 'on_time');
  s.check('marks: an assignment with no problems or no students does not throw', buildAssignmentMarks({ assignment: {}, students: [], submissions: [] }).length === 0 && buildAssignmentMarks({ assignment: {}, students: [{ id: 'a' }], submissions: [] })[0].marks === 0);
};
