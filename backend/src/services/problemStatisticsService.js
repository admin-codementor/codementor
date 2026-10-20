// Per-question statistics for faculty: gathers one problem's submissions, time records and flag events, limits them to the
// students this viewer may see (own classes, department, or everyone) and optionally to chosen classes, then hands them
// to the pure aggregator in utils/problemStatistics.js. Cached briefly: it reads every submission to one problem.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const classroomRepo = require('../repositories/classroomRepository');
const submissionRepo = require('../repositories/submissionRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');
const problemTimeRepo = require('../repositories/problemTimeRepository');
const analytics = require('./analyticsService');
const { scopedStudents, loadGroups } = require('./courseAnalyticsService');
const { buildProblemStatistics } = require('../utils/problemStatistics');

const TTL_SECONDS = 60;
const VERSION = 1;

async function compute({ problemId, scope, classroomIds }) {
  const problem = await problemRepo.getById(problemId);
  if (!problem) return null;

  const [studentsMap, allClassrooms] = await Promise.all([
    userRepo.getMapByRole('student'),
    scope.ownClasses ? classroomRepo.listByFacultyId(scope.facultyId) : classroomRepo.listAll(),
  ]);
  const scoped = scopedStudents(scope, studentsMap);
  const groups = await loadGroups(scope, scoped, allClassrooms);
  const chosen = classroomIds.length ? groups.filter((g) => classroomIds.includes(g.id)) : groups;
  const ids = classroomIds.length ? new Set(chosen.flatMap((g) => [...g.memberIds])) : new Set(scoped.keys());
  const students = [...ids].map((id) => scoped.get(id)).filter(Boolean)
    .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo || null, section: s.section || null, year: s.year ?? null }));

  const [submissions, times, events] = await Promise.all([
    submissionRepo.listByProblemForStats(problemId),
    problemTimeRepo.listByProblem(problemId),
    proctorEventRepo.listByProblem(problemId),
  ]);

  return {
    problem: { id: problem.id, title: problem.title, difficulty: problem.difficulty },
    ...buildProblemStatistics({ students, submissions, times, events }),
    availableGroups: groups.map((g) => ({ id: g.id, name: g.name, students: g.memberIds.size })),
    selectedGroupIds: chosen.map((g) => g.id),
  };
}

/** @returns {Promise<object|null>} null when the problem does not exist */
exports.getProblemStatistics = async (req, problemId, classroomIds = []) => {
  const scope = await analytics.resolveAnalyticsScope(req);
  scope.facultyId = req.user.id;
  const ids = [...new Set(classroomIds)].sort();
  const key = `analytics:problem:v${VERSION}:${problemId}:${analytics.scopeKey(scope)}:${ids.join(',') || 'all'}`;
  return cached(key, TTL_SECONDS, () => compute({ problemId, scope, classroomIds: ids }));
};
