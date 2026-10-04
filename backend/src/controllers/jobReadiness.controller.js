const problemRepo = require('../repositories/problemRepository');
const submissionRepo = require('../repositories/submissionRepository');
const courseRepo = require('../repositories/courseRepository');
const mcqRepo = require('../repositories/mcqRepository');
const roadmapRepo = require('../repositories/roadmapRepository');
const codingProfileRepo = require('../repositories/codingProfileRepository');
const userRepo = require('../repositories/userRepository');
const { buildCatalog, resolveRoadmap } = require('../services/roadmapService');
const { computeJobReadiness } = require('../services/jobReadinessService');
const { COMPONENTS } = require('../config/jobReadiness');

const isPublished = (p) => (p?.status ?? 'published') !== 'draft';

/**
 * Everything the score is computed from, fetched once.
 *
 * This is the widest read in the student API — the catalogue, every course, the
 * student's submissions and their attempt on each published MCQ test. The
 * problem read is field-masked and the MCQ reads are one document each, so the
 * cost is roughly "number of published tests" extra reads, which is small and
 * bounded. Worth watching if a college ever publishes hundreds of tests.
 */
async function gather(userId, role) {
  const [problems, courses, mySubs, mcqTests, me, codingProfiles] = await Promise.all([
    problemRepo.listCatalog(),
    courseRepo.listPublished(),
    submissionRepo.listByUser(userId),
    mcqRepo.listPublished(),
    userRepo.getById(userId, role),
    codingProfileRepo.listByUser(userId),
  ]);

  const published = problems.filter(isPublished);
  const byId = new Map(published.map((p) => [p.id, p]));

  const acceptedSubs = mySubs.filter((s) => s.verdict === 'Accepted');
  const solvedIds = new Set(acceptedSubs.map((s) => s.problemId));
  const solvedProblems = [...solvedIds].map((id) => byId.get(id)).filter(Boolean);

  const moduleLists = await Promise.all(courses.map((c) => courseRepo.getModules(c.id)));
  const modules = courses.flatMap((c, i) =>
    moduleLists[i].map((m) => ({
      id: m.id, title: m.title, problemIds: m.problemIds || [], courseId: c.id, courseTitle: c.title,
    })),
  );
  const courseProblemIds = [...new Set(modules.flatMap((m) => m.problemIds))];

  const attempts = await Promise.all(mcqTests.map((t) => mcqRepo.getAttempt(t.id, userId)));
  const mcqAttempts = attempts.filter((a) => a && a.submittedAt != null);

  let roadmapProgress = null;
  if (me?.activeRoadmapId) {
    const roadmap = await roadmapRepo.getById(me.activeRoadmapId);
    if (roadmap) {
      roadmapProgress = resolveRoadmap(roadmap, buildCatalog(published, modules), solvedIds);
    }
  }

  return {
    now: Date.now(),
    acceptedSubs,
    solvedIds,
    solvedProblems,
    courseProblemIds,
    mcqAttempts,
    codingProfiles,
    roadmapProgress,
  };
}

// @desc    Job-Ready Score per target, with the workings and what to do next
// @route   GET /api/student/job-ready
exports.getJobReadiness = async (req, res) => {
  try {
    const inputs = await gather(req.user.id, req.user.role);
    const data = computeJobReadiness(inputs);
    // The component glossary travels with the score so the browser never has to
    // keep its own copy of what the weights mean.
    res.json({ success: true, data: { ...data, glossary: COMPONENTS } });
  } catch (error) {
    console.error('getJobReadiness error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute your readiness score' });
  }
};

// Reused by the public profile, which shows the score only when the student
// has switched that on.
exports.jobReadinessFor = async (userId, role) => computeJobReadiness(await gather(userId, role));
