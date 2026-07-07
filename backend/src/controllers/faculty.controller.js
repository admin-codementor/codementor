const db = require('../config/db');
const { Parser } = require('json2csv');
const { getGeminiClient } = require('./ai.controller');
const { logAction } = require('../middleware/audit');
const { scopeDept, canSeeDepartment } = require('../middleware/role.middleware');
const { cached } = require('../utils/cache');

// Whitelisted cohort dimensions → real column names (guards against SQL injection
// when the dimension is interpolated into GROUP BY / WHERE).
const COHORT_DIMS = { department: 'department', year: 'year', section: 'section' };

exports.getDashboardData = async (req, res) => {
  try {
    // 1. Total Students
    const studentsRes = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'student'");
    const totalStudents = parseInt(studentsRes.rows[0].count) || 0;

    // 2. Active Students — submitted at least once in the last 7 days
    const activeRes = await db.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM code_submissions
      WHERE submitted_at >= NOW() - INTERVAL '7 days'
    `);
    const activeStudents = parseInt(activeRes.rows[0].count) || 0;

    // 3. Class Overview: Total Submissions and AC Rate
    const statsRes = await db.query(`
      SELECT
        COUNT(*) as total_subs,
        SUM(CASE WHEN verdict = 'Accepted' THEN 1 ELSE 0 END) as total_ac
      FROM code_submissions
    `);
    const totalSubs = parseInt(statsRes.rows[0].total_subs) || 0;
    const acRate = totalSubs > 0 ? Math.round((parseInt(statsRes.rows[0].total_ac) / totalSubs) * 100) : 0;

    // 4. Problems solved (unique accepted problems across all students)
    const solvedRes = await db.query(`
      SELECT COUNT(DISTINCT problem_id) as count
      FROM code_submissions
      WHERE verdict = 'Accepted'
    `);
    const problemsSolved = parseInt(solvedRes.rows[0].count) || 0;

    // 5. Assignments List (for this faculty member)
    const assignRes = await db.query(`
      SELECT id, title, deadline, created_at
      FROM assignments
      WHERE faculty_id = $1
      ORDER BY deadline ASC
    `, [req.user.id]);
    const assignments = assignRes.rows;

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

    const newAssign = await db.query(
      `INSERT INTO assignments (faculty_id, title, deadline, allowed_cidrs, is_exam)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, title, deadline, cidrs, is_exam === true]
    );
    const assignId = newAssign.rows[0].id;

    for (const pid of problem_ids) {
      await db.query(
        `INSERT INTO assignment_problems (assignment_id, problem_id) VALUES ($1, $2)`,
        [assignId, pid]
      );
    }

    res.json({ success: true, message: 'Assignment created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Verify the requesting faculty owns the assignment (admins bypass). Returns true
// if access is allowed; otherwise sends a 404 and returns false.
async function assertAssignmentAccess(req, res, assignmentId) {
  const { rows } = await db.query(
    `SELECT 1 FROM assignments WHERE id = $1 AND (faculty_id = $2 OR $3 = 'admin')`,
    [assignmentId, req.user.id, req.user.role]
  );
  if (!rows.length) {
    res.status(404).json({ success: false, error: 'Assignment not found' });
    return false;
  }
  return true;
}

exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertAssignmentAccess(req, res, id))) return;

    const subsRes = await db.query(`
      SELECT
        u.name as student_name,
        u.email,
        p.title as problem_title,
        s.verdict,
        s.runtime,
        s.submitted_at
      FROM code_submissions s
      JOIN users u ON s.user_id = u.id
      JOIN problems p ON s.problem_id = p.id
      JOIN assignment_problems ap ON p.id = ap.problem_id
      WHERE ap.assignment_id = $1
      ORDER BY s.submitted_at DESC
    `, [id]);

    res.json({ success: true, data: subsRes.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.exportMarksCSV = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertAssignmentAccess(req, res, id))) return;

    const subsRes = await db.query(`
      SELECT
        u.roll_no  as "Roll No",
        u.name     as "Student Name",
        u.email    as "Email",
        u.department as "Department",
        u.section  as "Section",
        p.title    as "Problem",
        MAX(CASE WHEN s.verdict = 'Accepted' THEN 100 ELSE 0 END) as "Score",
        MIN(CASE WHEN s.verdict = 'Accepted' THEN s.submitted_at END) as "Solved At",
        EXISTS (
          SELECT 1 FROM plagiarism_results pr
          WHERE pr.assignment_id = $1 AND (pr.student_a = u.id OR pr.student_b = u.id)
        ) as "Plagiarism Flag"
      FROM users u
      JOIN code_submissions s ON u.id = s.user_id
      JOIN problems p ON s.problem_id = p.id
      JOIN assignment_problems ap ON p.id = ap.problem_id
      WHERE ap.assignment_id = $1
      GROUP BY u.roll_no, u.name, u.email, u.department, u.section, p.title, u.id
    `, [id]);

    const rows = subsRes.rows.map(r => ({
      ...r,
      'Solved At': r['Solved At'] ? new Date(r['Solved At']).toISOString().replace('T', ' ').slice(0, 16) : '',
      'Plagiarism Flag': r['Plagiarism Flag'] ? 'FLAGGED' : '',
    }));

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

    const stubsJson = (stubs && typeof stubs === 'object' && !Array.isArray(stubs))
      ? JSON.stringify(stubs)
      : '{}';
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

    const pRes = await db.query(
      `INSERT INTO problems (title, description, difficulty, tags, created_by, stubs,
                             scoring_mode, max_score, editorial, editorial_visible_at,
                             uses_checker, checker_code, checker_language_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [title, description, difficulty, tags, req.user.id, stubsJson,
       mode, mScore, editorial || null, editorial_visible_at || null,
       usesChecker, checkerCode, checkerLangId]
    );
    const pid = pRes.rows[0].id;

    if (test_cases && test_cases.length > 0) {
      for (const tc of test_cases) {
        await db.query(
          `INSERT INTO test_cases (problem_id, input_data, expected_output, is_public, score)
           VALUES ($1, $2, $3, $4, $5)`,
          [pid, tc.input, tc.output, tc.is_public || false, tc.score || 0]
        );
      }
    }

    res.json({ success: true, message: 'Problem added successfully', data: { id: pid } });
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

    const stubsJson = (stubs && typeof stubs === 'object' && !Array.isArray(stubs))
      ? JSON.stringify(stubs)
      : null;
    const mode   = ['acm', 'oi'].includes(scoring_mode) ? scoring_mode : null;
    const mScore = Number.isInteger(max_score) && max_score > 0 ? max_score : null;

    // Special judge config — only update fields the client actually sent
    // (typeof check) so COALESCE preserves existing values otherwise.
    const usesChecker = typeof uses_checker === 'boolean' ? uses_checker : null;
    const checkerCode = typeof checker_code === 'string' ? checker_code : null;
    const checkerLangId = Number.isInteger(checker_language_id) && checker_language_id > 0
      ? checker_language_id
      : null;

    const result = await db.query(`
      UPDATE problems
      SET title                = COALESCE($1, title),
          description          = COALESCE($2, description),
          difficulty           = COALESCE($3, difficulty),
          tags                 = COALESCE($4, tags),
          stubs                = COALESCE($5::jsonb, stubs),
          scoring_mode         = COALESCE($6, scoring_mode),
          max_score            = COALESCE($7, max_score),
          editorial            = COALESCE($8, editorial),
          editorial_visible_at = COALESCE($9::timestamp, editorial_visible_at),
          uses_checker         = COALESCE($10, uses_checker),
          checker_code         = COALESCE($11, checker_code),
          checker_language_id  = COALESCE($12, checker_language_id)
      WHERE id = $13 AND created_by = $14
      RETURNING id
    `, [title, description, difficulty, tags, stubsJson, mode, mScore,
        editorial || null, editorial_visible_at || null,
        usesChecker, checkerCode, checkerLangId, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Problem not found or not authorized' });
    }

    res.json({ success: true, message: 'Problem updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM problems WHERE id = $1 AND created_by = $2 RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Problem not found or not authorized' });
    }

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
    const { rows } = await db.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.department, u.section, u.year, u.roll_no,
        u.created_at as joined_date,
        COUNT(s.id) as total_submissions,
        SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) as accepted_submissions,
        COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) as problems_solved
      FROM users u
      LEFT JOIN code_submissions s ON u.id = s.user_id
      WHERE u.role = 'student'
      GROUP BY u.id, u.name, u.email, u.department, u.section, u.year, u.roll_no, u.created_at
      ORDER BY problems_solved DESC, u.name ASC
    `);

    const students = rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      department: r.department || null,
      section: r.section || null,
      year: r.year || null,
      rollNo: r.roll_no || null,
      joinedDate: r.joined_date.toISOString().split('T')[0],
      totalSubmissions: parseInt(r.total_submissions) || 0,
      acceptedSubmissions: parseInt(r.accepted_submissions) || 0,
      problemsSolved: parseInt(r.problems_solved) || 0,
      acRate: parseInt(r.total_submissions) > 0
        ? Math.round((parseInt(r.accepted_submissions) / parseInt(r.total_submissions)) * 100)
        : 0
    }));

    res.json({ success: true, data: students });
  } catch (error) {
    console.error('Get Students Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
};

exports.getAtRiskStudents = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.email, u.department, u.section, u.roll_no, u.last_login_at,
             MAX(s.submitted_at) AS last_submission,
             COUNT(s.id) AS total_subs,
             SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) AS accepted
        FROM users u
        LEFT JOIN code_submissions s ON s.user_id = u.id
       WHERE u.role = 'student'
       GROUP BY u.id, u.name, u.email, u.department, u.section, u.roll_no, u.last_login_at
    `);

    const now = Date.now();
    const DAY = 86400000;
    const INACTIVE_DAYS = 14;

    const flagged = [];
    for (const r of rows) {
      const lastLogin = r.last_login_at ? new Date(r.last_login_at).getTime() : 0;
      const lastSub   = r.last_submission ? new Date(r.last_submission).getTime() : 0;
      const lastActive = Math.max(lastLogin, lastSub);
      const inactiveDays = lastActive ? Math.floor((now - lastActive) / DAY) : null;
      const totalSubs = parseInt(r.total_subs) || 0;
      const accepted  = parseInt(r.accepted) || 0;
      const acRate = totalSubs > 0 ? Math.round((accepted / totalSubs) * 100) : 0;

      const reasons = [];
      if (inactiveDays === null) reasons.push('Never active');
      else if (inactiveDays >= INACTIVE_DAYS) reasons.push(`Inactive ${inactiveDays}d`);
      if (totalSubs >= 5 && acRate < 30) reasons.push(`Low success ${acRate}%`);

      if (reasons.length) {
        flagged.push({
          id: r.id, name: r.name, email: r.email,
          department: r.department || null, section: r.section || null, rollNo: r.roll_no || null,
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
    const { rows: [own] } = await db.query('SELECT 1 FROM problems WHERE id = $1 AND created_by = $2', [id, req.user.id]);
    if (!own) return res.status(404).json({ success: false, error: 'Problem not found' });

    const { runOnJudge0 } = require('../utils/judge0Run');
    const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 25);

    const created = [];
    const failures = [];
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
      const isPublic = make_public && created.length < 2;
      await db.query(
        `INSERT INTO test_cases (problem_id, input_data, expected_output, is_public) VALUES ($1,$2,$3,$4)`,
        [id, input, expected, isPublic]
      );
      created.push({ i });
    }

    if (persist_config) {
      await db.query(
        `UPDATE problems SET generator_code = $1, generator_language_id = $2, reference_code = $3, reference_language_id = $4 WHERE id = $5`,
        [generator_code, generator_language_id, reference_code, reference_language_id, id]
      );
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
    const { rows } = await db.query(`
      SELECT DISTINCT ON (user_id) test_results
        FROM code_submissions
       WHERE problem_id = $1 AND test_results IS NOT NULL
       ORDER BY user_id, submitted_at DESC
    `, [id]);

    // How many public test cases the problem exposes (for labelling).
    const { rows: [tc] } = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_public)::int AS public
         FROM test_cases WHERE problem_id = $1`,
      [id]
    );

    const attempts = [];
    const failures = [];
    for (const r of rows) {
      const arr = Array.isArray(r.test_results) ? r.test_results : [];
      arr.forEach((passed, i) => {
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

    res.json({ success: true, data: { studentsAnalyzed: rows.length, totalTests: tc?.total || heatmap.length, heatmap } });
  } catch (error) {
    console.error('Test Heatmap Error:', error);
    res.status(500).json({ success: false, error: 'Failed to build test heatmap' });
  }
};

exports.getProblems = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.id, p.title, p.difficulty, p.tags, p.created_at,
        COUNT(s.id) as total_submissions,
        SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) as accepted_count
      FROM problems p
      LEFT JOIN code_submissions s ON p.id = s.problem_id
      WHERE p.created_by = $1
      GROUP BY p.id, p.title, p.difficulty, p.tags, p.created_at
      ORDER BY p.created_at DESC
    `, [req.user.id]);

    const problems = rows.map(r => ({
      ...r,
      totalSubmissions: parseInt(r.total_submissions) || 0,
      acceptedCount: parseInt(r.accepted_count) || 0,
      acceptanceRate: parseInt(r.total_submissions) > 0
        ? Math.round((parseInt(r.accepted_count) / parseInt(r.total_submissions)) * 100)
        : 0
    }));

    res.json({ success: true, data: problems });
  } catch (error) {
    console.error('Get Faculty Problems Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch problems' });
  }
};

exports.getAssignmentProgress = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertAssignmentAccess(req, res, id))) return;

    // Get all problems in this assignment
    const problemsResult = await db.query(`
      SELECT p.id, p.title, p.difficulty
      FROM problems p
      JOIN assignment_problems ap ON p.id = ap.problem_id
      WHERE ap.assignment_id = $1
    `, [id]);

    // Get all students
    const studentsResult = await db.query(
      "SELECT id, name, email FROM users WHERE role = 'student' ORDER BY name ASC"
    );

    // Get all accepted submissions for this assignment's problems
    const solvedResult = await db.query(`
      SELECT DISTINCT s.user_id, s.problem_id
      FROM code_submissions s
      JOIN assignment_problems ap ON s.problem_id = ap.problem_id
      WHERE ap.assignment_id = $1 AND s.verdict = 'Accepted'
    `, [id]);

    const solvedSet = new Set(solvedResult.rows.map(r => `${r.user_id}:${r.problem_id}`));

    const progress = studentsResult.rows.map(student => ({
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
    // Topic weakness: which tags have the most failed attempts class-wide
    const topicResult = await db.query(`
      SELECT topic, solved_count, failed_count
      FROM (
        SELECT unnest(p.tags) as topic,
          SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) as solved_count,
          SUM(CASE WHEN s.verdict != 'Accepted' THEN 1 ELSE 0 END) as failed_count
        FROM code_submissions s
        JOIN problems p ON s.problem_id = p.id
        GROUP BY unnest(p.tags)
      ) t
      ORDER BY failed_count DESC
      LIMIT 10
    `);

    // Submissions over last 30 days
    const timelineResult = await db.query(`
      SELECT DATE(submitted_at) as date, COUNT(*) as count
      FROM code_submissions
      WHERE submitted_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(submitted_at)
      ORDER BY date ASC
    `);

    // Difficulty distribution of solved problems
    const diffResult = await db.query(`
      SELECT p.difficulty, COUNT(DISTINCT s.id) as count
      FROM code_submissions s
      JOIN problems p ON s.problem_id = p.id
      WHERE s.verdict = 'Accepted'
      GROUP BY p.difficulty
    `);

    // Verdict distribution: count of every verdict across all submissions
    const verdictResult = await db.query(`
      SELECT verdict, COUNT(*) as count
      FROM code_submissions
      WHERE verdict IS NOT NULL
      GROUP BY verdict
      ORDER BY count DESC
    `);

    // Top students by distinct problems solved (accepted)
    const topStudentsResult = await db.query(`
      SELECT u.name,
        COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) as solved
      FROM users u
      JOIN code_submissions s ON u.id = s.user_id
      WHERE u.role = 'student'
      GROUP BY u.id, u.name
      HAVING COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) > 0
      ORDER BY solved DESC
      LIMIT 10
    `);

    // Topic mastery: solved vs failed attempts per tag (class-wide)
    const topicMasteryResult = await db.query(`
      SELECT topic, solved_count, failed_count
      FROM (
        SELECT unnest(p.tags) as topic,
          SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END) as solved_count,
          SUM(CASE WHEN s.verdict != 'Accepted' THEN 1 ELSE 0 END) as failed_count
        FROM code_submissions s
        JOIN problems p ON s.problem_id = p.id
        GROUP BY unnest(p.tags)
      ) t
      ORDER BY (solved_count + failed_count) DESC
      LIMIT 8
    `);

    // Cohort comparison: avg problems solved + AC rate per department and per section.
    const cohortQuery = (dim) => `
      SELECT COALESCE(u.${dim}, 'Unassigned') AS label,
             COUNT(DISTINCT u.id) AS students,
             COALESCE(SUM(CASE WHEN s.verdict = 'Accepted' THEN 1 ELSE 0 END), 0) AS accepted,
             COUNT(s.id) AS total_subs,
             COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) AS solved
        FROM users u
        LEFT JOIN code_submissions s ON s.user_id = u.id
       WHERE u.role = 'student'
       GROUP BY COALESCE(u.${dim}, 'Unassigned')
       ORDER BY solved DESC`;
    const [byDept, bySection] = await Promise.all([
      db.query(cohortQuery('department')),
      db.query(cohortQuery('section')),
    ]);
    const mapCohort = (rows) => rows.map(r => ({
      label: r.label,
      students: parseInt(r.students) || 0,
      solved: parseInt(r.solved) || 0,
      acRate: parseInt(r.total_subs) > 0 ? Math.round((parseInt(r.accepted) / parseInt(r.total_subs)) * 100) : 0,
      avgSolved: parseInt(r.students) > 0 ? Math.round((parseInt(r.solved) / parseInt(r.students)) * 10) / 10 : 0,
    }));

    // Weekly trend (last 12 weeks): submission volume + acceptance rate over time.
    const weeklyResult = await db.query(`
      SELECT to_char(date_trunc('week', submitted_at), 'YYYY-MM-DD') AS week,
             COUNT(*) AS total,
             SUM(CASE WHEN verdict = 'Accepted' THEN 1 ELSE 0 END) AS accepted
        FROM code_submissions
       WHERE submitted_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1 ASC
    `);
    const weeklyTrend = weeklyResult.rows.map(r => {
      const total = parseInt(r.total) || 0;
      const accepted = parseInt(r.accepted) || 0;
      return { week: r.week, total, accepted, acRate: total ? Math.round((accepted / total) * 100) : 0 };
    });

    // Distribution of students by number of distinct problems solved (a "score" histogram).
    const solvedDistResult = await db.query(`
      SELECT COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) AS solved
        FROM users u
        LEFT JOIN code_submissions s ON s.user_id = u.id
       WHERE u.role = 'student'
       GROUP BY u.id
    `);
    const buckets = [
      { range: '0',      min: 0,  max: 0 },
      { range: '1–2',    min: 1,  max: 2 },
      { range: '3–5',    min: 3,  max: 5 },
      { range: '6–10',   min: 6,  max: 10 },
      { range: '11–20',  min: 11, max: 20 },
      { range: '21+',    min: 21, max: Infinity },
    ].map(b => ({ ...b, students: 0 }));
    for (const r of solvedDistResult.rows) {
      const v = parseInt(r.solved) || 0;
      const b = buckets.find(b => v >= b.min && v <= b.max);
      if (b) b.students += 1;
    }
    const solvedDistribution = buckets.map(({ range, students }) => ({ range, students }));

    // Submission heatmap: day-of-week × hour-of-day over the last 60 days.
    const heatmapResult = await db.query(`
      SELECT EXTRACT(DOW  FROM submitted_at)::int AS dow,
             EXTRACT(HOUR FROM submitted_at)::int AS hour,
             COUNT(*) AS count
        FROM code_submissions
       WHERE submitted_at >= NOW() - INTERVAL '60 days'
       GROUP BY 1, 2
    `);
    const submissionHeatmap = heatmapResult.rows.map(r => ({
      dow: r.dow, hour: r.hour, count: parseInt(r.count) || 0,
    }));

    // Language distribution across all submissions.
    const langResult = await db.query(`
      SELECT language AS name, COUNT(*) AS value
        FROM code_submissions
       WHERE language IS NOT NULL AND language <> ''
       GROUP BY language ORDER BY value DESC
    `);
    const languageDistribution = langResult.rows.map(r => ({ name: r.name, value: parseInt(r.value) || 0 }));

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
    if (topicResult.rows.length) {
      const t = topicResult.rows[0];
      const failed = parseInt(t.failed_count) || 0;
      if (failed > 0) {
        insights.push({ tone: 'warning', text: `"${t.topic}" is the most-failed topic — ${failed} failed attempts class-wide.` });
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
        topicWeakness: topicResult.rows,
        submissionsTimeline: timelineResult.rows.map(r => ({
          date: r.date.toISOString().split('T')[0],
          count: parseInt(r.count)
        })),
        difficultyDistribution: diffResult.rows,
        verdictDistribution: verdictResult.rows.map(r => ({
          name: r.verdict,
          value: parseInt(r.count) || 0
        })),
        topStudents: topStudentsResult.rows.map(r => ({
          name: r.name,
          solved: parseInt(r.solved) || 0
        })),
        topicMastery: topicMasteryResult.rows.map(r => ({
          topic: r.topic,
          solved: parseInt(r.solved_count) || 0,
          failed: parseInt(r.failed_count) || 0
        })),
        byDepartment: mapCohort(byDept.rows),
        bySection: mapCohort(bySection.rows),
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
    const params = [];
    let where = `u.role = 'student'`;
    if (dept !== null) { params.push(dept); where += ` AND u.department = $${params.length}`; }

    const key = `analytics:cohorts:${dept ?? 'all'}:${dim}`;
    const data = await cached(key, 120, async () => {
      const { rows } = await db.query(
        `SELECT cohort,
                COUNT(*)::int                                          AS students,
                ROUND(AVG(solved))::int                                AS avg_solved,
                CASE WHEN SUM(subs) > 0
                     THEN ROUND(100.0 * SUM(ac) / SUM(subs))::int ELSE 0 END AS ac_rate
           FROM (
             SELECT u.id,
                    COALESCE(u.${dim}::text, 'Unassigned')                    AS cohort,
                    COUNT(DISTINCT CASE WHEN s.verdict='Accepted' THEN s.problem_id END) AS solved,
                    COUNT(s.id)                                               AS subs,
                    SUM(CASE WHEN s.verdict='Accepted' THEN 1 ELSE 0 END)     AS ac
               FROM users u
               LEFT JOIN code_submissions s ON s.user_id = u.id
              WHERE ${where}
              GROUP BY u.id, cohort
           ) t
          GROUP BY cohort
          ORDER BY cohort ASC`,
        params,
      );
      return rows;
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
    const offset = (page - 1) * limit;
    const dept = scopeDept(req);

    // A scoped faculty/HOD may only inspect their own department's cohorts.
    if (dim === 'department' && dept !== null && value !== dept) {
      return res.status(403).json({ success: false, error: 'Outside your department scope.' });
    }

    const params = [value];
    let where = `u.role = 'student' AND COALESCE(u.${dim}::text, 'Unassigned') = $1`;
    if (dept !== null) { params.push(dept); where += ` AND u.department = $${params.length}`; }

    const countRes = await db.query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${where}`, params);
    const total = countRes.rows[0]?.n || 0;

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.roll_no, u.department, u.section, u.year,
              COUNT(DISTINCT CASE WHEN s.verdict='Accepted' THEN s.problem_id END)::int AS solved,
              COUNT(s.id)::int                                                          AS subs,
              SUM(CASE WHEN s.verdict='Accepted' THEN 1 ELSE 0 END)::int                AS ac
         FROM users u
         LEFT JOIN code_submissions s ON s.user_id = u.id
        WHERE ${where}
        GROUP BY u.id
        ORDER BY solved DESC, u.name ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      success: true,
      total,
      page,
      limit,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        rollNo: r.roll_no,
        department: r.department,
        section: r.section,
        year: r.year,
        solved: r.solved,
        acRate: r.subs > 0 ? Math.round((r.ac / r.subs) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error('getCohortStudents error:', error);
    res.status(500).json({ success: false, error: 'Failed to load cohort students' });
  }
};

exports.getStudentDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: [student] } = await db.query(
      `SELECT id, name, email, department, section, year, roll_no, rating, last_login_at, created_at
         FROM users WHERE id = $1 AND role = 'student'`,
      [id]
    );
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
    // Strict department isolation: HOD/faculty may only drill into their own dept.
    if (!canSeeDepartment(req, student.department)) {
      return res.status(403).json({ success: false, error: 'Outside your department scope.' });
    }

    // Learning curve: cumulative distinct problems solved over time
    // (keyed by the date each problem was *first* accepted).
    const { rows: curveRows } = await db.query(`
      SELECT to_char(DATE(first_ac), 'YYYY-MM-DD') AS date, COUNT(*) AS solved
        FROM (
          SELECT problem_id, MIN(submitted_at) AS first_ac
            FROM code_submissions
           WHERE user_id = $1 AND verdict = 'Accepted'
           GROUP BY problem_id
        ) t
       GROUP BY DATE(first_ac) ORDER BY DATE(first_ac) ASC
    `, [id]);
    let cum = 0;
    const learningCurve = curveRows.map(r => {
      cum += parseInt(r.solved) || 0;
      return { date: r.date, solved: cum };
    });

    // Topic mastery for this student: solved vs attempted per tag.
    const { rows: topicRows } = await db.query(`
      SELECT topic,
             COUNT(DISTINCT CASE WHEN verdict = 'Accepted' THEN problem_id END) AS solved,
             COUNT(*) AS attempts
        FROM (
          SELECT unnest(p.tags) AS topic, s.problem_id, s.verdict
            FROM code_submissions s JOIN problems p ON p.id = s.problem_id
           WHERE s.user_id = $1
        ) x
       GROUP BY topic ORDER BY attempts DESC LIMIT 8
    `, [id]);
    const topicBreakdown = topicRows.map(r => ({
      topic: r.topic, solved: parseInt(r.solved) || 0, attempts: parseInt(r.attempts) || 0,
    }));

    // Verdict mix for this student.
    const { rows: verdictRows } = await db.query(`
      SELECT verdict AS name, COUNT(*) AS value
        FROM code_submissions WHERE user_id = $1 AND verdict IS NOT NULL
       GROUP BY verdict ORDER BY value DESC
    `, [id]);

    // Totals.
    const { rows: [totals] } = await db.query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN verdict = 'Accepted' THEN 1 ELSE 0 END) AS accepted,
             COUNT(DISTINCT CASE WHEN verdict = 'Accepted' THEN problem_id END) AS solved
        FROM code_submissions WHERE user_id = $1
    `, [id]);
    const total = parseInt(totals.total) || 0;
    const accepted = parseInt(totals.accepted) || 0;

    res.json({
      success: true,
      data: {
        student: {
          id: student.id, name: student.name, email: student.email,
          department: student.department, section: student.section, year: student.year,
          rollNo: student.roll_no, rating: student.rating, lastLoginAt: student.last_login_at,
          joinedDate: student.created_at,
        },
        totals: {
          total, accepted,
          solved: parseInt(totals.solved) || 0,
          acRate: total ? Math.round((accepted / total) * 100) : 0,
        },
        learningCurve,
        topicBreakdown,
        verdictBreakdown: verdictRows.map(r => ({ name: r.name, value: parseInt(r.value) || 0 })),
      }
    });
  } catch (error) {
    console.error('Student Detail Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch student detail' });
  }
};

// Topic-mastery matrix per cohort, for an overlay radar chart.
// `dim` selects the grouping: department | section | year (whitelisted).
exports.getCohortTopics = async (req, res) => {
  try {
    const ALLOWED = { department: 'department', section: 'section', year: 'year' };
    const dim = ALLOWED[String(req.query.dim || 'department')];
    if (!dim) return res.status(400).json({ success: false, error: 'Invalid dimension' });

    const { rows } = await db.query(`
      SELECT cohort, topic,
             SUM(CASE WHEN verdict = 'Accepted' THEN 1 ELSE 0 END) AS accepted,
             COUNT(*) AS attempts
        FROM (
          SELECT COALESCE(u.${dim}::text, 'Unassigned') AS cohort,
                 unnest(p.tags) AS topic,
                 s.verdict
            FROM code_submissions s
            JOIN users u ON u.id = s.user_id AND u.role = 'student'
            JOIN problems p ON p.id = s.problem_id
        ) x
       GROUP BY cohort, topic
    `);

    // Pick the most-attempted topics (radar axes) and the most-active cohorts (series).
    const topicTotals = {};
    const cohortTotals = {};
    const cell = {}; // `${cohort}|${topic}` -> { accepted, attempts }
    for (const r of rows) {
      const accepted = parseInt(r.accepted) || 0;
      const attempts = parseInt(r.attempts) || 0;
      topicTotals[r.topic] = (topicTotals[r.topic] || 0) + attempts;
      cohortTotals[r.cohort] = (cohortTotals[r.cohort] || 0) + attempts;
      cell[`${r.cohort}|${r.topic}`] = { accepted, attempts };
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
