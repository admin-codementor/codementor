const problemRepo = require('../repositories/problemRepository');
const courseRepo = require('../repositories/courseRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const { getProblemStats } = require('../services/problemStatsService');

const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

// A problem is student-visible unless it is explicitly a draft.
//
// The absence of `status` means "published" on purpose: every problem authored
// before the draft lifecycle existed has no status field, and those must stay
// visible. Only the authoring flow sets status:'draft', so the default is safe.
// This route is public and unauthenticated, so it is the boundary that keeps
// half-written problems away from students.
const isPublished = (p) => (p?.status ?? 'published') !== 'draft';

// @desc    Get all problems (with optional filters)
// @route   GET /api/problems
exports.getProblems = async (req, res) => {
  try {
    let { difficulty, tag, search, limit } = req.query;
    if (difficulty && !ALLOWED_DIFFICULTIES.has(String(difficulty).toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Invalid difficulty value.' });
    }
    tag = tag ? String(tag).slice(0, 50) : null;
    search = search ? String(search).slice(0, 100).toLowerCase() : null;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 200);

    let problems = (await problemRepo.getAll()).filter(isPublished);
    if (difficulty) problems = problems.filter(p => (p.difficulty || '').toLowerCase() === String(difficulty).toLowerCase());
    if (tag) problems = problems.filter(p => (p.tags || []).includes(tag));
    if (search) problems = problems.filter(p => (p.title || '').toLowerCase().includes(search));

    problems = problems
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, parsedLimit);

    // Popularity/difficulty signal. Best-effort: the list must still render if the
    // aggregate is unavailable, so a failure just omits the two fields.
    let stats = {};
    try { stats = (await getProblemStats()) || {}; } catch (e) { console.error('Problem stats unavailable:', e.message); }

    problems = problems.map(p => {
      const st = stats[p.id];
      return {
        id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [],
        time_limit: p.timeLimit, memory_limit: p.memoryLimit, created_at: p.createdAt,
        // null (not 0) when nobody has attempted it, so the UI can show "—".
        acceptance: st?.attempts ? Math.round((st.accepted / st.attempts) * 100) : null,
        solved_count: st?.solvers ?? 0,
      };
    });

    res.json({ success: true, count: problems.length, data: problems });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get prev/next problem IDs for navigation
// @route   GET /api/problems/:id/adjacent?course=&module=&assignment=
//
// Navigation follows the list the student is actually working through. Without
// a context it walked every published problem in creation order, so "next" from
// problem 3 of a Java module could land on an unrelated graph problem — which is
// what made the arrows feel random.
exports.getAdjacentProblems = async (req, res) => {
  try {
    const { id } = req.params;
    const { course, module: moduleId, assignment } = req.query;

    let orderedIds = null;
    let contextLabel = null;

    if (course && moduleId) {
      const modules = await courseRepo.getModules(course);
      const mod = modules.find((m) => m.id === moduleId);
      if (mod) {
        orderedIds = mod.problemIds || [];
        contextLabel = mod.title || null;
      }
    } else if (assignment) {
      const a = await assignmentRepo.getById(assignment);
      if (a) {
        orderedIds = a.problemIds || [];
        contextLabel = a.title || null;
      }
    }

    // Drafts are excluded so prev/next never lands on an unpublished problem and
    // the "position of total" counter matches what the student can actually see.
    const published = (await problemRepo.getAll()).filter(isPublished);

    let sequence;
    if (orderedIds && orderedIds.includes(id)) {
      const byId = new Map(published.map((p) => [p.id, p]));
      sequence = orderedIds.filter((pid) => byId.has(pid)).map((pid) => byId.get(pid));
    } else {
      // No usable context — fall back to the whole catalogue, as before.
      sequence = published.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      contextLabel = null;
    }

    const idx = sequence.findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Problem not found' });
    }

    res.json({
      success: true,
      data: {
        prev: idx > 0 ? sequence[idx - 1].id : null,
        next: idx < sequence.length - 1 ? sequence[idx + 1].id : null,
        position: idx + 1,
        total: sequence.length,
        context: contextLabel,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get a single problem with public test cases
// @route   GET /api/problems/:id
exports.getProblemById = async (req, res) => {
  try {
    const { id } = req.params;

    const p = await problemRepo.getById(id);
    // A draft is indistinguishable from "does not exist" to a student — including
    // to anyone guessing an id from a colleague's screen share.
    if (!p || !isPublished(p)) {
      return res.status(404).json({ success: false, error: 'Problem not found' });
    }

    const publicTestCases = await problemRepo.getPublicTestCases(id);

    // Hide editorial if not yet published
    const now = new Date();
    const editorialVisibleAt = p.editorialVisibleAt?.toDate?.() ?? (p.editorialVisibleAt ? new Date(p.editorialVisibleAt) : null);
    const editorialUnlocked = !!(editorialVisibleAt && editorialVisibleAt <= now && p.editorial);

    const problem = {
      id: p.id, title: p.title, description: p.description, difficulty: p.difficulty, tags: p.tags || [],
      time_limit: p.timeLimit, memory_limit: p.memoryLimit,
      stubs: p.stubs || {},
      editorial: editorialUnlocked ? p.editorial : null,
      editorial_visible_at: editorialVisibleAt ? editorialVisibleAt.toISOString() : null,
      editorial_unlocked: editorialUnlocked,
      test_cases: publicTestCases.map(t => ({ input_data: t.inputData, expected_output: t.expectedOutput })),
      // The solve page consumes `examples` with {input, output} field names.
      examples: publicTestCases.map(t => ({ input: t.inputData, output: t.expectedOutput })),
    };

    res.json({ success: true, data: problem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
