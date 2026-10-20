// Course resume: the last unsolved problem the student touched, else the first unsolved, else nothing.
const { resolveResume } = require('../../src/utils/courseResume');

const mk = (id, moduleId, position, moduleTotal = 3) => ({ id, title: `T-${id}`, moduleId, moduleTitle: `M-${moduleId}`, position, moduleTotal });
const ordered = [mk('a', 'm1', 1), mk('b', 'm1', 2), mk('c', 'm1', 3), mk('d', 'm2', 1), mk('e', 'm2', 2), mk('f', 'm2', 3)];

module.exports = function (s) {
  let r = resolveResume(ordered, new Set(), new Map());
  s.check('nothing started: next up is the very first problem', r.problemId === 'a' && r.reason === 'next' && r.touchedAt === null);

  r = resolveResume(ordered, new Set(['a', 'b']), new Map());
  s.check('some solved, none touched: next up is the first unsolved in course order', r.problemId === 'c' && r.reason === 'next' && r.position === 3);

  r = resolveResume(ordered, new Set(['a']), new Map([['e', 5000]]));
  s.check('a problem opened but not solved is resumed, even if it is later in the course', r.problemId === 'e' && r.reason === 'in_progress' && r.touchedAt === 5000 && r.moduleId === 'm2');

  r = resolveResume(ordered, new Set(), new Map([['b', 1000], ['d', 9000], ['c', 4000]]));
  s.check('with several in progress the most recently touched wins', r.problemId === 'd');

  r = resolveResume(ordered, new Set(['b']), new Map([['b', 99999], ['c', 100]]));
  s.check('a solved problem touched last does not count as in progress', r.problemId === 'c' && r.reason === 'in_progress');

  r = resolveResume(ordered, new Set(['a', 'b', 'c', 'd', 'e', 'f']), new Map([['a', 1]]));
  s.check('everything solved: nothing to resume', r === null);

  s.check('an empty course has nothing to resume', resolveResume([], new Set(), new Map()) === null);

  r = resolveResume(ordered, new Set(), new Map([['zzz', 9999]]));
  s.check('time records for problems outside the course are ignored', r.problemId === 'a' && r.reason === 'next');

  r = resolveResume(ordered, new Set(['a']), new Map([['b', 0]]));
  s.check('a zero timestamp is treated as never touched', r.reason === 'next' && r.problemId === 'b');
};
