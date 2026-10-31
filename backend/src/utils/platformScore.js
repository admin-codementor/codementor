// One coding score per student, from CodeMentor and the seven platforms on the Coding Profiles page. Pure: plain values in,
// plain values out, and the formula shown to HODs is generated from the same constants that compute the score, so the two
// can never disagree.
//
// Design rules (why this is not a plain sum of each platform's own numbers):
//   - Every platform becomes 0 to 100 POINTS, with a ceiling, so no single outside rating can dominate the total and one
//     problem on one site is not secretly worth five on another.
//   - The overall score is the average of the student's BEST FOUR platform scores, 0 to 100 (a platform not used counts as 0). So
//     nobody is marked down for not using a site, linking more never lowers a score, and the scale is the one used before the extra
//     platforms were added.
//   - LeetCode, Codeforces and GitHub are read by the server. CodeChef, HackerRank, InterviewBit and GeeksforGeeks cannot be, so the
//     student TYPES the number; it counts at half weight until a HOD or Admin has verified it.
//   - Flags: red / orange / green from one pair of thresholds per college year, applied to every platform and the overall.

const SCORED = ['codementor', 'leetcode', 'codeforces', 'codechef', 'hackerrank', 'interviewbit', 'gfg', 'github'];
const TYPED = ['codechef', 'hackerrank', 'interviewbit', 'gfg'];
/** How many of a student's platform scores make up the overall score. */
const BEST_OF = 4;
/** A typed number counts at this share until it is verified. */
const UNVERIFIED_WEIGHT = 0.5;

const LABEL = { codementor: 'CodeMentor', leetcode: 'LeetCode', codeforces: 'Codeforces', codechef: 'CodeChef', hackerrank: 'HackerRank', interviewbit: 'InterviewBit', gfg: 'GeeksforGeeks', github: 'GitHub' };

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
  codechefSolved: 150,     // typed: CodeChef problems solved that earn 100
  hackerrankSolved: 100,   // typed: HackerRank problems solved
  gfgSolved: 250,          // typed: GeeksforGeeks problems solved
  interviewbitScore: 2000, // typed: InterviewBit score
};
const TYPED_CAP = { codechef: CAP.codechefSolved, hackerrank: CAP.hackerrankSolved, gfg: CAP.gfgSolved, interviewbit: CAP.interviewbitScore };

// Below `red` is red, `green` and above is green, between is orange. Percent points (0 to 100).
const DEFAULT_THRESHOLDS = { red: 20, green: 50 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (n) => Math.round(n * 10) / 10;

/** Points (0 to 100) one platform earns. `p` is that platform's stored profile, or undefined when not linked. */
function platformPoints(platform, p, codementorSolved = 0) {
  if (platform === 'codementor') return round1(clamp((num(codementorSolved) / CAP.codementorSolved) * 100, 0, 100));
  if (!p) return 0;
  if (TYPED.includes(platform)) {
    const full = clamp((num(p.typedValue) / TYPED_CAP[platform]) * 100, 0, 100);
    return round1(p.scoreVerified === true ? full : full * UNVERIFIED_WEIGHT);
  }
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
  const best = SCORED.map((pf) => points[pf]).sort((a, b) => b - a).slice(0, BEST_OF);
  const overall = round1(best.reduce((n, v) => n + v, 0) / BEST_OF);
  const flags = Object.fromEntries(SCORED.map((pf) => [pf, flagFor(points[pf], thresholds)]));
  return {
    points, overall, flag: flagFor(overall, thresholds), flags,
    linked: SCORED.filter((pf) => pf !== 'codementor' && !!profiles[pf]),
  };
}

/** The formula as text, one line per platform, for the "Formula" dialog. Generated from CAP so it cannot go stale. */
function describeFormula() {
  return {
    overall: `The average of the student's best ${BEST_OF} platform scores, 0 to 100. A platform that is not used counts as 0, so nobody is marked down for skipping a site, and using more never lowers the score.`,
    platforms: [
      { platform: 'codementor', label: LABEL.codementor, text: `Problems solved on CodeMentor ÷ ${CAP.codementorSolved} × 100, at most 100.` },
      { platform: 'leetcode', label: LABEL.leetcode, text: `Problems solved ÷ ${CAP.leetcodeSolved} × 100, at most 100.` },
      { platform: 'codeforces', label: LABEL.codeforces, text: `Rating from ${CAP.cfRatingFloor} (0 points) up to ${CAP.cfRatingTop} (${CAP.cfRatingShare} points), plus problems solved ÷ ${CAP.cfSolved} × ${CAP.cfSolvedShare}. At most 100.` },
      { platform: 'codechef', label: LABEL.codechef, text: `Typed: problems solved ÷ ${CAP.codechefSolved} × 100, at most 100.` },
      { platform: 'hackerrank', label: LABEL.hackerrank, text: `Typed: problems solved ÷ ${CAP.hackerrankSolved} × 100, at most 100.` },
      { platform: 'interviewbit', label: LABEL.interviewbit, text: `Typed: score ÷ ${CAP.interviewbitScore} × 100, at most 100.` },
      { platform: 'gfg', label: LABEL.gfg, text: `Typed: problems solved ÷ ${CAP.gfgSolved} × 100, at most 100.` },
      { platform: 'github', label: LABEL.github, text: `Public repositories ÷ ${CAP.githubRepos} × ${CAP.githubReposShare}, plus stars ÷ ${CAP.githubStars} × ${CAP.githubStarsShare}. At most 100.` },
    ],
    platformsTyped: { text: `CodeChef, HackerRank, InterviewBit and GeeksforGeeks cannot be read by the server, so the student types the number. It counts at ${UNVERIFIED_WEIGHT * 100}% until a HOD or Admin marks it verified.`, labels: TYPED.map((x) => LABEL[x]) },
    why: 'Each platform is capped at 100 so one very high outside rating cannot dominate the total.',
  };
}

module.exports = { SCORED, TYPED, BEST_OF, UNVERIFIED_WEIGHT, LABEL, CAP, DEFAULT_THRESHOLDS, platformPoints, flagFor, validateThresholds, buildScore, describeFormula };
