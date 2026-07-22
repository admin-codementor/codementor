const { Parser } = require('json2csv');
const { getGeminiClient } = require('./ai.controller');
const { logAction } = require('../middleware/audit');
const { scopeDept, canSeeDepartment } = require('../middleware/role.middleware');
const { cached } = require('../utils/cache');
const { computeStrengthsWeaknesses } = require('../utils/topicScores');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const ratingHistoryRepo = require('../repositories/ratingHistoryRepository');
const topicMasteryRepo = require('../repositories/topicMasteryRepository');
const codingProfileRepo = require('../repositories/codingProfileRepository');
const contestRepo = require('../repositories/contestRepository');
const submissionRepo = require('../repositories/submissionRepository');
const plagiarismResultRepo = require('../repositories/plagiarismResultRepository');

// Firestore Timestamp | Date | ISO-string | null -> 'YYYY-MM-DD' (or null).
const toDateOnly = (value) => {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return d.toISOString().split('T')[0];
};

// Firestore Timestamp | Date | ISO-string | null -> full ISO string (or null).
const toISO = (value) => {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return d.toISOString();
};

// Whitelisted cohort dimensions → real column names (guards against SQL injection
// when the dimension is interpolated into GROUP BY / WHERE).
const COHORT_DIMS = { department: 'department', year: 'year', section: 'section' };

exports.getDashboardData = async (req, res) => {
  try {
    // 1. Total Students
    const totalStudents = (await userRepo.listByRole('student')).length;

    // 2-4. Active students (7d), total submissions/AC rate, unique problems solved.
    const allSubs = await submissionRepo.listAll();
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const activeStudents = new Set(
      allSubs.filter(s => (s.submittedAt?.toMillis?.() ?? 0) >= sevenDaysAgo).map(s => s.userId)
    ).size;

    const totalSubs = allSubs.length;
    const totalAccepted = allSubs.filter(s => s.verdict === 'Accepted').length;
    const acRate = totalSubs > 0 ? Math.round((totalAccepted / totalSubs) * 100) : 0;

    const problemsSolved = new Set(allSubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId)).size;

    // 5. Assignments List (for this faculty member)
    const assignments = (await assignmentRepo.listByFacultyId(req.user.id))
      .sort((a, b) => (a.deadline?.toMillis?.() ?? new Date(a.deadline).getTime()) - (b.deadline?.toMillis?.() ?? new Date(b.deadline).getTime()))
      .map(a => ({ id: a.id, title: a.title, deadline: a.deadline, created_at: a.createdAt }));

    res.json({
      success: true,
      data: {
        stats: { totalStudents, activeStudents, totalSubs, acRate, problemsSolved },
        assignments
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.createAssignment = async (req, res) => {
  try {
    const { title, deadline, problem_ids, allowed_cidrs, is_exam } = req.body;

    if (!title || !deadline || !problem_ids || !Array.isArray(problem_ids)) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
    if (typeof title !== 'string' || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title must be ≤ 200 characters.' });
    }

    // Validate CIDRs if provided
    const { validateCIDR } = require('../middleware/cidrCheck');
    const cidrs = Array.isArray(allowed_cidrs) ? allowed_cidrs : [];
    for (const cidr of cidrs) {
      if (!validateCIDR(cidr.trim())) {
        return res.status(400).json({ success: false, error: `Invalid CIDR: "${cidr}"` });
      }
    }

    await assignmentRepo.create({
      facultyId: req.user.id, title, deadline, allowedCidrs: cidrs, isExam: is_exam === true,
      problemIds: problem_ids,
    });

    res.json({ success: true, message: 'Assignment created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Verify the requesting faculty owns the assignment (admins bypass). Returns the
// assignment if access is allowed; otherwise sends a 404 and returns null.
async function assertAssignmentAccess(req, res, assignmentId) {
  const assignment = await assignmentRepo.getById(assignmentId);
  if (!assignment || (assignment.facultyId !== req.user.id && req.user.role !== 'admin')) {
    res.status(404).json({ success: false, error: 'Assignment not found' });
    return null;
  }
  return assignment;
}

exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    const subs = (await Promise.all((assignment.problemIds || []).map(pid => submissionRepo.listByProblem(pid))))
      .flat()
      .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0));

    const usersMap = await userRepo.getAllUsersMap();
    const problemsMap = await problemRepo.getMapByIds(subs.map(s => s.problemId));
    const data = subs.map(s => {
      const profile = usersMap.get(s.userId) || {};
      return {
        student_name: profile.name || 'Unknown',
        email: profile.email || null,
        problem_title: problemsMap.get(s.problemId)?.title || 'Unknown',
        verdict: s.verdict,
        runtime: s.runtime,
        submitted_at: s.submittedAt?.toDate?.() ?? s.submittedAt,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.exportMarksCSV = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    const subs = (await Promise.all((assignment.problemIds || []).map(pid => submissionRepo.listByProblem(pid)))).flat();
    const plagiarismPairs = await plagiarismResultRepo.listByAssignment(id);
    const flaggedUserIds = new Set(plagiarismPairs.flatMap(p => [p.studentA, p.studentB]));

    // Group by (user, problem): max score (Accepted -> 100), earliest Accepted time.
    const grouped = new Map(); // `${userId}|${problemId}` -> { score, solvedAt }
    for (const s of subs) {
      const key = `${s.userId}|${s.problemId}`;
      if (!grouped.has(key)) grouped.set(key, { userId: s.userId, problemId: s.problemId, score: 0, solvedAt: null });
      const g = grouped.get(key);
      if (s.verdict === 'Accepted') {
        g.score = 100;
        const t = s.submittedAt?.toDate?.() ?? new Date(s.submittedAt);
        if (!g.solvedAt || t < g.solvedAt) g.solvedAt = t;
      }
    }

    const usersMap = await userRepo.getAllUsersMap();
    const problemsMap = await problemRepo.getMapByIds([...grouped.values()].map(g => g.problemId));
    const rows = [...grouped.values()].map(g => {
      const profile = usersMap.get(g.userId) || {};
      return {
        'Roll No': profile.rollNo || null,
        'Student Name': profile.name || 'Unknown',
        'Email': profile.email || null,
        'Department': profile.department || null,
        'Section': profile.section || null,
        'Problem': problemsMap.get(g.problemId)?.title || 'Unknown',
        'Score': g.score,
        'Solved At': g.solvedAt ? g.solvedAt.toISOString().replace('T', ' ').slice(0, 16) : '',
        'Plagiarism Flag': flaggedUserIds.has(g.userId) ? 'FLAGGED' : '',
      };
    });

    const fields = ['Roll No', 'Student Name', 'Email', 'Department', 'Section', 'Problem', 'Score', 'Solved At', 'Plagiarism Flag'];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    logAction(req, 'marks.export', `assignment ${id} (${rows.length} rows)`);
    res.header('Content-Type', 'text/csv');
    res.attachment('marks_export.csv');
    return res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.createProblem = async (req, res) => {
  try {
    const { title, description, difficulty, tags, test_cases, stubs,
            scoring_mode, max_score, editorial, editorial_visible_at,
            uses_checker, checker_code, checker_language_id } = req.body;

    if (!title || typeof title !== 'string' || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
    }
    if (description != null && (typeof description !== 'string' || description.length > 20000)) {
      return res.status(400).json({ success: false, error: 'Description must be ≤ 20000 characters.' });
    }

    const stubsObj = (stubs && typeof stubs === 'object' && !Array.isArray(stubs)) ? stubs : {};
    const mode   = ['acm', 'oi'].includes(scoring_mode) ? scoring_mode : 'acm';
    const mScore = Number.isInteger(max_score) && max_score > 0 ? max_score : 100;

    // Special judge config
    const usesChecker = uses_checker === true;
    const checkerCode = usesChecker && typeof checker_code === 'string' && checker_code.trim()
      ? checker_code
      : null;
    const checkerLangId = usesChecker && Number.isInteger(checker_language_id) && checker_language_id > 0
      ? checker_language_id
      : null;

    const problem = await problemRepo.create({
      title, description, difficulty, tags: tags || [], createdBy: req.user.id, stubs: stubsObj,
      scoringMode: mode, maxScore: mScore, editorial: editorial || null,
      editorialVisibleAt: editorial_visible_at || null,
      usesChecker, checkerCode, checkerLanguageId: checkerLangId,
      timeLimit: 2, memoryLimit: 256,
    }, test_cases || []);

    res.json({ success: true, message: 'Problem added successfully', data: { id: problem.id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, difficulty, tags, stubs, scoring_mode, max_score,
            editorial, editorial_visible_at,
            uses_checker, checker_code, checker_language_id } = req.body;

    const existing = await problemRepo.getById(id);
    if (!existing || existing.createdBy !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Problem not found or not authorized' });
    }

    const partial = {};
    if (title !== undefined) partial.title = title;
    if (description !== undefined) partial.description = description;
    if (difficulty !== undefined) partial.difficulty = difficulty;
    if (tags !== undefined) partial.tags = tags;
    if (stubs && typeof stubs === 'object' && !Array.isArray(stubs)) partial.stubs = stubs;
    if (['acm', 'oi'].includes(scoring_mode)) partial.scoringMode = scoring_mode;
    if (Number.isInteger(max_score) && max_score > 0) partial.maxScore = max_score;
    if (editorial !== undefined) partial.editorial = editorial || null;
    if (editorial_visible_at !== undefined) partial.editorialVisibleAt = editorial_visible_at || null;
    if (typeof uses_checker === 'boolean') partial.usesChecker = uses_checker;
    if (typeof checker_code === 'string') partial.checkerCode = checker_code;
    if (Number.isInteger(checker_language_id) && checker_language_id > 0) partial.checkerLanguageId = checker_language_id;

    await problemRepo.update(id, partial);
    res.json({ success: true, message: 'Problem updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await problemRepo.getById(id);
    if (!existing || existing.createdBy !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Problem not found or not authorized' });
    }

    await problemRepo.remove(id);

    logAction(req, 'problem.delete', `problem ${id}`);
    res.json({ success: true, message: 'Problem deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.generateAITestCases = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'Title and description are required' });
    }

    const ai = getGeminiClient();

    if (!ai) {
      const mockCases = Array.from({ length: 15 }).map((_, i) => ({
        input: `Mock Input ${i + 1}`,
        output: `Mock Output ${i + 1}`
      }));
      return res.json({
        success: true,
        data: { suggestedDifficulty: 'medium', testCases: mockCases }
      });
    }

    const prompt = `You are an expert algorithmic judge. The faculty member is creating a new coding problem.
Title: ${title}
Description: ${description}

Generate EXACTLY 15 edge-case test inputs automatically.
Include edge cases such as: empty input, maximum constraints, duplicates, negative numbers, and single elements.
Also suggest a difficulty rating.

Output strictly valid JSON matching this schema:
{
  "suggestedDifficulty": "easy" | "medium" | "hard",
  "testCases": [
    { "input": "string", "output": "string" }
  ]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const parsed = JSON.parse(response.text);
    if (!parsed.testCases || !Array.isArray(parsed.testCases)) {
      throw new Error('Invalid AI Response Structure');
    }

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('AI Test Generation Failed:', error);
    res.status(500).json({ success: false, error: 'AI Generation Failed' });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const studentsMap = await userRepo.getMapByRole('student');
    const studentIds = [...studentsMap.keys()];
    if (studentIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const allSubs = await submissionRepo.listAll();
    const statsByStudent = new Map(studentIds.map(id => [id, { total: 0, accepted: 0, solved: new Set() }]));
    for (const s of allSubs) {
      const stat = statsByStudent.get(s.userId);
      if (!stat) continue;
      stat.total += 1;
      if (s.verdict === 'Accepted') { stat.accepted += 1; stat.solved.add(s.problemId); }
    }

    const students = studentIds.map(id => {
      const profile = studentsMap.get(id) || {};
      const stat = statsByStudent.get(id);
      return {
        id,
        name: profile.name || 'Unknown',
        email: profile.email || null,
        department: profile.department || null,
        section: profile.section || null,
        year: profile.year || null,
        rollNo: profile.rollNo || null,
        joinedDate: toDateOnly(profile.createdAt),
        totalSubmissions: stat.total,
        acceptedSubmissions: stat.accepted,
        problemsSolved: stat.solved.size,
        acRate: stat.total > 0 ? Math.round((stat.accepted / stat.total) * 100) : 0
      };
    }).sort((a, b) => b.problemsSolved - a.problemsSolved || a.name.localeCompare(b.name));

    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get Students Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
};

// Firestore Timestamp | Date | ISO-string | null -> epoch millis (or 0).
const toMillis = (value) => {
  if (!value) return 0;
  return (typeof value.toDate === 'function' ? value.toDate() : new Date(value)).getTime();
};

exports.getAtRiskStudents = async (req, res) => {
  try {
    const studentsMap = await userRepo.getMapByRole('student');
    const studentIds = [...studentsMap.keys()];
    if (studentIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const allSubs = await submissionRepo.listAll();
    const statsByStudent = new Map(studentIds.map(id => [id, { total: 0, accepted: 0, lastSub: 0 }]));
    for (const s of allSubs) {
      const stat = statsByStudent.get(s.userId);
      if (!stat) continue;
      stat.total += 1;
      if (s.verdict === 'Accepted') stat.accepted += 1;
      const t = s.submittedAt?.toMillis?.() ?? 0;
      if (t > stat.lastSub) stat.lastSub = t;
    }

    const now = Date.now();
    const DAY = 86400000;
    const INACTIVE_DAYS = 14;

    const flagged = [];
    for (const id of studentIds) {
      const profile = studentsMap.get(id) || {};
      const stat = statsByStudent.get(id);
      const lastLogin = toMillis(profile.lastLoginAt);
      const lastActive = Math.max(lastLogin, stat.lastSub);
      const inactiveDays = lastActive ? Math.floor((now - lastActive) / DAY) : null;
      const totalSubs = stat.total;
      const accepted  = stat.accepted;
      const acRate = totalSubs > 0 ? Math.round((accepted / totalSubs) * 100) : 0;

      const reasons = [];
      if (inactiveDays === null) reasons.push('Never active');
      else if (inactiveDays >= INACTIVE_DAYS) reasons.push(`Inactive ${inactiveDays}d`);
      if (totalSubs >= 5 && acRate < 30) reasons.push(`Low success ${acRate}%`);

      if (reasons.length) {
        flagged.push({
          id, name: profile.name || 'Unknown', email: profile.email || null,
          department: profile.department || null, section: profile.section || null, rollNo: profile.rollNo || null,
          inactiveDays, totalSubmissions: totalSubs, acRate,
          reasons,
          severity: (inactiveDays ?? 999),
        });
      }
    }

    flagged.sort((a, b) => b.severity - a.severity);
    res.json({ success: true, data: flagged });
  } catch (error) {
    console.error('At-Risk Students Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch at-risk students' });
  }
};

// Pass C: generate randomized hidden test cases via a generator + reference solution.
// The generator prints a random input to stdout (seeded by an integer on stdin);
// the reference solution produces the canonical expected output for that input.
exports.generateRandomTests = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      count = 5,
      generator_code, generator_language_id,
      reference_code, reference_language_id,
      make_public = false,
      persist_config = true,
    } = req.body;

    if (!generator_code || !generator_language_id || !reference_code || !reference_language_id) {
      return res.status(400).json({ success: false, error: 'generator and reference code + language ids are required' });
    }

    // Ownership check
    const own = await problemRepo.getById(id);
    if (!own || own.createdBy !== req.user.id) return res.status(404).json({ success: false, error: 'Problem not found' });

    const { runOnJudge0 } = require('../utils/judge0Run');
    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 25);

    const created = [];
    const failures = [];
    const newTestCases = [];
    for (let i = 0; i < n; i++) {
      // 1. Generate a random input (seed = i so runs are reproducible per request).
      const gen = await runOnJudge0({ source_code: generator_code, language_id: generator_language_id, stdin: String(i + 1) });
      if (!gen.ok || !gen.stdout.trim()) { failures.push({ i, stage: 'generator', msg: gen.message || gen.stderr }); continue; }
      const input = gen.stdout;
      // 2. Run the reference solution to get the expected output.
      const ref = await runOnJudge0({ source_code: reference_code, language_id: reference_language_id, stdin: input });
      if (!ref.ok) { failures.push({ i, stage: 'reference', msg: ref.message || ref.stderr }); continue; }
      const expected = ref.stdout;
      // First couple may be public samples if requested.
      const isPublic = make_public && newTestCases.length < 2;
      newTestCases.push({ input, output: expected, is_public: isPublic });
      created.push({ i });
    }
    if (newTestCases.length) await problemRepo.addTestCases(id, newTestCases);

    if (persist_config) {
      await problemRepo.update(id, {
        generatorCode: generator_code, generatorLanguageId: generator_language_id,
        referenceCode: reference_code, referenceLanguageId: reference_language_id,
      });
    }

    res.json({ success: true, data: { created: created.length, requested: n, failures } });
  } catch (error) {
    console.error('Generate random tests error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate random tests' });
  }
};

exports.getProblemTestHeatmap = async (req, res) => {
  try {
    const { id } = req.params;

    // Latest submission per student (that recorded per-test results).
    const problemSubs = (await submissionRepo.listByProblem(id))
      .filter(s => Array.isArray(s.testResults))
      .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0));
    const latestPerUser = new Map();
    for (const s of problemSubs) {
      if (!latestPerUser.has(s.userId)) latestPerUser.set(s.userId, s);
    }

    // How many public test cases the problem exposes (for labelling).
    const allTestCases = await problemRepo.getTestCases(id);
    const tc = { total: allTestCases.length, public: allTestCases.filter(t => t.isPublic).length };

    const attempts = [];
    const failures = [];
    for (const s of latestPerUser.values()) {
      s.testResults.forEach((passed, i) => {
        attempts[i] = (attempts[i] || 0) + 1;
        if (!passed) failures[i] = (failures[i] || 0) + 1;
      });
    }

    const heatmap = attempts.map((att, i) => ({
      testIndex: i + 1,
      isPublic: tc ? i < tc.public : false,
      attempts: att,
      failures: failures[i] || 0,
      failRate: att > 0 ? Math.round(((failures[i] || 0) / att) * 100) : 0,
    }));

    res.json({ success: true, data: { studentsAnalyzed: latestPerUser.size, totalTests: tc?.total || heatmap.length, heatmap } });
  } catch (error) {
    console.error('Test Heatmap Error:', error);
    res.status(500).json({ success: false, error: 'Failed to build test heatmap' });
  }
};

exports.getProblems = async (req, res) => {
  try {
    const mine = (await problemRepo.getAll()).filter(p => p.createdBy === req.user.id);
    const subsPerProblem = await Promise.all(mine.map(p => submissionRepo.listByProblem(p.id)));

    const problems = mine
      .map((p, i) => {
        const subs = subsPerProblem[i];
        const total = subs.length;
        const accepted = subs.filter(s => s.verdict === 'Accepted').length;
        return {
          id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [], created_at: p.createdAt,
          totalSubmissions: total,
          acceptedCount: accepted,
          acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
        };
      })
      .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));

    res.json({ success: true, data: problems });
  } catch (error) {
    console.error('Get Faculty Problems Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch problems' });
  }
};

exports.getAssignmentProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    // Get all problems in this assignment
    const assignmentProblemsMap = await problemRepo.getMapByIds(assignment.problemIds || []);
    const problemsResult = { rows: [...assignmentProblemsMap.values()].map(p => ({ id: p.id, title: p.title, difficulty: p.difficulty })) };

    // Get all students
    const students = (await userRepo.listByRole('student'))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Get all accepted submissions for this assignment's problems
    const subs = (await Promise.all((assignment.problemIds || []).map(pid => submissionRepo.listByProblem(pid)))).flat();
    const solvedSet = new Set(subs.filter(s => s.verdict === 'Accepted').map(s => `${s.userId}:${s.problemId}`));

    const progress = students.map(student => ({
      student: { id: student.id, name: student.name, email: student.email },
      solved: problemsResult.rows.filter(p => solvedSet.has(`${student.id}:${p.id}`)).length,
      total: problemsResult.rows.length,
      problems: problemsResult.rows.map(p => ({
        id: p.id,
        title: p.title,
        solved: solvedSet.has(`${student.id}:${p.id}`)
      }))
    }));

    res.json({
      success: true,
      data: {
        problems: problemsResult.rows,
        progress
      }
    });
  } catch (error) {
    console.error('Assignment Progress Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assignment progress' });
  }
};

exports.getClassAnalytics = async (req, res) => {
  try {
    // Single full-collection read — every aggregate below is derived from
    // this one array in application code (Firestore has no server-side
    // GROUP BY). See submissionRepository.js header for the scale caveat.
    const allSubs = await submissionRepo.listAll();
    const allProblemIds = [...new Set(allSubs.map(s => s.problemId))];
    const problemsMap = await problemRepo.getMapByIds(allProblemIds);
    const subMillis = (s) => s.submittedAt?.toMillis?.() ?? new Date(s.submittedAt).getTime();
    const subDate = (s) => s.submittedAt?.toDate?.() ?? new Date(s.submittedAt);

    // Topic weakness / mastery: which tags have the most failed attempts class-wide.
    const topicCounts = {};
    for (const s of allSubs) {
      const tags = problemsMap.get(s.problemId)?.tags || [];
      for (const tag of tags) {
        if (!topicCounts[tag]) topicCounts[tag] = { topic: tag, solved: 0, failed: 0 };
        if (s.verdict === 'Accepted') topicCounts[tag].solved += 1;
        else topicCounts[tag].failed += 1;
      }
    }
    const topicWeakness = Object.values(topicCounts).sort((a, b) => b.failed - a.failed).slice(0, 10);
    const topicMastery = Object.values(topicCounts)
      .sort((a, b) => (b.solved + b.failed) - (a.solved + a.failed))
      .slice(0, 8);

    // Submissions over last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const timelineCounts = {};
    for (const s of allSubs) {
      if (subMillis(s) < thirtyDaysAgo) continue;
      const date = subDate(s).toISOString().split('T')[0];
      timelineCounts[date] = (timelineCounts[date] || 0) + 1;
    }
    const submissionsTimeline = Object.entries(timelineCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    // Difficulty distribution of solved problems
    const diffCounts = {};
    for (const s of allSubs) {
      if (s.verdict !== 'Accepted') continue;
      const d = problemsMap.get(s.problemId)?.difficulty || 'Unknown';
      diffCounts[d] = (diffCounts[d] || 0) + 1;
    }
    const difficultyDistribution = Object.entries(diffCounts).map(([difficulty, count]) => ({ difficulty, count }));

    // Verdict distribution
    const verdictCounts = {};
    for (const s of allSubs) { if (s.verdict) verdictCounts[s.verdict] = (verdictCounts[s.verdict] || 0) + 1; }
    const verdictDistribution = Object.entries(verdictCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Student roster + per-student submission aggregates.
    const studentsMap = await userRepo.getMapByRole('student');
    const studentIds = [...studentsMap.keys()];
    const perStudent = new Map(studentIds.map(id => [id, { solved: new Set(), total: 0, accepted: 0 }]));
    for (const s of allSubs) {
      const stat = perStudent.get(s.userId);
      if (!stat) continue;
      stat.total += 1;
      if (s.verdict === 'Accepted') { stat.accepted += 1; stat.solved.add(s.problemId); }
    }

    // Top students by distinct problems solved (accepted)
    const topStudents = studentIds
      .map(id => ({ name: studentsMap.get(id)?.name || 'Unknown', solved: perStudent.get(id).solved.size }))
      .filter(r => r.solved > 0)
      .sort((a, b) => b.solved - a.solved)
      .slice(0, 10);

    // Cohort comparison: avg problems solved + AC rate per department and per section.
    const groupByDim = (dim) => {
      const groups = new Map();
      for (const id of studentIds) {
        const label = studentsMap.get(id)?.[dim] || 'Unassigned';
        if (!groups.has(label)) groups.set(label, { label, students: 0, accepted: 0, total_subs: 0, solved: 0 });
        const g = groups.get(label);
        const stat = perStudent.get(id);
        g.students += 1;
        g.accepted += stat.accepted;
        g.total_subs += stat.total;
        g.solved += stat.solved.size;
      }
      return [...groups.values()]
        .sort((a, b) => b.solved - a.solved)
        .map(g => ({
          label: g.label, students: g.students, solved: g.solved,
          acRate: g.total_subs > 0 ? Math.round((g.accepted / g.total_subs) * 100) : 0,
          avgSolved: g.students > 0 ? Math.round((g.solved / g.students) * 10) / 10 : 0,
        }));
    };
    const byDepartment = groupByDim('department');
    const bySection = groupByDim('section');

    // Weekly trend (last 12 weeks): submission volume + acceptance rate over time.
    const twelveWeeksAgo = Date.now() - 12 * 7 * 86400000;
    const weekStart = (d) => { const wd = new Date(d); const day = (wd.getUTCDay() + 6) % 7; wd.setUTCDate(wd.getUTCDate() - day); return wd.toISOString().split('T')[0]; };
    const weeklyCounts = {};
    for (const s of allSubs) {
      const ms = subMillis(s);
      if (ms < twelveWeeksAgo) continue;
      const week = weekStart(subDate(s));
      if (!weeklyCounts[week]) weeklyCounts[week] = { total: 0, accepted: 0 };
      weeklyCounts[week].total += 1;
      if (s.verdict === 'Accepted') weeklyCounts[week].accepted += 1;
    }
    const weeklyTrend = Object.entries(weeklyCounts)
      .map(([week, { total, accepted }]) => ({ week, total, accepted, acRate: total ? Math.round((accepted / total) * 100) : 0 }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // Distribution of students by number of distinct problems solved (a "score" histogram).
    const buckets = [
      { range: '0',      min: 0,  max: 0 },
      { range: '1–2',    min: 1,  max: 2 },
      { range: '3–5',    min: 3,  max: 5 },
      { range: '6–10',   min: 6,  max: 10 },
      { range: '11–20',  min: 11, max: 20 },
      { range: '21+',    min: 21, max: Infinity },
    ].map(b => ({ ...b, students: 0 }));
    for (const id of studentIds) {
      const v = perStudent.get(id).solved.size;
      const b = buckets.find(b => v >= b.min && v <= b.max);
      if (b) b.students += 1;
    }
    const solvedDistribution = buckets.map(({ range, students }) => ({ range, students }));

    // Submission heatmap: day-of-week × hour-of-day over the last 60 days.
    const sixtyDaysAgo = Date.now() - 60 * 86400000;
    const heatmapCounts = {};
    for (const s of allSubs) {
      if (subMillis(s) < sixtyDaysAgo) continue;
      const d = subDate(s);
      const key = `${d.getDay()}|${d.getHours()}`;
      heatmapCounts[key] = (heatmapCounts[key] || 0) + 1;
    }
    const submissionHeatmap = Object.entries(heatmapCounts).map(([key, count]) => {
      const [dow, hour] = key.split('|').map(Number);
      return { dow, hour, count };
    });

    // Language distribution across all submissions.
    const langCounts = {};
    for (const s of allSubs) { if (s.language) langCounts[s.language] = (langCounts[s.language] || 0) + 1; }
    const languageDistribution = Object.entries(langCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // ── Auto-generated plain-language insights (so non-technical viewers get the takeaway) ──
    const insights = [];
    if (weeklyTrend.length >= 2) {
      const last = weeklyTrend[weeklyTrend.length - 1];
      const prev = weeklyTrend[weeklyTrend.length - 2];
      const diff = last.acRate - prev.acRate;
      if (Math.abs(diff) >= 3) {
        insights.push({
          tone: diff > 0 ? 'positive' : 'negative',
          text: `Class acceptance rate ${diff > 0 ? 'rose' : 'fell'} ${Math.abs(diff)} pts this week (${prev.acRate}% → ${last.acRate}%).`,
        });
      }
    }
    if (topicWeakness.length) {
      const t = topicWeakness[0];
      if (t.failed > 0) {
        insights.push({ tone: 'warning', text: `"${t.topic}" is the most-failed topic — ${t.failed} failed attempts class-wide.` });
      }
    }
    if (submissionHeatmap.length) {
      const top = submissionHeatmap.reduce((a, b) => (b.count > a.count ? b : a));
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      insights.push({ tone: 'neutral', text: `Peak activity is ${days[top.dow]} around ${String(top.hour).padStart(2, '0')}:00.` });
    }
    const zeroSolved = buckets[0].students;
    if (zeroSolved > 0) {
      insights.push({ tone: 'warning', text: `${zeroSolved} student${zeroSolved === 1 ? ' has' : 's have'} not solved a single problem yet.` });
    }

    res.json({
      success: true,
      data: {
        topicWeakness,
        submissionsTimeline,
        difficultyDistribution,
        verdictDistribution,
        topStudents,
        topicMastery,
        byDepartment,
        bySection,
        weeklyTrend,
        solvedDistribution,
        submissionHeatmap,
        languageDistribution,
        insights
      }
    });
  } catch (error) {
    console.error('Class Analytics Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

// Per-student deep-dive: learning curve, topic mastery radar, verdict mix, totals.
// ── Hierarchical drill-down analytics (class → cohort → student) ───────────────

// Level 1: cohort aggregates for the class bar chart. Department-scoped (admin = all),
// cached briefly. `?dimension=department|year|section`.
exports.getCohorts = async (req, res) => {
  try {
    const dim = COHORT_DIMS[req.query.dimension] || 'department';
    const dept = scopeDept(req); // null = admin (all); else restrict to own dept

    const studentsMap = await userRepo.getMapByRole('student');
    let students = [...studentsMap.values()];
    if (dept !== null) students = students.filter(s => (s.department || null) === dept);
    const ids = students.map(s => s.id);

    const key = `analytics:cohorts:${dept ?? 'all'}:${dim}`;
    const data = await cached(key, 120, async () => {
      if (ids.length === 0) return [];
      const idSet = new Set(ids);
      const allSubs = (await submissionRepo.listAll()).filter(s => idSet.has(s.userId));
      const perStudent = new Map(ids.map(id => [id, { solved: new Set(), subs: 0, ac: 0 }]));
      for (const s of allSubs) {
        const stat = perStudent.get(s.userId);
        stat.subs += 1;
        if (s.verdict === 'Accepted') { stat.ac += 1; stat.solved.add(s.problemId); }
      }

      // Group by cohort (department/section/year) using the Firestore-sourced
      // dimension — Postgres no longer knows about this column.
      const cohorts = new Map();
      for (const id of ids) {
        const cohort = studentsMap.get(id)?.[dim] || 'Unassigned';
        if (!cohorts.has(cohort)) cohorts.set(cohort, { cohort, students: 0, solvedSum: 0, subsSum: 0, acSum: 0 });
        const c = cohorts.get(cohort);
        const stat = perStudent.get(id);
        c.students += 1;
        c.solvedSum += stat.solved.size;
        c.subsSum += stat.subs;
        c.acSum += stat.ac;
      }
      return [...cohorts.values()]
        .map(c => ({
          cohort: c.cohort,
          students: c.students,
          avg_solved: c.students > 0 ? Math.round(c.solvedSum / c.students) : 0,
          ac_rate: c.subsSum > 0 ? Math.round((100 * c.acSum) / c.subsSum) : 0,
        }))
        .sort((a, b) => a.cohort.localeCompare(b.cohort));
    });

    res.json({ success: true, data, dimension: dim });
  } catch (error) {
    console.error('getCohorts error:', error);
    res.status(500).json({ success: false, error: 'Failed to load cohorts' });
  }
};

// Level 2: ranked students within one cohort, paginated. Department-scoped.
// `?dimension=&value=&page=&limit=`.
exports.getCohortStudents = async (req, res) => {
  try {
    const dim = COHORT_DIMS[req.query.dimension] || 'department';
    const value = String(req.query.value ?? 'Unassigned');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const dept = scopeDept(req);

    // A scoped faculty/HOD may only inspect their own department's cohorts.
    if (dim === 'department' && dept !== null && value !== dept) {
      return res.status(403).json({ success: false, error: 'Outside your department scope.' });
    }

    const studentsMap = await userRepo.getMapByRole('student');
    let students = [...studentsMap.values()].filter(s => (s[dim] || 'Unassigned') === value);
    if (dept !== null) students = students.filter(s => (s.department || null) === dept);

    const total = students.length;
    const ids = students.map(s => s.id);
    const idSet = new Set(ids);

    const allSubs = ids.length ? (await submissionRepo.listAll()).filter(s => idSet.has(s.userId)) : [];
    const statsMap = new Map(ids.map(id => [id, { solved: new Set(), subs: 0, ac: 0 }]));
    for (const s of allSubs) {
      const stat = statsMap.get(s.userId);
      stat.subs += 1;
      if (s.verdict === 'Accepted') { stat.ac += 1; stat.solved.add(s.problemId); }
    }

    const merged = students
      .map(s => {
        const st = statsMap.get(s.id);
        return {
          id: s.id, name: s.name, rollNo: s.rollNo || null,
          department: s.department || null, section: s.section || null, year: s.year || null,
          solved: st.solved.size,
          acRate: st.subs > 0 ? Math.round((st.ac / st.subs) * 100) : 0,
        };
      })
      .sort((a, b) => b.solved - a.solved || a.name.localeCompare(b.name));

    const pageData = merged.slice((page - 1) * limit, (page - 1) * limit + limit);

    res.json({ success: true, total, page, limit, data: pageData });
  } catch (error) {
    console.error('getCohortStudents error:', error);
    res.status(500).json({ success: false, error: 'Failed to load cohort students' });
  }
};

exports.getStudentDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await userRepo.getById(id, 'student');
    if (!profile) return res.status(404).json({ success: false, error: 'Student not found' });
    // Strict department isolation: HOD/faculty may only drill into their own dept.
    if (!canSeeDepartment(req, profile.department)) {
      return res.status(403).json({ success: false, error: 'Outside your department scope.' });
    }

    const student = {
      id: profile.id, name: profile.name, email: profile.email,
      department: profile.department, section: profile.section, year: profile.year,
      roll_no: profile.rollNo, rating: profile.rating ?? 1200,
      last_login_at: profile.lastLoginAt, created_at: profile.createdAt,
    };

    const data = await cached(`student-profile:${id}`, 120, () => buildStudentProfile(id, student));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Student Detail Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch student detail' });
  }
};

// Runs every query for one student's full profile bundle. Pulled out of the route
// handler so the (department-check-free) result can be Redis-cached by id alone.
async function buildStudentProfile(id, student) {
  const [subs, ratingRows, masteryRes, codingProfilesRes] = await Promise.all([
    submissionRepo.listByUser(id),
    ratingHistoryRepo.listByUser(id),
    topicMasteryRepo.listByUser(id),
    codingProfileRepo.listByUser(id),
  ]);
  const subMillis = (s) => s.submittedAt?.toMillis?.() ?? new Date(s.submittedAt).getTime();
  const subDate = (s) => s.submittedAt?.toDate?.() ?? new Date(s.submittedAt);

  const problemsMap = await problemRepo.getMapByIds([...new Set(subs.map(s => s.problemId))]);

  // Learning curve: cumulative distinct problems solved over time (keyed by
  // the date each problem was *first* accepted).
  const firstAcceptedByProblem = new Map();
  for (const s of subs) {
    if (s.verdict !== 'Accepted') continue;
    const t = subMillis(s);
    if (!firstAcceptedByProblem.has(s.problemId) || t < firstAcceptedByProblem.get(s.problemId)) {
      firstAcceptedByProblem.set(s.problemId, t);
    }
  }
  const solvedByDate = {};
  for (const t of firstAcceptedByProblem.values()) {
    const date = new Date(t).toISOString().split('T')[0];
    solvedByDate[date] = (solvedByDate[date] || 0) + 1;
  }
  let cum = 0;
  const learningCurve = Object.entries(solvedByDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, n]) => { cum += n; return { date, solved: cum }; });

  // Topic mastery for this student: solved vs attempted per tag.
  const topicAgg = {};
  for (const s of subs) {
    const tags = problemsMap.get(s.problemId)?.tags || [];
    for (const tag of tags) {
      if (!topicAgg[tag]) topicAgg[tag] = { topic: tag, solvedSet: new Set(), attempts: 0 };
      topicAgg[tag].attempts += 1;
      if (s.verdict === 'Accepted') topicAgg[tag].solvedSet.add(s.problemId);
    }
  }
  const topicBreakdown = Object.values(topicAgg)
    .map(t => ({ topic: t.topic, solved: t.solvedSet.size, attempts: t.attempts }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 15);

  const verdictCounts = {};
  for (const s of subs) { if (s.verdict) verdictCounts[s.verdict] = (verdictCounts[s.verdict] || 0) + 1; }
  const verdictBreakdown = Object.entries(verdictCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  const total = subs.length;
  const accepted = subs.filter(s => s.verdict === 'Accepted').length;
  const solvedProblemIds = new Set(subs.filter(s => s.verdict === 'Accepted').map(s => s.problemId));

  // Difficulty progression: accepted problems by difficulty tier.
  const difficultyCounts = {};
  for (const pid of solvedProblemIds) {
    const d = problemsMap.get(pid)?.difficulty || 'Unknown';
    difficultyCounts[d] = (difficultyCounts[d] || 0) + 1;
  }
  const difficultyProgression = Object.entries(difficultyCounts).map(([difficulty, solved]) => ({ difficulty, solved }));

  // Submission velocity: submissions per week, last ~12 weeks.
  const twelveWeeksAgo = Date.now() - 12 * 7 * 86400000;
  const weekStart = (d) => { const wd = new Date(d); const day = (wd.getUTCDay() + 6) % 7; wd.setUTCDate(wd.getUTCDate() - day); return wd.toISOString().split('T')[0]; };
  const velocityCounts = {};
  for (const s of subs) {
    const ms = subMillis(s);
    if (ms < twelveWeeksAgo) continue;
    const week = weekStart(subDate(s));
    velocityCounts[week] = (velocityCounts[week] || 0) + 1;
  }
  const submissionVelocity = Object.entries(velocityCounts).map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week));

  // Activity heatmap, last 12 months.
  const twelveMonthsAgo = Date.now() - 365 * 86400000;
  const heatmapCounts = {};
  for (const s of subs) {
    const ms = subMillis(s);
    if (ms < twelveMonthsAgo) continue;
    const date = subDate(s).toISOString().split('T')[0];
    heatmapCounts[date] = (heatmapCounts[date] || 0) + 1;
  }
  const activityHeatmap = Object.entries(heatmapCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

  const contestIds = [...new Set(ratingRows.map(r => r.contestId).filter(Boolean))];
  const contestTitleMap = new Map(
    (await Promise.all(contestIds.map(cid => contestRepo.getById(cid)))).filter(Boolean).map(c => [c.id, c.title])
  );

  const ratingHistory = ratingRows.map(r => ({
    contestId: r.contestId, contestTitle: contestTitleMap.get(r.contestId) || 'Untitled contest',
    oldRating: r.oldRating, newRating: r.newRating, rank: r.rank,
    createdAt: r.createdAt?.toDate?.() ?? r.createdAt,
  }));

  const langCounts = {};
  for (const s of subs) { if (s.language) langCounts[s.language] = (langCounts[s.language] || 0) + 1; }
  const languages = Object.entries(langCounts).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count);

  const { strengths, weaknesses } = computeStrengthsWeaknesses(masteryRes.map(m => ({
    topic: m.topic, solved_count: m.solvedCount, failed_count: m.failedCount, hint_usage_count: m.hintUsageCount,
  })));

  const codingProfiles = codingProfilesRes.map(r => ({
    platform: r.platform, handle: r.handle,
    solved: parseInt(r.solved) || 0,
    rating: r.rating, maxRating: r.maxRating,
    syncStatus: r.syncStatus, lastSynced: r.lastSynced,
  }));
  const externalSolved = codingProfiles.reduce((sum, p) => sum + p.solved, 0);

  // At-a-glance highlights.
  const topTopic = strengths[0]?.topic ?? null;
  const weakTopic = weaknesses[0]?.topic ?? null;
  const topLanguage = languages[0]?.language ?? null;
  const busiestDay = activityHeatmap.reduce(
    (best, d) => (d.count > (best?.count ?? -1) ? d : best), null
  );
  const currentStreak = calculateStreakFromHeatmap(activityHeatmap);

  return {
    student: {
      id: student.id, name: student.name, email: student.email,
      department: student.department, section: student.section, year: student.year,
      rollNo: student.roll_no, rating: student.rating, lastLoginAt: toISO(student.last_login_at),
      joinedDate: toDateOnly(student.created_at),
    },
    totals: {
      total, accepted,
      solved: solvedProblemIds.size,
      acRate: total ? Math.round((accepted / total) * 100) : 0,
    },
    learningCurve,
    topicBreakdown,
    verdictBreakdown,
    difficultyProgression,
    submissionVelocity,
    activityHeatmap,
    ratingHistory,
    languages,
    strengths,
    weaknesses,
    codingProfiles,
    highlights: {
      topTopic,
      weakTopic,
      topLanguage,
      busiestDay: busiestDay ? busiestDay.date : null,
      currentStreak,
      externalSolved,
    },
  };
}

// Mirrors calculateStreak() in student.controller.js so faculty see the same
// "current streak" a student would on their own dashboard.
function calculateStreakFromHeatmap(heatmapRows) {
  if (!heatmapRows.length) return 0;
  const dates = heatmapRows.map(r => r.date).sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    const curr = new Date(dates[i]);
    const prev = new Date(dates[i + 1]);
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

// Topic-mastery matrix per cohort, for an overlay radar chart.
// `dim` selects the grouping: department | section | year (whitelisted).
exports.getCohortTopics = async (req, res) => {
  try {
    const ALLOWED = { department: 'department', section: 'section', year: 'year' };
    const dim = ALLOWED[String(req.query.dim || 'department')];
    if (!dim) return res.status(400).json({ success: false, error: 'Invalid dimension' });

    // Roster + cohort dimension from Firestore; submissions from Postgres,
    // tags hydrated from Firestore, aggregated by cohort here since neither
    // dimension lives in SQL anymore.
    const studentsMap = await userRepo.getMapByRole('student');
    const studentIds = new Set(studentsMap.keys());
    const subs = (await submissionRepo.listAll()).filter(s => studentIds.has(s.userId));
    const cohortTopicsProblemsMap = await problemRepo.getMapByIds(subs.map(s => s.problemId));

    // Pick the most-attempted topics (radar axes) and the most-active cohorts (series).
    const topicTotals = {};
    const cohortTotals = {};
    const cell = {}; // `${cohort}|${topic}` -> { accepted, attempts }
    for (const r of subs) {
      const cohort = studentsMap.get(r.userId)?.[dim] || 'Unassigned';
      const tags = cohortTopicsProblemsMap.get(r.problemId)?.tags || [];
      const accepted = r.verdict === 'Accepted' ? 1 : 0;
      for (const topic of tags) {
        topicTotals[topic] = (topicTotals[topic] || 0) + 1;
        cohortTotals[cohort] = (cohortTotals[cohort] || 0) + 1;
        const key = `${cohort}|${topic}`;
        if (!cell[key]) cell[key] = { accepted: 0, attempts: 0 };
        cell[key].accepted += accepted;
        cell[key].attempts += 1;
      }
    }
    const topTopics = Object.entries(topicTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
    const topCohorts = Object.entries(cohortTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);

    // One row per topic; each cohort is a key holding the acceptance-rate (0..100).
    const topics = topTopics.map(topic => {
      const row = { topic };
      for (const cohort of topCohorts) {
        const c = cell[`${cohort}|${topic}`];
        row[cohort] = c && c.attempts > 0 ? Math.round((c.accepted / c.attempts) * 100) : 0;
      }
      return row;
    });

    res.json({ success: true, data: { dim, cohorts: topCohorts, topics } });
  } catch (error) {
    console.error('Cohort Topics Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cohort topics' });
  }
};
