// The coding score: per-platform points, the overall average, flags and thresholds.
const { platformPoints, flagFor, validateThresholds, buildScore, describeFormula, CAP, DEFAULT_THRESHOLDS, SCORED } = require('../../src/utils/platformScore');

module.exports = function (s) {
  // ── per platform ──
  s.check('CodeMentor: 150 solved is full marks, half is half, never above 100', platformPoints('codementor', null, 150) === 100 && platformPoints('codementor', null, 75) === 50 && platformPoints('codementor', null, 900) === 100 && platformPoints('codementor', null, 0) === 0);
  s.check('LeetCode: solved over 200, capped', platformPoints('leetcode', { solved: 100 }) === 50 && platformPoints('leetcode', { solved: 5000 }) === 100);
  s.check('an unlinked platform scores 0', platformPoints('leetcode', undefined) === 0 && platformPoints('github', undefined) === 0);

  s.check('Codeforces: rating floor earns nothing for rating, the top earns 70, solved adds up to 30', platformPoints('codeforces', { rating: 800, solved: 0 }) === 0 && platformPoints('codeforces', { rating: 2000, solved: 0 }) === 70 && platformPoints('codeforces', { rating: 1400, solved: 0 }) === 35 && platformPoints('codeforces', { rating: null, solved: 100 }) === 30);
  s.check('Codeforces: a huge rating cannot pass 100 (the point of capping)', platformPoints('codeforces', { rating: 3800, solved: 5000 }) === 100);
  s.check('Codeforces: a rating below the floor does not go negative', platformPoints('codeforces', { rating: 400, solved: 0 }) === 0);

  s.check('GitHub: repos and stars share 60 and 40, capped', platformPoints('github', { extra: { repos: 10, stars: 0 } }) === 60 && platformPoints('github', { extra: { repos: 0, stars: 50 } }) === 40 && platformPoints('github', { extra: { repos: 99, stars: 9999 } }) === 100 && platformPoints('github', { extra: {} }) === 0);
  s.check('garbage in the stored numbers is read as 0, not NaN', platformPoints('leetcode', { solved: 'abc' }) === 0 && platformPoints('codeforces', { rating: 'x', solved: undefined }) === 0);

  // ── flags ──
  s.check('flags: below 20 red, 20 to 49 orange, 50 and above green', flagFor(19.9) === 'red' && flagFor(20) === 'orange' && flagFor(49.9) === 'orange' && flagFor(50) === 'green' && flagFor(100) === 'green');
  s.check('flags use the thresholds given', flagFor(30, { red: 40, green: 80 }) === 'red' && flagFor(80, { red: 40, green: 80 }) === 'green');
  s.check('thresholds are validated: whole numbers, 0 <= red < green <= 100', validateThresholds({ red: 10, green: 60 }).green === 60 && !!validateThresholds({ red: 60, green: 60 }).error && !!validateThresholds({ red: -1, green: 50 }).error && !!validateThresholds({ red: 10, green: 101 }).error && !!validateThresholds({ red: 1.5, green: 50 }).error && !!validateThresholds({}).error);

  // ── overall ──
  const none = buildScore({ profiles: {}, codementorSolved: 0 });
  s.check('a student with nothing is 0 overall and red', none.overall === 0 && none.flag === 'red' && none.linked.length === 0 && SCORED.every((p) => none.flags[p] === 'red'));

  const full = buildScore({ profiles: { leetcode: { solved: 200 }, codeforces: { rating: 2000, solved: 100 }, github: { extra: { repos: 10, stars: 50 } } }, codementorSolved: 150 });
  s.check('everything at the top is 100 and green', full.overall === 100 && full.flag === 'green' && full.linked.join() === 'leetcode,codeforces,github');

  const mixed = buildScore({ profiles: { leetcode: { solved: 100 } }, codementorSolved: 150 });
  s.check('the overall is the plain average of the four (here (100 + 50 + 0 + 0) / 4)', mixed.overall === 37.5 && mixed.flag === 'orange' && mixed.points.codementor === 100 && mixed.points.leetcode === 50);

  const star = buildScore({ profiles: { codeforces: { rating: 3500, solved: 4000 } }, codementorSolved: 0 });
  s.check('one outside rating alone cannot make a student green: it is capped at 100 of four', star.overall === 25 && star.flag === 'orange');

  const strict = buildScore({ profiles: { leetcode: { solved: 100 } }, codementorSolved: 150, thresholds: { red: 50, green: 90 } });
  s.check('a stricter college threshold changes the flag, not the score', strict.overall === 37.5 && strict.flag === 'red');

  // ── the formula text is built from the same constants ──
  const f = describeFormula();
  s.check('the formula lists every scored platform and quotes the real caps', f.platforms.length === SCORED.length && f.platforms.find((x) => x.platform === 'codementor').text.includes(String(CAP.codementorSolved)) && f.platforms.find((x) => x.platform === 'codeforces').text.includes(String(CAP.cfRatingTop)));
  s.check('the formula says which platforms are not scored', /HackerRank/.test(f.notScored) && DEFAULT_THRESHOLDS.red < DEFAULT_THRESHOLDS.green);
};
