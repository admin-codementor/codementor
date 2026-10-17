// Labs for HOD/admin. Department comes from the token, never the query.
// A class belongs to a department through its owner (the staff member's department),
// falling back to the department typed on the class when the owner has none.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const classroomRepo = require('../repositories/classroomRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { buildLabs } = require('../utils/labs');
const { activeStudents } = require('../utils/students');

const TTL_SECONDS = 60;
const VERSION = 1;

async function compute(dept) {
  const [studentsMap, facultyMap, classrooms, assignments, submissions] = await Promise.all([
    userRepo.getMapByRole('student'), userRepo.getMapByRole('faculty'),
    classroomRepo.listAll(), assignmentRepo.getAll(), submissionRepo.listAllForAnalytics(),
  ]);
  // `faculty` holds teaching staff, HODs and admins; an admin never owns a department's class.
  const staff = [...facultyMap.values()].filter((u) => u.role !== 'admin' && (dept === null || (u.department || null) === dept));
  const ownerNames = new Map(staff.map((u) => [u.id, u.name || u.email || 'Staff']));
  const ownerDept = new Map([...facultyMap.values()].map((u) => [u.id, u.department || null]));

  const mine = classrooms.filter((c) => dept === null || (ownerDept.get(c.facultyId) ?? c.department ?? null) === dept);
  const students = activeStudents([...studentsMap.values()]).filter((s) => dept === null || (s.department || null) === dept);
  // Owners of admin-scope classes (dept === null) are not in `staff` for admins, so name them too.
  if (dept === null) for (const u of facultyMap.values()) if (!ownerNames.has(u.id)) ownerNames.set(u.id, u.name || u.email || 'Staff');

  const members = await Promise.all(mine.map(async (c) => [c.id, (await classroomRepo.listMembers(c.id)).map((m) => m.userId)]));
  return buildLabs({
    classrooms: mine, membersByClass: new Map(members), assignments, students, submissions, ownerNames, now: Date.now(),
  });
}

exports.getLabs = async (req) => {
  const dept = scopeDept(req);
  const data = await cached(`analytics:labs:v${VERSION}:${dept ?? 'all'}`, TTL_SECONDS, () => compute(dept));
  return { ...data, scope: { department: dept } };
};
