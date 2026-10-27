// Coding scores for the viewer's students: gathers linked profiles, CodeMentor solves and the college thresholds, and hands
// them to the pure scorer in utils/platformScore.js.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const codingProfileRepo = require('../repositories/codingProfileRepository');
const submissionRepo = require('../repositories/submissionRepository');
const settingsRepo = require('../repositories/platformSettingsRepository');
const analytics = require('./analyticsService');
const { scopedStudents } = require('./courseAnalyticsService');
const { classLabel } = require('../utils/students');
const { buildScore, describeFormula, DEFAULT_THRESHOLDS, SCORED, LABEL } = require('../utils/platformScore');
const { LIVE_PLATFORMS, fetchPlatform } = require('../utils/codingPlatforms');

const TTL = 120;
const VERSION = 1;

/** The pair that applies to one college year: that year's own, else the college default, else the built-in. */
function thresholdsFor(settings, year) {
  return settings.byYear?.[String(year)] || settings.default || DEFAULT_THRESHOLDS;
}

function solvedByUser(submissions) {
  const per = new Map();
  for (const s of submissions) {
    if (s.verdict !== 'Accepted' || !s.userId) continue;
    const set = per.get(s.userId) || new Set();
    set.add(s.problemId);
    per.set(s.userId, set);
  }
  return per;
}

async function compute({ scope, year, section }) {
  const [studentsMap, profiles, submissions, settings] = await Promise.all([
    userRepo.getMapByRole('student'), codingProfileRepo.listAll(), submissionRepo.listAllForAnalytics(), settingsRepo.get(),
  ]);
  const students = [...scopedStudents(scope, studentsMap).values()]
    .filter((s) => (!year || String(s.year) === String(year)) && (!section || s.section === section));
  const byUser = new Map();
  for (const p of profiles) {
    const m = byUser.get(p.userId) || {};
    m[p.platform] = p;
    byUser.set(p.userId, m);
  }
  const solved = solvedByUser(submissions);

  const rows = students.map((st) => {
    const mine = byUser.get(st.id) || {};
    const score = buildScore({ profiles: mine, codementorSolved: solved.get(st.id)?.size ?? 0, thresholds: thresholdsFor(settings, st.year) });
    const lastSynced = Object.values(mine).map((p) => p.lastSynced?.toMillis?.() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    return {
      id: st.id, name: st.name || 'Unknown', rollNo: st.rollNo || null, section: st.section || null, year: st.year ?? null,
      classLabel: classLabel(st.year, st.section),
      overall: score.overall, flag: score.flag, points: score.points, flags: score.flags, linked: score.linked,
      // Handles for the link-only platforms, so the HOD can still open them.
      links: Object.fromEntries(Object.values(mine).filter((p) => !LIVE_PLATFORMS.includes(p.platform)).map((p) => [p.platform, p.handle])),
      lastSyncedMs: lastSynced || null,
    };
  }).sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));

  const count = (f) => rows.filter((r) => r.flag === f).length;
  return {
    totals: { students: rows.length, red: count('red'), orange: count('orange'), green: count('green'), avg: rows.length ? Math.round((rows.reduce((n, r) => n + r.overall, 0) / rows.length) * 10) / 10 : 0, withAnyLink: rows.filter((r) => r.linked.length > 0).length },
    rows,
    formula: describeFormula(),
    thresholds: { default: settings.default || DEFAULT_THRESHOLDS, byYear: settings.byYear || {}, builtIn: DEFAULT_THRESHOLDS },
    platforms: SCORED.map((p) => ({ key: p, label: LABEL[p] })),
  };
}

exports.getScores = async (req, { year, section } = {}) => {
  const scope = await analytics.resolveAnalyticsScope(req);
  scope.facultyId = req.user.id;
  const key = `platform-scores:v${VERSION}:${analytics.scopeKey(scope)}:${year || 'all'}:${section || 'all'}`;
  return cached(key, TTL, () => compute({ scope, year, section }));
};

/** Every student's score, for the Training & Placement export. Cached like the staff table. */
exports.collegeScores = () => cached(`platform-scores:v${VERSION}:college`, TTL, () => compute({ scope: { ownClasses: false, dept: null, memberIds: null } }));

/** One student's own score (for their profile page). */
exports.getMine = async (userId) => {
  const [me, profiles, submissions, settings] = await Promise.all([
    userRepo.getById(userId, 'student'), codingProfileRepo.listByUser(userId), submissionRepo.listByUser(userId), settingsRepo.get(),
  ]);
  const solved = new Set(submissions.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId)).size;
  const thresholds = thresholdsFor(settings, me?.year);
  return { ...buildScore({ profiles: Object.fromEntries(profiles.map((p) => [p.platform, p])), codementorSolved: solved, thresholds }), thresholds, formula: describeFormula(), codementorSolved: solved };
};

/**
 * Re-reads linked profiles from the platforms, for the students in scope, oldest first. Bounded per call so one request
 * stays short; the caller says how many remain.
 */
exports.refreshBatch = async (req, limit = 20) => {
  const scope = await analytics.resolveAnalyticsScope(req);
  const students = new Set([...scopedStudents(scope, await userRepo.getMapByRole('student')).keys()]);
  // Only profiles not read in the last six hours, so repeated clicks work through everyone once and then stop.
  const cutoff = Date.now() - 6 * 3600000;
  const todo = (await codingProfileRepo.listAll())
    .filter((p) => students.has(p.userId) && LIVE_PLATFORMS.includes(p.platform) && p.handle && (p.lastSynced?.toMillis?.() ?? 0) < cutoff)
    .sort((a, b) => (a.lastSynced?.toMillis?.() ?? 0) - (b.lastSynced?.toMillis?.() ?? 0));
  const batch = todo.slice(0, limit);
  let ok = 0; let failed = 0;
  for (const p of batch) {
    try {
      const stats = await fetchPlatform(p.platform, p.handle);
      await codingProfileRepo.upsert(p.userId, p.platform, { solved: stats.solved || 0, rating: stats.rating ?? null, maxRating: stats.max_rating ?? null, extra: stats.extra || {}, syncStatus: 'ok', lastSynced: new Date() });
      ok += 1;
    } catch {
      await codingProfileRepo.upsert(p.userId, p.platform, { syncStatus: 'error', lastSynced: new Date() });
      failed += 1;
    }
  }
  return { refreshed: ok, failed, remaining: Math.max(0, todo.length - batch.length), total: todo.length };
};
