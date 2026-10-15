// Department Activity data (HOD/admin). Department comes from the token, never
// the query, so an HOD cannot read another department by editing the URL.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { buildActivity, ALLOWED_DAYS } = require('../utils/departmentActivity');

const TTL_SECONDS = 120;
const VERSION = 1;

async function compute({ dept, kind, days }) {
  if (kind === 'faculty') {
    const staff = [...(await userRepo.getMapByRole('faculty')).values()]
      // The `faculty` collection also holds admins; a department view lists teaching staff and the HOD only.
      .filter((u) => u.role !== 'admin')
      .filter((u) => dept === null || (u.department || null) === dept);
    return buildActivity({ people: staff, days, now: Date.now() });
  }
  const [studentsMap, submissions] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
  ]);
  const students = [...studentsMap.values()].filter((s) => dept === null || (s.department || null) === dept);
  const ids = new Set(students.map((s) => s.id));
  return buildActivity({ people: students, submissions: submissions.filter((s) => ids.has(s.userId)), days, now: Date.now() });
}

exports.getDepartmentActivity = async (req, { kind, days }) => {
  const dept = scopeDept(req);
  const k = kind === 'faculty' ? 'faculty' : 'students';
  const d = ALLOWED_DAYS.includes(days) ? days : 7;
  const key = `analytics:dept-activity:v${VERSION}:${dept ?? 'all'}:${k}:${d}`;
  const data = await cached(key, TTL_SECONDS, () => compute({ dept, kind: k, days: d }));
  return { ...data, kind: k, scope: { department: dept } };
};
