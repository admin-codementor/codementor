const roadmapRepo = require('../repositories/roadmapRepository');
const courseRepo = require('../repositories/courseRepository');
const problemRepo = require('../repositories/problemRepository');
const submissionRepo = require('../repositories/submissionRepository');
const userRepo = require('../repositories/userRepository');
const { buildCatalog, resolveRoadmap } = require('../services/roadmapService');

// Matches problems.controller: a problem with no `status` predates the draft
// lifecycle and must stay visible.
const isPublished = (p) => (p?.status ?? 'published') !== 'draft';

/**
 * The published catalog plus this student's accepted problem ids — everything
 * roadmap progress is computed from, fetched once.
 */
async function loadContext(userId) {
  const [problems, courses, mySubs] = await Promise.all([
    problemRepo.listCatalog(),
    courseRepo.listPublished(),
    submissionRepo.listByUser(userId),
  ]);

  const moduleLists = await Promise.all(courses.map((c) => courseRepo.getModules(c.id)));
  const modules = courses.flatMap((c, i) =>
    moduleLists[i].map((m) => ({
      id: m.id,
      title: m.title,
      problemIds: m.problemIds || [],
      courseId: c.id,
      courseTitle: c.title,
    })),
  );

  const solvedSet = new Set(mySubs.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId));
  return { catalog: buildCatalog(problems.filter(isPublished), modules), solvedSet };
}

// @desc    All roadmaps with the caller's progress, and which one is active
// @route   GET /api/roadmaps
exports.listRoadmaps = async (req, res) => {
  try {
    const userId = req.user.id;
    const [roadmaps, { catalog, solvedSet }, me] = await Promise.all([
      roadmapRepo.listAll(),
      loadContext(userId),
      userRepo.getById(userId, req.user.role),
    ]);

    const data = roadmaps.map((r) => resolveRoadmap(r, catalog, solvedSet, { includeMilestones: false }));
    res.json({ success: true, data, activeRoadmapId: me?.activeRoadmapId ?? null });
  } catch (error) {
    console.error('listRoadmaps error:', error);
    res.status(500).json({ success: false, error: 'Failed to load roadmaps' });
  }
};

// @desc    One roadmap with every milestone resolved against the catalog
// @route   GET /api/roadmaps/:id
exports.getRoadmap = async (req, res) => {
  try {
    const userId = req.user.id;
    const roadmap = await roadmapRepo.getById(req.params.id);
    if (!roadmap) return res.status(404).json({ success: false, error: 'Roadmap not found' });

    const [{ catalog, solvedSet }, me] = await Promise.all([
      loadContext(userId),
      userRepo.getById(userId, req.user.role),
    ]);

    res.json({
      success: true,
      data: resolveRoadmap(roadmap, catalog, solvedSet),
      isActive: (me?.activeRoadmapId ?? null) === roadmap.id,
    });
  } catch (error) {
    console.error('getRoadmap error:', error);
    res.status(500).json({ success: false, error: 'Failed to load roadmap' });
  }
};

// @desc    Choose (or clear) the roadmap shown on the dashboard
// @route   PUT /api/student/active-roadmap   body: { roadmapId: string | null }
exports.setActiveRoadmap = async (req, res) => {
  try {
    const { roadmapId } = req.body;

    if (roadmapId !== null && typeof roadmapId !== 'string') {
      return res.status(400).json({ success: false, error: 'roadmapId must be a string, or null to clear' });
    }
    // Storing an id that resolves to nothing would leave the dashboard pointing
    // at a roadmap the student cannot open.
    if (roadmapId && !(await roadmapRepo.getById(roadmapId))) {
      return res.status(404).json({ success: false, error: 'Roadmap not found' });
    }

    await userRepo.update(req.user.id, req.user.role, { activeRoadmapId: roadmapId || null });
    res.json({ success: true, data: { activeRoadmapId: roadmapId || null } });
  } catch (error) {
    console.error('setActiveRoadmap error:', error);
    res.status(500).json({ success: false, error: 'Failed to set active roadmap' });
  }
};
