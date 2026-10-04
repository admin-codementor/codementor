const courseRepo = require('../repositories/courseRepository');
const problemRepo = require('../repositories/problemRepository');
const submissionRepo = require('../repositories/submissionRepository');

const toISO = (value) => {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * Where a module stands for one student. Computed here rather than in the
 * browser so the course list, the course page and the dashboard cannot disagree
 * about the same number.
 */
function moduleProgress(problemIds, solvedSet, dueAt, now = Date.now()) {
  const total = problemIds.length;
  const solved = problemIds.filter((pid) => solvedSet.has(pid)).length;
  const percent = total > 0 ? Math.round((solved / total) * 100) : 0;
  const due = toISO(dueAt);
  const overdue = !!due && new Date(due).getTime() < now && solved < total;

  let status;
  if (total === 0) status = 'empty';
  else if (solved >= total) status = 'done';
  else if (overdue) status = 'overdue';
  else if (solved > 0) status = 'in_progress';
  else status = 'not_started';

  return { total, solved, percent, dueAt: due, status };
}

// @desc    List published courses with module/problem counts + caller's solved count
// @route   GET /api/courses
exports.getCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const [courses, mySubs] = await Promise.all([courseRepo.listPublished(), submissionRepo.listByUser(userId)]);
    const mySolvedIds = new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId));

    const now = Date.now();
    // Catalogue-wide totals, deduplicated across courses. The page used to add
    // the per-course counts up, which counts a problem twice when two courses
    // share it — here the four company problems also sit in the CDP course, so
    // the header read "81 problems, 24 solved" beside a dashboard saying 22.
    const everyProblemId = new Set();
    const everySolvedId = new Set();

    const data = await Promise.all(courses.map(async (c) => {
      const modules = await courseRepo.getModules(c.id);
      const problemIds = [...new Set(modules.flatMap(m => m.problemIds || []))];
      const solvedCount = problemIds.filter(pid => mySolvedIds.has(pid)).length;
      for (const pid of problemIds) {
        everyProblemId.add(pid);
        if (mySolvedIds.has(pid)) everySolvedId.add(pid);
      }

      // Enough per-module detail for the list to show where the student is,
      // without shipping every problem of every course.
      const moduleSummaries = modules.map((m) => ({
        id: m.id,
        title: m.title,
        ...moduleProgress(m.problemIds || [], mySolvedIds, m.dueAt, now),
      }));

      // What to do next, and what is most pressing.
      const nextModule = moduleSummaries.find((m) => m.status !== 'done' && m.total > 0) || null;
      const dueModules = moduleSummaries
        .filter((m) => m.dueAt && m.status !== 'done')
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        moduleCount: modules.length,
        problemCount: problemIds.length,
        solvedCount,
        modules: moduleSummaries,
        nextModule: nextModule ? { id: nextModule.id, title: nextModule.title } : null,
        nextDue: dueModules[0] ? { id: dueModules[0].id, title: dueModules[0].title, dueAt: dueModules[0].dueAt } : null,
        overdueCount: moduleSummaries.filter((m) => m.status === 'overdue').length,
      };
    }));

    // `totals` sits beside `data` rather than inside it: every existing caller
    // reads the array and is unaffected.
    res.json({
      success: true,
      data,
      totals: { problems: everyProblemId.size, solved: everySolvedId.size, courses: courses.length },
    });
  } catch (error) {
    console.error('getCourses error:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get one course with ordered modules → problems (+ per-problem solved flag)
// @route   GET /api/courses/:id
exports.getCourseById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const course = await courseRepo.getById(id);
    if (!course || !course.isPublished) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const modules = await courseRepo.getModules(id);
    const allProblemIds = [...new Set(modules.flatMap(m => m.problemIds || []))];
    const problemsMap = await problemRepo.getMapByIds(allProblemIds);

    const idSet = new Set(allProblemIds);
    const mySubs = await submissionRepo.listByUser(userId);
    const solvedSet = new Set(mySubs.filter(s => s.verdict === 'Accepted' && idSet.has(s.problemId)).map(s => s.problemId));

    const now = Date.now();
    const moduleRows = modules.map((m) => {
      const problems = (m.problemIds || [])
        .map(pid => problemsMap.get(pid))
        .filter(Boolean)
        .map(p => ({
          id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [],
          is_solved: solvedSet.has(p.id),
        }));

      return {
        id: m.id,
        title: m.title,
        description: m.description || null,
        problems,
        ...moduleProgress(problems.map((p) => p.id), solvedSet, m.dueAt, now),
        // The first unsolved problem here — what "continue" should open.
        nextProblemId: problems.find((p) => !p.is_solved)?.id ?? null,
      };
    });

    // Deduplicated across modules: a problem shared by two modules must not be
    // counted twice in the course total.
    const solvedTotal = allProblemIds.filter((pid) => solvedSet.has(pid)).length;
    const nextModule = moduleRows.find((m) => m.status !== 'done' && m.total > 0) || null;

    res.json({
      success: true,
      data: {
        id: course.id,
        title: course.title,
        description: course.description,
        problemCount: allProblemIds.length,
        solvedCount: solvedTotal,
        percent: allProblemIds.length > 0 ? Math.round((solvedTotal / allProblemIds.length) * 100) : 0,
        nextUp: nextModule
          ? { moduleId: nextModule.id, moduleTitle: nextModule.title, problemId: nextModule.nextProblemId }
          : null,
        modules: moduleRows,
      },
    });
  } catch (error) {
    console.error('getCourseById error:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
