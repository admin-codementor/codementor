const express = require('express');
const { createLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth.middleware');
const { authorize, facultyStaff } = require('../middleware/role.middleware');
const { requirePermission, ALL_PERMISSIONS, resolvePermissions } = require('../middleware/permissions');
const facultyController = require('../controllers/faculty.controller');
const reportsController = require('../controllers/reports.controller');
const platformScoreController = require('../controllers/platformScore.controller');
const plagiarismController = require('../controllers/plagiarism.controller');
const groupController = require('../controllers/studentGroup.controller');
const mentorController = require('../controllers/mentor.controller');
const placementController = require('../controllers/placement.controller');
const alumniController = require('../controllers/alumni.controller');
const classFilter = require('../middleware/classFilter');
const { logAction } = require('../middleware/audit');
const userRepo = require('../repositories/userRepository');
const auditLogRepo = require('../repositories/auditLogRepository');

const router = express.Router();

// Every insights call can spend AI quota (results are cached 10 minutes server-side).
const insightsLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 6,
  prefix: 'ai:dept-insights',
  message: 'Too many insight requests. Please wait a minute.',
});

router.use(protect);
router.use(facultyStaff);
// ?classId= narrows the dashboard and analytics calls to one class the caller may look at (the dashboard's class switcher).
router.use(classFilter);

// JPlag runs are expensive (~minutes each) — cap them per faculty to prevent
// accidental or malicious DoS. Keyed by user id (route is always authenticated).
const plagiarismLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 5,
  prefix: 'faculty:plagiarism',
  keyGenerator: (req) => req.user?.id || 'anon',
  message: 'Plagiarism runs are limited to 5 per 5 minutes. Please wait before running again.',
});

// ── Read-only dashboard endpoints (no extra permission needed) ───────────────
router.get('/dashboard',  facultyController.getDashboardData);
// Admin only: this legacy endpoint aggregates EVERY department and returns top
// students by name, which a faculty or HOD token must not be able to read. No
// screen calls it (the analytics pages use /analytics/overview and friends).
router.get('/analytics',  authorize('admin'), facultyController.getClassAnalytics);
// HOD/admin only. A `faculty` token is scoped to its own CLASSES everywhere else
// (resolveAnalyticsScope), so serving it a whole-department roster here would
// quietly widen what a class teacher can see.
router.get('/department', authorize('hod', 'admin'), facultyController.getDepartmentAnalytics);
// Aggregates only: a head may compare departments, never see another department's students.
// Mentor mapping: HOD/admin only, and an HOD is confined to their own department by the token.
router.get('/portfolio', authorize('hod', 'admin'), facultyController.getPortfolioOverview);
// Placement drives, applications and analytics: HOD/admin only; an HOD is confined to their own department.
router.get('/placement/drives', authorize('hod', 'admin'), placementController.listDrives);
router.post('/placement/drives', authorize('hod', 'admin'), placementController.createDrive);
router.get('/placement/drives/:id', authorize('hod', 'admin'), placementController.getDrive);
router.patch('/placement/drives/:id', authorize('hod', 'admin'), placementController.updateDrive);
router.delete('/placement/drives/:id', authorize('hod', 'admin'), placementController.deleteDrive);
router.put('/placement/drives/:id/applications', authorize('hod', 'admin'), placementController.saveApplications);
router.get('/placement/analytics', authorize('hod', 'admin'), placementController.getAnalytics);
router.get('/placement/readiness', authorize('hod', 'admin'), require('../controllers/career.controller').getReadiness);
// Alumni: HOD/admin only; an HOD is confined to their own department.
router.get('/alumni', authorize('hod', 'admin'), alumniController.getAlumni);
router.put('/alumni/graduation', authorize('hod', 'admin'), alumniController.setGraduation);
router.get('/mentors', authorize('hod', 'admin'), mentorController.listMentors);
router.put('/mentors/assign', authorize('hod', 'admin'), mentorController.assignMentees);
router.post('/department/insights', authorize('hod', 'admin'), insightsLimiter, facultyController.getDepartmentInsights);
// Labs: the department's classes and assignment completion; read-only, HOD/admin, department from the token.
router.get('/labs', authorize('hod', 'admin'), facultyController.getLabs);
router.get('/department/activity', authorize('hod', 'admin'), facultyController.getDepartmentActivity);
router.get('/department-leaderboard', authorize('hod', 'admin'), facultyController.getDepartmentLeaderboard);
// Department-wide comparisons: for a HOD or an Admin (a faculty member sees their own classes through /analytics/cohort and the dashboard).
router.get('/cohort-topics', authorize('hod', 'admin'), facultyController.getCohortTopics);
// Hierarchical drill-down (department-scoped for HOD/faculty; admin = all).
router.get('/analytics/cohorts', authorize('hod', 'admin'), facultyController.getCohorts);
router.get('/analytics/cohort-students', authorize('hod', 'admin'), facultyController.getCohortStudents);
router.get('/question-bank', facultyController.getQuestionBank);

// Analytics — all served from one cached snapshot (services/analyticsService.js).
router.get('/analytics/overview',        facultyController.getAnalyticsOverview);
router.get('/analytics/cohort',          facultyController.getCohortDetail);
router.get('/analytics/at-risk',         facultyController.getAnalyticsAtRisk);
router.get('/analytics/top-performers',  facultyController.getTopPerformers);
router.get('/analytics/problem/:id',     facultyController.getProblemAnalytics);
router.get('/analytics/mcq/:id',         facultyController.getMcqItemAnalysis);
router.get('/problems',   facultyController.getProblems);
router.get('/problems/:id', facultyController.getProblemDetail);
router.get('/problems/:id/test-heatmap', facultyController.getProblemTestHeatmap);
router.post('/problems/:id/random-tests',
  requirePermission('manage_problems'),
  facultyController.generateRandomTests
);

// ── Student data ─────────────────────────────────────────────────────────────
router.get('/students',
  requirePermission('manage_students'),
  facultyController.getStudents
);
router.get('/at-risk',
  requirePermission('manage_students'),
  facultyController.getAtRiskStudents
);
router.get('/class-insights',
  requirePermission('manage_students'),
  facultyController.getClassInsights
);

// Each person's own dashboard layout (which widgets, in what order).
router.get('/dashboard-layout', facultyController.getDashboardLayout);
router.put('/dashboard-layout', facultyController.saveDashboardLayout);
router.get('/students/:id/detail',
  requirePermission('manage_students'),
  facultyController.getStudentDetail
);

// ── Problems management ───────────────────────────────────────────────────────
router.post('/problems',
  requirePermission('manage_problems'),
  facultyController.createProblem
);
router.put('/problems/:id',
  requirePermission('manage_problems'),
  facultyController.updateProblem
);
router.patch('/problems/:id/status',
  requirePermission('manage_problems'),
  facultyController.setProblemStatus
);
router.delete('/problems/:id',
  requirePermission('manage_problems'),
  facultyController.deleteProblem
);

// ── Assignments ───────────────────────────────────────────────────────────────
router.post('/assignments',
  requirePermission('manage_assignments'),
  facultyController.createAssignment
);
router.put('/assignments/:id',
  requirePermission('manage_assignments'),
  facultyController.updateAssignment
);
router.get('/assignments/:id', facultyController.getAssignmentDetail);
router.get('/assignments/:id/submissions', facultyController.getAssignmentSubmissions);
router.get('/assignments/:id/progress',    facultyController.getAssignmentProgress);

// ── Custom student groups / mixed-branch batches ────────────────────
// Reading is open to all teaching staff (they need to target an exam at a group);
// creating and editing is gated on manage_students, the same permission that
// governs class rosters.
router.get('/groups', groupController.listGroups);
router.get('/groups-candidates', groupController.listCandidates);
router.get('/groups/:id', groupController.getGroup);
router.post('/groups', requirePermission('manage_students'), groupController.createGroup);
router.patch('/groups/:id', requirePermission('manage_students'), groupController.updateGroup);
router.delete('/groups/:id', requirePermission('manage_students'), groupController.deleteGroup);

// ── Courses / modules (student practice catalogue) ──────────────────────────
router.get('/courses',    facultyController.getFacultyCourses);
router.get('/courses/completion', facultyController.getCourseCompletionSummary);
router.get('/courses/:id', facultyController.getFacultyCourseDetail);
router.get('/courses/:id/analytics', facultyController.getCourseAnalytics);
router.get('/problems/:id/statistics', facultyController.getProblemStatistics);

// Report catalogue and reopen requests (controllers/reports.controller.js).
router.get('/reports/summary', reportsController.getSummary);

// Coding score (utils/platformScore.js). Reading is for all staff; changing thresholds and refreshing are HOD / admin.
router.post('/nudges', require('../controllers/nudge.controller').send);
router.get('/platform-scores', platformScoreController.getScores);
router.put('/platform-thresholds', authorize('hod', 'admin'), platformScoreController.putThresholds);
router.post('/platform-scores/refresh', authorize('hod', 'admin'), platformScoreController.refresh);
router.get('/reports/daily', reportsController.getDaily);
router.get('/reports/late/assignments', reportsController.listLateCandidates);
router.get('/reports/late', reportsController.getLate);
router.get('/reopen-requests', reportsController.listReopenRequests);
router.patch('/reopen-requests/:id', reportsController.decideReopenRequest);
router.post('/courses',
  requirePermission('manage_problems'),
  facultyController.createCourse
);
router.patch('/courses/:id',
  requirePermission('manage_problems'),
  facultyController.updateCourse
);
router.post('/courses/:id/modules',
  requirePermission('manage_problems'),
  facultyController.createModule
);
router.patch('/courses/:id/modules/:moduleId',
  requirePermission('manage_problems'),
  facultyController.updateModule
);
router.delete('/courses/:id/modules/:moduleId',
  requirePermission('manage_problems'),
  facultyController.deleteModule
);

// ── Export (CSV / reports) ────────────────────────────────────────────────────
router.get('/assignments/:id/export',
  requirePermission('export_data'),
  facultyController.exportMarksCSV
);

// ── AI tools ─────────────────────────────────────────────────────────────────
router.post('/ai/generate-tests',
  requirePermission('generate_ai_tests'),
  facultyController.generateAITestCases
);

// ── Plagiarism detection (JPlag) ──────────────────────────────────────────────
router.post('/assignments/:id/plagiarism',
  plagiarismLimiter,
  requirePermission('run_plagiarism'),
  plagiarismController.runPlagiarism
);
router.get('/plagiarism-overview',
  requirePermission('run_plagiarism'),
  plagiarismController.getPlagiarismOverview
);
router.get('/assignments/:id/plagiarism',
  requirePermission('run_plagiarism'),
  plagiarismController.getPlagiarismResults
);
router.get('/assignments/:id/plagiarism/:pairId/diff',
  requirePermission('run_plagiarism'),
  plagiarismController.getPairDiff
);

// ── Admin: manage faculty permissions ────────────────────────────────────────
// Only admin role can call these endpoints.

// List all faculty users with their effective permissions (for the admin manager).
router.get('/faculty-list',
  authorize('admin'),
  async (req, res) => {
    const faculty = (await userRepo.listByRole('faculty'))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const data = faculty.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      created_at: u.createdAt,
      permissions: resolvePermissions(u),
    }));
    res.json({ success: true, data, allPermissions: ALL_PERMISSIONS });
  }
);

router.get('/permissions/:userId',
  authorize('admin'),
  async (req, res) => {
    const user = await userRepo.getById(req.params.userId, 'faculty');
    if (!user) return res.status(404).json({ success: false, error: 'Faculty user not found' });
    res.json({ success: true, data: { ...user, permissions: resolvePermissions(user) } });
  }
);

router.patch('/permissions/:userId',
  authorize('admin'),
  async (req, res) => {
    const incoming = req.body.permissions;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ success: false, error: 'permissions object is required' });
    }

    // Only allow known permission keys
    const sanitized = Object.fromEntries(
      ALL_PERMISSIONS
        .filter(p => p in incoming)
        .map(p => [p, Boolean(incoming[p])])
    );

    const existing = await userRepo.getById(req.params.userId, 'faculty');
    if (!existing) return res.status(404).json({ success: false, error: 'Faculty user not found' });

    await userRepo.update(req.params.userId, 'faculty', { permissions: sanitized });
    // The old session still carries the old permissions: end it so the change takes effect within minutes.
    await userRepo.bumpTokenVersion(req.params.userId, 'faculty');

    logAction(req, 'permissions.update', `faculty ${req.params.userId}: ${Object.keys(sanitized).filter(k => sanitized[k]).join(',') || 'none'}`);
    res.json({ success: true, data: { id: existing.id, name: existing.name, email: existing.email, permissions: sanitized } });
  }
);

// View recent audit-log entries (admin only).
router.get('/audit-logs',
  authorize('admin'),
  async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const rows = await auditLogRepo.listRecent(limit);
    const usersMap = await userRepo.getAllUsersMap();
    const data = rows.map(r => {
      const u = usersMap.get(r.userId);
      return {
        id: r.id, action: r.action, detail: r.detail, ip: r.ip, created_at: r.createdAt?.toDate?.() ?? r.createdAt,
        user_name: u?.name || null, user_email: u?.email || null,
      };
    });
    res.json({ success: true, data });
  }
);

module.exports = router;
