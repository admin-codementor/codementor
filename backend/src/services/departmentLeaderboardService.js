// Cross-department leaderboard for HOD/admin. Gathers inputs and hands them to
// the pure builder. The cached result is viewer-independent; "which row is you"
// is added per request so one cache entry serves every HOD.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { buildDepartmentLeaderboard, normalizeDepartment } = require('../utils/departmentLeaderboard');

const TTL_SECONDS = 120;
// Bump when the response shape or aggregation changes (the cache outlives deploys).
const VERSION = 1;

async function compute() {
  const [studentsMap, submissions] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
  ]);
  const students = [...studentsMap.values()].map((s) => ({ id: s.id, department: s.department }));
  return buildDepartmentLeaderboard({ students, submissions, now: Date.now() });
}

exports.getDepartmentLeaderboard = async (req) => {
  const { ranked, unranked } = await cached(`analytics:deptboard:v${VERSION}`, TTL_SECONDS, compute);
  const mine = req.user?.role === 'admin' ? null : normalizeDepartment(req.user?.department);
  const mark = (r) => ({ ...r, you: mine !== null && r.department === mine });
  return { ranked: ranked.map(mark), unranked: unranked.map(mark), your_department: mine };
};
