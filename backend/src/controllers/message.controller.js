// Direct messages (routes under /api/messages). See utils/messages.js for who may
// talk to whom and how consent, blocking and reporting work.
const userRepo = require('../repositories/userRepository');
const classroomRepo = require('../repositories/classroomRepository');
const messageRepo = require('../repositories/messageRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { logAction } = require('../middleware/audit');
const M = require('../utils/messages');

const me = (req) => ({ id: req.user.id, role: req.user.role, department: req.user.department ?? null });
const fail = (res, status, error) => res.status(status).json({ success: false, error });

// People named on a set of threads, looked up once.
async function peopleFor(threads) {
  const ids = [...new Set(threads.flatMap((t) => t.participants))];
  const users = await Promise.all(ids.map((id) => userRepo.getById(id)));
  return new Map(users.filter(Boolean).map((u) => [u.id, u]));
}

// Does this faculty member teach or mentor the student?
async function teachesOrMentors(facultyId, student) {
  if (student.mentorId === facultyId) return true;
  const classes = await classroomRepo.listByFacultyId(facultyId);
  for (const c of classes) {
    if ((await classroomRepo.listMembers(c.id)).some((m) => m.userId === student.id)) return true;
  }
  return false;
}

// @route GET /api/messages/threads — the caller's conversations, newest first
exports.listThreads = async (req, res) => {
  try {
    const threads = await messageRepo.listForUser(req.user.id);
    const people = await peopleFor(threads);
    res.json({ success: true, data: threads.slice(0, 100).map((t) => M.threadRow(t, req.user.id, people)) });
  } catch (error) {
    console.error('List threads error:', error);
    fail(res, 500, 'Failed to load messages.');
  }
};

// @route GET /api/messages/threads/:id — one conversation with its messages; marks it read
exports.getThread = async (req, res) => {
  try {
    const thread = await messageRepo.getById(req.params.id);
    if (!thread || !thread.participants.includes(req.user.id)) return fail(res, 404, 'Conversation not found.');
    const [messages, people] = await Promise.all([messageRepo.listMessages(thread.id), peopleFor([thread])]);
    await messageRepo.markRead(thread.id, req.user.id, Date.now());
    res.json({
      success: true,
      data: {
        thread: { ...M.threadRow(thread, req.user.id, people), unread: false },
        messages: messages.map((m) => ({ id: m.id, mine: m.senderId === req.user.id, body: m.body, sent_at: new Date(m.createdAtMs).toISOString() })),
      },
    });
  } catch (error) {
    console.error('Get thread error:', error);
    fail(res, 500, 'Failed to load the conversation.');
  }
};

// @route POST /api/messages/threads  body { to: userId, body }
// Starts a conversation (staff only) or reuses the existing one with that person.
exports.startThread = async (req, res) => {
  try {
    const v = M.validateBody(req.body?.body);
    if (v.error) return fail(res, 400, v.error);
    const toId = typeof req.body?.to === 'string' ? req.body.to : '';
    const sender = me(req);
    const recipient = toId ? await userRepo.getById(toId) : null;
    const related = sender.role === 'faculty' && recipient?.role === 'student' ? await teachesOrMentors(sender.id, recipient) : false;
    const ok = M.canStart({ sender, recipient: recipient && { id: recipient.id, role: recipient.role, department: recipient.department ?? null }, related });
    if (ok.error) return fail(res, ok.error === 'That person was not found.' ? 404 : 403, ok.error);

    const now = Date.now();
    const { thread } = await messageRepo.createOrGet(M.newThread({ sender, recipient: { id: recipient.id, role: recipient.role, department: recipient.department ?? null }, now }));
    const sent = await messageRepo.addMessage(thread.id, sender.id, v.body, now);
    if (sent.error) return fail(res, sent.status, sent.error);
    res.status(201).json({ success: true, data: { id: thread.id } });
  } catch (error) {
    console.error('Start thread error:', error);
    fail(res, 500, 'Failed to send the message.');
  }
};

// @route POST /api/messages/threads/:id/messages  body { body }
exports.sendMessage = async (req, res) => {
  try {
    const v = M.validateBody(req.body?.body);
    if (v.error) return fail(res, 400, v.error);
    const sent = await messageRepo.addMessage(req.params.id, req.user.id, v.body, Date.now());
    if (sent.error) return fail(res, sent.status, sent.error);
    res.status(201).json({ success: true, data: { id: sent.message.id } });
  } catch (error) {
    console.error('Send message error:', error);
    fail(res, 500, 'Failed to send the message.');
  }
};

// @route PATCH /api/messages/threads/:id  body { action: accept|decline|block|unblock|report, reason? }
exports.updateThread = async (req, res) => {
  try {
    const thread = await messageRepo.getById(req.params.id);
    const r = M.applyAction({ thread, userId: req.user.id, action: req.body?.action, reason: req.body?.reason, now: Date.now() });
    if (r.error) return fail(res, r.status, r.error);
    await messageRepo.update(thread.id, r.patch);
    if (req.body.action === 'report') logAction(req, 'message.report', `thread ${thread.id}`);
    res.json({ success: true, data: { id: thread.id } });
  } catch (error) {
    console.error('Update thread error:', error);
    fail(res, 500, 'Failed to update the conversation.');
  }
};

// @route GET /api/messages/contacts?q=  (staff) — people the caller may start a conversation with
exports.searchContacts = async (req, res) => {
  try {
    if (!M.isStaff(req.user.role)) return fail(res, 403, 'Only staff can start a conversation.');
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const sender = me(req);
    const hit = (u) => `${u.name || ''} ${u.rollNo || ''}`.toLowerCase().includes(q);

    const staff = [...(await userRepo.getMapByRole('faculty')).values()]
      .filter((u) => u.id !== sender.id && M.canStart({ sender, recipient: { id: u.id, role: u.role, department: u.department ?? null } }).ok && hit(u))
      .map((u) => ({ id: u.id, name: u.name || 'Staff', role: u.role, detail: u.department || '' }));

    let students = [...(await userRepo.getMapByRole('student')).values()].filter((s) => s.graduated !== true && hit(s));
    if (sender.role === 'hod') students = students.filter((s) => (s.department ?? null) === sender.department && sender.department !== null);
    if (sender.role === 'faculty') {
      const classes = await classroomRepo.listByFacultyId(sender.id);
      const taught = new Set((await Promise.all(classes.map((c) => classroomRepo.listMembers(c.id)))).flat().map((m) => m.userId));
      students = students.filter((s) => s.mentorId === sender.id || taught.has(s.id));
    }
    const rows = [
      ...staff,
      ...students.map((s) => ({ id: s.id, name: s.name || 'Student', role: 'student', detail: [s.rollNo, s.section && `Sec ${s.section}`].filter(Boolean).join(' · ') })),
    ].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Contacts error:', error);
    fail(res, 500, 'Failed to search.');
  }
};

// @route GET /api/messages/reported (HOD/admin) — reported conversations the caller may review.
// An HOD sees those involving their own department; an admin sees all. This is the one
// place a conversation is readable by someone who is not in it, and the app says so
// to everyone before they use messaging.
exports.listReported = async (req, res) => {
  try {
    const dept = scopeDept(req);
    const threads = (await messageRepo.listReported())
      .filter((t) => !t.reported?.resolvedAtMs && (dept === null || (t.departments || []).includes(dept)));
    const people = await peopleFor(threads);
    const data = await Promise.all(threads.map(async (t) => ({
      id: t.id,
      reported_by: people.get(t.reported?.by)?.name || 'Unknown user',
      reported_at: t.reported?.atMs ? new Date(t.reported.atMs).toISOString() : null,
      reason: t.reported?.reason || '',
      people: t.participants.map((p) => ({ id: p, name: people.get(p)?.name || 'Unknown user', role: people.get(p)?.role || null })),
      messages: (await messageRepo.listMessages(t.id)).map((m) => ({
        id: m.id, from: people.get(m.senderId)?.name || 'Unknown user', body: m.body, sent_at: new Date(m.createdAtMs).toISOString(),
      })),
    })));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Reported threads error:', error);
    fail(res, 500, 'Failed to load reported conversations.');
  }
};

// @route PATCH /api/messages/reported/:id (HOD/admin) — mark a report as reviewed
exports.resolveReport = async (req, res) => {
  try {
    const dept = scopeDept(req);
    const thread = await messageRepo.getById(req.params.id);
    if (!thread || !thread.isReported || thread.reported?.resolvedAtMs) return fail(res, 404, 'Report not found.');
    if (dept !== null && !(thread.departments || []).includes(dept)) return fail(res, 404, 'Report not found.');
    await messageRepo.update(thread.id, { reported: { ...thread.reported, resolvedAtMs: Date.now(), resolvedBy: req.user.id } });
    logAction(req, 'message.report.resolve', `thread ${thread.id}`);
    res.json({ success: true, data: { id: thread.id } });
  } catch (error) {
    console.error('Resolve report error:', error);
    fail(res, 500, 'Failed to update the report.');
  }
};
