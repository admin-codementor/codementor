// The coding score: per-platform points, the overall average, flags and thresholds.
const { platformPoints, flagFor, validateThresholds, buildScore, describeFormula, CAP, DEFAULT_THRESHOLDS, SCORED, BEST_OF, UNVERIFIED_WEIGHT } = require('../../src/utils/platformScore');
const { validateTypedValue, LIVE_PLATFORMS, TYPED_PLATFORMS, ALL_PLATFORMS } = require('../../src/utils/codingPlatforms');

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
  s.check('the overall is the average of the best four (here (100 + 50 + 0 + 0) / 4)', mixed.overall === 37.5 && mixed.flag === 'orange' && mixed.points.codementor === 100 && mixed.points.leetcode === 50);

  const star = buildScore({ profiles: { codeforces: { rating: 3500, solved: 4000 } }, codementorSolved: 0 });
  s.check('one outside rating alone cannot make a student green: it is capped at 100 of four', star.overall === 25 && star.flag === 'orange');

  const strict = buildScore({ profiles: { leetcode: { solved: 100 } }, codementorSolved: 150, thresholds: { red: 50, green: 90 } });
  s.check('a stricter college threshold changes the flag, not the score', strict.overall === 37.5 && strict.flag === 'red');

  // ── the formula text is built from the same constants ──
  const f = describeFormula();
  s.check('the formula lists every scored platform and quotes the real caps', f.platforms.length === SCORED.length && f.platforms.find((x) => x.platform === 'codementor').text.includes(String(CAP.codementorSolved)) && f.platforms.find((x) => x.platform === 'codeforces').text.includes(String(CAP.cfRatingTop)));
  s.check('the formula explains the typed platforms and the best-four rule, and the thresholds are ordered', /CodeChef/.test(f.platformsTyped.text) && f.platformsTyped.labels.length === 4 && /best 4/.test(f.overall) && /50%/.test(f.platformsTyped.text) && DEFAULT_THRESHOLDS.red < DEFAULT_THRESHOLDS.green);

  // ── the four typed platforms ──
  s.check('typed: an unverified number counts at half weight, a verified one in full, both capped', platformPoints('codechef', { typedValue: 150 }) === 50 && platformPoints('codechef', { typedValue: 150, scoreVerified: true }) === 100 && platformPoints('codechef', { typedValue: 99999, scoreVerified: true }) === 100 && platformPoints('hackerrank', { typedValue: 50, scoreVerified: true }) === 50 && platformPoints('gfg', { typedValue: 125, scoreVerified: true }) === 50 && platformPoints('interviewbit', { typedValue: 1000, scoreVerified: true }) === 50);
  s.check('typed: a missing, negative or garbage number scores 0 and never NaN', platformPoints('codechef', {}) === 0 && platformPoints('codechef', { typedValue: -5, scoreVerified: true }) === 0 && platformPoints('hackerrank', { typedValue: 'abc', scoreVerified: true }) === 0 && platformPoints('gfg', undefined) === 0);
  s.check('typed: only scoreVerified === true counts as verified, not a truthy look-alike', platformPoints('codechef', { typedValue: 150, scoreVerified: 'yes' }) === 50 && platformPoints('codechef', { typedValue: 150, scoreVerified: 1 }) === 50);
  const all8 = buildScore({ profiles: { leetcode: { solved: 200 }, codeforces: { rating: 2000, solved: 100 }, github: { extra: { repos: 10, stars: 50 } }, codechef: { typedValue: 150, scoreVerified: true }, hackerrank: { typedValue: 100, scoreVerified: true }, gfg: { typedValue: 250, scoreVerified: true }, interviewbit: { typedValue: 2000, scoreVerified: true } }, codementorSolved: 150 });
  s.check('all eight at the top is still 100 (the best four of eight), and every platform is listed as linked', all8.overall === 100 && all8.flag === 'green' && all8.linked.length === 7);
  const base = buildScore({ profiles: { leetcode: { solved: 100 } }, codementorSolved: 150 });
  const more = buildScore({ profiles: { leetcode: { solved: 100 }, codechef: { typedValue: 15 } }, codementorSolved: 150 });
  s.check('linking another platform never lowers the overall score', more.overall >= base.overall && buildScore({ profiles: { leetcode: { solved: 100 }, github: { extra: { repos: 0, stars: 0 } }, gfg: { typedValue: 0 } }, codementorSolved: 150 }).overall === base.overall);
  const five = buildScore({ profiles: { leetcode: { solved: 200 }, codeforces: { rating: 2000, solved: 100 }, codechef: { typedValue: 150, scoreVerified: true }, hackerrank: { typedValue: 100, scoreVerified: true } }, codementorSolved: 150 });
  s.check('only the best four count: five strong platforms still give exactly 100, not more', five.overall === 100 && BEST_OF === 4 && UNVERIFIED_WEIGHT === 0.5);
  s.check('the unverified half weight changes the score, verifying lifts it', buildScore({ profiles: { codechef: { typedValue: 150 } }, codementorSolved: 0 }).overall === 12.5 && buildScore({ profiles: { codechef: { typedValue: 150, scoreVerified: true } }, codementorSolved: 0 }).overall === 25);
  // typed numbers as the student enters them
  s.check('what a student types is checked: whole numbers from 0 to 100000, per platform', validateTypedValue('codechef', '120').value === 120 && validateTypedValue('gfg', 0).value === 0 && !!validateTypedValue('codechef', '1.5').error && !!validateTypedValue('codechef', '-1').error && !!validateTypedValue('codechef', '').error && !!validateTypedValue('codechef', 100001).error && !!validateTypedValue('leetcode', 5).error && !!validateTypedValue('codechef', 'abc').error && /problems solved/.test(validateTypedValue('hackerrank', 'x').error) && /score/.test(validateTypedValue('interviewbit', 'x').error));
  s.check('the platform lists agree: three read by the server, four typed, seven in all', LIVE_PLATFORMS.length === 3 && TYPED_PLATFORMS.length === 4 && ALL_PLATFORMS.length === 7 && TYPED_PLATFORMS.every((x) => SCORED.includes(x)) && LIVE_PLATFORMS.every((x) => SCORED.includes(x)));
};
