// The rules of one student's exam attempt. Pure: attempts and clocks in, decisions out, so every rule is checkable without a database.
//
// The server is the only authority over an attempt:
//   - the clock is `windowExpiresAt` (set on the server when the attempt starts); nothing the browser says changes it
//   - a student writes only through the one ACTIVE SESSION. Starting or resuming the exam from another device or tab makes that one
//     the active session (D-23); the earlier one is told, on its next save, that it was replaced
//   - every save carries a sequence number, so a delayed or retried save can never overwrite a newer answer
//   - leaving fullscreen or switching tabs is counted; after the exam's limit the attempt is LOCKED until staff decide. Nothing ends
//     the exam before the server deadline (D-22)
//   - staff (Admin, the exam's owner, the owner's HOD) can REOPEN an attempt that was cut off, with a written reason; it is capped,
//     recorded on the attempt, and audited by the caller (D-21)
const crypto = require('crypto');
const { isFlagEvent } = require('./proctorEvents');
const { pushSessionHistory } = require('./examIntegrity');

const MAX_REOPENS = 3; // per attempt, for the exam owner and the HOD
const ADMIN_MAX_REOPENS = 6;
const MAX_EXTRA_MINUTES = 60; // owner and HOD
const ADMIN_MAX_EXTRA_MINUTES = 180;
const DEFAULT_VIOLATION_LIMIT = 5; // 0 on an exam means "never lock"
const VIOLATION_DEBOUNCE_MS = 5000; // leaving fullscreen also fires blur and visibilitychange: one act, one count
const REASON_MIN = 5;
const REASON_MAX = 300;

// Only these count toward the lock. Other flagged events (blur, for example) are recorded for the report but never lock anyone,
// because they fire when someone clicks the taskbar or a notification.
const LOCK_COUNTED = new Set(['tab_switch', 'fullscreen_exit', 'devtools', 'paste']);

const toMs = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

const newSessionId = () => crypto.randomBytes(16).toString('hex');
const validSessionId = (s) => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);

const fail = (status, code, error, hint) => ({ ok: false, status, code, error, hint });

/**
 * May this request change the attempt right now?
 * @param {object|null} attempt
 * @param {{sessionId?: string|null, now?: number}} ctx
 */
function guardLive(attempt, { sessionId = null, now = Date.now() } = {}) {
  if (!attempt) return fail(404, 'NOT_STARTED', 'You have not started this exam.', 'Start the exam first.');
  if (attempt.submittedAt) return fail(409, 'ALREADY_SUBMITTED', 'This exam is already submitted.', 'Your answers are saved. You can close this page.');
  if (attempt.locked) return fail(423, 'EXAM_LOCKED', 'Your exam is paused.', 'Your answers are saved. Ask your invigilator or faculty to resume you.');
  const expires = toMs(attempt.windowExpiresAt);
  if (expires != null && now > expires) return fail(409, 'TIME_UP', 'Time is up for this exam.', 'Your answers are saved and will be marked.');
  if (attempt.session?.id) {
    if (!sessionId) return fail(409, 'SESSION_REQUIRED', 'This exam page is out of date.', 'Reload the page to continue.');
    if (sessionId !== attempt.session.id) return fail(409, 'SESSION_REPLACED', 'This exam was opened on another device or window.', 'Close this page. The other window is now the active one.');
  }
  return { ok: true };
}

/**
 * Is this save older than what is already stored? A stale save is acknowledged and ignored: it is not an error, it is a delayed
 * retry that lost the race.
 *
 * Sequence numbers only compare INSIDE one session ("epoch"): each device or window counts from zero when it takes the exam over, so
 * its first saves must not look older than the previous window's last ones. The epoch rises by one on every takeover, on the server.
 * @param {{seq?: number, epoch?: number}|undefined} existing the stored entry for this question
 * @param {*} seq                                           what the client sent
 * @param {number} epoch                                    the attempt's current session epoch
 */
function decideSave(existing, seq, epoch = 0) {
  const incoming = Number.isInteger(seq) && seq >= 0 ? seq : null;
  if (incoming == null) return { apply: true, seq: null };
  const stored = Number.isInteger(existing?.seq) ? existing.seq : null;
  const sameEpoch = (Number.isInteger(existing?.epoch) ? existing.epoch : 0) === epoch;
  if (stored != null && sameEpoch && incoming <= stored) return { apply: false, seq: stored };
  return { apply: true, seq: incoming };
}

/**
 * What one proctor event does to an attempt.
 * @returns {{counts: boolean, count: number, lock: object|null}}
 */
function applyViolation(attempt, exam, eventType, now = Date.now()) {
  const count = Number.isInteger(attempt?.violationCount) ? attempt.violationCount : 0;
  if (!isFlagEvent(eventType) || !LOCK_COUNTED.has(eventType)) return { counts: false, count, lock: null };
  const last = toMs(attempt?.lastViolationAt);
  if (last != null && now - last < VIOLATION_DEBOUNCE_MS) return { counts: false, count, lock: null };
  const next = count + 1;
  const limit = Number.isInteger(exam?.violationLimit) ? exam.violationLimit : DEFAULT_VIOLATION_LIMIT;
  const lock = limit > 0 && next >= limit && !attempt?.locked ? { at: now, reason: 'violations', count: next, limit } : null;
  return { counts: true, count: next, lock };
}

/** Who may reopen or unlock an attempt on this exam. The Training & Placement office may, for any exam: they are the ones on the phone when a student is cut off. */
function canReopen({ actor, exam, ownerDepartment }) {
  if (!actor) return false;
  if (actor.role === 'admin' || actor.role === 'tnp') return true;
  if (exam?.facultyId && actor.id === exam.facultyId) return true;
  return actor.role === 'hod' && actor.department != null && (ownerDepartment ?? null) === actor.department;
}

/**
 * Plan a reopen. Returns {error} or {patch, entry}: the fields to write and the record to keep on the attempt.
 * @param {{reason?: string, extraMinutes?: number}} input
 */
function planReopen({ attempt, exam, actor, input = {}, now = Date.now() }) {
  if (!attempt) return { error: 'This student has not started the exam.', status: 404, code: 'NOT_STARTED' };
  const isAdmin = actor?.role === 'admin';
  const reason = String(input.reason ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length < REASON_MIN) return { error: `Write the reason (at least ${REASON_MIN} characters). It is kept on the record.`, status: 400, code: 'REASON_REQUIRED' };
  if (reason.length > REASON_MAX) return { error: `Keep the reason under ${REASON_MAX} characters.`, status: 400, code: 'REASON_TOO_LONG' };

  const extra = input.extraMinutes === undefined || input.extraMinutes === null ? 0 : Number(input.extraMinutes);
  const cap = isAdmin ? ADMIN_MAX_EXTRA_MINUTES : MAX_EXTRA_MINUTES;
  if (!Number.isInteger(extra) || extra < 0 || extra > cap) return { error: `Extra time must be a whole number of minutes from 0 to ${cap}.`, status: 400, code: 'BAD_EXTRA_TIME' };

  const expires = toMs(attempt.windowExpiresAt);
  const finished = !!attempt.submittedAt;
  const expired = expires != null && now > expires;
  if (!finished && !attempt.locked && !expired) return { error: 'This attempt is still running. There is nothing to reopen.', status: 409, code: 'STILL_RUNNING' };
  if (finished || expired) {
    if (extra < 1) return { error: 'Give at least 1 extra minute: the attempt has no time left.', status: 400, code: 'BAD_EXTRA_TIME' };
  }

  const reopens = Array.isArray(attempt.reopens) ? attempt.reopens : [];
  const limit = isAdmin ? ADMIN_MAX_REOPENS : MAX_REOPENS;
  if (reopens.length >= limit) return { error: `This attempt has already been reopened ${reopens.length} times.${isAdmin ? '' : ' Ask an Admin.'}`, status: 409, code: 'TOO_MANY_REOPENS' };

  const windowEnd = toMs(exam?.windowEnd);
  if (windowEnd != null && now > windowEnd && !isAdmin) return { error: 'The exam window has closed. Only an Admin can reopen an attempt now.', status: 403, code: 'WINDOW_CLOSED' };

  // A running (locked) attempt keeps its deadline and gains the extra time. One with no time left restarts from now.
  const base = finished || expired ? now : Math.max(expires ?? now, now);
  const newExpiry = base + extra * 60000;
  const entry = {
    at: now, byId: actor.id, byRole: actor.role, reason, extraMinutes: extra,
    previous: { submittedAt: toMs(attempt.submittedAt), score: attempt.score ?? null, total: attempt.total ?? null, autoSubmitted: !!attempt.autoSubmitted, locked: attempt.locked ?? null, windowExpiresAt: expires },
  };
  return {
    patch: {
      submittedAt: null, score: null, total: null, autoSubmitted: null, locked: null,
      windowExpiresAt: new Date(newExpiry),
      // A placeholder session nobody holds: the cut-off device (which still has its old session) is refused, and the student gets a
      // valid session only by starting the exam again, which claims it. (A MISSING session would let any old page write.)
      session: { id: newSessionId(), claimedAt: now, epoch: (Number.isInteger(attempt.session?.epoch) ? attempt.session.epoch : 0) + 1, placeholder: true },
      violationCount: 0, lastViolationAt: null,
      reopens: [...reopens, entry],
      // The window that was cut off still holds its old session code: remember it, so it is told apart from an invented one.
      ...(Array.isArray(attempt.sessionHistory) ? { sessionHistory: pushSessionHistory(attempt.sessionHistory, attempt.session?.id) } : {}),
    },
    entry,
    newExpiry,
  };
}

/** One roster row's state, for the staff view of a live exam. */
function rosterState(attempt, now = Date.now()) {
  if (!attempt) return 'not_started';
  if (attempt.submittedAt) return attempt.autoSubmitted ? 'auto_submitted' : 'submitted';
  if (attempt.locked) return 'locked';
  const expires = toMs(attempt.windowExpiresAt);
  if (expires != null && now > expires) return 'expired';
  return 'in_progress';
}

module.exports = {
  MAX_REOPENS, ADMIN_MAX_REOPENS, MAX_EXTRA_MINUTES, ADMIN_MAX_EXTRA_MINUTES, DEFAULT_VIOLATION_LIMIT, VIOLATION_DEBOUNCE_MS, LOCK_COUNTED,
  toMs, newSessionId, validSessionId, guardLive, decideSave, applyViolation, canReopen, planReopen, rosterState,
};
