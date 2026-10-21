// In-app reminders from staff to students. Pure rules, so each can be checked against a fixture.
//
//   - at most MAX_RECIPIENTS students per send, each only once per send
//   - the text is 3 to MAX_MESSAGE characters, plain text
//   - a student already reminded by the same sender within COOLDOWN_MS is skipped (a reminder is not a flood)
//   - only students the sender is allowed to see can be reminded; anyone else is dropped and counted

const MAX_RECIPIENTS = 100;
const MAX_MESSAGE = 200;
const COOLDOWN_MS = 24 * 3600000;
const SHOW_DAYS = 14;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** @returns {{error: string} | {ids: string[], message: string}} */
function readNudge(body = {}) {
  const message = clean(body.message);
  if (message.length < 3) return { error: 'Write a short message first.' };
  if (message.length > MAX_MESSAGE) return { error: `Keep the reminder under ${MAX_MESSAGE} characters.` };
  if (!Array.isArray(body.studentIds)) return { error: 'Choose who to remind.' };
  const ids = [...new Set(body.studentIds.filter((x) => typeof x === 'string' && x))];
  if (!ids.length) return { error: 'Choose who to remind.' };
  if (ids.length > MAX_RECIPIENTS) return { error: `You can remind at most ${MAX_RECIPIENTS} students at a time.` };
  return { ids, message };
}

/**
 * Splits the requested ids into those to send to and those left out, with the reason.
 * @param {string[]} ids
 * @param {Set<string>} allowed  students the sender may see
 * @param {Map<string, number>} lastSentMs  sender's most recent reminder per student
 * @param {number} now
 */
function planSend(ids, allowed, lastSentMs, now) {
  const send = [];
  let notYours = 0;
  let tooSoon = 0;
  for (const id of ids) {
    if (!allowed.has(id)) { notYours += 1; continue; }
    if (now - (lastSentMs.get(id) ?? 0) < COOLDOWN_MS) { tooSoon += 1; continue; }
    send.push(id);
  }
  return { send, notYours, tooSoon };
}

/** The newest reminder time per student, from a sender's earlier reminders. */
function lastSentBy(nudges) {
  const m = new Map();
  for (const n of nudges) m.set(n.studentId, Math.max(m.get(n.studentId) ?? 0, n.createdAtMs ?? 0));
  return m;
}

/** What a student sees: the last SHOW_DAYS days, newest first, at most 20. */
function visibleTo(nudges, now) {
  const since = now - SHOW_DAYS * 86400000;
  return nudges.filter((n) => (n.createdAtMs ?? 0) >= since).sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 20);
}

module.exports = { readNudge, planSend, lastSentBy, visibleTo, MAX_RECIPIENTS, MAX_MESSAGE, COOLDOWN_MS, SHOW_DAYS };
