// Per-question statistics: statuses, failure kinds, time, best / weakest, suspicion.
const { buildProblemStatistics, failureKind, FLAG_THRESHOLD } = require('../../src/utils/problemStatistics');

const st = (id, name) => ({ id, name, rollNo: `R${id}`, section: 'A', year: 3 });
const sub = (userId, verdict, at) => ({ userId, verdict, submittedAt: at });
const ev = (userId, eventType) => ({ userId, eventType });

module.exports = function (s) {
  // ── verdict kinds ──
  s.check('verdict kinds', failureKind('Accepted') === null && failureKind('Compilation Error') === 'compile'
    && failureKind('Runtime Error (NZEC)') === 'runtime' && failureKind('Time Limit Exceeded') === 'timeout'
    && failureKind('Wrong Answer') === 'wrong' && failureKind('Internal Error') === 'other' && failureKind(undefined) === 'other');

  const students = [st('a', 'Asha'), st('b', 'Bala'), st('c', 'Chitra'), st('d', 'Dev'), st('e', 'Esha')];
  const submissions = [
    sub('a', 'Compilation Error', 1), sub('a', 'Wrong Answer', 2), sub('a', 'Accepted', 3), sub('a', 'Accepted', 4),
    sub('b', 'Accepted', 5),
    sub('c', 'Runtime Error (NZEC)', 6), sub('c', 'Time Limit Exceeded', 7), sub('c', 'Wrong Answer', 8), sub('c', 'Wrong Answer', 9),
    sub('zzz', 'Accepted', 10), // not in scope
  ];
  const times = [
    { userId: 'a', seconds: 900, solvedAtSeconds: 700 },
    { userId: 'b', seconds: 240, solvedAtSeconds: 200 },
    { userId: 'c', seconds: 3000, solvedAtSeconds: null },
    { userId: 'd', seconds: 30, solvedAtSeconds: null }, // opened it, never submitted
    { userId: 'zzz', seconds: 99999, solvedAtSeconds: 1 },
  ];
  const events = [ev('c', 'paste'), ev('c', 'paste'), ev('c', 'paste'), ev('c', 'copy'), ev('a', 'paste'), ev('e', 'exam_start')];
  const r = buildProblemStatistics({ students, submissions, times, events });

  s.check('totals add up to the people in scope', r.totals.students === 5 && r.totals.completed === 2 && r.totals.inProgress === 2 && r.totals.notStarted === 1
    && r.totals.completed + r.totals.inProgress + r.totals.notStarted === r.totals.students, JSON.stringify(r.totals));
  const row = (id) => r.students.find((x) => x.id === id);
  s.check('statuses', row('a').status === 'completed' && row('b').status === 'completed' && row('c').status === 'in_progress' && row('d').status === 'in_progress' && row('e').status === 'not_started');
  s.check('someone who only opened it is in progress; someone out of scope is ignored', row('d').submissions === 0 && !r.students.find((x) => x.id === 'zzz'));

  s.check('failure kinds are counted per student and in total', row('a').compileErrors === 1 && row('a').wrongAnswers === 1 && row('c').runtimeErrors === 1 && row('c').timeouts === 1 && row('c').wrongAnswers === 2
    && r.failures.compile === 1 && r.failures.runtime === 1 && r.failures.timeout === 1 && r.failures.wrong === 3 && r.failures.other === 0, JSON.stringify(r.failures));
  s.check('attempts to solve stop at the first accepted submission (not the later ones)', row('a').attemptsToSolve === 3 && row('b').attemptsToSolve === 1 && row('c').attemptsToSolve === null);
  s.check('average attempts to solve', r.avgAttemptsToSolve === 2, r.avgAttemptsToSolve);

  s.check('average time over everyone who spent time; average time to solve over solvers', r.avgTimeSeconds === Math.round((900 + 240 + 3000 + 30) / 4) && r.avgSolveSeconds === 450, JSON.stringify([r.avgTimeSeconds, r.avgSolveSeconds]));
  s.check('time histogram covers each student with time exactly once', r.timeHistogram.reduce((n, b) => n + b.count, 0) === 4
    && r.timeHistogram[0].count === 2 && r.timeHistogram[2].count === 1 && r.timeHistogram[4].count === 1 && r.timeHistogram[5].count === 0, JSON.stringify(r.timeHistogram.map((b) => b.count)));
  s.check('time data is reported as present', r.hasTimeData === true);

  s.check('best is the solver with the shortest time to solve', r.best.id === 'b' && r.best.solvedAtSeconds === 200);
  s.check('weakest is the unfinished student who tried most', r.weakest.id === 'c' && r.weakest.submissions === 4);

  s.check('suspicion needs the threshold of flag events on this problem; copy and exam_start do not count', FLAG_THRESHOLD === 3 && row('c').suspicious && row('c').flagEvents === 3 && !row('a').suspicious && row('e').flagEvents === 0
    && r.flagged.length === 1 && r.flagged[0].id === 'c');

  // ── degenerate cases ──
  const empty = buildProblemStatistics({ students: [], submissions: [], times: [], events: [] });
  s.check('nobody in scope is empty and safe', empty.totals.students === 0 && empty.best === null && empty.weakest === null && empty.avgTimeSeconds === null && empty.hasTimeData === false);

  const none = buildProblemStatistics({ students, submissions: [], times: [], events: [] });
  s.check('nobody has started: everyone is not started, no best or weakest', none.totals.notStarted === 5 && none.best === null && none.weakest === null);

  const allDone = buildProblemStatistics({
    students: students.slice(0, 2),
    submissions: [sub('a', 'Accepted', 1), sub('b', 'Accepted', 2)],
    times: [{ userId: 'a', seconds: 600, solvedAtSeconds: 500 }, { userId: 'b', seconds: 100, solvedAtSeconds: 90 }],
    events: [],
  });
  s.check('everyone done: best is quickest, weakest is the slowest finisher', allDone.best.id === 'b' && allDone.weakest.id === 'a' && allDone.weakest.kind === 'weakest');

  const noTime = buildProblemStatistics({
    students: students.slice(0, 2),
    submissions: [sub('a', 'Wrong Answer', 1), sub('a', 'Accepted', 2), sub('b', 'Accepted', 3)],
    times: [], events: [],
  });
  s.check('without time records the best is the one who needed fewest attempts, and time is reported as absent', noTime.best.id === 'b' && noTime.hasTimeData === false && noTime.avgTimeSeconds === null);
};
