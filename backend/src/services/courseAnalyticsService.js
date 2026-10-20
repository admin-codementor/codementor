// Per-course faculty dashboard data: gathers the inputs and hands them to the pure
// aggregator in utils/courseAnalytics.js. Result is cached per (course, scope,
// window, class filter) because it needs full scans of submissions, proctor events
// and plagiarism pairs, the same trade-off analyticsService.getSnapshot makes.
const { cached, getVersion } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const courseRepo = require('../repositories/courseRepository');
const problemRepo = require('../repositories/problemRepository');
const classroomRepo = require('../repositories/classroomRepository');
const submissionRepo = require('../repositories/submissionRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');
const plagiarismRepo = require('../repositories/plagiarismResultRepository');
const problemTimeRepo = require('../repositories/problemTimeRepository');
const analytics = require('./analyticsService');
const { buildCourseAnalytics } = require('../utils/courseAnalytics');
const { resolveCourse, tally, studentProgress, summarise } = require('../utils/courseProgress');
const { activeStudents } = require('../utils/students');

const TTL_SECONDS = 120;
// Bump when the response shape or aggregation changes (the cache outlives deploys).
const VERSION = 4;
const ALLOWED_DAYS = new Set([7, 30, 182]);

/** Same population rule as the analytics snapshot: own classes' students, department, or everyone. */
function scopedStudents(scope, studentsMap) {
  const inScope = (s) => (scope.memberIds ? scope.memberIds.has(s.id) : scope.dept === null || (s.department || null) === scope.dept);
  // Alumni leave every active view: they would sit at 0% and drag the class average down.
  return new Map(activeStudents([...studentsMap.values()]).filter(inScope).map((s) => [s.id, s]));
}

/**
 * Groups = classrooms, with members trimmed to the people this viewer may see. A classroom with nobody in scope is
 * dropped (e.g. another department's class for an HOD). Shared with the per-question statistics.
 */
async function loadGroups(scope, scoped, allClassrooms) {
  return (await Promise.all(allClassrooms.map(async (c) => {
    const members = (await classroomRepo.listMembers(c.id)).map((m) => m.userId).filter((id) => scoped.has(id));
    return { id: c.id, name: c.name || 'Untitled class', memberIds: new Set(members) };
  }))).filter((g) => g.memberIds.size > 0);
}

async function compute({ courseId, scope, days, classroomIds }) {
  const course = await courseRepo.getById(courseId);
  if (!course) return null;

  const [rawModules, studentsMap, allClassrooms] = await Promise.all([
    courseRepo.getModules(courseId),
    userRepo.getMapByRole('student'),
    scope.ownClasses ? classroomRepo.listByFacultyId(scope.facultyId) : classroomRepo.listAll(),
  ]);

  // Only problems that still exist and are published count as required (see utils/courseProgress.js).
  const problemsById = await problemRepo.getMapByIds([...new Set(rawModules.flatMap((m) => m.problemIds || []))]);
  const resolved = resolveCourse(rawModules, problemsById);
  const modules = resolved.units;

  // A faculty member sees their own classes' students, HOD their department, admin everyone.
  const scoped = scopedStudents(scope, studentsMap);

  const groups = await loadGroups(scope, scoped, allClassrooms);

  const chosen = classroomIds.length ? groups.filter((g) => classroomIds.includes(g.id)) : groups;
  const studentIds = classroomIds.length ? new Set(chosen.flatMap((g) => [...g.memberIds])) : new Set(scoped.keys());
  const students = [...studentIds].map((id) => scoped.get(id)).filter(Boolean)
    .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo || null, section: s.section || null, year: s.year ?? null }));

  const [submissions, proctorEvents, plagiarismPairs, courseTimes] = await Promise.all([
    submissionRepo.listAllForAnalytics(),
    proctorEventRepo.listAllForAnalytics(),
    plagiarismRepo.listAllPairs(),
    problemTimeRepo.listByCourse(courseId),
  ]);

  const result = buildCourseAnalytics({
    modules: modules.map((m) => ({ id: m.id, title: m.title, problemIds: m.problemIds || [] })),
    students,
    groups: chosen,
    submissions, proctorEvents, plagiarismPairs, courseTimes,
    days, now: Date.now(),
  });

  return {
    ...result,
    course: { id: course.id, title: course.title, moduleCount: modules.length, skippedProblems: resolved.skipped },
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
  const cv = await getVersion('courses'); // bumped when a course, module or problem changes
  const key = `analytics:course:v${VERSION}:c${cv}:${courseId}:${analytics.scopeKey(scope)}:${windowDays}:${ids.join(',') || 'all'}`;
  return cached(key, TTL_SECONDS, () => compute({ courseId, scope, days: windowDays, classroomIds: ids }));
};

async function computeSummary(scope) {
  const [courses, studentsMap, submissions] = await Promise.all([
    courseRepo.listAll(),
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
  ]);
  const students = [...scopedStudents(scope, studentsMap).values()].map((s) => ({ id: s.id }));
  const modulesByCourse = await Promise.all(courses.map((c) => courseRepo.getModules(c.id)));
  const problemsById = await problemRepo.getMapByIds([...new Set(modulesByCourse.flatMap((ms) => ms.flatMap((m) => m.problemIds || [])))]);
  const out = {};
  courses.forEach((c, i) => {
    const { units, problems } = resolveCourse(modulesByCourse[i], problemsById);
    const { solved, attempted } = tally(problems, students, submissions);
    const rows = students.map((st) => studentProgress(problems.size, solved.get(st.id), attempted.get(st.id), units));
    out[c.id] = summarise(rows, problems.size);
  });
  return out;
}

/** One line per course for the course list: how many of the viewer's students finished, and how far along on average. */
exports.getCompletionSummary = async (req) => {
  const scope = await analytics.resolveAnalyticsScope(req);
  scope.facultyId = req.user.id;
  const cv = await getVersion('courses');
  return cached(`analytics:course-summary:v2:c${cv}:${analytics.scopeKey(scope)}`, TTL_SECONDS, () => computeSummary(scope));
};

exports.scopedStudents = scopedStudents;
exports.loadGroups = loadGroups;
