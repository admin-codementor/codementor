// Department practice analytics (utils/practiceAnalytics.js), checked against a small fixture worked out by hand.
const { buildPracticeAnalytics, bucketsFor, PERIODS } = require('../../src/utils/practiceAnalytics');
const { studentState } = require('../../src/utils/studentState');

const DAY = 86400000;
const NOW = Date.parse('2026-11-01T12:00:00Z'); // a Sunday, 17:30 in India
const ago = (d) => NOW - d * DAY;
const sub = (userId, problemId, ok, d, language = 71) => ({ userId, problemId, verdict: ok ? 'Accepted' : 'Wrong Answer', submittedAt: ago(d), language });

const students = [
  { id: 's1', year: 4, admissionYear: 2023 }, { id: 's2', year: 4, admissionYear: 2023 }, { id: 's3', year: 4, admissionYear: 2023 },
  { id: 's4', year: 3, admissionYear: 2024 }, { id: 's5', year: 3, admissionYear: 2024 }, { id: 's6', year: 3, admissionYear: 2024 },
];
const catalog = [
  { id: 'p1', title: 'Sum', difficulty: 'Easy', tags: ['Loops'] }, { id: 'p2', title: 'Count', difficulty: 'easy', tags: ['loops'] },
  { id: 'p3', title: 'Sort', difficulty: 'medium', tags: ['Arrays'] }, { id: 'p4', title: 'Knapsack', difficulty: 'hard', tags: ['arrays', 'DP'] },
];
const submissions = [
  sub('s1', 'p1', true, 2), sub('s1', 'p2', true, 3), sub('s1', 'p3', false, 1.5), sub('s1', 'p3', true, 1.4),
  sub('s2', 'p1', false, 2), sub('s2', 'p1', false, 2.1),
  sub('s3', 'p1', true, 20),
  sub('s4', 'p1', true, 10), sub('s4', 'p2', true, 9),
  sub('s5', 'p1', false, 5),
];
const run = (days, extra = {}) => buildPracticeAnalytics({ students, submissions, catalog, days, now: NOW, ...extra });

module.exports = function (s) {
  const w = run(7);
  const t = w.tiles;
  s.check('the numbers of the last 7 days: students, who practised, participation', t.students === 6 && t.practising === 3 && t.participation_pct === 50);
  s.check('solved counts a problem once per student, on the day it was first accepted (s1 solved three, s4\'s two are in the period before)', t.solved === 3 && t.solved_change === 1);
  s.check('submissions and the pass rate of the period, with the change against the period before', t.submissions === 7 && t.pass_rate === 43 && t.submissions_change === 5 && t.per_practising === 1);
  s.check('not started, stuck and gone quiet use the same states as the Overview, and with practising they add up to every student', t.not_started === 1 && t.stuck === 2 && t.gone_quiet === 2 && t.not_started + t.stuck + t.gone_quiet + 1 === t.students);
  s.check('they really are the Overview\'s rule: s2 and s5 are stuck, s3 and s4 gone quiet, s6 not started', studentState({ subs: 2, solved: 0, lastActiveMs: ago(2) }, NOW) === 'stuck' && studentState({ subs: 1, solved: 1, lastActiveMs: ago(20) }, NOW) === 'gone_quiet' && studentState({ subs: 0, solved: 0, lastActiveMs: 0 }, NOW) === 'not_started');

  s.check('what was solved by difficulty, against what exists (difficulty names ignore case)', JSON.stringify(w.difficulty.solved) === JSON.stringify({ easy: 2, medium: 1, hard: 0, other: 0 }) && JSON.stringify(w.difficulty.bank) === JSON.stringify({ easy: 2, medium: 1, hard: 1, other: 0 }) && t.bank.easy === 2);
  s.check('practice over time is one bucket per day for a week, and the buckets add up to the totals', w.over_time.length === 7 && w.over_time.reduce((n, b) => n + b.submissions, 0) === 7 && w.over_time.reduce((n, b) => n + b.solved, 0) === 3);
  s.check('the heat map has 7 weekdays by 24 hours and counts every submission once', w.heatmap.length === 7 && w.heatmap.every((r) => r.length === 24) && w.heatmap.flat().reduce((n, v) => n + v, 0) === 7);
  s.check('the heat map is in India time: noon UTC on a Sunday is 17:30 Sunday, so a submission 2 days earlier is Friday 17', (() => { const one = buildPracticeAnalytics({ students: [students[0]], submissions: [sub('s1', 'p1', true, 2)], catalog, days: 7, now: NOW }); return one.heatmap[5][17] === 1 && one.heatmap.flat().reduce((n, v) => n + v, 0) === 1; })());
  s.check('a submission just after midnight India time lands on the next day, not the UTC one', (() => { const ms = Date.parse('2026-10-30T19:00:00Z'); /* 00:30 on 31 Oct in India: a Saturday */ const one = buildPracticeAnalytics({ students: [students[0]], submissions: [{ userId: 's1', problemId: 'p1', verdict: 'Accepted', submittedAt: ms, language: 71 }], catalog, days: 7, now: NOW }); return one.heatmap[6][0] === 1; })());

  s.check('languages: named, with submissions, passed and students; an unknown id is still shown', w.languages.length === 1 && w.languages[0].name === 'Python 3.8' && w.languages[0].submissions === 7 && w.languages[0].passed === 3 && w.languages[0].students === 3 && buildPracticeAnalytics({ students, submissions: [{ ...submissions[0], language: 999 }], catalog, days: 7, now: NOW }).languages[0].name === 'Language 999');
  const p1 = w.problems.find((p) => p.id === 'p1');
  s.check('the problem table counts how many tried, solved, the submissions and the pass rate', p1.tried === 3 && p1.solved === 1 && p1.submissions === 4 && p1.pass_rate === 25 && w.problems[0].id === 'p1');
  s.check('a problem that was removed is still listed, with plain words', buildPracticeAnalytics({ students, submissions: [sub('s1', 'gone', true, 1)], catalog, days: 7, now: NOW }).problems[0].title === 'A problem that was removed');

  const loops = w.topics.find((x) => x.name === 'Loops');
  const arrays = w.topics.find((x) => x.name === 'Arrays');
  s.check('topic coverage: students who started, who finished all of it, and how much of it starters solved (tags match ignoring case)', loops.problems === 2 && loops.started === 5 && loops.completed === 2 && loops.solved_share === 50 && arrays.problems === 2 && arrays.started === 1 && arrays.completed === 0 && arrays.solved_share === 50 && w.topics.find((x) => x.name === 'DP').started === 0);
  s.check('topics do not depend on the period', JSON.stringify(run(7).topics) === JSON.stringify(run(365).topics));

  s.check('batches: students, how many practised, solved, and per student; the newest batch first', JSON.stringify(w.batches.map((b) => [b.name, b.students, b.practising, b.solved])) === JSON.stringify([['2024-2028', 3, 1, 0], ['2023-2027', 3, 2, 3]]) && w.batches[1].per_student === 1);

  s.check('what to look at, in plain rules: stuck and gone quiet here; nothing about topics (none has 3 problems)', w.insights.map((i) => i.title).join('|') === '2 students are stuck|2 students have gone quiet');
  const quiet = buildPracticeAnalytics({ students, submissions: [], catalog, days: 7, now: NOW });
  s.check('with nobody practising, the first thing said is that students have never practised, with the share', quiet.insights[0].severity === 'high' && /6 of 6 students have never practised/.test(quiet.insights[0].title) && quiet.tiles.participation_pct === 0 && quiet.tiles.pass_rate === 0);
  const falling = buildPracticeAnalytics({ students, submissions: [sub('s1', 'p1', true, 1), ...[2, 3, 4, 5].map((i) => sub(`s${i}`, 'p1', true, 9))], catalog, days: 7, now: NOW });
  s.check('falling practice is called out with the real numbers and the percentage', /falling off: 1 problems solved in the last 7 days, against 4/.test(falling.insights.map((i) => i.title).join('|')) && /75% fewer/.test(falling.insights.find((i) => /falling/.test(i.title)).detail));
  s.check('a very small department is not told about a weak topic: it needs 3 problems and 3 students who started', !w.insights.some((i) => /weakest/.test(i.title)));
  const many = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, year: 4 }));
  const topic3 = buildPracticeAnalytics({ students: many, submissions: many.map((m) => sub(m.id, 'q1', false, 1)), catalog: [{ id: 'q1', tags: ['graphs'] }, { id: 'q2', tags: ['graphs'] }, { id: 'q3', tags: ['graphs'] }], days: 7, now: NOW });
  s.check('with enough data the weakest topic is named with the share solved', topic3.insights.some((i) => /graphs is the weakest topic/.test(i.title) && /0%/.test(i.detail)));

  // periods
  s.check('the last 30 days include the 20-day-old solve; the change is against the 30 days before', run(30).tiles.solved === 6 && run(30).tiles.solved_change === 6);
  s.check('all time has no change (nothing to compare), and monthly buckets that add up', run(0).tiles.solved_change === null && run(0).tiles.submissions_change === null && run(0).tiles.submissions === 10 && run(0).over_time.reduce((n, b) => n + b.submissions, 0) === 10);
  s.check('today is 24 hourly buckets; an unknown period falls back to 7 days', run(1).over_time.length === 24 && run(1).tiles.submissions === 0 && run(5).period_days === 7 && PERIODS.includes(0));
  s.check('90, 180 and 365 days are weekly buckets', run(90).over_time.length === 13 && run(365).over_time.length === 53 && bucketsFor(180, NOW).length === 26);

  // robustness
  const empty = buildPracticeAnalytics({ students: [], submissions, catalog, days: 7, now: NOW });
  s.check('no students gives zeros and an empty insight list, not an error', empty.tiles.students === 0 && empty.tiles.participation_pct === 0 && empty.insights.length === 0 && empty.batches.length === 0);
  s.check('submissions from students outside the view, from the future, or with no time are ignored', buildPracticeAnalytics({ students: [students[0]], submissions: [sub('other', 'p1', true, 1), { userId: 's1', problemId: 'p1', verdict: 'Accepted', submittedAt: NOW + DAY }, { userId: 's1', problemId: 'p1', verdict: 'Accepted' }], catalog, days: 7, now: NOW }).tiles.submissions === 0);
  s.check('Firestore timestamps are read', buildPracticeAnalytics({ students: [students[0]], submissions: [{ userId: 's1', problemId: 'p1', verdict: 'Accepted', submittedAt: { toMillis: () => ago(1) }, language: 71 }], catalog, days: 7, now: NOW }).tiles.solved === 1);
  s.check('a student with no year and no stored batch is grouped as "No batch"', buildPracticeAnalytics({ students: [{ id: 'x' }], submissions: [], catalog, days: 7, now: NOW }).batches[0].name === 'No batch');
};
