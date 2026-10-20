// Topic mastery: solved means DISTINCT problems, never accepted submissions.
const { applyAttempt } = require('../../src/utils/topicMastery');

module.exports = function (s) {
  const base = { userId: 'u1', topic: 'arrays' };
  let d = applyAttempt(null, { ...base, solved: true, problemId: 'p1' });
  s.check('first accepted problem: one solved, none failed', d.solvedCount === 1 && d.failedCount === 0 && d.solvedProblemIds.join() === 'p1');

  for (let i = 0; i < 4; i++) d = applyAttempt(d, { ...base, solved: true, problemId: 'p1' });
  s.check('re-submitting the same solved problem four more times still counts one (it used to read five problems)', d.solvedCount === 1 && d.solvedProblemIds.length === 1);

  d = applyAttempt(d, { ...base, solved: true, problemId: 'p2' });
  s.check('a different problem counts', d.solvedCount === 2);

  d = applyAttempt(d, { ...base, solved: false, problemId: 'p3' });
  s.check('a failed submission to an unsolved problem is a failed attempt', d.failedCount === 1 && d.solvedCount === 2);

  d = applyAttempt(d, { ...base, solved: false, problemId: 'p1' });
  s.check('a failed submission to a problem already solved is not a failure in the topic', d.failedCount === 1);

  d = applyAttempt(d, { ...base, solved: false, problemId: 'p3', hintUsed: true });
  s.check('hints are counted, and repeated failures on an unsolved problem keep counting', d.hintUsageCount === 1 && d.failedCount === 2);

  d = applyAttempt(d, { ...base, solved: true, problemId: 'p3' });
  s.check('solving it later raises solved without erasing the failed attempts', d.solvedCount === 3 && d.failedCount === 2);

  const legacy = applyAttempt({ userId: 'u1', topic: 'x', solvedCount: 4, failedCount: 1, hintUsageCount: 0 }, { ...base, solved: true });
  s.check('a caller that does not know the problem keeps the old behaviour', legacy.solvedCount === 5);

  const untouched = { userId: 'u1', topic: 'x', solvedCount: 1, failedCount: 0, hintUsageCount: 0, solvedProblemIds: ['a'] };
  const copy = applyAttempt(untouched, { ...base, solved: true, problemId: 'b' });
  s.check('the stored document is not mutated in place', untouched.solvedProblemIds.length === 1 && untouched.solvedCount === 1 && copy.solvedCount === 2);
};
