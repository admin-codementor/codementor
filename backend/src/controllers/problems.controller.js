const problemRepo = require('../repositories/problemRepository');

const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

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

    let problems = await problemRepo.getAll();
    if (difficulty) problems = problems.filter(p => (p.difficulty || '').toLowerCase() === String(difficulty).toLowerCase());
    if (tag) problems = problems.filter(p => (p.tags || []).includes(tag));
    if (search) problems = problems.filter(p => (p.title || '').toLowerCase().includes(search));

    problems = problems
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, parsedLimit)
      .map(p => ({
        id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [],
        time_limit: p.timeLimit, memory_limit: p.memoryLimit, created_at: p.createdAt,
      }));

    res.json({ success: true, count: problems.length, data: problems });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get prev/next problem IDs for navigation
// @route   GET /api/problems/:id/adjacent
exports.getAdjacentProblems = async (req, res) => {
  try {
    const { id } = req.params;

    const problems = (await problemRepo.getAll())
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

    const idx = problems.findIndex(r => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Problem not found' });
    }

    res.json({
      success: true,
      data: {
        prev: idx > 0 ? problems[idx - 1].id : null,
        next: idx < problems.length - 1 ? problems[idx + 1].id : null,
        position: idx + 1,
        total: problems.length
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
    if (!p) {
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
