// One coding score per student, from the platforms we can read reliably plus CodeMentor itself. Pure: plain values in,
// plain values out, and the formula shown to HODs is generated from the same constants that compute the score, so the two
// can never disagree.
//
// Design rules (why this is not a plain sum of each platform's own numbers):
//   - Every platform becomes 0 to 100 POINTS, with a ceiling, so no single outside rating can dominate the total and one
//     problem on one site is not secretly worth five on another.
//   - The overall score is the average of the platforms in SCOPE (those we can read), 0 to 100. A platform the student has
//     not linked counts as 0: linking nothing is not the same as being good.
//   - Platforms we cannot read (HackerRank, CodeChef, GeeksforGeeks) are shown as links only and are NOT scored.
//   - Flags: red / orange / green from one pair of thresholds per college year, applied to every platform and the overall.

const SCORED = ['codementor', 'leetcode', 'codeforces', 'github'];

const LABEL = { codementor: 'CodeMentor', leetcode: 'LeetCode', codeforces: 'Codeforces', github: 'GitHub' };

// Where full marks start. Each is the amount that earns 100 (or the stated share of it).
const CAP = {
  codementorSolved: 150,   // distinct problems solved on CodeMentor
  leetcodeSolved: 200,     // problems solved on LeetCode
  cfRatingFloor: 800,      // Codeforces rating that earns 0 rating points
  cfRatingTop: 2000,       // Codeforces rating that earns the full 70 rating points
  cfRatingShare: 70,
  cfSolved: 100,           // Codeforces problems solved that earn the other 30
  cfSolvedShare: 30,
  githubRepos: 10,         // public repositories that earn the 60 repo points
  githubReposShare: 60,
  githubStars: 50,         // stars across them that earn the other 40
  githubStarsShare: 40,
};

// Below `red` is red, `green` and above is green, between is orange. Percent points (0 to 100).
const DEFAULT_THRESHOLDS = { red: 20, green: 50 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (n) => Math.round(n * 10) / 10;

/** Points (0 to 100) one platform earns. `p` is that platform's stored profile, or undefined when not linked. */
function platformPoints(platform, p, codementorSolved = 0) {
  if (platform === 'codementor') return round1(clamp((num(codementorSolved) / CAP.codementorSolved) * 100, 0, 100));
  if (!p) return 0;
  if (platform === 'leetcode') return round1(clamp((num(p.solved) / CAP.leetcodeSolved) * 100, 0, 100));
  if (platform === 'codeforces') {
    const rated = p.rating == null ? 0 : clamp((num(p.rating) - CAP.cfRatingFloor) / (CAP.cfRatingTop - CAP.cfRatingFloor), 0, 1) * CAP.cfRatingShare;
    const solved = clamp(num(p.solved) / CAP.cfSolved, 0, 1) * CAP.cfSolvedShare;
    return round1(rated + solved);
  }
  if (platform === 'github') {
    const x = p.extra || {};
    const repos = clamp(num(x.repos) / CAP.githubRepos, 0, 1) * CAP.githubReposShare;
    const stars = clamp(num(x.stars) / CAP.githubStars, 0, 1) * CAP.githubStarsShare;
    return round1(repos + stars);
  }
  return 0;
}

/** 'red' | 'orange' | 'green' for a 0 to 100 points value. */
function flagFor(points, thresholds = DEFAULT_THRESHOLDS) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  return points < t.red ? 'red' : points >= t.green ? 'green' : 'orange';
}

/** Validates a thresholds pair coming from the HOD: whole numbers, 0 <= red < green <= 100. */
function validateThresholds(input) {
  const red = Number(input?.red);
  const green = Number(input?.green);
  if (![red, green].every(Number.isInteger)) return { error: 'red and green must be whole numbers.' };
  if (red < 0 || green > 100 || red >= green) return { error: 'It must be 0 <= red < green <= 100.' };
  return { red, green };
}

/**
 * @param {Record<string, {solved?:number, rating?:number|null, extra?:object}>} profiles  by platform
 * @param {number} codementorSolved   distinct problems solved on CodeMentor
 * @param {{red:number, green:number}} [thresholds]
 */
function buildScore({ profiles = {}, codementorSolved = 0, thresholds = DEFAULT_THRESHOLDS }) {
  const points = {};
  for (const pf of SCORED) points[pf] = platformPoints(pf, profiles[pf], codementorSolved);
  const overall = round1(SCORED.reduce((n, pf) => n + points[pf], 0) / SCORED.length);
  const flags = Object.fromEntries(SCORED.map((pf) => [pf, flagFor(points[pf], thresholds)]));
  return {
    points, overall, flag: flagFor(overall, thresholds), flags,
    linked: SCORED.filter((pf) => pf !== 'codementor' && !!profiles[pf]),
  };
}

/** The formula as text, one line per platform, for the "Formula" dialog. Generated from CAP so it cannot go stale. */
function describeFormula() {
  return {
    overall: `The average of the ${SCORED.length} platform scores below, 0 to 100. A platform that is not linked counts as 0.`,
    platforms: [
      { platform: 'codementor', label: LABEL.codementor, text: `Problems solved on CodeMentor ÷ ${CAP.codementorSolved} × 100, at most 100.` },
      { platform: 'leetcode', label: LABEL.leetcode, text: `Problems solved ÷ ${CAP.leetcodeSolved} × 100, at most 100.` },
      { platform: 'codeforces', label: LABEL.codeforces, text: `Rating from ${CAP.cfRatingFloor} (0 points) up to ${CAP.cfRatingTop} (${CAP.cfRatingShare} points), plus problems solved ÷ ${CAP.cfSolved} × ${CAP.cfSolvedShare}. At most 100.` },
      { platform: 'github', label: LABEL.github, text: `Public repositories ÷ ${CAP.githubRepos} × ${CAP.githubReposShare}, plus stars ÷ ${CAP.githubStars} × ${CAP.githubStarsShare}. At most 100.` },
    ],
    notScored: 'HackerRank, CodeChef and GeeksforGeeks have no public API we can read reliably, so they are kept as profile links and are not scored.',
    why: 'Each platform is capped at 100 so one very high outside rating cannot dominate the total.',
  };
}

module.exports = { SCORED, LABEL, CAP, DEFAULT_THRESHOLDS, platformPoints, flagFor, validateThresholds, buildScore, describeFormula };
