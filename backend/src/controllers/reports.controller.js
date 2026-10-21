// Faculty report catalogue and reopen-request decisions. Every report is scoped to the viewer's own students (own classes for
// faculty, department for an HOD, everyone for an admin), the same rule as the analytics pages.
const assignmentRepo = require('../repositories/assignmentRepository');
const submissionRepo = require('../repositories/submissionRepository');
const userRepo = require('../repositories/userRepository');
const reopenRepo = require('../repositories/reopenRequestRepository');
const { cached } = require('../utils/cache');
const analytics = require('../services/analyticsService');
const { scopedStudents } = require('../services/courseAnalyticsService');
const { assignmentStudents } = require('../services/assignmentStudentsService');
const { buildAssignmentMarks } = require('../utils/assignmentMarks');
const { buildDailyReport, buildLateRows, buildSummary, istDay } = require('../utils/reports');
const { validateDecision, reopenUntil, extensionsByStudent } = require('../utils/reopen');
const { canManageOwnedBy } = require('../middleware/role.middleware');

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const toISO = (v) => { const ms = toMillis(v); return ms ? new Date(ms).toISOString() : null; };
const TTL = 120;

async function scopeStudents(req) {
  const scope = await analytics.resolveAnalyticsScope(req);
  scope.facultyId = req.user.id;
  const map = await userRepo.getMapByRole('student');
  return { scope, students: [...scopedStudents(scope, map).values()].map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo || null, section: s.section || null, year: s.year ?? null })) };
}

// The assignments this viewer may see in reports: their own; an HOD's department's; an admin's all.
async function manageableAssignments(req) {
  const all = req.user.role === 'faculty' ? await assignmentRepo.listByFacultyId(req.user.id) : await assignmentRepo.getAll();
  const out = [];
  for (const a of all) if (await canManageOwnedBy(req, a.facultyId)) out.push(a);
  return out;
}

// @route GET /api/faculty/reports/summary
exports.getSummary = async (req, res) => {
  try {
    const { scope, students } = await scopeStudents(req);
    const key = `reports:summary:v1:${analytics.scopeKey(scope)}`;
    const data = await cached(key, TTL, async () => {
      const now = Date.now();
      const [submissions, assignments, requests] = await Promise.all([submissionRepo.listAllForAnalytics(), manageableAssignments(req), reopenRepo.listAll()]);
      const overdue = assignments.filter((a) => toMillis(a.deadline) && toMillis(a.deadline) < now).length;
      const mine = new Set(students.map((s) => s.id));
      const pending = requests.filter((r) => r.status === 'pending' && mine.has(r.userId)).length;
      return buildSummary({ students, submissions, now, overdueAssignments: overdue, pendingReopen: pending });
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Summary report error:', error);
    res.status(500).json({ success: false, error: 'Failed to build the summary.' });
  }
};

// @route GET /api/faculty/reports/daily?date=YYYY-MM-DD   (default: today, IST)
exports.getDaily = async (req, res) => {
  try {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : istDay(Date.now());
    const { scope, students } = await scopeStudents(req);
    const data = await cached(`reports:daily:v1:${analytics.scopeKey(scope)}:${day}`, TTL, async () =>
      buildDailyReport({ students, submissions: await submissionRepo.listAllForAnalytics(), day }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({ success: false, error: 'Failed to build the daily report.' });
  }
};

// @route GET /api/faculty/reports/late/assignments   the viewer's assignments whose deadline has passed, newest first
exports.listLateCandidates = async (req, res) => {
  try {
    const now = Date.now();
    const rows = (await manageableAssignments(req))
      .filter((a) => toMillis(a.deadline) && toMillis(a.deadline) < now)
      .sort((a, b) => toMillis(b.deadline) - toMillis(a.deadline))
      .slice(0, 60)
      .map((a) => ({ id: a.id, title: a.title, deadline: toISO(a.deadline), problems: (a.problemIds || []).length }));
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Late candidates error:', error);
    res.status(500).json({ success: false, error: 'Failed to list assignments.' });
  }
};

// @route GET /api/faculty/reports/late?assignmentId=
exports.getLate = async (req, res) => {
  try {
    const assignment = await assignmentRepo.getById(String(req.query.assignmentId || ''));
    if (!assignment || !(await canManageOwnedBy(req, assignment.facultyId))) return res.status(404).json({ success: false, error: 'Assignment not found' });
    const students = await assignmentStudents(req, assignment);
    const subs = (await Promise.all((assignment.problemIds || []).map((pid) => submissionRepo.listByProblem(pid)))).flat();
    const marks = buildAssignmentMarks({ assignment, students, submissions: subs, extensions: extensionsByStudent(await reopenRepo.listApprovedForAssignment(assignment.id)) });
    const report = buildLateRows({ students, marks, deadline: assignment.deadline });
    res.json({ success: true, data: { assignment: { id: assignment.id, title: assignment.title, deadline: toISO(assignment.deadline) }, ...report } });
  } catch (error) {
    console.error('Late report error:', error);
    res.status(500).json({ success: false, error: 'Failed to build the late-work report.' });
  }
};

// Who may decide a request: the owner of the assignment or course, the HOD of the owner's department, or an admin.
async function canDecide(req, r) {
  if (r.ownerId && (await canManageOwnedBy(req, r.ownerId))) return true;
  // No owner on record (an old record): fall back to the department rule on the student.
  if (!r.ownerId && req.user.role === 'hod') return (r.department ?? null) === (req.user.department ?? null);
  return req.user.role === 'admin';
}

// @route GET /api/faculty/reopen-requests?status=pending|approved|declined|all
exports.listReopenRequests = async (req, res) => {
  try {
    const status = ['pending', 'approved', 'declined'].includes(req.query.status) ? req.query.status : null;
    const rows = [];
    for (const r of await reopenRepo.listAll()) {
      if (status && r.status !== status) continue;
      if (await canDecide(req, r)) rows.push(r);
    }
    rows.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || toMillis(b.createdAt) - toMillis(a.createdAt));
    res.json({
      success: true,
      data: rows.slice(0, 300).map((r) => ({
        id: r.id, studentId: r.userId, studentName: r.userName || 'Unknown', rollNo: r.rollNo || null,
        targetType: r.targetType, title: r.targetTitle, deadline: toISO(r.deadline), reason: r.reason, status: r.status,
        decisionNote: r.decisionNote || '', reopenUntil: r.reopenUntil ? toISO(r.reopenUntil) : null, createdAt: toISO(r.createdAt),
      })),
    });
  } catch (error) {
    console.error('List reopen requests error:', error);
    res.status(500).json({ success: false, error: 'Failed to load requests.' });
  }
};

// @route PATCH /api/faculty/reopen-requests/:id   { decision: 'approve'|'decline', days?, note? }
exports.decideReopenRequest = async (req, res) => {
  try {
    const r = await reopenRepo.getById(req.params.id);
    if (!r || !(await canDecide(req, r))) return res.status(404).json({ success: false, error: 'Request not found' });
    if (r.status !== 'pending') return res.status(409).json({ success: false, error: 'This request has already been decided.' });
    const d = validateDecision(req.body || {});
    if (d.error) return res.status(400).json({ success: false, error: d.error });
    const now = Date.now();
    const updated = await reopenRepo.decide(r.id, {
      status: d.status, decisionNote: d.note, decidedBy: req.user.id,
      ...(d.status === 'approved' ? { reopenUntil: new Date(reopenUntil(now, d.days)), reopenDays: d.days } : {}),
    });
    res.json({ success: true, data: { id: updated.id, status: updated.status, reopenUntil: updated.reopenUntil ? toISO(updated.reopenUntil) : null } });
  } catch (error) {
    console.error('Decide reopen request error:', error);
    res.status(500).json({ success: false, error: 'Failed to save the decision.' });
  }
};

// Used by the student course page: approved extensions for modules, so an approved unit does not still read "overdue".
exports.moduleExtensionsFor = async (userId, courseId) =>
  new Map((await reopenRepo.listApprovedForUser(userId)).filter((r) => r.targetType === 'module' && r.courseId === courseId)
    .map((r) => [r.moduleId, toMillis(r.reopenUntil)]));

