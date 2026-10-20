// "What to look at" for a course: each rule fires on its own fixture and stays quiet otherwise.
const { buildCourseInsights } = require('../../src/utils/courseInsights');

const DAY = 86400000;
const NOW = 1_800_000_000_000;
const base = () => ({
  summary: { students: 10, totalProblems: 20, completed: 0, inProgress: 5, notStarted: 5 },
  units: [], students: [], flagged: [], daily: Array.from({ length: 6 }, () => ({ subs: 10 })), days: 6, now: NOW,
});
const keys = (i) => i.map((x) => x.key);
const find = (i, k) => i.find((x) => x.key === k);
const daily = (a, b) => [...a.map((n) => ({ subs: n })), ...b.map((n) => ({ subs: n }))];

module.exports = function (s) {
  s.check('an empty class or an empty course says nothing',
    buildCourseInsights({ ...base(), summary: { ...base().summary, students: 0 } }).length === 0
    && buildCourseInsights({ ...base(), summary: { ...base().summary, totalProblems: 0 } }).length === 0);

  let r = buildCourseInsights(base());
  s.check('half the class not started is a high-severity finding, with the real numbers',
    r[0].key === 'not_started' && r[0].severity === 'high' && /5 of 10/.test(r[0].title) && /50%/.test(r[0].detail), JSON.stringify(r[0]));

  r = buildCourseInsights({ ...base(), summary: { students: 10, totalProblems: 20, completed: 0, inProgress: 9, notStarted: 1 } });
  s.check('a few not started is only low severity', find(r, 'not_started').severity === 'low');

  r = buildCourseInsights({
    ...base(),
    summary: { students: 10, totalProblems: 20, completed: 0, inProgress: 10, notStarted: 0 },
    students: [
      { status: 'in_progress', lastActiveMs: NOW - 8 * DAY, subsInWindow: 0, solvedInWindow: 0 },
      { status: 'in_progress', lastActiveMs: NOW - 2 * DAY, subsInWindow: 3, solvedInWindow: 1 },
      { status: 'not_started', lastActiveMs: null, subsInWindow: 0, solvedInWindow: 0 },
      { status: 'completed', lastActiveMs: NOW - 30 * DAY, subsInWindow: 0, solvedInWindow: 0 },
    ],
  });
  const quiet = find(r, 'gone_quiet');
  s.check('quiet means started, unfinished and silent past the threshold; finished or never started do not count',
    quiet && /^1 student started but has been quiet/.test(quiet.title), quiet && quiet.title);

  r = buildCourseInsights({
    ...base(),
    summary: { students: 4, totalProblems: 5, completed: 0, inProgress: 4, notStarted: 0 },
    students: [
      { status: 'in_progress', lastActiveMs: NOW, subsInWindow: 7, solvedInWindow: 0 },
      { status: 'in_progress', lastActiveMs: NOW, subsInWindow: 7, solvedInWindow: 2 },
      { status: 'in_progress', lastActiveMs: NOW, subsInWindow: 4, solvedInWindow: 0 },
    ],
  });
  s.check('stuck needs many submissions and nothing solved in the window',
    keys(r).includes('stuck') && /^1 student submitted 5\+ times/.test(find(r, 'stuck').title));

  r = buildCourseInsights({
    ...base(),
    units: [
      { title: 'Loops', empty: false, avgPercent: 62, solved: 3, partial: 4 },
      { title: 'Recursion', empty: false, avgPercent: 12, solved: 0, partial: 5 },
      { title: 'Untouched', empty: false, avgPercent: 0, solved: 0, partial: 0 },
      { title: 'Coming soon', empty: true, avgPercent: 0, solved: 0, partial: 0 },
    ],
  });
  const low = find(r, 'low_unit');
  s.check('the lowest unit that anyone has started is named; untouched and empty units are not',
    low && /Recursion/.test(low.title) && /12%/.test(low.detail), low && low.title);
  s.check('no unit below the threshold means no sentence',
    !keys(buildCourseInsights({ ...base(), units: [{ title: 'Loops', empty: false, avgPercent: 70, solved: 3, partial: 4 }] })).includes('low_unit'));

  r = buildCourseInsights({ ...base(), flagged: [{ reasons: ['x'] }, { reasons: ['y'] }] });
  s.check('flagged students are counted', /^2 students are flagged/.test(find(r, 'flagged').title));

  r = buildCourseInsights({ ...base(), daily: daily([10, 10, 10], [2, 2, 2]), days: 6 });
  s.check('activity falling: later half at most half of the earlier', /falling/i.test(find(r, 'falling').title) && /80%/.test(find(r, 'falling').detail));
  r = buildCourseInsights({ ...base(), daily: daily([2, 2, 2], [6, 6, 6]), days: 6 });
  s.check('activity rising: later half at least 1.5x', keys(r).includes('rising') && /200%/.test(find(r, 'rising').detail));
  s.check('flat or tiny windows say nothing about direction',
    !keys(buildCourseInsights(base())).some((k) => k === 'rising' || k === 'falling')
    && !keys(buildCourseInsights({ ...base(), daily: [{ subs: 5 }], days: 1 })).some((k) => k === 'rising' || k === 'falling'));

  r = buildCourseInsights({ ...base(), summary: { students: 10, totalProblems: 20, completed: 3, inProgress: 7, notStarted: 0 } });
  s.check('completion is good news, low severity', find(r, 'completed').severity === 'low' && /30%/.test(find(r, 'completed').detail));

  const loud = buildCourseInsights({
    summary: { students: 10, totalProblems: 20, completed: 1, inProgress: 4, notStarted: 5 },
    units: [{ title: 'U', empty: false, avgPercent: 5, solved: 0, partial: 3 }],
    students: [{ status: 'in_progress', lastActiveMs: NOW - 9 * DAY, subsInWindow: 9, solvedInWindow: 0 }],
    flagged: [{ reasons: ['x'] }], daily: daily([10, 10, 10], [1, 1, 1]), days: 6, now: NOW,
  });
  const rank = { high: 0, medium: 1, low: 2 };
  s.check('findings are ordered by severity and capped at six',
    loud.length <= 6 && loud[0].severity === 'high' && loud.every((x, i, a) => i === 0 || rank[a[i - 1].severity] <= rank[x.severity]), JSON.stringify(keys(loud)));
};
