// Department (HOD) dashboard data. Gathers inputs, hands them to the pure
// aggregator, and caches the result per scope + filter.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { buildDepartmentAnalytics } = require('../utils/departmentAnalytics');

const TTL_SECONDS = 120;
// Bump when the response shape or aggregation changes (the cache outlives deploys).
const VERSION = 1;

async function compute({ dept, section, year }) {
  const [studentsMap, submissions] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
  ]);

  const students = [...studentsMap.values()]
    .filter((s) => dept === null || (s.department || null) === dept)
    .filter((s) => !section || (s.section || null) === section)
    // `year` arrives as a string from the query; compare loosely rather than
    // trusting both sides to be the same type.
    .filter((s) => !year || String(s.year ?? '') === String(year))
    .map((s) => ({
      id: s.id, name: s.name, rollNo: s.rollNo || null,
      department: s.department || null, section: s.section || null, year: s.year ?? null,
    }));

  const result = buildDepartmentAnalytics({ students, submissions, now: Date.now() });

  // Filter options always describe the WHOLE department, not the current
  // filter, so selecting a section never empties the menu you selected from.
  const inDept = [...studentsMap.values()].filter((s) => dept === null || (s.department || null) === dept);
  return {
    ...result,
    scope: {
      department: dept,
      section: section || null,
      year: year || null,
      sections: [...new Set(inDept.map((s) => s.section).filter(Boolean))].sort(),
      years: [...new Set(inDept.map((s) => s.year).filter((y) => y != null))].sort((a, b) => a - b),
    },
  };
}

/**
 * @param {object} req  Express request — department comes from the token, never the query,
 *                      so an HOD cannot read another department by editing the URL.
 */
exports.getDepartmentAnalytics = async (req, { section, year } = {}) => {
  const dept = scopeDept(req);
  const key = `analytics:dept:v${VERSION}:${dept ?? 'all'}:${section || 'all'}:${year || 'all'}`;
  return cached(key, TTL_SECONDS, () => compute({ dept, section, year }));
};
