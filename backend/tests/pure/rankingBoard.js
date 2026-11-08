// The shared ranking table: only Accepted submissions matter, repeats of a problem count once, and the numbers equal
// what the old per-request scan produced.
const { buildBoard } = require('../../src/utils/rankingBoard');
const { rankRows, sameClass } = require('../../src/utils/ranking');

module.exports = function (s) {
  const students = new Map([
    ['a', { name: 'Asha', department: 'CSE', section: 'A', year: 3, rating: 1300, publicProfile: { published: true } }],
    ['b', { name: 'Bala', department: 'CSE', section: 'A', year: 3 }],
    ['c', { name: 'Chitra', department: 'CSE', section: 'B', year: 3, graduated: true }],
    ['d', { name: 'Dev', department: 'ECE', section: 'A', year: 2 }],
  ]);
  // Accepted rows only, as the repository returns them. Asha solved p1 twice and p2; Bala solved p1.
  const accepted = [
    { userId: 'a', problemId: 'p1' }, { userId: 'a', problemId: 'p1' }, { userId: 'a', problemId: 'p2' },
    { userId: 'b', problemId: 'p1' },
    { userId: 'ghost', problemId: 'p9' }, // not a student: ignored
    { userId: 'b' },                      // malformed: ignored
  ];
  const board = buildBoard(students, accepted, new Map([['a', 'asha-k']]), 1000);

  s.check('a repeat accept of the same problem counts once', board.solved.a === 2);
  s.check('one accepted problem counts as one', board.solved.b === 1);
  s.check('a student with no accepted problem has no entry (reads as 0)', board.solved.c === undefined && board.solved.d === undefined);
  s.check('non-students and malformed rows are ignored', board.solved.ghost === undefined && Object.keys(board.solved).length === 2);
  s.check('the table is JSON-safe (survives Redis)', JSON.stringify(JSON.parse(JSON.stringify(board))) === JSON.stringify(board));
  s.check('a published profile carries its handle, an unpublished one does not', board.students.a.publicHandle === 'asha-k' && board.students.b.publicHandle === null);
  s.check('graduated flag is carried so alumni stay out of the ranking', board.students.c.graduated === true && board.students.a.graduated === false);
  s.check('built-at is recorded', board.builtAt === 1000);

  // Same ranking rule as before: ties share a rank, nothing solved = unranked.
  const rows = Object.keys(board.students).filter((id) => !board.students[id].graduated)
    .map((id) => ({ id, name: board.students[id].name, solved: board.solved[id] || 0 }));
  const ranked = rankRows(rows, (r) => r.solved);
  s.check('Asha is #1 with 2 solved, Bala #2 with 1, Dev unranked', ranked.find((r) => r.id === 'a').rank === 1 && ranked.find((r) => r.id === 'b').rank === 2 && ranked.find((r) => r.id === 'd').rank === 0);
  s.check('class membership works on the slim profile', sameClass(board.students.a, board.students.b) && !sameClass(board.students.a, board.students.d));
};
