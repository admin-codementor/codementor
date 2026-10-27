// Exam integrity: what the SERVER can prove, how it is recorded, and what is said about it.
//
// Hard evidence is only what cannot happen by accident, because the real exam page never does it. Anything a person can do by mistake
// (leaving fullscreen, switching tab, an unstable connection) is NOT here: those pause the exam (utils/examAttempt.js) and never send mail.
//
//   forged_session       a save used an exam session code that this attempt never had (the page cannot invent one)
//   foreign_question     a save named a question or section that is not a real id of this exam
//   invalid_selection    a save chose an option that cannot exist (not a number, negative, or far past the options)
//   client_score_fields  a request carried fields that set marks or results (the page never sends any)
//   late_write           repeated writes sent long after time ran out, by something that ignored the "time is up" answer
const EVIDENCE = {
  forged_session: {
    label: 'Used an exam session code that was never issued to this attempt',
    reason: 'A request to save answers used an exam session code that this exam attempt never had. The normal exam page cannot do this; it needs modified or custom software.',
  },
  foreign_question: {
    label: 'Saved an answer for a question that is not in this exam',
    reason: 'A request tried to save an answer for a question or section that is not part of this exam. The normal exam page only sends questions that are on the screen.',
  },
  invalid_selection: {
    label: 'Saved an option that cannot exist',
    reason: 'A request tried to save an answer option that does not exist. The normal exam page only sends options that are on the screen.',
  },
  client_score_fields: {
    label: 'Sent marks or result fields',
    reason: 'A request contained fields that set marks or results. The normal exam page never sends these, and the server ignores them.',
  },
  late_write: {
    label: 'Kept changing answers long after time ended',
    reason: 'Repeated requests to change answers were sent long after the time for the exam ended, and after the server had said time was up. The normal exam page stops at that point.',
  },
};
const TYPES = Object.keys(EVIDENCE);

const LATE_GRACE_MS = 120000;     // a write this long after the deadline is not a slow connection
const LATE_EMAIL_AT = 3;          // late writes mail only on the third, so one stray request never does
const MAX_EVENTS = 40;            // events kept per attempt (the counts keep growing)
const MAX_EMAILS = 3;             // mails per attempt, whatever happens
const THROTTLE_MS = 20000;        // the same kind of event from the same student is written at most this often
const FIELD_DENY = ['score', 'total', 'is_correct', 'iscorrect', 'correct', 'correct_index', 'correctindex', 'correct_answer', 'answer_key', 'graded', 'verdict', 'status', 'result', 'results', 'points', 'marks', 'passed', 'percent', 'percentage', 'submitted_at', 'submittedat'];

/** Field names in a request body that no real exam request carries. Names only, never values. */
function forbiddenFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body).filter((k) => FIELD_DENY.includes(String(k).toLowerCase())).slice(0, 8);
}

/** Text from a client made safe to keep and to put in a mail: printable ASCII only, short. */
function cleanDetail(value, max = 80) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '?').trim().slice(0, max);
}

/** A real exam id is a UUID (sections, exams) or a Firestore auto-id (questions: 20 letters and digits). Anything else was typed by a person or a tool. */

/** A real exam id is a UUID (sections, exams) or a Firestore auto-id (questions: 20 letters and digits). Anything else was typed by a person or a tool. */
const looksLikeRealId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? '')) || /^[A-Za-z0-9]{20}$/.test(String(id ?? ''));

/**
 * Is a chosen option clearly not something the page could send? An index just past the real options (4 to 9 when there are 4) is NOT
 * flagged: a faculty edit of a live exam can cause that innocently. Not a number, negative, or 10 or more is.
 */
function isTamperedSelection(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return true;
  return value < 0 || value >= 10;
}

/**
 * Does a refused write prove something? `refusal` is the guard's answer ({code}); `attempt` the stored attempt.
 * @returns {'forged_session'|'late_write'|null}
 */
function refusalEvidence({ attempt, refusal, sessionId, now }) {
  if (!attempt || !refusal) return null;
  if (refusal.code === 'SESSION_REPLACED' && sessionId && Array.isArray(attempt.sessionHistory)
    && sessionId !== attempt.session?.id && !attempt.sessionHistory.includes(sessionId)) return 'forged_session';
  if (refusal.code === 'TIME_UP') {
    const exp = attempt.windowExpiresAt?.toMillis ? attempt.windowExpiresAt.toMillis() : (attempt.windowExpiresAt instanceof Date ? attempt.windowExpiresAt.getTime() : Number(attempt.windowExpiresAt));
    if (Number.isFinite(exp) && now - exp > LATE_GRACE_MS) return 'late_write';
  }
  return null;
}

/** The list of session ids an attempt has held (newest last), so an old window is told apart from an invented code. */
function pushSessionHistory(list, previousId) {
  const base = Array.isArray(list) ? list : [];
  if (!previousId || base.includes(previousId)) return base.slice(-20);
  return [...base, previousId].slice(-20);
}

const blankRecord = (examId, userId, now) => ({ examId, userId, events: [], counts: {}, emailed: {}, emailCount: 0, firstAt: now, lastAt: now });

/**
 * Add one piece of evidence to an attempt's record and say whether this one should be mailed.
 * @returns {{record: object, email: boolean}}
 */
function applyEvidence(existing, { examId, userId, type, detail, now }) {
  if (!EVIDENCE[type]) throw new Error(`unknown evidence type: ${type}`);
  const rec = existing ? { ...existing, events: [...(existing.events || [])], counts: { ...(existing.counts || {}) }, emailed: { ...(existing.emailed || {}) } } : blankRecord(examId, userId, now);
  rec.counts[type] = (rec.counts[type] || 0) + 1;
  rec.events.push({ type, at: now, detail: cleanDetail(detail) });
  if (rec.events.length > MAX_EVENTS) rec.events = rec.events.slice(-MAX_EVENTS);
  rec.lastAt = now;
  const wanted = type === 'late_write' ? rec.counts[type] === LATE_EMAIL_AT : rec.counts[type] === 1;
  const email = wanted && !rec.emailed[type] && (rec.emailCount || 0) < MAX_EMAILS;
  if (email) { rec.emailed[type] = now; rec.emailCount = (rec.emailCount || 0) + 1; }
  return { record: rec, email };
}

const fmtTime = (ms) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }) + ' IST';

/**
 * The two mails for one piece of evidence: one to the student, one to the admins. Plain, factual, no accusation.
 * @returns {{student: {subject: string, text: string}, admin: {subject: string, text: string}}}
 */
function buildEmails({ student, exam, type, record, link }) {
  const info = EVIDENCE[type];
  const events = (record?.events || []).filter((e) => e.type === type);
  const first = events[0]?.at ?? record?.firstAt ?? Date.now();
  const count = record?.counts?.[type] ?? events.length;
  const detail = events.find((e) => e.detail)?.detail;
  const title = cleanDetail(exam?.title, 120) || 'the exam';
  const who = cleanDetail(student?.name, 80) || 'the student';

  const student_ = {
    subject: `Exam integrity notice: ${title}`,
    text: [
      `Hello ${who},`,
      '',
      `Our exam server recorded something unusual during "${title}" at ${fmtTime(first)}:`,
      '',
      `  ${info.reason}`,
      detail ? `  Detail recorded: ${detail}` : '',
      count > 1 ? `  This happened ${count} times.` : '',
      '',
      'This was detected automatically by the server. It is a record, not a decision: your faculty and the administrators will look at it.',
      'If you think this is a mistake, please tell your faculty as soon as you can. Please do not reply with explanations to this address.',
      '',
      'CodeMentor',
    ].filter((l) => l !== '').join('\n'),
  };

  const admin = {
    subject: `Exam integrity: ${who} in "${title}"`,
    text: [
      'An exam integrity event was recorded.',
      '',
      `Student:  ${who}${student?.rollNo ? ` (${cleanDetail(student.rollNo, 40)})` : ''}`,
      `Exam:     ${title}`,
      `When:     ${fmtTime(first)}${count > 1 ? ` (${count} times)` : ''}`,
      `What:     ${info.label}`,
      '',
      info.reason,
      detail ? `Detail recorded: ${detail}` : '',
      '',
      link ? `All events for this exam: ${link}` : '',
      'The student has been sent a copy of the reason. This is automatic evidence from the server, not a verdict.',
    ].filter((l) => l !== '').join('\n'),
  };
  return { student: student_, admin };
}

module.exports = {
  EVIDENCE, TYPES, LATE_GRACE_MS, LATE_EMAIL_AT, MAX_EVENTS, MAX_EMAILS, THROTTLE_MS,
  forbiddenFields, cleanDetail, looksLikeRealId, isTamperedSelection, refusalEvidence, pushSessionHistory, applyEvidence, buildEmails,
};
