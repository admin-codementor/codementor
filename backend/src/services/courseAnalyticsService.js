// Per-course faculty dashboard data: gathers the inputs and hands them to the pure
// aggregator in utils/courseAnalytics.js. Result is cached per (course, scope,
// window, class filter) because it needs full scans of submissions, proctor events
// and plagiarism pairs, the same trade-off analyticsService.getSnapshot makes.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const courseRepo = require('../repositories/courseRepository');
const classroomRepo = require('../repositories/classroomRepository');
const submissionRepo = require('../repositories/submissionRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');
const plagiarismRepo = require('../repositories/plagiarismResultRepository');
const analytics = require('./analyticsService');
const { buildCourseAnalytics } = require('../utils/courseAnalytics');

const TTL_SECONDS = 120;
// Bump when the response shape or aggregation changes (the cache outlives deploys).
const VERSION = 1;
const ALLOWED_DAYS = new Set([7, 30, 182]);

async function compute({ courseId, scope, days, classroomIds }) {
  const course = await courseRepo.getById(courseId);
  if (!course) return null;

  const [modules, studentsMap, allClassrooms] = await Promise.all([
    courseRepo.getModules(courseId),
    userRepo.getMapByRole('student'),
    scope.ownClasses ? classroomRepo.listByFacultyId(scope.facultyId) : classroomRepo.listAll(),
  ]);

  // Same population rule as the analytics snapshot: a faculty member sees their
  // own classes' students, HOD sees their department, admin sees everyone.
  const inScope = (s) => (scope.memberIds ? scope.memberIds.has(s.id) : scope.dept === null || (s.department || null) === scope.dept);
  const scoped = new Map([...studentsMap.values()].filter(inScope).map((s) => [s.id, s]));

  // Groups = classrooms, with members trimmed to the people this viewer may see.
  // A classroom with nobody in scope is dropped (e.g. another department's class for an HOD).
  const groups = (await Promise.all(allClassrooms.map(async (c) => {
    const members = (await classroomRepo.listMembers(c.id)).map((m) => m.userId).filter((id) => scoped.has(id));
    return { id: c.id, name: c.name || 'Untitled class', memberIds: new Set(members) };
  }))).filter((g) => g.memberIds.size > 0);

  const chosen = classroomIds.length ? groups.filter((g) => classroomIds.includes(g.id)) : groups;
  const studentIds = classroomIds.length ? new Set(chosen.flatMap((g) => [...g.memberIds])) : new Set(scoped.keys());
  const students = [...studentIds].map((id) => scoped.get(id)).filter(Boolean)
    .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo || null }));

  const [submissions, proctorEvents, plagiarismPairs] = await Promise.all([
    submissionRepo.listAllForAnalytics(),
    proctorEventRepo.listAllForAnalytics(),
    plagiarismRepo.listAllPairs(),
  ]);

  const result = buildCourseAnalytics({
    modules: modules.map((m) => ({ id: m.id, title: m.title, problemIds: m.problemIds || [] })),
    students,
    groups: chosen,
    submissions, proctorEvents, plagiarismPairs,
    days, now: Date.now(),
  });

  return {
    ...result,
    course: { id: course.id, title: course.title, moduleCount: modules.length },
    days,
    // Always the full list, so the filter can show every option while a subset is selected.
    availableGroups: groups.map((g) => ({ id: g.id, name: g.name, students: g.memberIds.size })),
    selectedGroupIds: chosen.map((g) => g.id),
  };
}

/**
 * @param {object} req          Express request (used for scope resolution)
 * @param {string} courseId
 * @param {number} days         7 | 30 | 182
 * @param {string[]} classroomIds  optional class filter
 * @returns {Promise<object|null>} null when the course doesn't exist
 */
exports.getCourseAnalytics = async (req, courseId, days, classroomIds = []) => {
  const windowDays = ALLOWED_DAYS.has(days) ? days : 7;
  const scope = await analytics.resolveAnalyticsScope(req);
  scope.facultyId = req.user.id;
  const ids = [...new Set(classroomIds)].sort();
  const key = `analytics:course:v${VERSION}:${courseId}:${analytics.scopeKey(scope)}:${windowDays}:${ids.join(',') || 'all'}`;
  return cached(key, TTL_SECONDS, () => compute({ courseId, scope, days: windowDays, classroomIds: ids }));
};
