const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { requirePermission, ALL_PERMISSIONS, resolvePermissions } = require('../middleware/permissions');
const facultyController = require('../controllers/faculty.controller');
const plagiarismController = require('../controllers/plagiarism.controller');
const { logAction } = require('../middleware/audit');
const db = require('../config/db');

const router = express.Router();

router.use(protect);
router.use(authorize('faculty', 'admin', 'hod'));

// JPlag runs are expensive (~minutes each) — cap them per faculty to prevent
// accidental or malicious DoS. Keyed by user id (route is always authenticated).
const plagiarismLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user?.id || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Plagiarism runs are limited to 5 per 5 minutes. Please wait before running again.' },
});

// ── Read-only dashboard endpoints (no extra permission needed) ───────────────
router.get('/dashboard',  facultyController.getDashboardData);
router.get('/analytics',  facultyController.getClassAnalytics);
router.get('/cohort-topics', facultyController.getCohortTopics);
// Hierarchical drill-down (department-scoped for HOD/faculty; admin = all).
router.get('/analytics/cohorts', facultyController.getCohorts);
router.get('/analytics/cohort-students', facultyController.getCohortStudents);
router.get('/problems',   facultyController.getProblems);
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
router.delete('/problems/:id',
  requirePermission('manage_problems'),
  facultyController.deleteProblem
);

// ── Assignments ───────────────────────────────────────────────────────────────
router.post('/assignments',
  requirePermission('manage_assignments'),
  facultyController.createAssignment
);
router.get('/assignments/:id/submissions', facultyController.getAssignmentSubmissions);
router.get('/assignments/:id/progress',    facultyController.getAssignmentProgress);

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
    try {
      const { rows } = await db.query(
        `SELECT id, name, email, role, permissions, created_at
           FROM users WHERE role = 'faculty' ORDER BY name ASC`
      );
      const data = rows.map(u => ({
        id: u.id, name: u.name, email: u.email, role: u.role,
        created_at: u.created_at,
        permissions: resolvePermissions(u),
      }));
      res.json({ success: true, data, allPermissions: ALL_PERMISSIONS });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

router.get('/permissions/:userId',
  authorize('admin'),
  async (req, res) => {
    try {
      const { rows } = await db.query(
        'SELECT id, name, email, role, permissions FROM users WHERE id = $1 AND role = $2',
        [req.params.userId, 'faculty']
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Faculty user not found' });
      res.json({ success: true, data: { ...rows[0], permissions: resolvePermissions(rows[0]) } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

router.patch('/permissions/:userId',
  authorize('admin'),
  async (req, res) => {
    try {
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

      const { rows } = await db.query(
        `UPDATE users SET permissions = $1 WHERE id = $2 AND role = 'faculty' RETURNING id, name, email, permissions`,
        [JSON.stringify(sanitized), req.params.userId]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Faculty user not found' });

      logAction(req, 'permissions.update', `faculty ${req.params.userId}: ${Object.keys(sanitized).filter(k => sanitized[k]).join(',') || 'none'}`);
      res.json({ success: true, data: rows[0] });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// View recent audit-log entries (admin only).
router.get('/audit-logs',
  authorize('admin'),
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
      const { rows } = await db.query(
        `SELECT al.id, al.action, al.detail, al.ip, al.created_at,
                u.name AS user_name, u.email AS user_email
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.user_id
          ORDER BY al.created_at DESC
          LIMIT $1`,
        [limit]
      );
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

module.exports = router;
