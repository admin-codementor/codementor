const { Parser } = require('json2csv');
const aiGateway = require('../services/aiGateway');
const { generateVerifiedTestCases } = require('../services/testCaseGenerator');
const { logAction } = require('../middleware/audit');
const { scopeDept, canSeeDepartment, canManageResource, canManageOwnedBy } = require('../middleware/role.middleware');
const { cached, bumpVersion } = require('../utils/cache');
const { computeStrengthsWeaknesses } = require('../utils/topicScores');
const { flagFor, weeklyActivity, funnelFromStats } = require('../utils/studentState');
const examRepo = require('../repositories/examRepository');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const courseRepo = require('../repositories/courseRepository');
const ratingHistoryRepo = require('../repositories/ratingHistoryRepository');
const topicMasteryRepo = require('../repositories/topicMasteryRepository');
const codingProfileRepo = require('../repositories/codingProfileRepository');
const contestRepo = require('../repositories/contestRepository');
const mcqRepo = require('../repositories/mcqRepository');
const analytics = require('../services/analyticsService');
const classTargets = require('../services/classTargets');
const courseAnalyticsService = require('../services/courseAnalyticsService');
const departmentAnalyticsService = require('../services/departmentAnalyticsService');
const departmentLeaderboardService = require('../services/departmentLeaderboardService');
const departmentActivityService = require('../services/departmentActivityService');
const labsService = require('../services/labsService');
const { resolveCourse, percentOf } = require('../utils/courseProgress');
const { attemptsUntilFirstAccept } = require('../utils/attempts');
const { activeStudents, cohortValue } = require('../utils/students');
const { buildAssignmentMarks } = require('../utils/assignmentMarks');
const { extensionsByStudent } = require('../utils/reopen');
const reopenRepo = require('../repositories/reopenRequestRepository');
const departmentInsightsService = require('../services/departmentInsightsService');
const portfolioService = require('../services/portfolioService');
const portfolioRepo = require('../repositories/portfolioRepository');
const submissionRepo = require('../repositories/submissionRepository');
const plagiarismResultRepo = require('../repositories/plagiarismResultRepository');

const problemStatisticsService = require('../services/problemStatisticsService');
const problemTimeRepo = require('../repositories/problemTimeRepository');
const MAX_LESSON = 8000; // characters of teaching text per problem

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

// Absent status means published — see problems.controller.js for why.
const problemStatus = (p) => (p?.status ?? 'published');

// Fetch a problem and confirm the requester may modify it. Admin bypasses; an HOD
// may manage problems authored by staff in their own department (decision D1);
// faculty get only their own. Sends the 404 and returns null when not allowed, so
// callers can `if (!problem) return;`.
async function assertProblemAccess(req, res, problemId) {
  const problem = await problemRepo.getById(problemId);
  if (problem && (await canManageOwnedBy(req, problem.createdBy))) return problem;
  res.status(404).json({ success: false, error: 'Problem not found or not authorized' });
  return null;
}

exports.getDashboardData = async (req, res) => {
  try {
    // Same scope as every analytics screen: a faculty member sees the students in the classes they created,
    // an HOD their own department, an admin everyone. It used to count every student and read every submission
    // in the college on each load, so a teacher saw college-wide totals (and it cost a full collection scan).
    const scope = await analytics.resolveAnalyticsScope(req);
    const snap = await analytics.getSnapshot(scope);

    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const stats = snap.studentStats;
    const totalSubs = stats.reduce((n, s) => n + s.subs, 0);
    const totalAccepted = stats.reduce((n, s) => n + s.ac, 0);
    const dashStats = {
      totalStudents: snap.totalStudents,
      activeStudents: stats.filter((s) => (s.lastActiveMs ?? 0) >= sevenDaysAgo).length,
      totalSubs,
      acRate: totalSubs > 0 ? Math.round((totalAccepted / totalSubs) * 100) : 0,
      problemsSolved: snap.problemStats.filter((p) => p.solvers > 0).length,
    };

    // Assignments: a faculty member's own; an HOD's department's (an HOD authors nothing, so their own list is
    // empty, D1); an admin sees all.
    let assignments;
    if (req.user.role === 'admin') {
      assignments = await assignmentRepo.getAll();
    } else if (req.user.role === 'hod') {
      const dept = req.user.department ?? null;
      const staff = (await userRepo.listByRole('faculty')).filter((u) => dept !== null && (u.department ?? null) === dept);
      const ids = new Set(staff.map((u) => u.id));
      assignments = (await assignmentRepo.getAll()).filter((a) => ids.has(a.facultyId));
    } else {
      assignments = await assignmentRepo.listByFacultyId(req.user.id);
    }
    assignments = assignments
      .sort((a, b) => (a.deadline?.toMillis?.() ?? new Date(a.deadline).getTime()) - (b.deadline?.toMillis?.() ?? new Date(b.deadline).getTime()))
      .map((a) => ({ id: a.id, title: a.title, deadline: a.deadline, created_at: a.createdAt }));

    res.json({ success: true, data: { stats: dashStats, assignments } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Shared validation for assignment create/update. Returns { error } on failure or
// the normalised fields on success.
async function normaliseAssignmentInput({ title, deadline, problem_ids, allowed_cidrs, is_exam, proctored, classroom_ids }, req) {
  if (typeof title !== 'string' || !title.trim() || title.length > 200) {
    return { error: 'Title is required and must be ≤ 200 characters.' };
  }
  if (!deadline || Number.isNaN(new Date(deadline).getTime())) {
    return { error: 'A valid deadline is required.' };
  }
  if (!Array.isArray(problem_ids) || problem_ids.length === 0) {
    return { error: 'Select at least one problem — an assignment with no problems is not usable by students.' };
  }
  if (problem_ids.length > 50) {
    return { error: 'An assignment can hold at most 50 problems.' };
  }

  // Every referenced problem must exist, otherwise students open an assignment
  // whose problems 404. This is the check that was missing when the UI shipped
  // `problem_ids: []` unconditionally.
  const found = await problemRepo.getMapByIds(problem_ids);
  const missing = problem_ids.filter(pid => !found.has(pid));
  if (missing.length) {
    return { error: `Unknown problem id(s): ${missing.slice(0, 3).join(', ')}` };
  }

  // A draft problem 404s for students, so assigning one hands out an assignment
  // that cannot be opened.
  const drafts = problem_ids.filter(pid => (found.get(pid)?.status ?? 'published') === 'draft');
  if (drafts.length) {
    const titles = drafts.slice(0, 3).map(pid => found.get(pid)?.title || pid);
    return {
      error: `These problems are still drafts and aren't visible to students: ${titles.join(', ')}. Publish them first.`,
    };
  }

  const { validateCIDR } = require('../middleware/cidrCheck');
  const cidrs = Array.isArray(allowed_cidrs) ? allowed_cidrs.map(c => String(c).trim()).filter(Boolean) : [];
  for (const cidr of cidrs) {
    if (!validateCIDR(cidr)) return { error: `Invalid CIDR: "${cidr}"` };
  }

  // Class targeting. An EMPTY list means "every student", which is what every
  // assignment created before targeting existed effectively was — so omitting the
  // field keeps the old behaviour rather than silently hiding existing work.
  let classroomIds = [];
  if (Array.isArray(classroom_ids) && classroom_ids.length) {
    classroomIds = [...new Set(classroom_ids.map(String))].slice(0, 50);
    // Only classes the requester may act on — otherwise an assignment could be pushed into another faculty member's class.
    // A class is a classroom of theirs or an academic class they are given (services/classTargets.js).
    const { unknown } = await classTargets.validateTargets(classroomIds, req);
    if (unknown.length) {
      return { error: `Unknown or inaccessible class id(s): ${unknown.slice(0, 3).join(', ')}` };
    }
  }

  return {
    fields: {
      title: title.trim(),
      deadline,
      allowedCidrs: cidrs,
      // Proctoring is off unless the faculty member turns it on. `isExam` is the
      // original name for the same switch and is still written so nothing that
      // reads the old field changes behaviour; `proctored` is what the UI sends
      // now, because "is this an exam?" and "should this be watched?" are the
      // same question for an assignment and the second one is the honest one.
      isExam: proctored === true || is_exam === true,
      proctored: proctored === true || is_exam === true,
      problemIds: [...new Set(problem_ids)],
      classroomIds,
    },
  };
}

exports.createAssignment = async (req, res) => {
  try {
    const { error, fields } = await normaliseAssignmentInput(req.body, req);
    if (error) return res.status(400).json({ success: false, error });

    const assignment = await assignmentRepo.create({ facultyId: req.user.id, ...fields });

    logAction(req, 'assignment.create', `"${fields.title}" (${fields.problemIds.length} problems)`);
    res.json({ success: true, message: 'Assignment created successfully', data: { id: assignment.id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    const { error, fields } = await normaliseAssignmentInput(req.body, req);
    if (error) return res.status(400).json({ success: false, error });

    await assignmentRepo.update(id, fields);

    logAction(req, 'assignment.update', `"${fields.title}" (${fields.problemIds.length} problems)`);
    res.json({ success: true, message: 'Assignment updated', data: { id } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Assignment detail for the edit form — includes the attached problem titles so
// the picker can show what is already selected.
exports.getAssignmentDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    const problemIds = assignment.problemIds || [];
    const problemsMap = await problemRepo.getMapByIds(problemIds);

    // Resolve class names so the builder can show what is already targeted.
    const classroomIds = assignment.classroomIds || [];
    const classes = [];
    for (const cid of classroomIds) {
      const d = await classTargets.describeTarget(cid);
      classes.push({ id: cid, name: d.name, member_count: d.member_count });
    }

    res.json({
      success: true,
      data: {
        id: assignment.id,
        title: assignment.title || '',
        deadline: toISO(assignment.deadline),
        is_exam: !!(assignment.proctored ?? assignment.isExam),
        proctored: !!(assignment.proctored ?? assignment.isExam),
        allowed_cidrs: assignment.allowedCidrs || [],
        classroom_ids: classroomIds,
        classes,
        problems: problemIds.map(pid => ({
          id: pid,
          title: problemsMap.get(pid)?.title || '(deleted problem)',
          difficulty: problemsMap.get(pid)?.difficulty || null,
        })),
      },
    });
  } catch (error) {
    console.error('Get Assignment Detail Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assignment' });
  }
};

// Verify the requester may act on the assignment. Admin bypasses; an HOD may act
// on assignments authored by staff in their own department (decision D1); faculty
// get only their own. Sends a 404 and returns null when not allowed.
async function assertAssignmentAccess(req, res, assignmentId) {
  const assignment = await assignmentRepo.getById(assignmentId);
  if (assignment && (await canManageOwnedBy(req, assignment.facultyId))) return assignment;
  res.status(404).json({ success: false, error: 'Assignment not found' });
  return null;
}

// The students an assignment was set for: the members of its classes, or the caller's department when it names no class
// (an assignment with no class goes to everyone, but a faculty member or HOD only ever sees their own students). Only
// current students; alumni are not part of it.
const { assignmentStudents } = require('../services/assignmentStudentsService');

exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    const targeted = new Set((await assignmentStudents(req, assignment)).map((s) => s.id));
    const deadlineMs = assignment.deadline ? (assignment.deadline.toMillis?.() ?? new Date(assignment.deadline).getTime()) : null;
    const subs = (await Promise.all((assignment.problemIds || []).map(pid => submissionRepo.listByProblem(pid))))
      .flat()
      .filter((s) => targeted.has(s.userId))
      .sort((a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0));

    const usersMap = await userRepo.getAllUsersMap();
    const problemsMap = await problemRepo.getMapByIds(subs.map(s => s.problemId));
    const data = subs.map(s => {
      const profile = usersMap.get(s.userId) || {};
      const ms = s.submittedAt?.toMillis?.() ?? 0;
      return {
        student_name: profile.name || 'Unknown',
        email: profile.email || null,
        problem_title: problemsMap.get(s.problemId)?.title || 'Unknown',
        verdict: s.verdict,
        runtime: s.runtime,
        submitted_at: s.submittedAt?.toDate?.() ?? s.submittedAt,
        on_time: !deadlineMs || !ms || ms <= deadlineMs,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

const STATUS_LABEL = { on_time: 'On time', late: 'Late', not_solved: 'Not solved', not_attempted: 'Not attempted' };

exports.exportMarksCSV = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    const students = (await assignmentStudents(req, assignment)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const subs = (await Promise.all((assignment.problemIds || []).map(pid => submissionRepo.listByProblem(pid)))).flat();
    const plagiarismPairs = await plagiarismResultRepo.listByAssignment(id);
    const flaggedUserIds = new Set(plagiarismPairs.flatMap(p => [p.studentA, p.studentB]));

    // Best mark made on or before the deadline; a later solve is listed as Late and earns no marks. Every student the
    // assignment was set for gets a row for every problem, including those who never submitted (utils/assignmentMarks.js).
    const marks = buildAssignmentMarks({ assignment, students, submissions: subs, extensions: extensionsByStudent(await reopenRepo.listApprovedForAssignment(id)) });
    const problemsMap = await problemRepo.getMapByIds(assignment.problemIds || []);
    const byId = new Map(students.map((st) => [st.id, st]));
    const rows = marks.flatMap((m) => m.problems.map((p) => {
      const profile = byId.get(m.id) || {};
      return {
        'Roll No': profile.rollNo || null,
        'Student Name': profile.name || 'Unknown',
        'Email': profile.email || null,
        'Department': profile.department || null,
        'Section': profile.section || null,
        'Problem': problemsMap.get(p.problemId)?.title || 'Unknown',
        'Score': p.mark,
        'Status': STATUS_LABEL[p.status],
        'Solved At': p.solvedAt ? new Date(p.solvedAt).toISOString().replace('T', ' ').slice(0, 16) : '',
        'Plagiarism Flag': flaggedUserIds.has(m.id) ? 'FLAGGED' : '',
      };
    }));

    const fields = ['Roll No', 'Student Name', 'Email', 'Department', 'Section', 'Problem', 'Score', 'Status', 'Solved At', 'Plagiarism Flag'];
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
    const { title, description, difficulty, tags, test_cases, stubs, lesson,
            scoring_mode, max_score, editorial, editorial_visible_at,
            uses_checker, checker_code, checker_language_id } = req.body;

    if (!title || typeof title !== 'string' || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
    }
    if (description != null && (typeof description !== 'string' || description.length > 20000)) {
      return res.status(400).json({ success: false, error: 'Description must be ≤ 20000 characters.' });
    }
    if (lesson != null && (typeof lesson !== 'string' || lesson.length > MAX_LESSON)) {
      return res.status(400).json({ success: false, error: `Lesson must be ≤ ${MAX_LESSON} characters.` });
    }

    // Only an explicit 'draft' creates a draft. Everything that existed before the
    // lifecycle (the quick dialog, ZIP import, import-commit) keeps publishing
    // directly, so this is additive rather than a behaviour change.
    const status = req.body.status === 'draft' ? 'draft' : 'published';

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
      title, description, difficulty, tags: tags || [], createdBy: req.user.id, stubs: stubsObj, lesson: lesson || null,
      scoringMode: mode, maxScore: mScore, editorial: editorial || null,
      editorialVisibleAt: editorial_visible_at || null,
      usesChecker, checkerCode, checkerLanguageId: checkerLangId,
      timeLimit: 2, memoryLimit: 256, status,
    }, test_cases || []);

    res.json({ success: true, message: 'Problem added successfully', data: { id: problem.id, status } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateProblem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, difficulty, tags, stubs, lesson, scoring_mode, max_score,
            editorial, editorial_visible_at, test_cases,
            uses_checker, checker_code, checker_language_id } = req.body;

    const existing = await assertProblemAccess(req, res, id);
    if (!existing) return;

    const partial = {};
    if (title !== undefined) partial.title = title;
    if (description !== undefined) partial.description = description;
    if (difficulty !== undefined) partial.difficulty = difficulty;
    if (tags !== undefined) partial.tags = tags;
    if (lesson !== undefined) {
      if (lesson !== null && (typeof lesson !== 'string' || lesson.length > MAX_LESSON)) {
        return res.status(400).json({ success: false, error: `Lesson must be ≤ ${MAX_LESSON} characters.` });
      }
      partial.lesson = lesson || null;
    }
    if (stubs && typeof stubs === 'object' && !Array.isArray(stubs)) partial.stubs = stubs;
    if (['acm', 'oi'].includes(scoring_mode)) partial.scoringMode = scoring_mode;
    if (Number.isInteger(max_score) && max_score > 0) partial.maxScore = max_score;
    if (editorial !== undefined) partial.editorial = editorial || null;
    if (editorial_visible_at !== undefined) partial.editorialVisibleAt = editorial_visible_at || null;
    if (typeof uses_checker === 'boolean') partial.usesChecker = uses_checker;
    if (typeof checker_code === 'string') partial.checkerCode = checker_code;
    if (Number.isInteger(checker_language_id) && checker_language_id > 0) partial.checkerLanguageId = checker_language_id;

    await problemRepo.update(id, partial);

    // Test cases used to be silently ignored here, so a problem's tests could
    // never be corrected after creation. `test_cases` is treated as the complete
    // replacement set — omit the key entirely to leave the existing tests alone.
    let testCount;
    if (Array.isArray(test_cases)) {
      const clean = test_cases.filter(
        tc => tc && typeof tc.input === 'string' && typeof tc.output === 'string' && tc.input.trim() && tc.output.trim()
      );
      if (clean.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'A problem needs at least one test case with both input and expected output.',
        });
      }
      await problemRepo.replaceTestCases(id, clean);
      testCount = clean.length;
    }

    logAction(req, 'problem.update', `problem ${id}`);
    res.json({ success: true, message: 'Problem updated', data: { id, test_count: testCount } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertProblemAccess(req, res, id))) return;

    await problemRepo.remove(id);

    logAction(req, 'problem.delete', `problem ${id}`);
    await bumpVersion('courses'); // a deleted problem changes every course's required set
    res.json({ success: true, message: 'Problem deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Expected outputs come from running a reference solution through Judge0, never
// from the model — see services/testCaseGenerator.js for the reasoning. The old
// implementation asked the model for input/output pairs directly, which risked
// marking an entire cohort wrong in the same way.
exports.generateAITestCases = async (req, res) => {
  try {
    const { title, description, count } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'Title and description are required' });
    }

    if (!aiGateway.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'No AI provider is configured. Set GEMINI_API_KEY (or AI_PROVIDER/AI_BASE_URL) and check with: node src/scripts/checkAiKey.js',
      });
    }

    const result = await generateVerifiedTestCases({ title, description, count });

    logAction(req, 'ai.generate-tests', `"${title}" → ${result.testCases.length} verified case(s)`);
    res.json({ success: true, data: result });
  } catch (error) {
    // These are expected outcomes, not crashes: report them precisely so the
    // faculty member knows whether to retry, fix the statement, or start Judge0.
    if (error.code === 'REFERENCE_UNRELIABLE') {
      return res.status(422).json({
        success: false, code: error.code, error: error.message, details: error.details ?? null,
      });
    }
    if (error.code === 'NO_CASES') {
      return res.status(422).json({
        success: false, code: error.code, error: error.message, details: error.details ?? null,
      });
    }
    if (error.code === 'JUDGE0_UNREACHABLE') {
      return res.status(503).json({
        success: false, code: error.code,
        error: 'Judge0 is not reachable, so generated outputs cannot be verified. Start Judge0 and try again.',
      });
    }
    if (error.name === 'AiError') {
      return res.status(error.status && error.status >= 400 && error.status < 600 ? error.status : 502).json({
        success: false, error: `AI provider error: ${error.message}`,
      });
    }
    console.error('AI Test Generation Failed:', error);
    res.status(500).json({ success: false, error: 'Test-case generation failed' });
  }
};

exports.getStudents = async (req, res) => {
  try {
    // A HOD: current students of their own department; an Admin: all. A faculty member: only the students of the classes they are given
    // (their own classrooms and the academic structure), narrowed to one class when the class switcher is used.
    const dept = scopeDept(req);
    const scope = await resolveAnalyticsScope(req);
    const allStudents = await userRepo.getMapByRole('student');
    const studentsMap = new Map(activeStudents([...allStudents.values()])
      .filter((s) => (scope.memberIds ? scope.memberIds.has(s.id) : (dept === null || (s.department || null) === dept)))
      .map((s) => [s.id, s]));
    const studentIds = [...studentsMap.keys()];
    if (studentIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const allSubs = await submissionRepo.listAllForAnalytics(); // not listAll(): that downloads every student's source code
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

// Shared by the Dashboard card and the Analytics Pulse tab (getAnalyticsAtRisk
// below) — same scope resolution, same cache entry, same risk definition.
// Previously this scanned every student in the system with no department
// filter at all, so an HOD or faculty saw other departments' at-risk students
// too; resolveAnalyticsScope fixes that the same way every other analytics
// endpoint is scoped.
exports.getAtRiskStudents = async (req, res) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const data = await analytics.getAtRiskList(scope);
    res.json({ success: true, data });
  } catch (error) {
    console.error('At-Risk Students Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch at-risk students' });
  }
};

// Same data as getAtRiskStudents (shared cache, shared scope resolution) —
// kept as its own route under /analytics so it lives alongside the rest of
// the Analytics page's endpoints rather than the Dashboard's.
exports.getAnalyticsAtRisk = async (req, res) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const data = await analytics.getAtRiskList(scope);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics at-risk error:', error);
    res.status(500).json({ success: false, error: 'Failed to load at-risk analytics.' });
  }
};

// The one shared top-performers ranking (analytics.getTopPerformers), also
// used by the PDF class report below. getClassAnalytics's own topStudents
// field is left alone — it has no frontend caller (dead code).
exports.getTopPerformers = async (req, res) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const data = await analytics.getTopPerformers(scope, limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Top performers error:', error);
    res.status(500).json({ success: false, error: 'Failed to load top performers.' });
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

    if (!(await assertProblemAccess(req, res, id))) return;

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
    // Admins and HODs get catalogue-wide visibility for oversight (decision D1);
    // faculty see their own. Editing someone else's is still gated separately by
    // assertProblemAccess, so `canEdit` tells the UI which rows are actionable.
    const seesAll = req.user.role === 'admin' || req.user.role === 'hod';
    const all = await problemRepo.getAll();
    const visible = seesAll ? all : all.filter(p => p.createdBy === req.user.id);

    const [subsPerProblem, usersMap] = await Promise.all([
      Promise.all(visible.map(p => submissionRepo.listByProblem(p.id))),
      seesAll ? userRepo.getAllUsersMap() : Promise.resolve(new Map()),
    ]);

    const problems = visible
      .map((p, i) => {
        const subs = subsPerProblem[i];
        const total = subs.length;
        const accepted = subs.filter(s => s.verdict === 'Accepted').length;
        const owner = usersMap.get(p.createdBy);
        return {
          id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [], created_at: p.createdAt,
          totalSubmissions: total,
          acceptedCount: accepted,
          acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
          status: problemStatus(p),
          author: p.createdBy === req.user.id ? 'You' : (owner?.name || null),
          canEdit: p.createdBy === req.user.id
            || req.user.role === 'admin'
            || canManageResource(req, p.createdBy, owner?.department ?? null),
        };
      })
      .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));

    res.json({ success: true, data: problems });
  } catch (error) {
    console.error('Get Faculty Problems Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch problems' });
  }
};

// Question bank: every reusable item in one place, with how often each is used.
// @route GET /api/faculty/question-bank
//
// The point is reuse. Faculty were re-typing problems that already existed because
// nothing showed them the catalogue with enough context to judge "can I use this?"
// — so this returns usage counts (assignments, contests, submissions) alongside the
// filterable metadata, plus MCQ questions from every test they can see.
exports.getQuestionBank = async (req, res) => {
  try {
    const seesAll = req.user.role === 'admin' || req.user.role === 'hod';

    const [allProblems, assignments, contests, usersMap] = await Promise.all([
      problemRepo.getAll(),
      assignmentRepo.getAll(),
      contestRepo.listAll(),
      userRepo.getAllUsersMap(),
    ]);

    // Count references once, rather than per problem.
    const assignmentUse = new Map();
    for (const a of assignments) {
      for (const pid of a.problemIds || []) {
        assignmentUse.set(pid, (assignmentUse.get(pid) || 0) + 1);
      }
    }
    const contestUse = new Map();
    for (const c of contests) {
      for (const pid of c.problemIds || []) {
        contestUse.set(pid, (contestUse.get(pid) || 0) + 1);
      }
    }

    const visibleProblems = seesAll ? allProblems : allProblems.filter(p => p.createdBy === req.user.id);

    const problems = await Promise.all(visibleProblems.map(async (p) => {
      const owner = usersMap.get(p.createdBy);
      const testCount = (await problemRepo.getTestCases(p.id)).length;
      return {
        kind: 'problem',
        id: p.id,
        title: p.title,
        difficulty: (p.difficulty || 'easy').toLowerCase(),
        tags: p.tags || [],
        status: problemStatus(p),
        test_case_count: testCount,
        used_in_assignments: assignmentUse.get(p.id) || 0,
        used_in_contests: contestUse.get(p.id) || 0,
        author: p.createdBy === req.user.id ? 'You' : (owner?.name || null),
        can_edit: p.createdBy === req.user.id
          || req.user.role === 'admin'
          || canManageResource(req, p.createdBy, owner?.department ?? null),
        created_at: p.createdAt,
      };
    }));

    // MCQ questions, flattened out of their tests so they can be browsed by topic.
    const tests = seesAll ? await mcqRepo.listAll() : await mcqRepo.listByFaculty(req.user.id);
    const mcqQuestions = [];
    for (const t of tests) {
      const qs = await mcqRepo.getQuestions(t.id);
      for (const q of qs) {
        mcqQuestions.push({
          kind: 'mcq',
          id: q.id,
          test_id: t.id,
          test_title: t.title,
          title: q.questionText,
          topic: q.topic || null,
          category: t.category,
          marks: q.marks ?? 1,
          option_count: (q.options || []).length,
          is_published: !!t.isPublished,
          author: t.facultyId === req.user.id ? 'You' : (usersMap.get(t.facultyId)?.name || null),
        });
      }
    }

    problems.sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));

    res.json({
      success: true,
      data: {
        problems,
        mcqQuestions,
        summary: {
          problems: problems.length,
          publishedProblems: problems.filter(p => p.status === 'published').length,
          unusedProblems: problems.filter(p => p.used_in_assignments === 0 && p.used_in_contests === 0).length,
          mcqQuestions: mcqQuestions.length,
          tests: tests.length,
        },
      },
    });
  } catch (error) {
    console.error('Question bank error:', error);
    res.status(500).json({ success: false, error: 'Could not load the question bank.' });
  }
};

// Publish or unpublish a problem.
// @route PATCH /api/faculty/problems/:id/status   { status: 'draft' | 'published' }
//
// Publishing is gated on the problem actually being gradeable. Unpublishing is
// always allowed — pulling a broken problem back must never be blocked.
exports.setProblemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const target = req.body?.status;
    if (target !== 'draft' && target !== 'published') {
      return res.status(400).json({ success: false, error: "status must be 'draft' or 'published'." });
    }

    const problem = await assertProblemAccess(req, res, id);
    if (!problem) return;

    if (target === 'published') {
      const testCases = await problemRepo.getTestCases(id);
      const complete = testCases.filter(t => String(t.inputData ?? '').trim() && String(t.expectedOutput ?? '').trim());
      const missing = [];
      if (!problem.title?.trim()) missing.push('a title');
      if (!problem.description?.trim()) missing.push('a problem statement');
      if (complete.length === 0) missing.push('at least one complete test case');
      if (missing.length) {
        return res.status(422).json({
          success: false,
          code: 'INCOMPLETE',
          error: `This problem still needs ${missing.join(', ')} before students can see it.`,
        });
      }
    }

    await problemRepo.update(id, { status: target });

    // Unpublishing is allowed unconditionally, but if the problem is already in an
    // assignment the faculty member needs to know students just lost access to it.
    let warnings = [];
    if (target === 'draft') {
      const affected = (await assignmentRepo.getAll())
        .filter(a => (a.problemIds || []).includes(id))
        .map(a => a.title);
      if (affected.length) {
        warnings.push(
          `This problem is used by ${affected.length} assignment(s): ${affected.slice(0, 3).join(', ')}. Students can no longer open it there.`,
        );
      }
    }

    logAction(req, 'problem.status', `problem ${id} → ${target}`);
    await bumpVersion('courses'); // a draft problem is not required, a published one is
    res.json({ success: true, data: { id, status: target, warnings } });
  } catch (error) {
    console.error('Set problem status error:', error);
    res.status(500).json({ success: false, error: 'Could not change the problem status.' });
  }
};

// Full problem detail (including test cases) for the authoring form. Without this
// the edit dialog only had the list row's title/difficulty/tags and blanked the
// statement, tests, stubs, editorial and checker every time it opened.
exports.getProblemDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const problem = await assertProblemAccess(req, res, id);
    if (!problem) return;

    const testCases = await problemRepo.getTestCases(id);

    res.json({
      success: true,
      data: {
        id: problem.id,
        title: problem.title || '',
        description: problem.description || '',
        status: problemStatus(problem),
        difficulty: (problem.difficulty || 'easy').toLowerCase(),
        tags: problem.tags || [],
        stubs: problem.stubs || {},
        lesson: problem.lesson || '',
        scoring_mode: problem.scoringMode || 'acm',
        max_score: problem.maxScore ?? 100,
        editorial: problem.editorial || '',
        editorial_visible_at: problem.editorialVisibleAt || '',
        uses_checker: !!problem.usesChecker,
        checker_code: problem.checkerCode || '',
        checker_language_id: problem.checkerLanguageId ?? null,
        time_limit: problem.timeLimit ?? 2,
        memory_limit: problem.memoryLimit ?? 256,
        test_cases: testCases.map(tc => ({
          input: tc.inputData ?? '',
          output: tc.expectedOutput ?? '',
          is_public: !!tc.isPublic,
          score: tc.score ?? 0,
        })),
      },
    });
  } catch (error) {
    console.error('Get Problem Detail Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch problem' });
  }
};

exports.getAssignmentProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assertAssignmentAccess(req, res, id);
    if (!assignment) return;

    // The problems, in the order the assignment lists them.
    const assignmentProblemsMap = await problemRepo.getMapByIds(assignment.problemIds || []);
    const problems = [...new Set(assignment.problemIds || [])]
      .map((pid) => assignmentProblemsMap.get(pid))
      .filter(Boolean)
      .map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty }));

    // Only the students this assignment was set for (not every student in the college).
    const students = (await assignmentStudents(req, assignment)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const subs = (await Promise.all((assignment.problemIds || []).map(pid => submissionRepo.listByProblem(pid)))).flat();
    const marks = new Map(buildAssignmentMarks({ assignment, students, submissions: subs, extensions: extensionsByStudent(await reopenRepo.listApprovedForAssignment(id)) }).map((m) => [m.id, m]));

    const progress = students.map((student) => {
      const m = marks.get(student.id);
      const byProblem = new Map(m.problems.map((p) => [p.problemId, p]));
      return {
        student: { id: student.id, name: student.name, email: student.email, rollNo: student.rollNo || null },
        solved: problems.filter((p) => ['on_time', 'late'].includes(byProblem.get(p.id)?.status)).length,
        solved_on_time: problems.filter((p) => byProblem.get(p.id)?.status === 'on_time').length,
        solved_late: problems.filter((p) => byProblem.get(p.id)?.status === 'late').length,
        total: problems.length,
        problems: problems.map((p) => {
          const status = byProblem.get(p.id)?.status || 'not_attempted';
          return { id: p.id, title: p.title, solved: status === 'on_time' || status === 'late', status };
        }),
      };
    });

    res.json({ success: true, data: { problems, progress } });
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
        const label = cohortValue(studentsMap.get(id) || {}, dim);
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

// Moved to analyticsService.js (resolveAnalyticsScope) so pdfExport.controller.js
// can share the exact same scoping instead of exportClassReport reading every
// student in the system unconditionally.
const { resolveAnalyticsScope } = analytics;

// Per-student deep-dive: learning curve, topic mastery radar, verdict mix, totals.
// ── Analytics overview: institution / department level ────────────────────────
// Everything here comes from one cached snapshot (services/analyticsService.js)
// rather than a full-collection read per panel.
//
// The deliberate emphasis is on *distributions* over averages: a cohort mean of
// "12 solved" reads the same whether every student solved 12, or half solved 24
// and half solved none — and those need opposite responses from a lecturer.
exports.getAnalyticsOverview = async (req, res) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const dimension = analytics.COHORT_DIMS[req.query.dimension] ? req.query.dimension : 'department';
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 365);

    const snap = await analytics.getSnapshot(scope);

    const now = Date.now();
    const windowStart = now - days * analytics.DAY_MS;
    const prevStart = windowStart - days * analytics.DAY_MS;

    const inRange = (d, from, to) => {
      const ms = new Date(`${d}T00:00:00Z`).getTime();
      return ms >= from && ms < to;
    };
    const current = snap.perDay.filter((d) => inRange(d.date, windowStart, now + analytics.DAY_MS));
    const previous = snap.perDay.filter((d) => inRange(d.date, prevStart, windowStart));

    const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);
    const rate = (rows) => (sum(rows, 'subs') ? Math.round((sum(rows, 'ac') / sum(rows, 'subs')) * 100) : 0);

    // "Active in the window" = last activity falls inside it, which is exactly
    // equivalent to "submitted at least once in the window".
    //
    // The same trick does NOT work for the previous window: a student active in
    // both periods has their lastActive in the current one, so a previous-period
    // count would undercount. Rather than show a wrong arrow, this KPI has no
    // delta — computing one honestly needs per-day membership the snapshot
    // deliberately doesn't carry (it would not fit in the cache at scale).
    const activeInWindow = snap.studentStats.filter((s) => s.lastActiveMs && s.lastActiveMs >= windowStart).length;

    // A trend is only meaningful with something to compare against.
    const delta = (cur, prev) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 100));

    const cohorts = analytics.cohortsFrom(snap, dimension);
    const solvedValues = snap.studentStats.map((s) => s.solved);

    res.json({
      success: true,
      data: {
        scope: {
          department: scope.dept, dimension, days, generatedAt: snap.generatedAt,
          ownClasses: scope.ownClasses, classroomCount: scope.classroomCount ?? null,
        },
        kpis: {
          submissions: { value: sum(current, 'subs'), delta: delta(sum(current, 'subs'), sum(previous, 'subs')) },
          acRate: { value: rate(current), delta: delta(rate(current), rate(previous)) },
          activeStudents: { value: activeInWindow, delta: null },
          totalStudents: { value: snap.totalStudents, delta: null },
          engagedStudents: {
            value: snap.studentStats.filter((s) => s.subs > 0).length,
            delta: null,
          },
        },
        // Sparkline + trend series.
        daily: current.map((d) => ({ date: d.date, subs: d.subs, ac: d.ac, activeUsers: d.activeUsers })),
        // day × hour rhythm — when work actually happens.
        activityByDayHour: snap.dayHour,
        verdicts: snap.verdicts,
        languages: snap.languages,
        cohorts,
        // Where every student in view stands: not started / practising / stuck / gone quiet.
        funnel: funnelFromStats(snap.studentStats, now),
        // The class-wide shape the averages hide.
        solvedHistogram: analytics.histogram(solvedValues, 5),
        solvedDistribution: analytics.boxStats(solvedValues),
        // One dot per student: effort against success, for spotting quadrants.
        studentScatter: snap.studentStats
          .filter((s) => s.subs > 0)
          .map((s) => ({
            id: s.id, name: s.name, x: s.subs, y: s.acRate, solved: s.solved,
            cohort: cohortValue(s, analytics.COHORT_DIMS[dimension]),
          })),
        hardestProblems: snap.problemStats
          .filter((p) => p.attempters >= 2)
          .sort((a, b) => a.solveRate - b.solveRate)
          .slice(0, 10),
        mostAttempted: snap.problemStats.slice(0, 10),
      },
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to load analytics.' });
  }
};

// ── Analytics: one cohort in depth ────────────────────────────────────────────
exports.getCohortDetail = async (req, res) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const dimension = analytics.COHORT_DIMS[req.query.dimension] ? req.query.dimension : 'department';
    const dim = analytics.COHORT_DIMS[dimension];
    const value = String(req.query.value ?? 'Unassigned');

    // Blocked for anyone with a department boundary — HOD/admin because their
    // scope IS the department, and faculty too: a faculty member's classroom
    // roster is normally their own students, but classes can be
    // interdisciplinary (electives, combined sections), so a colleague's
    // department name is never a safe value to request explicitly even if the
    // snapshot itself would come back empty.
    if (dimension === 'department' && scope.dept !== null && value !== scope.dept) {
      return res.status(403).json({ success: false, error: 'Outside your department scope.' });
    }

    const snap = await analytics.getSnapshot(scope);
    const members = snap.studentStats.filter((s) => cohortValue(s, dim) === String(value));
    if (members.length === 0) {
      return res.json({ success: true, data: { cohort: value, students: [], empty: true } });
    }

    // Topic mastery is per-student and small, so it is fetched only for the
    // cohort being inspected rather than for everyone in the snapshot.
    const masteryByTopic = new Map();
    await Promise.all(members.map(async (m) => {
      const rows = await topicMasteryRepo.listByUser(m.id);
      for (const r of rows) {
        const topic = r.topic || 'general';
        if (!masteryByTopic.has(topic)) masteryByTopic.set(topic, { attempts: 0, solved: 0, students: new Set() });
        const t = masteryByTopic.get(topic);
        // The mastery document stores solvedCount (distinct problems solved) and failedCount; it has no
        // "attempts" or "solved" fields, which is why this card used to read 0 for every topic.
        t.attempts += (r.solvedCount ?? 0) + (r.failedCount ?? 0);
        t.solved += r.solvedCount ?? 0;
        t.students.add(m.id);
      }
    }));

    const solved = members.map((m) => m.solved);

    // Same at-risk definition as the Dashboard card and the Analytics Pulse
    // tab (analytics.getAtRiskList) — this call hits the shared 120s cache
    // rather than recomputing, so it costs nothing extra once any of those
    // three have run recently.
    const riskReasonsById = new Map((await analytics.getAtRiskList(scope)).map((s) => [s.id, s.riskReasons]));

    res.json({
      success: true,
      data: {
        cohort: value,
        dimension,
        size: members.length,
        summary: {
          active: members.filter((m) => m.subs > 0).length,
          solvedDistribution: analytics.boxStats(solved),
          acRate: (() => {
            const s = members.reduce((a, m) => a + m.subs, 0);
            const a = members.reduce((x, m) => x + m.ac, 0);
            return s ? Math.round((a / s) * 100) : 0;
          })(),
        },
        funnel: funnelFromStats(members),
        solvedHistogram: analytics.histogram(solved, 5),
        topicMastery: [...masteryByTopic.entries()]
          .map(([topic, t]) => ({
            topic,
            accuracy: t.attempts ? Math.round((t.solved / t.attempts) * 100) : 0,
            attempts: t.attempts,
            students: t.students.size,
          }))
          .sort((a, b) => b.attempts - a.attempts)
          .slice(0, 8),
        students: members
          .map((m) => ({
            ...m,
            // Surfaced as chips so "at risk" is explainable, not a black box.
            riskReasons: riskReasonsById.get(m.id) || [],
          }))
          .sort((a, b) => b.riskReasons.length - a.riskReasons.length || a.solved - b.solved),
      },
    });
  } catch (error) {
    console.error('Cohort detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to load cohort analytics.' });
  }
};

// ── Analytics: one problem in depth ───────────────────────────────────────────
// The funnel is the useful part: it separates "nobody tried" from "everybody
// tried and failed", which look identical in a solve-rate number.
exports.getProblemAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const problem = await problemRepo.getById(id);
    if (!problem) return res.status(404).json({ success: false, error: 'Problem not found' });

    const scope = await resolveAnalyticsScope(req);
    const [snap, subs, testCases] = await Promise.all([
      analytics.getSnapshot(scope),
      submissionRepo.listByProblem(id),
      problemRepo.getTestCases(id),
    ]);

    const inScope = new Set(snap.studentStats.map((s) => s.id));
    const mine = subs.filter((s) => inScope.has(s.userId));

    const attemptsByUser = new Map();
    const timesByUser = new Map();
    const firstSub = new Map();
    const firstAc = new Map();
    for (const s of mine) {
      attemptsByUser.set(s.userId, (attemptsByUser.get(s.userId) || 0) + 1);
      const ms = analytics.toMillis(s.submittedAt);
      timesByUser.set(s.userId, [...(timesByUser.get(s.userId) || []), ms]);
      if (!firstSub.has(s.userId) || ms < firstSub.get(s.userId)) firstSub.set(s.userId, ms);
      if (s.verdict === 'Accepted' && (!firstAc.has(s.userId) || ms < firstAc.get(s.userId))) firstAc.set(s.userId, ms);
    }

    // Submissions up to the first accepted one, not every submission the student ever made (utils/attempts.js).
    const attemptsToSolve = [...firstAc.entries()].map(([u, ac]) => attemptsUntilFirstAccept(timesByUser.get(u) || [], ac) ?? attemptsByUser.get(u) ?? 1);
    const timeToSolveMin = [...firstAc.entries()]
      .map(([u, ac]) => Math.round((ac - (firstSub.get(u) ?? ac)) / 60000))
      .filter((m) => m >= 0);

    // Per-test failure hotspots, from the latest attempt of each student.
    const withResults = mine.filter((s) => Array.isArray(s.testResults))
      .sort((a, b) => analytics.toMillis(b.submittedAt) - analytics.toMillis(a.submittedAt));
    const latestPerUser = new Map();
    for (const s of withResults) if (!latestPerUser.has(s.userId)) latestPerUser.set(s.userId, s);
    const attempts = [], failures = [];
    for (const s of latestPerUser.values()) {
      s.testResults.forEach((passed, i) => {
        attempts[i] = (attempts[i] || 0) + 1;
        if (!passed) failures[i] = (failures[i] || 0) + 1;
      });
    }
    const publicCount = testCases.filter((t) => t.isPublic).length;

    const verdictCounts = new Map();
    for (const s of mine) verdictCounts.set(s.verdict || 'Unknown', (verdictCounts.get(s.verdict || 'Unknown') || 0) + 1);

    res.json({
      success: true,
      data: {
        problem: { id, title: problem.title, difficulty: (problem.difficulty || 'easy').toLowerCase(), tags: problem.tags || [] },
        // Strictly nested stages — each is a subset of the one above, so the shape
        // is readable as a funnel. "Needed more than one attempt" is NOT a stage
        // (most students who solve do it first try, so it isn't between attempted
        // and solved); it's reported separately below as a struggle signal.
        funnel: [
          { stage: 'In scope', value: snap.totalStudents },
          { stage: 'Attempted', value: attemptsByUser.size },
          { stage: 'Solved', value: firstAc.size },
        ],
        summary: {
          submissions: mine.length,
          attempters: attemptsByUser.size,
          solvers: firstAc.size,
          solveRate: attemptsByUser.size ? Math.round((firstAc.size / attemptsByUser.size) * 100) : 0,
          // Struggle signals, deliberately outside the funnel.
          neededMultipleAttempts: attemptsToSolve.filter((n) => n > 1).length, // solvers who needed more than one try
          gaveUp: [...attemptsByUser.keys()].filter((u) => !firstAc.has(u)).length,
          attemptsToSolve: analytics.boxStats(attemptsToSolve),
          timeToSolveMinutes: analytics.boxStats(timeToSolveMin),
        },
        attemptsHistogram: analytics.histogram(attemptsToSolve, 1),
        verdicts: [...verdictCounts.entries()].map(([verdict, count]) => ({ verdict, count })).sort((a, b) => b.count - a.count),
        testHeatmap: attempts.map((att, i) => ({
          testIndex: i + 1,
          isPublic: i < publicCount,
          attempts: att,
          failures: failures[i] || 0,
          failRate: att ? Math.round(((failures[i] || 0) / att) * 100) : 0,
        })),
        studentsAnalyzed: latestPerUser.size,
      },
    });
  } catch (error) {
    console.error('Problem analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load problem analytics.' });
  }
};

// ── Analytics: MCQ item analysis ──────────────────────────────────────────────
// Difficulty index (p) against discrimination index (D). D is the classic
// upper-third minus lower-third split: a question everyone gets right, or that
// strong and weak students answer identically, teaches nothing about who knows
// the material — regardless of how reasonable it looks to the author.
exports.getMcqItemAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const test = await mcqRepo.getById(id);
    if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
    if (!(await canManageOwnedBy(req, test.facultyId)) && req.user.role !== 'hod' && req.user.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    const [questions, attempts] = await Promise.all([
      mcqRepo.getQuestions(id),
      mcqRepo.listSubmittedAttempts(id),
    ]);

    if (attempts.length === 0) {
      return res.json({ success: true, data: { test: { id, title: test.title }, items: [], attempts: 0, empty: true } });
    }

    const ranked = [...attempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const groupSize = Math.max(1, Math.floor(ranked.length / 3));
    const upper = ranked.slice(0, groupSize);
    const lower = ranked.slice(-groupSize);

    const correctIn = (group, q) => group.filter((a) => (a.responses || {})[q.id] === q.correctIndex).length;

    const items = questions.map((q, i) => {
      const answered = attempts.filter((a) => (a.responses || {})[q.id] != null).length;
      const correct = attempts.filter((a) => (a.responses || {})[q.id] === q.correctIndex).length;
      const p = attempts.length ? correct / attempts.length : 0;
      const d = groupSize ? (correctIn(upper, q) - correctIn(lower, q)) / groupSize : 0;

      // Standard interpretation bands from classical test theory.
      let flag = null;
      if (p >= 0.95) flag = 'too easy — nearly everyone got it';
      else if (p <= 0.1) flag = 'too hard, or the keyed answer may be wrong';
      else if (d < 0.1) flag = 'does not separate strong from weak students';
      else if (d < 0.2) flag = 'only weakly separates strong from weak students';

      return {
        id: q.id,
        position: i + 1,
        question_text: q.questionText,
        topic: q.topic || null,
        answered,
        correct,
        difficultyIndex: Math.round(p * 100) / 100,
        discriminationIndex: Math.round(d * 100) / 100,
        flag,
      };
    });

    res.json({
      success: true,
      data: {
        test: { id, title: test.title, category: test.category },
        attempts: attempts.length,
        groupSize,
        items,
        problematic: items.filter((i) => i.flag).length,
      },
    });
  } catch (error) {
    console.error('MCQ item analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to analyse this test.' });
  }
};

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
        const cohort = cohortValue(studentsMap.get(id) || {}, dim);
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
    let students = [...studentsMap.values()].filter(s => cohortValue(s, dim) === String(value));
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
    // And a faculty member only a student of their own classes (not every student of the department).
    if (req.user.role === 'faculty') {
      const own = await resolveAnalyticsScope(req, { ignoreClassFilter: true });
      if (!own.memberIds.has(id)) return res.status(403).json({ success: false, code: 'STUDENT_NOT_YOURS', error: 'That student is not in one of your classes.' });
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
  const [subs, ratingRows, masteryRes, codingProfilesRes, allExams, allCourses, portfolioItems] = await Promise.all([
    submissionRepo.listByUser(id),
    ratingHistoryRepo.listByUser(id),
    topicMasteryRepo.listByUser(id),
    codingProfileRepo.listByUser(id),
    examRepo.listPublished(),
    courseRepo.listAll(),
    portfolioRepo.listByUser(id),
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
  const attemptedProblemIds = new Set(subs.map(s => s.problemId));

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

  // ── Week-over-week activity (HOD review: the weekly review loop) ──────────
  const weekly = weeklyActivity(subs, 8);

  // ── Traffic-light flag, same rules the department funnel uses ─────────────
  const lastActiveMs = subs.length ? Math.max(...subs.map(subMillis)) : 0;
  const status = flagFor({
    subs: total,
    solved: solvedProblemIds.size,
    acRate: total ? Math.round((accepted / total) * 100) : 0,
    lastActiveMs,
  });

  // ── Exam history: every published exam this student has an attempt on ─────
  const examRows = await Promise.all(allExams.map(async (e) => {
    const attempt = await examRepo.getAttempt(e.id, id);
    if (!attempt) return null;
    const startedMs = attempt.startedAt?.toMillis?.() ?? 0;
    const submittedMs = attempt.submittedAt?.toMillis?.() ?? 0;
    return {
      id: e.id,
      title: e.title,
      submitted: !!attempt.submittedAt,
      score: attempt.score ?? null,
      total: attempt.total ?? null,
      // Derived, not stored: the attempt keeps both timestamps, so this is the
      // honest elapsed time rather than an estimate.
      minutes_taken: startedMs && submittedMs ? Math.max(0, Math.round((submittedMs - startedMs) / 60000)) : null,
      submitted_at: toISO(attempt.submittedAt),
    };
  }));
  const exams = examRows.filter(Boolean).sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''));
  const scoredExams = exams.filter((e) => e.submitted && e.total);
  const examSummary = {
    taken: exams.filter((e) => e.submitted).length,
    available: allExams.length,
    avg_percent: scoredExams.length
      ? Math.round(scoredExams.reduce((n, e) => n + (e.score / e.total) * 100, 0) / scoredExams.length)
      : null,
  };

  // ── Course progress: same definition as the course analytics and the student's own page ──
  // Required problems = distinct, existing, published problems (utils/courseProgress.js), so a problem that sits in
  // two modules counts once and a deleted one cannot hold the student below 100%.
  const courses = [];
  // Active time per course from the timer (zero for courses worked on before it existed).
  const courseSeconds = new Map((await problemTimeRepo.listCourseTimesByUser(student.id)).map((t) => [t.courseId, t.seconds || 0]));
  const publishedCourses = allCourses.filter((c) => c.isPublished);
  const modulesByCourse = await Promise.all(publishedCourses.map((c) => courseRepo.getModules(c.id)));
  const courseProblems = await problemRepo.getMapByIds([...new Set(modulesByCourse.flatMap((ms) => ms.flatMap((m) => m.problemIds || [])))]);
  publishedCourses.forEach((c, i) => {
    const { units: resolvedUnits, problems: required } = resolveCourse(modulesByCourse[i], courseProblems);
    if (required.size === 0) return;
    const units = resolvedUnits.map((m) => ({
      id: m.id,
      title: m.title,
      total: m.problemIds.length,
      solved: m.problemIds.filter((pid) => solvedProblemIds.has(pid)).length,
      attempted: m.problemIds.filter((pid) => attemptedProblemIds.has(pid)).length,
    }));
    const solvedCount = [...required].filter((pid) => solvedProblemIds.has(pid)).length;
    courses.push({
      id: c.id,
      title: c.title,
      total: required.size,
      solved: solvedCount,
      percent: percentOf(solvedCount, required.size),
      time_seconds: courseSeconds.get(c.id) ?? 0,
      // "Pending" is what the faculty member actually acts on: units started
      // but not finished, plus units never touched. An empty unit has nothing to do.
      pending_units: units.filter((u) => u.total > 0 && u.solved < u.total).length,
      units,
    });
  });
  courses.sort((a, b) => b.percent - a.percent || a.title.localeCompare(b.title));

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
      attempted: attemptedProblemIds.size,
      // Days with any submission in the last 12 months. Real active time per course is in courses[].time_seconds
      // (recorded by the problem timer since it was switched on).
      activeDays: activityHeatmap.length,
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
    weekly,
    status,
    exams,
    examSummary,
    courses,
    portfolio: portfolioItems.map((i) => ({
      id: i.id, type: i.type, title: i.title, detail: i.detail || '', date: i.date || null, link: i.link || null,
    })),
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
      const cohort = cohortValue(studentsMap.get(r.userId) || {}, dim);
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

// ── Courses & modules: the student practice catalogue ─────────────────────────
// A course is a curated, free-browsing (not gated/sequential) collection of
// modules, each an ordered list of existing problems. Shared and visible to
// every faculty/HOD/admin (like the question bank) rather than siloed per
// creator, since a curriculum is meant to be a collaborative resource — but
// editing an existing course is still ownership-gated the same way problems
// are (creator, or HOD in the same department, or admin).

// @route GET /api/faculty/courses
exports.getFacultyCourses = async (req, res) => {
  try {
    const [courses, usersMap] = await Promise.all([
      courseRepo.listAll(),
      userRepo.getAllUsersMap(),
    ]);
    const data = await Promise.all(courses.map(async (c) => {
      const modules = await courseRepo.getModules(c.id);
      const problemCount = new Set(modules.flatMap((m) => m.problemIds || [])).size;
      const owner = usersMap.get(c.createdBy);
      return {
        id: c.id,
        title: c.title,
        description: c.description || '',
        isPublished: !!c.isPublished,
        moduleCount: modules.length,
        problemCount,
        // null (not 'Unknown') for platform-seeded courses that were never
        // attributed to a real user — the frontend omits the "by ..." line
        // rather than printing a placeholder that reads as a data bug.
        author: owner?.name || null,
        canEdit: c.createdBy === req.user.id || req.user.role === 'admin'
          || canManageResource(req, c.createdBy, owner?.department ?? null),
      };
    }));
    data.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Get Faculty Courses Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch courses' });
  }
};

// @route GET /api/faculty/courses/:id — full detail for the authoring view,
// draft or published (unlike the student-facing GET /api/courses/:id).
exports.getFacultyCourseDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await courseRepo.getById(id);
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });

    const [modules, owner] = await Promise.all([
      courseRepo.getModules(id),
      course.createdBy ? userRepo.getById(course.createdBy, 'faculty') : null,
    ]);
    const allProblemIds = [...new Set(modules.flatMap((m) => m.problemIds || []))];
    const problemsMap = await problemRepo.getMapByIds(allProblemIds);

    res.json({
      success: true,
      data: {
        id: course.id,
        title: course.title,
        description: course.description || '',
        isPublished: !!course.isPublished,
        canEdit: course.createdBy === req.user.id || req.user.role === 'admin'
          || canManageResource(req, course.createdBy, owner?.department ?? null),
        modules: modules.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description || '',
          dueAt: toISO(m.dueAt),
          opensAt: toISO(m.opensAt),
          problems: (m.problemIds || [])
            .map((pid) => problemsMap.get(pid))
            .filter(Boolean)
            .map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [] })),
        })),
      },
    });
  } catch (error) {
    console.error('Get Faculty Course Detail Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch course' });
  }
};

// @route GET /api/faculty/department?section=&year=
// HOD/department dashboard: student-state funnel, flags, section comparison,
// badge ladder and written insights. Department comes from the caller's token
// (scopeDept), never the query string.
// @route GET /api/faculty/department/activity?kind=students|faculty&days=7|30|90 (HOD/admin)
exports.getDepartmentActivity = async (req, res) => {
  try {
    const data = await departmentActivityService.getDepartmentActivity(req, {
      kind: req.query.kind, days: parseInt(req.query.days, 10) || 7,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Department activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to load department activity.' });
  }
};

// @route GET /api/faculty/labs (HOD/admin) — the department's classes and their assignments, read-only.
exports.getLabs = async (req, res) => {
  try {
    res.json({ success: true, data: await labsService.getLabs(req) });
  } catch (error) {
    console.error('Labs error:', error);
    res.status(500).json({ success: false, error: 'Failed to load labs.' });
  }
};

// @route POST /api/faculty/department/insights (HOD/admin) body { section?, year? }
// Written recommendations from an AI provider that only ever sees aggregate numbers.
exports.getDepartmentInsights = async (req, res) => {
  try {
    if (!aiGateway.isConfigured()) {
      return res.status(503).json({ success: false, error: 'No AI provider is configured, so insights cannot be generated.' });
    }
    const section = String(req.body?.section || '').trim().slice(0, 40) || null;
    const year = String(req.body?.year || '').trim().slice(0, 10) || null;
    const data = await departmentInsightsService.getInsights(req, { section, year });
    logAction(req, 'ai.department-insights', `${section || 'all sections'} / ${year || 'all years'}`);
    res.json({ success: true, data });
  } catch (error) {
    if (error.name === 'AiError') {
      return res.status(error.status && error.status >= 400 && error.status < 600 ? error.status : 502).json({
        success: false, error: `AI provider error: ${error.message}`,
      });
    }
    console.error('Department insights error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate insights.' });
  }
};

// @route GET /api/faculty/portfolio?section&year&mentor (HOD/admin)
// How complete the department's portfolios are, counted by types covered, never a score.
exports.getPortfolioOverview = async (req, res) => {
  try {
    const clean = (v, n) => String(v || '').trim().slice(0, n) || null;
    const data = await portfolioService.getOverview(req, {
      section: clean(req.query.section, 40), year: clean(req.query.year, 10), mentor: clean(req.query.mentor, 80),
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Portfolio overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to load portfolio completeness.' });
  }
};

// @route GET /api/faculty/department-leaderboard (HOD/admin)
// Every department's aggregate numbers side by side, with the caller's own row marked.
exports.getDepartmentLeaderboard = async (req, res) => {
  try {
    res.json({ success: true, data: await departmentLeaderboardService.getDepartmentLeaderboard(req) });
  } catch (error) {
    console.error('Department leaderboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the department leaderboard.' });
  }
};

exports.getDepartmentAnalytics = async (req, res) => {
  try {
    const section = String(req.query.section || '').trim().slice(0, 40) || null;
    const year = String(req.query.year || '').trim().slice(0, 10) || null;
    const mentor = String(req.query.mentor || '').trim().slice(0, 80) || null;
    const percentile = String(req.query.percentile || '').trim();
    const batch = /^\d{4}-\d{4}$/.test(String(req.query.batch || '')) ? String(req.query.batch) : null;
    const data = await departmentAnalyticsService.getDepartmentAnalytics(req, { section, year, mentor, percentile, batch });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Department analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load department analytics.' });
  }
};

// @route GET /api/faculty/courses/completion
// Per-course completion for the viewer's own students, keyed by course id.
exports.getCourseCompletionSummary = async (req, res) => {
  try {
    res.json({ success: true, data: await courseAnalyticsService.getCompletionSummary(req) });
  } catch (error) {
    console.error('Course completion summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to load course completion.' });
  }
};

// @route GET /api/faculty/courses/:id/analytics?days=7|30|182&classroomIds=a,b
// Course-level class dashboard: KPIs, unit-wise completion, trends, leaderboards,
// flagged students. Scoped to the viewer's own population (see resolveAnalyticsScope).
exports.getCourseAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const classroomIds = String(req.query.classroomIds || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    const data = await courseAnalyticsService.getCourseAnalytics(req, req.params.id, days, classroomIds);
    if (!data) return res.status(404).json({ success: false, error: 'Course not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Course analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load course analytics.' });
  }
};

// @route POST /api/faculty/courses — any faculty/HOD/admin may start a new
// course; it always begins as a draft since an empty course has nothing to
// publish to students yet.
exports.createCourse = async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, error: 'Title is required.' });

    const course = await courseRepo.create({
      title,
      description: String(req.body.description || '').trim(),
      sortOrder: 0,
      isPublished: false,
      createdBy: req.user.id,
    });
    await bumpVersion('courses');
    res.status(201).json({ success: true, data: course });
  } catch (error) {
    console.error('Create Course Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create course' });
  }
};

// @route GET /api/faculty/problems/:id/statistics?classroomIds=a,b
// Per-question statistics for the viewer's own population: who finished, who is stuck, time, failure kinds, suspicion.
exports.getProblemStatistics = async (req, res) => {
  try {
    const classroomIds = String(req.query.classroomIds || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50);
    const data = await problemStatisticsService.getProblemStatistics(req, req.params.id, classroomIds);
    if (!data) return res.status(404).json({ success: false, error: 'Problem not found' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Problem statistics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the question statistics.' });
  }
};

// @route PATCH /api/faculty/courses/:id
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await courseRepo.getById(id);
    if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
    if (!(await canManageOwnedBy(req, course.createdBy))) {
      return res.status(403).json({ success: false, error: 'You cannot edit this course.' });
    }

    const patch = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ success: false, error: 'Title cannot be empty.' });
      patch.title = title;
    }
    if (req.body.description !== undefined) patch.description = String(req.body.description).trim();

    if (req.body.isPublished === true && !course.isPublished) {
      // Publishing is gated on having actual content — same "gate publish,
      // never gate unpublish" rule problems use — so a half-empty course
      // never reaches a student. Pulling a published course always works.
      const modules = await courseRepo.getModules(id);
      const hasContent = modules.some((m) => (m.problemIds || []).length > 0);
      if (!hasContent) {
        return res.status(422).json({
          success: false, error: 'INCOMPLETE',
          message: 'Add at least one problem to a module before publishing.',
        });
      }
      patch.isPublished = true;
    } else if (req.body.isPublished === false) {
      patch.isPublished = false;
    }

    const updated = await courseRepo.update(id, patch);
    await bumpVersion('courses');
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update Course Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update course' });
  }
};

async function assertCourseEditable(req, res, courseId) {
  const course = await courseRepo.getById(courseId);
  if (!course) {
    res.status(404).json({ success: false, error: 'Course not found' });
    return null;
  }
  if (!(await canManageOwnedBy(req, course.createdBy))) {
    res.status(403).json({ success: false, error: 'You cannot edit this course.' });
    return null;
  }
  return course;
}

// @route POST /api/faculty/courses/:id/modules
exports.createModule = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertCourseEditable(req, res, id))) return;

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, error: 'Module title is required.' });
    const problemIds = Array.isArray(req.body.problem_ids)
      ? [...new Set(req.body.problem_ids.filter(Boolean))]
      : [];

    const existing = await courseRepo.getModules(id);
    const created = await courseRepo.addModule(id, {
      title,
      description: String(req.body.description || '').trim(),
      problemIds,
      sortOrder: existing.length,
    });
    await bumpVersion('courses');
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Create Module Error:', error);
    res.status(500).json({ success: false, error: 'Failed to create module' });
  }
};

// @route PATCH /api/faculty/courses/:id/modules/:moduleId
exports.updateModule = async (req, res) => {
  try {
    const { id, moduleId } = req.params;
    if (!(await assertCourseEditable(req, res, id))) return;

    const patch = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ success: false, error: 'Module title cannot be empty.' });
      patch.title = title;
    }
    if (req.body.description !== undefined) patch.description = String(req.body.description).trim();
    if (Array.isArray(req.body.problem_ids)) patch.problemIds = [...new Set(req.body.problem_ids.filter(Boolean))];
    // Optional per-module deadline. Sending null or '' clears it, so a module can
    // go back to having no due date.
    if (req.body.due_at !== undefined) {
      if (!req.body.due_at) {
        patch.dueAt = null;
      } else {
        const due = new Date(req.body.due_at);
        if (Number.isNaN(due.getTime())) {
          return res.status(400).json({ success: false, error: 'Due date is not a valid date.' });
        }
        patch.dueAt = due;
      }
    }
    // Optional release date: the unit shows as locked to students until then.
    if (req.body.opens_at !== undefined) {
      if (!req.body.opens_at) {
        patch.opensAt = null;
      } else {
        const opens = new Date(req.body.opens_at);
        if (Number.isNaN(opens.getTime())) {
          return res.status(400).json({ success: false, error: 'The opening date is not a valid date.' });
        }
        patch.opensAt = opens;
      }
    }
    {
      const current = (await courseRepo.getModules(id)).find((m) => m.id === moduleId);
      const opensMs = patch.opensAt !== undefined ? (patch.opensAt ? patch.opensAt.getTime() : 0) : (current?.opensAt?.toMillis?.() ?? (current?.opensAt ? new Date(current.opensAt).getTime() : 0));
      const dueMs = patch.dueAt !== undefined ? (patch.dueAt ? patch.dueAt.getTime() : 0) : (current?.dueAt?.toMillis?.() ?? (current?.dueAt ? new Date(current.dueAt).getTime() : 0));
      if (opensMs && dueMs && opensMs >= dueMs) {
        return res.status(400).json({ success: false, error: 'A unit has to open before it is due.' });
      }
    }

    const updated = await courseRepo.updateModule(id, moduleId, patch);
    if (!updated) return res.status(404).json({ success: false, error: 'Module not found' });
    await bumpVersion('courses');
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update Module Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update module' });
  }
};

// @route DELETE /api/faculty/courses/:id/modules/:moduleId
exports.deleteModule = async (req, res) => {
  try {
    const { id, moduleId } = req.params;
    if (!(await assertCourseEditable(req, res, id))) return;
    await courseRepo.deleteModule(id, moduleId);
    await bumpVersion('courses');
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Module Error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete module' });
  }
};

// ══════════════════════════════════════════════════════════════
// Dashboard: what needs attention, and the person's own layout
// ══════════════════════════════════════════════════════════════
const { classInsights } = require('../utils/classInsights');
const dashboardLayout = require('../utils/dashboardLayout');

// @route GET /api/faculty/class-insights?classId=
// Who has not started, who went quiet, who is stuck and on what, and which problems are hardest, for the selected class (or everything
// the caller may see). Cached with the analytics snapshot, so a dashboard visit costs no extra reads.
exports.getClassInsights = async (req, res) => {
  try {
    const scope = await resolveAnalyticsScope(req);
    const snap = await analytics.getSnapshot(scope);
    res.json({ success: true, data: { ...classInsights(snap, Date.now()), class: req.classFilter ? { id: req.classFilter.classId, label: req.classFilter.label } : null } });
  } catch (error) {
    console.error('Class insights error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the class insights.' });
  }
};

// @route GET /api/faculty/dashboard-layout
exports.getDashboardLayout = async (req, res) => {
  try {
    const me = await userRepo.getById(req.user.id, 'faculty');
    res.json({ success: true, data: { layout: dashboardLayout.normalise(me?.dashboardLayout), registry: dashboardLayout.REGISTRY, presets: dashboardLayout.PRESETS } });
  } catch (error) {
    console.error('Get dashboard layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to load your dashboard layout.' });
  }
};

// @route PUT /api/faculty/dashboard-layout   body { widgets: [{id, visible}] } or { preset }
exports.saveDashboardLayout = async (req, res) => {
  try {
    const v = dashboardLayout.validateInput(req.body);
    if (!v.ok) return res.status(400).json({ success: false, code: 'BAD_LAYOUT', error: v.error });
    await userRepo.update(req.user.id, 'faculty', { dashboardLayout: v.layout });
    res.json({ success: true, data: { layout: v.layout } });
  } catch (error) {
    console.error('Save dashboard layout error:', error);
    res.status(500).json({ success: false, error: 'Failed to save your dashboard layout.' });
  }
};
