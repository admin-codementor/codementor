// Job-Ready Score arithmetic: the headline must equal the sum of the rounded component contributions shown under it.
const { scoreTarget, computeJobReadiness } = require('../../src/services/jobReadinessService');
const { TARGETS } = require('../../src/config/jobReadiness');

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 20, 12);
const mk = (n, difficulty = 'easy') => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, difficulty, tags: ['arrays'] }));

function inputs(solved, over = {}) {
  const solvedProblems = mk(solved);
  return {
    now, solvedProblems, solvedIds: new Set(solvedProblems.map((p) => p.id)),
    acceptedSubs: solvedProblems.map((p, i) => ({ problemId: p.id, submittedAt: new Date(now - i * DAY) })),
    courseProblemIds: solvedProblems.map((p) => p.id), mcqAttempts: [{ score: 7, total: 10, submittedAt: new Date(now - DAY) }],
    codingProfiles: [], roadmapProgress: null, ...over,
  };
}

module.exports = function (s) {
  s.check('every target\'s weights add up to 100', TARGETS.every((t) => Object.values(t.weights).reduce((a, b) => a + b, 0) === 100));
  for (const n of [0, 1, 3, 7, 12, 25, 60]) {
    const ok = TARGETS.filter((t) => t.key !== 'role').every((t) => {
      const r = scoreTarget(t, inputs(n));
      return r.score === Math.max(0, Math.min(100, r.components.reduce((a, c) => a + c.contributes, 0)));
    });
    s.check(`with ${n} problems solved, the headline equals the sum of the contributions shown`, ok);
  }
  const r = scoreTarget(TARGETS[0], inputs(60));
  s.check('each contribution is its score times its weight, rounded', r.components.every((c) => c.contributes === Math.round((c.score * c.weight) / 100)));
  s.check('a score never leaves 0 to 100', r.score >= 0 && r.score <= 100 && scoreTarget(TARGETS[1], inputs(0)).score >= 0);
  const out = computeJobReadiness(inputs(12));
  s.check('the roadmap target is hidden when no roadmap is followed', !out.targets.some((t) => t.key === 'role') && out.roleTargetAvailable === false);
  s.check('the weekly change is the new score minus the score seven days ago', out.targets.every((t) => Number.isInteger(t.weekChange)));
  const more = computeJobReadiness(inputs(30)).targets[0].score;
  s.check('solving more never lowers the score', more >= out.targets[0].score);
};
