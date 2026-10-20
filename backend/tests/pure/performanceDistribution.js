// The runtime / memory comparison: who counts, how ties and empty cases read.
const { performanceDistribution } = require('../../src/utils/performanceDistribution');

const sub = (userId, runtime, memory, extra = {}) => ({ userId, verdict: 'Accepted', runtime, memory, language: '100', ...extra });

module.exports = function (s) {
  const subs = [
    sub('me', 40, 9000), sub('me', 25, 8000), // my best counts, not my first
    sub('a', 10, 7000), sub('b', 30, 9500), sub('c', 60, 12000), sub('d', 25, 8000),
    sub('e', 5, 100, { language: '62' }), // another language: not comparable
    sub('f', 1, 1, { verdict: 'Wrong Answer' }), // not accepted: never counts
  ];
  const r = performanceDistribution(subs, 'me');
  s.check('my value is my best accepted run', r.runtime.mine === 25 && r.memory.mine === 8000);
  s.check('only the same language, only accepted, one value per student', r.runtime.others === 4 && r.students === 5, JSON.stringify({ o: r.runtime.others, st: r.students }));
  // others: 10, 30, 60, 25 -> slower than 25: 30, 60 (2); same: 25 (1) -> (2 + 0.5) / 4 = 62.5 -> 63
  s.check('faster than: slower others plus half the ties', r.runtime.fasterThanPercent === 63, r.runtime.fasterThanPercent);
  s.check('best and median among the others', r.runtime.best === 10 && r.runtime.median === 30, JSON.stringify({ b: r.runtime.best, m: r.runtime.median }));
  const total = r.runtime.bins.reduce((n, b) => n + b.count, 0);
  s.check('every other solution is in exactly one bin, and my bin is marked', total === 4 && r.runtime.bins.filter((b) => b.mine).length === 1 && r.runtime.bins.length === 8);
  s.check('bins cover from the fastest to the slowest value', r.runtime.bins[0].from === 10 && r.runtime.bins[7].to === 60);

  const first = performanceDistribution([sub('me', 20, 5000)], 'me');
  s.check('the first student to solve it gets no percentage, not a made-up 100%', first.runtime.fasterThanPercent === null && first.runtime.others === 0 && first.mine === true);
  s.check('with everyone equal there is a single bin', performanceDistribution([sub('me', 20, 1), sub('a', 20, 1)], 'me').runtime.bins.length === 1);

  const unsolved = performanceDistribution([sub('a', 10, 100), sub('b', 20, 200)], 'me');
  s.check('a student who has not solved it sees the spread but no value of their own', unsolved.mine === false && unsolved.runtime.mine === null && unsolved.runtime.bins.length > 0 && unsolved.runtime.fasterThanPercent === null);

  const empty = performanceDistribution([], 'me');
  s.check('no submissions at all is empty and safe', empty.students === 0 && empty.runtime.bins.length === 0 && empty.runtime.best === null);

  const junk = performanceDistribution([sub('a', 'x', null), { verdict: 'Accepted', runtime: 5, memory: 5 }, sub('me', 7, 7)], 'me');
  s.check('rows with no student or a non-numeric value are ignored', junk.runtime.others === 0 && junk.runtime.mine === 7);
};
