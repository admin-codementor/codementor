const courseRepo = require('../repositories/courseRepository');
const problemRepo = require('../repositories/problemRepository');
const submissionRepo = require('../repositories/submissionRepository');

// @desc    List published courses with module/problem counts + caller's solved count
// @route   GET /api/courses
exports.getCourses = async (req, res) => {
  try {
    const userId = req.user.id;
    const [courses, mySubs] = await Promise.all([courseRepo.listPublished(), submissionRepo.listByUser(userId)]);
    const mySolvedIds = new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId));

    const data = await Promise.all(courses.map(async (c) => {
      const modules = await courseRepo.getModules(c.id);
      const problemIds = [...new Set(modules.flatMap(m => m.problemIds || []))];
      const solvedCount = problemIds.filter(pid => mySolvedIds.has(pid)).length;

      return {
        id: c.id,
        title: c.title,
        description: c.description,
        moduleCount: modules.length,
        problemCount: problemIds.length,
        solvedCount,
      };
    }));

    res.json({ success: true, data });
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

    res.json({
      success: true,
      data: {
        id: course.id,
        title: course.title,
        description: course.description,
        modules: modules.map(m => ({
          id: m.id,
          title: m.title,
          problems: (m.problemIds || [])
            .map(pid => problemsMap.get(pid))
            .filter(Boolean)
            .map(p => ({
              id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [],
              is_solved: solvedSet.has(p.id),
            })),
        })),
      },
    });
  } catch (error) {
    console.error('getCourseById error:', error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
