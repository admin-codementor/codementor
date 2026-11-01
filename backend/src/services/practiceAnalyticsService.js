// Department practice analytics for a HOD or Admin. Gathers the students in view (department from the token, never the query),
// hands them with the submissions and the problem catalog to the pure builder, and keeps the result for a short while.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const problemRepo = require('../repositories/problemRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { activeStudents } = require('../utils/students');
const { batchOf } = require('../utils/batch');
const { buildPracticeAnalytics, PERIODS } = require('../utils/practiceAnalytics');

const TTL_SECONDS = 90;
// Bump when the response shape changes (the cache outlives deploys).
const VERSION = 1;

/** @returns {number} one of PERIODS; anything else is 7 days */
const periodOf = (v) => { const n = Number(v); return PERIODS.includes(n) ? n : 7; };

async function compute({ dept, section, year, batch, days }) {
  const now = Date.now();
  const [studentsMap, submissions, catalog] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
    problemRepo.listCatalog(),
  ]);
  const students = activeStudents([...studentsMap.values()])
    .filter((s) => dept === null || (s.department || null) === dept)
    .filter((s) => !section || (s.section || null) === section)
    .filter((s) => !year || String(s.year ?? '') === String(year))
    .filter((s) => !batch || batchOf(s, now).label === batch);
  return buildPracticeAnalytics({ students, submissions, catalog, days, now });
}

/**
 * @param {object} req  Express request: the department comes from the token
 * @param {{days?: number|string, section?: string, year?: string, batch?: string}} filters  already checked by the caller
 */
exports.getPracticeAnalytics = async (req, { days, section, year, batch } = {}) => {
  const dept = scopeDept(req);
  const d = periodOf(days);
  const key = `analytics:practice:v${VERSION}:${dept ?? 'all'}:${d}:${section || 'all'}:${year || 'all'}:${batch || 'all'}`;
  return cached(key, TTL_SECONDS, () => compute({ dept, section, year, batch, days: d }));
};
exports.periodOf = periodOf;
