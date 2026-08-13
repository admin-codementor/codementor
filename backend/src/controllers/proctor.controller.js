const { canManageOwnedBy } = require('../middleware/role.middleware');
const userRepo = require('../repositories/userRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');

const ALLOWED_EVENTS = new Set([
  'tab_switch', 'fullscreen_exit', 'fullscreen_enter', 'paste', 'copy',
  'blur', 'devtools', 'exam_start', 'auto_submit',
]);

// ── Student client records a proctoring event ──────────────────────────────────
exports.recordEvent = async (req, res) => {
  try {
    const { assignment_id, problem_id, event_type, detail } = req.body;
    if (!event_type || !ALLOWED_EVENTS.has(event_type)) {
      return res.status(400).json({ success: false, error: 'Invalid event_type' });
    }
    await proctorEventRepo.create({
      userId: req.user.id, assignmentId: assignment_id || null, problemId: problem_id || null,
      eventType: event_type, detail: typeof detail === 'string' ? detail.slice(0, 300) : null,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Proctor event error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: per-student proctoring report for an assignment ────────────────────
exports.getAssignmentReport = async (req, res) => {
  try {
    const { id } = req.params;

    // Ownership: the assignment's faculty, an admin, or the HOD of the author's
    // department (decision D1) may view its proctor report.
    const assignment = await assignmentRepo.getById(id);
    if (!assignment || !(await canManageOwnedBy(req, assignment.facultyId))) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    const events = await proctorEventRepo.listByAssignment(id);
    const proctorUsersMap = await userRepo.getAllUsersMap();

    // Pivot into per-student summaries.
    const byUser = {};
    for (const e of events) {
      if (!byUser[e.userId]) {
        const profile = proctorUsersMap.get(e.userId) || {};
        byUser[e.userId] = {
          user_id: e.userId, name: profile.name || 'Unknown', email: profile.email || null, rollNo: profile.rollNo || null,
          counts: {}, total: 0, lastAt: null,
        };
      }
      const u = byUser[e.userId];
      u.counts[e.eventType] = (u.counts[e.eventType] || 0) + 1;
      // Flaggable events (exclude benign enters/starts) contribute to the total.
      if (!['fullscreen_enter', 'exam_start', 'copy'].includes(e.eventType)) u.total += 1;
      const createdAtMs = e.createdAt?.toMillis?.() ?? new Date(e.createdAt).getTime();
      if (!u.lastAt || createdAtMs > u.lastAt) u.lastAt = createdAtMs;
    }

    const report = Object.values(byUser)
      .map(u => ({
        ...u,
        lastAt: u.lastAt ? new Date(u.lastAt).toISOString() : null,
        tabSwitches:     u.counts.tab_switch || 0,
        fullscreenExits: u.counts.fullscreen_exit || 0,
        pastes:          u.counts.paste || 0,
        risk: u.total >= 8 ? 'high' : u.total >= 3 ? 'medium' : 'low',
      }))
      .sort((a, b) => b.total - a.total);

    res.json({ success: true, data: report });
  } catch (e) {
    console.error('Proctor report error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
