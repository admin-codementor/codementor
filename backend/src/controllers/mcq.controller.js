const { logAction } = require('../middleware/audit');
const userRepo = require('../repositories/userRepository');
const mcqRepo = require('../repositories/mcqRepository');

const CATEGORIES = ['aptitude', 'technical', 'verbal', 'logical', 'general'];

// ── Faculty: create a test ──────────────────────────────────────────────────────
exports.createTest = async (req, res) => {
  try {
    const { title, description, category, duration_minutes } = req.body;
    if (!title || typeof title !== 'string' || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
    }
    const cat = CATEGORIES.includes(category) ? category : 'aptitude';
    const dur = Math.min(Math.max(parseInt(duration_minutes, 10) || 30, 1), 300);

    const t = await mcqRepo.create({
      facultyId: req.user.id, title: title.trim(),
      description: (description || '').slice(0, 2000) || null,
      category: cat, durationMinutes: dur, isPublished: false,
    });
    logAction(req, 'mcq.create', `test "${title.trim()}"`);
    res.status(201).json({ success: true, data: { id: t.id } });
  } catch (e) {
    console.error('MCQ createTest error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Ownership guard (admins bypass). Returns the test or null.
async function ownedTest(req, testId) {
  const test = await mcqRepo.getById(testId);
  if (!test || (test.facultyId !== req.user.id && req.user.role !== 'admin')) return null;
  return test;
}

// ── Faculty: replace a test's questions in bulk ─────────────────────────────────
exports.setQuestions = async (req, res) => {
  try {
    const { id } = req.params;
    const { questions } = req.body;
    if (!(await ownedTest(req, id))) return res.status(404).json({ success: false, error: 'Test not found' });
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one question is required.' });
    }
    if (questions.length > 200) {
      return res.status(400).json({ success: false, error: 'A test can have at most 200 questions.' });
    }

    // Validate every question before writing anything.
    for (const [i, q] of questions.entries()) {
      const opts = q.options;
      if (!q.question_text || typeof q.question_text !== 'string') {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: text is required.` });
      }
      if (!Array.isArray(opts) || opts.length < 2 || opts.length > 6 || !opts.every(o => typeof o === 'string' && o.trim())) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: provide 2–6 non-empty options.` });
      }
      if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index >= opts.length) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: correct_index is out of range.` });
      }
    }

    const normalized = questions.map(q => ({
      question_text: q.question_text.trim(),
      options: q.options.map(o => String(o)),
      correct_index: q.correct_index,
      marks: Math.max(parseInt(q.marks, 10) || 1, 1),
      topic: (q.topic || '').slice(0, 60) || null,
      explanation: (q.explanation || '').slice(0, 1000) || null,
    }));
    await mcqRepo.replaceQuestions(id, normalized);
    res.json({ success: true, data: { count: questions.length } });
  } catch (e) {
    console.error('MCQ setQuestions error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: list own tests ─────────────────────────────────────────────────────
exports.listTests = async (req, res) => {
  try {
    const tests = req.user.role === 'admin' ? await mcqRepo.listAll() : await mcqRepo.listByFaculty(req.user.id);
    const data = await Promise.all(tests.map(async (t) => ({
      id: t.id, title: t.title, category: t.category, duration_minutes: t.durationMinutes,
      is_published: t.isPublished, created_at: t.createdAt,
      question_count: await mcqRepo.getQuestionCount(t.id),
      attempt_count: await mcqRepo.getAttemptCount(t.id),
    })));
    data.sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));
    res.json({ success: true, data });
  } catch (e) {
    console.error('MCQ listTests error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: full test with questions (incl. answers) ───────────────────────────
exports.getTestFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const test = await ownedTest(req, id);
    if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
    const questions = await mcqRepo.getQuestions(id);
    res.json({ success: true, data: { test, questions } });
  } catch (e) {
    console.error('MCQ getTestFaculty error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: publish / unpublish ────────────────────────────────────────────────
exports.publishTest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await ownedTest(req, id))) return res.status(404).json({ success: false, error: 'Test not found' });
    const publish = req.body.is_published === true;
    if (publish) {
      const count = await mcqRepo.getQuestionCount(id);
      if (count === 0) return res.status(400).json({ success: false, error: 'Add questions before publishing.' });
    }
    await mcqRepo.update(id, { isPublished: publish });
    res.json({ success: true, data: { is_published: publish } });
  } catch (e) {
    console.error('MCQ publishTest error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: delete ─────────────────────────────────────────────────────────────
exports.deleteTest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await ownedTest(req, id))) return res.status(404).json({ success: false, error: 'Test not found' });
    await mcqRepo.remove(id);
    logAction(req, 'mcq.delete', `test ${id}`);
    res.json({ success: true });
  } catch (e) {
    console.error('MCQ deleteTest error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: results + analytics ────────────────────────────────────────────────
exports.getResults = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await ownedTest(req, id))) return res.status(404).json({ success: false, error: 'Test not found' });

    const attempts = (await mcqRepo.listSubmittedAttempts(id))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));
    const attemptsUsersMap = await userRepo.getAllUsersMap();

    // Per-question accuracy (how many got each question right).
    const questions = await mcqRepo.getQuestions(id);
    const perQ = {};
    for (const q of questions) perQ[q.id] = { correct: 0, answered: 0 };
    for (const a of attempts) {
      const resp = a.responses || {};
      for (const q of questions) {
        if (resp[q.id] != null) {
          perQ[q.id].answered += 1;
          if (resp[q.id] === q.correctIndex) perQ[q.id].correct += 1;
        }
      }
    }
    const questionStats = questions.map(q => ({
      id: q.id, question_text: q.questionText, topic: q.topic,
      answered: perQ[q.id].answered, correct: perQ[q.id].correct,
      accuracy: perQ[q.id].answered ? Math.round((perQ[q.id].correct / perQ[q.id].answered) * 100) : 0,
    }));

    const scores = attempts.map(a => a.score || 0);
    const avg = scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : 0;

    res.json({
      success: true,
      data: {
        attempts: attempts.map(a => {
          const profile = attemptsUsersMap.get(a.userId) || {};
          return {
            userId: a.userId, name: profile.name || 'Unknown', email: profile.email || null,
            rollNo: profile.rollNo || null, department: profile.department || null, section: profile.section || null,
            score: a.score, total: a.total, submittedAt: a.submittedAt,
          };
        }),
        summary: { attempts: attempts.length, avgScore: avg, maxScore: scores.length ? Math.max(...scores) : 0 },
        questionStats,
      },
    });
  } catch (e) {
    console.error('MCQ getResults error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Student: list published tests (with own attempt status) ─────────────────────
exports.listAvailable = async (req, res) => {
  try {
    const tests = await mcqRepo.listPublished();
    const data = await Promise.all(tests.map(async (t) => {
      const [attempt, questionCount] = await Promise.all([
        mcqRepo.getAttempt(t.id, req.user.id), mcqRepo.getQuestionCount(t.id),
      ]);
      return {
        id: t.id, title: t.title, description: t.description, category: t.category,
        durationMinutes: t.durationMinutes, questionCount,
        attempted: !!attempt?.submittedAt, score: attempt?.score ?? null, total: attempt?.total ?? null,
      };
    }));
    data.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    res.json({ success: true, data });
  } catch (e) {
    console.error('MCQ listAvailable error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Student: start a test (questions WITHOUT answers) ───────────────────────────
exports.startTest = async (req, res) => {
  try {
    const { id } = req.params;
    const test = await mcqRepo.getById(id);
    if (!test || !test.isPublished) return res.status(404).json({ success: false, error: 'Test not available' });

    const existing = await mcqRepo.getAttempt(id, req.user.id);
    if (existing?.submittedAt) {
      return res.status(409).json({ success: false, error: 'You have already submitted this test.' });
    }

    // Record start time (idempotent).
    await mcqRepo.startAttempt(id, req.user.id);

    const questions = (await mcqRepo.getQuestions(id)).map(q => ({
      id: q.id, question_text: q.questionText, options: q.options, marks: q.marks, topic: q.topic, position: q.position,
    }));
    res.json({
      success: true,
      data: {
        test: { id: test.id, title: test.title, category: test.category, durationMinutes: test.durationMinutes },
        questions, // no correct_index / explanation
      },
    });
  } catch (e) {
    console.error('MCQ startTest error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Student: submit answers → auto-grade ────────────────────────────────────────
exports.submitTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { responses } = req.body; // { questionId: selectedIndex }
    if (!responses || typeof responses !== 'object') {
      return res.status(400).json({ success: false, error: 'responses object is required.' });
    }

    const test = await mcqRepo.getById(id);
    if (!test || !test.isPublished) return res.status(404).json({ success: false, error: 'Test not available' });

    const existing = await mcqRepo.getAttempt(id, req.user.id);
    if (existing?.submittedAt) {
      return res.status(409).json({ success: false, error: 'Already submitted.' });
    }

    const questions = await mcqRepo.getQuestions(id);
    let score = 0, total = 0;
    const review = [];
    const cleanResp = {};
    for (const q of questions) {
      total += q.marks;
      const sel = responses[q.id];
      const selected = Number.isInteger(sel) ? sel : null;
      cleanResp[q.id] = selected;
      const correct = selected === q.correctIndex;
      if (correct) score += q.marks;
      review.push({ questionId: q.id, selected, correctIndex: q.correctIndex, correct, explanation: q.explanation });
    }

    await mcqRepo.submitAttempt(id, req.user.id, { score, total, responses: cleanResp });

    res.json({ success: true, data: { score, total, review } });
  } catch (e) {
    console.error('MCQ submitTest error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
