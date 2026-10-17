// Direct messages between people on the platform. Pure: every rule takes plain
// objects, so each is checkable against a fixture.
//
// Who may talk to whom:
//   - Staff (faculty, HOD, admin) may start a conversation. Students never do.
//   - Staff to staff: same department, or either side is an admin.
//   - HOD to a student: a student of their own department.
//   - Faculty to a student: a student in one of their classes, or one they mentor.
//   - Admin to a student: any.
//   - A student can only reply to a conversation a staff member started.
//
// A conversation with a student starts "pending". The student sees who is writing
// and chooses to accept, decline, block or report. Until they do, the staff member
// has only their opening message: they cannot keep writing to someone who has not
// agreed to hear from them. Either side can block or report at any time.

const MAX_BODY = 1000;
const MAX_REASON = 300;
const STAFF_ROLES = ['faculty', 'hod', 'admin'];
const ACTIONS = ['accept', 'decline', 'block', 'unblock', 'report'];
const OPENING_MESSAGES = 1; // what staff may send to a student who has not accepted yet

const isStaff = (role) => STAFF_ROLES.includes(role);

/** @returns {{error: string} | {body: string}} */
function validateBody(input) {
  if (typeof input !== 'string') return { error: 'Write a message first.' };
  const body = input.replace(/\r\n/g, '\n').trim();
  if (!body) return { error: 'Write a message first.' };
  if (body.length > MAX_BODY) return { error: `Messages can be at most ${MAX_BODY} characters.` };
  return { body };
}

/**
 * May `sender` open a new conversation with `recipient`?
 * @param {{sender:{id,role,department?}, recipient:{id,role,department?}|null, related?:boolean}} a
 *   `related` is true when a faculty sender teaches or mentors the student recipient.
 * @returns {{ok: true} | {error: string}}
 */
function canStart({ sender, recipient, related = false }) {
  if (!recipient) return { error: 'That person was not found.' };
  if (sender.id === recipient.id) return { error: 'You cannot message yourself.' };
  if (!isStaff(sender.role)) return { error: 'Only staff can start a conversation. You can reply once a teacher writes to you.' };
  const sameDept = (sender.department ?? null) !== null && (sender.department ?? null) === (recipient.department ?? null);
  if (isStaff(recipient.role)) {
    return sender.role === 'admin' || recipient.role === 'admin' || sameDept ? { ok: true } : { error: 'You can message staff in your own department.' };
  }
  if (recipient.role !== 'student') return { error: 'That person cannot be messaged.' };
  if (sender.role === 'admin') return { ok: true };
  if (sender.role === 'hod') return sameDept ? { ok: true } : { error: 'You can message students in your own department.' };
  return related ? { ok: true } : { error: 'You can message students in your classes or those you mentor.' };
}

/**
 * Shape of a new thread document.
 * @param {{sender:{id,role,department?}, recipient:{id,role,department?}, now:number}} a
 */
function newThread({ sender, recipient, now }) {
  const toStudent = recipient.role === 'student';
  const departments = [...new Set([sender.department, recipient.department].filter(Boolean))];
  return {
    participants: [sender.id, recipient.id].sort(),
    studentId: toStudent ? recipient.id : null,
    createdBy: sender.id,
    status: toStudent ? 'pending' : 'active',
    blockedBy: [],
    isReported: false,
    reported: null,
    departments,
    staffMessages: 0,
    createdAtMs: now,
    lastMessageAtMs: now,
    lastMessageBy: null,
    lastPreview: '',
    reads: {},
  };
}

/**
 * May `senderId` send into this thread right now?
 * @returns {{ok: true, activates: boolean} | {error: string, status: number}}
 */
function canSend({ thread, senderId }) {
  if (!thread || !thread.participants.includes(senderId)) return { error: 'Conversation not found.', status: 404 };
  const others = thread.participants.filter((p) => p !== senderId);
  if ((thread.blockedBy || []).includes(senderId)) return { error: 'You have blocked this conversation. Unblock it to write.', status: 403 };
  if (others.some((p) => (thread.blockedBy || []).includes(p))) return { error: 'This person is not accepting messages from you.', status: 403 };
  if (thread.status === 'declined') return { error: 'This conversation was declined.', status: 403 };
  const senderIsStudent = thread.studentId === senderId;
  if (senderIsStudent) return { ok: true, activates: thread.status === 'pending' }; // replying is acceptance
  if (thread.status === 'pending' && thread.staffMessages >= OPENING_MESSAGES) {
    return { error: 'Waiting for the student to accept before you can send more.', status: 403 };
  }
  return { ok: true, activates: false };
}

/**
 * A participant's choice about a thread. Returns the fields to change, or an error.
 * @returns {{patch: object} | {error: string, status: number}}
 */
function applyAction({ thread, userId, action, reason, now }) {
  if (!thread || !thread.participants.includes(userId)) return { error: 'Conversation not found.', status: 404 };
  if (!ACTIONS.includes(action)) return { error: `action must be one of ${ACTIONS.join(', ')}.`, status: 400 };
  const isStudent = thread.studentId === userId;
  const blocked = new Set(thread.blockedBy || []);

  if (action === 'accept' || action === 'decline') {
    if (!isStudent) return { error: 'Only the student can accept or decline.', status: 403 };
    if (action === 'decline' && thread.status !== 'pending') return { error: 'Only a new conversation can be declined. Use block instead.', status: 400 };
    return { patch: { status: action === 'accept' ? 'active' : 'declined' } };
  }
  if (action === 'block') { blocked.add(userId); return { patch: { blockedBy: [...blocked] } }; }
  if (action === 'unblock') { blocked.delete(userId); return { patch: { blockedBy: [...blocked] } }; }

  // report
  if (thread.isReported && !thread.reported?.resolvedAtMs) return { error: 'This conversation is already reported.', status: 400 };
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length > MAX_REASON) return { error: `Keep the reason within ${MAX_REASON} characters.`, status: 400 };
  blocked.add(userId); // reporting also stops further messages to the reporter
  return { patch: { isReported: true, reported: { by: userId, atMs: now, reason: text }, blockedBy: [...blocked] } };
}

const preview = (body) => (body.length > 80 ? `${body.slice(0, 79)}…` : body).replace(/\n/g, ' ');

/** Counterpart-aware list row for one participant. */
function threadRow(thread, viewerId, people) {
  const otherId = thread.participants.find((p) => p !== viewerId) || null;
  const other = people.get(otherId) || null;
  const lastRead = thread.reads?.[viewerId] ?? 0;
  const iBlocked = (thread.blockedBy || []).includes(viewerId);
  return {
    id: thread.id,
    with: { id: otherId, name: other?.name || 'Unknown user', role: other?.role || null },
    status: thread.status,
    awaiting_my_answer: thread.status === 'pending' && thread.studentId === viewerId,
    i_started: thread.createdBy === viewerId,
    blocked_by_me: iBlocked,
    reported: !!thread.isReported && !thread.reported?.resolvedAtMs,
    last_message_at: thread.lastMessageAtMs ? new Date(thread.lastMessageAtMs).toISOString() : null,
    last_preview: thread.lastPreview || '',
    unread: !!thread.lastMessageBy && thread.lastMessageBy !== viewerId && thread.lastMessageAtMs > lastRead,
  };
}

module.exports = {
  MAX_BODY, MAX_REASON, ACTIONS, STAFF_ROLES, OPENING_MESSAGES,
  isStaff, validateBody, canStart, newThread, canSend, applyAction, preview, threadRow,
};
