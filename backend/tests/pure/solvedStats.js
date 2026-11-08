// The per-student solved record and the ranking table built from it.
const { applySolve, mergeSolved } = require('../../src/utils/solvedStats');
const { buildBoard, buildBoardFromCounts } = require('../../src/utils/rankingBoard');

module.exports = function (s) {
  const first = applySolve(null, 'p1');
  s.check('a first solve creates the record with count 1', first.isNew === true && first.next.solvedCount === 1 && first.next.solvedProblemIds[0] === 'p1');

  const again = applySolve(first.next, 'p1');
  s.check('solving the same problem again changes nothing', again.isNew === false && again.next.solvedCount === 1);

  const second = applySolve(first.next, 'p2');
  s.check('a second different problem makes 2', second.isNew === true && second.next.solvedCount === 2);
  s.check('applySolve does not change the record it was given', first.next.solvedProblemIds.length === 1);
  s.check('a missing problem id is ignored', applySolve(first.next, '').isNew === false && applySolve(null, undefined).next.solvedCount === 0);

  const merged = mergeSolved({ solvedProblemIds: ['p1', 'p2'] }, ['p2', 'p3', 'p3', '']);
  s.check('merge only adds, never removes, and counts distinct ids', merged.solvedCount === 3 && merged.solvedProblemIds.includes('p1'));
  s.check('merge into a new student works', mergeSolved(null, ['a', 'b']).solvedCount === 2);
  s.check('merge is repeatable (re-running the backfill changes nothing)', JSON.stringify(mergeSolved(merged, ['p1', 'p2', 'p3'])) === JSON.stringify(merged));

  // The two ways of building the table must agree: this is what lets the ranking switch over safely.
  const students = new Map([
    ['a', { name: 'Asha', department: 'CSE', section: 'A', year: 3 }],
    ['b', { name: 'Bala', department: 'CSE', section: 'A', year: 3 }],
    ['c', { name: 'Chitra', department: 'CSE', section: 'B', year: 3 }],
  ]);
  const rows = [
    { userId: 'a', problemId: 'p1' }, { userId: 'a', problemId: 'p1' }, { userId: 'a', problemId: 'p2' },
    { userId: 'b', problemId: 'p1' }, { userId: 'zz', problemId: 'p5' },
  ];
  const fromScan = buildBoard(students, rows, new Map(), 5);
  const records = { a: mergeSolved(null, ['p1', 'p2']).solvedCount, b: mergeSolved(null, ['p1']).solvedCount, zz: 1, c: 0 };
  const fromRecords = buildBoardFromCounts(students, records, new Map(), 5);
  s.check('the table from records equals the table from the old scan', JSON.stringify(fromScan) === JSON.stringify(fromRecords), JSON.stringify(fromRecords.solved));
  s.check('zero counts and non-students stay out of the table', fromRecords.solved.c === undefined && fromRecords.solved.zz === undefined);
};
