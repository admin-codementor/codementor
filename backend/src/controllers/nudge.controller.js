// In-app reminders. Staff send one to students they can see; a student reads their own and marks them read.
const userRepo = require('../repositories/userRepository');
const nudgeRepo = require('../repositories/nudgeRepository');
const analytics = require('../services/analyticsService');
const { scopedStudents } = require('../services/courseAnalyticsService');
const { logAction } = require('../middleware/audit');
const N = require('../utils/nudges');

const fail = (res, status, error) => res.status(status).json({ success: false, error });

// @route POST /api/faculty/nudges   body: { studentIds: [], message }
exports.send = async (req, res) => {
  try {
    const input = N.readNudge(req.body);
    if (input.error) return fail(res, 400, input.error);
    const scope = await analytics.resolveAnalyticsScope(req);
    scope.facultyId = req.user.id;
    const [studentsMap, sender] = await Promise.all([userRepo.getMapByRole('student'), userRepo.getById(req.user.id)]);
    const allowed = new Set(scopedStudents(scope, studentsMap).keys());
    const now = Date.now();
    const plan = N.planSend(input.ids, allowed, N.lastSentBy(await nudgeRepo.listBySender(req.user.id)), now);
    if (plan.send.length) {
      await nudgeRepo.addMany(plan.send.map((studentId) => ({
        studentId, fromId: req.user.id, fromName: sender?.name || 'Your faculty', message: input.message, createdAtMs: now, readAtMs: null,
      })));
      logAction(req, 'nudge.send', `${plan.send.length} student(s)`);
    }
    res.status(201).json({ success: true, data: { sent: plan.send.length, skippedRecently: plan.tooSoon, skippedNotYours: plan.notYours } });
  } catch (error) {
    console.error('nudge send error:', error);
    fail(res, 500, 'Could not send the reminder.');
  }
};

// @route GET /api/student/reminders
exports.listMine = async (req, res) => {
  try {
    const rows = N.visibleTo(await nudgeRepo.listByStudent(req.user.id), Date.now());
    res.json({
      success: true,
      data: { unread: rows.filter((n) => !n.readAtMs).length, items: rows.map((n) => ({ id: n.id, from: n.fromName, message: n.message, sentAt: new Date(n.createdAtMs).toISOString(), unread: !n.readAtMs })) },
    });
  } catch (error) {
    console.error('nudge list error:', error);
    fail(res, 500, 'Could not load your reminders.');
  }
};

// @route POST /api/student/reminders/read
exports.markRead = async (req, res) => {
  try {
    res.json({ success: true, data: { marked: await nudgeRepo.markAllRead(req.user.id, Date.now()) } });
  } catch (error) {
    console.error('nudge read error:', error);
    fail(res, 500, 'Could not update your reminders.');
  }
};
