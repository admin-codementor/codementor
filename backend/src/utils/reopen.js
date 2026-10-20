// Reopen requests: a student asks for more time on something whose deadline has passed; staff approve or decline.
// Pure: callers pass plain values, so every rule is checkable against a fixture.
//
// Rules:
//   - Only a PASSED deadline can be reopened (before it there is nothing to ask for).
//   - One pending request per student and target at a time; a decided request can be followed by a new one.
//   - Approval gives the student more time FROM THE DECISION, 1 to 14 days; it never shortens a deadline and never
//     changes anyone else's.
//   - Who decides: the owner of the assignment or course, the HOD of the student's department, or an admin.

const DAY_MS = 86400000;
const MIN_REASON = 10;
const MAX_REASON = 500;
const MAX_NOTE = 300;
const MIN_DAYS = 1;
const MAX_DAYS = 14;
const DEFAULT_DAYS = 3;

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/**
 * @param {object} a
 * @param {'assignment'|'module'} a.targetType
 * @param {unknown} a.deadline        the target's deadline
 * @param {string} a.reason
 * @param {{status:string}[]} a.existing  this student's earlier requests for the same target
 * @param {number} a.now
 * @returns {{error: string} | {reason: string}}
 */
function validateRequest({ targetType, deadline, reason, existing = [], now = Date.now() }) {
  if (!['assignment', 'module'].includes(targetType)) return { error: 'Choose an assignment or a course unit.' };
  const dl = toMillis(deadline);
  if (!dl) return { error: 'This has no deadline, so there is nothing to reopen.' };
  if (dl > now) return { error: 'The deadline has not passed yet.' };
  const text = String(reason ?? '').trim();
  if (text.length < MIN_REASON) return { error: `Please say why in at least ${MIN_REASON} characters.` };
  if (text.length > MAX_REASON) return { error: `Please keep the reason under ${MAX_REASON} characters.` };
  if (existing.some((r) => r.status === 'pending')) return { error: 'You already have a request waiting for this.' };
  return { reason: text };
}

/** @returns {{error: string} | {status: 'approved'|'declined', days: number|null, note: string}} */
function validateDecision({ decision, days, note }) {
  if (!['approve', 'decline'].includes(decision)) return { error: 'decision must be approve or decline.' };
  const cleanNote = String(note ?? '').trim().slice(0, MAX_NOTE);
  if (decision === 'decline') return { status: 'declined', days: null, note: cleanNote };
  const d = days === undefined || days === null || days === '' ? DEFAULT_DAYS : Number(days);
  if (!Number.isInteger(d) || d < MIN_DAYS || d > MAX_DAYS) return { error: `days must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}.` };
  return { status: 'approved', days: d, note: cleanNote };
}

/** When an approval granted at `decidedAt` lets the student work until. */
const reopenUntil = (decidedAt, days) => decidedAt + days * DAY_MS;

/**
 * The latest approved extension per student for one target, from raw requests.
 * @returns {Map<string, number>} userId -> ms until which the target is open for them
 */
function extensionsByStudent(requests) {
  const out = new Map();
  for (const r of requests) {
    if (r.status !== 'approved' || !r.reopenUntil) continue;
    const until = toMillis(r.reopenUntil);
    if (until > (out.get(r.userId) || 0)) out.set(r.userId, until);
  }
  return out;
}

/** The deadline that applies to one student: the later of the real one and their extension. */
function effectiveDeadline(deadline, extensionUntil) {
  const dl = toMillis(deadline);
  return Math.max(dl, extensionUntil || 0) || 0;
}

module.exports = {
  validateRequest, validateDecision, reopenUntil, extensionsByStudent, effectiveDeadline,
  MIN_REASON, MAX_REASON, MIN_DAYS, MAX_DAYS, DEFAULT_DAYS, DAY_MS,
};
