// Mentor mapping: who mentors whom, and how each mentor's mentees are doing.
// The link is `mentorId` on the student document. Scope comes from the token,
// never the request: an HOD can only see and change their own department.
const { cached, getVersion, bumpVersion } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { buildMentorBoard, checkAssignment, PERIODS, MAX_ASSIGN } = require('../utils/mentors');
const { activeStudents } = require('../utils/students');

const TTL_SECONDS = 120;
const VERSION = 1;
/** Bumped on every assignment so cached dashboards pick up the change immediately. */
const VERSION_NAME = 'mentors';

async function scoped(req) {
  const dept = scopeDept(req);
  const [staffMap, studentsMap] = await Promise.all([userRepo.getMapByRole('faculty'), userRepo.getMapByRole('student')]);
  const inDept = (u) => dept === null || (u.department || null) === dept;
  // The `faculty` collection also holds admins, who are not mentors.
  const mentors = [...staffMap.values()].filter((u) => u.role !== 'admin' && inDept(u));
  const students = activeStudents([...studentsMap.values()]).filter(inDept);
  return { dept, staffMap, studentsMap, mentors, students };
}

exports.getBoard = async (req, period) => {
  const per = PERIODS.includes(period) ? period : 'overall';
  const dept = scopeDept(req);
  const ver = await getVersion(VERSION_NAME);
  return cached(`mentors:board:v${VERSION}:m${ver}:${dept ?? 'all'}:${per}`, TTL_SECONDS, async () => {
    const { mentors, students } = await scoped(req);
    const ids = new Set(students.map((s) => s.id));
    const submissions = (await submissionRepo.listAllForAnalytics()).filter((s) => ids.has(s.userId));
    const board = buildMentorBoard({
      mentors: mentors.map((m) => ({ id: m.id, name: m.name })),
      students: students.map((s) => ({ id: s.id, mentorId: s.mentorId || null })),
      submissions, period: per, now: Date.now(),
    });
    return { ...board, scope: { department: dept } };
  });
};

/** @returns {Promise<{ok: true, updated: number} | {ok: false, status: number, error: string}>} */
exports.assign = async (req, { mentorId, studentIds }) => {
  const ids = Array.isArray(studentIds) ? [...new Set(studentIds.map(String))] : [];
  if (ids.length === 0) return { ok: false, status: 400, error: 'Choose at least one student.' };
  if (ids.length > MAX_ASSIGN) return { ok: false, status: 400, error: `You can assign at most ${MAX_ASSIGN} students at a time.` };

  const { staffMap, studentsMap } = await scoped(req);
  let mentor = null;
  if (mentorId) {
    mentor = staffMap.get(String(mentorId)) || null;
    if (!mentor) return { ok: false, status: 400, error: 'That mentor was not found.' };
  }
  const students = ids.map((id) => studentsMap.get(id));
  if (students.some((s) => !s)) return { ok: false, status: 400, error: 'One or more selected students were not found.' };

  const problem = checkAssignment({
    mentor, students, requesterRole: req.user.role, requesterDepartment: scopeDept(req),
  });
  if (problem) return { ok: false, status: 400, error: problem };

  await Promise.all(students.map((s) => userRepo.update(s.id, 'student', { mentorId: mentor ? mentor.id : null })));
  await bumpVersion(VERSION_NAME);
  return { ok: true, updated: students.length, mentorName: mentor?.name ?? null };
};

exports.mentorsVersion = () => getVersion(VERSION_NAME);
exports.VERSION_NAME = VERSION_NAME;
