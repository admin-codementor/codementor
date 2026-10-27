// What counts as hard evidence, how it is recorded, and what the mails say (utils/examIntegrity.js).
const I = require('../../src/utils/examIntegrity');

module.exports = async function (s) {
  // ── fields ──
  s.check('score and result fields in a request are named, and only the names', JSON.stringify(I.forbiddenFields({ section_id: 'x', selected_index: 1, score: 99, Is_Correct: true, verdict: 'AC' })) === JSON.stringify(['score', 'Is_Correct', 'verdict']));
  s.check('the fields the real page sends are never flagged', I.forbiddenFields({ section_id: 'x', marked: false, seq: 4, selected_index: 2 }).length === 0);
  s.check('an empty, missing or odd body gives nothing', I.forbiddenFields(undefined).length === 0 && I.forbiddenFields([]).length === 0 && I.forbiddenFields('score').length === 0 && I.forbiddenFields({}).length === 0);

  // ── selections ──
  s.check('a number the page could send is not flagged, even past the options (a live edit can cause it)', !I.isTamperedSelection(0) && !I.isTamperedSelection(3) && !I.isTamperedSelection(7));
  s.check('not a number, fractional, negative, or 10 or more is flagged', [-1, 1.5, 10, 99, '2', null, {}, NaN, Infinity].every((v) => I.isTamperedSelection(v)));

  // ── ids ──
  s.check('a UUID or a Firestore auto-id is a real id, a typed string is not', I.looksLikeRealId('22222222-2222-4222-8222-222222222222') && I.looksLikeRealId('aB3dE5gH7jK9mN1pQ3rS') && !I.looksLikeRealId('q1') && !I.looksLikeRealId('../../x') && !I.looksLikeRealId(undefined));

  // ── refusals ──
  const base = { session: { id: 'S2' }, sessionHistory: ['S0', 'S1'], windowExpiresAt: new Date(1_000_000) };
  s.check('an old window of the same attempt is NOT evidence (it is just replaced)', I.refusalEvidence({ attempt: base, refusal: { code: 'SESSION_REPLACED' }, sessionId: 'S1', now: 2_000_000 }) === null);
  s.check('a session code the attempt never had IS evidence', I.refusalEvidence({ attempt: base, refusal: { code: 'SESSION_REPLACED' }, sessionId: 'INVENTED', now: 2_000_000 }) === 'forged_session');
  s.check('the current session is never evidence', I.refusalEvidence({ attempt: base, refusal: { code: 'SESSION_REPLACED' }, sessionId: 'S2', now: 2_000_000 }) === null);
  s.check('an attempt from before session history existed cannot flag anything', I.refusalEvidence({ attempt: { session: { id: 'S2' }, windowExpiresAt: new Date(1) }, refusal: { code: 'SESSION_REPLACED' }, sessionId: 'X', now: 5 }) === null);
  s.check('a malformed or missing session header is not evidence', I.refusalEvidence({ attempt: base, refusal: { code: 'SESSION_REPLACED' }, sessionId: null, now: 2_000_000 }) === null);
  s.check('a write just after the deadline (slow connection) is not evidence', I.refusalEvidence({ attempt: base, refusal: { code: 'TIME_UP' }, sessionId: 'S2', now: 1_000_000 + 30000 }) === null);
  s.check('a write long after the deadline is late-write evidence', I.refusalEvidence({ attempt: base, refusal: { code: 'TIME_UP' }, sessionId: 'S2', now: 1_000_000 + 130000 }) === 'late_write');
  s.check('a locked or submitted refusal proves nothing', I.refusalEvidence({ attempt: base, refusal: { code: 'EXAM_LOCKED' }, sessionId: 'S2', now: 9e9 }) === null && I.refusalEvidence({ attempt: base, refusal: { code: 'ALREADY_SUBMITTED' }, sessionId: 'S2', now: 9e9 }) === null);

  // ── session history ──
  s.check('session history keeps the newest 20, without repeats', I.pushSessionHistory(Array.from({ length: 25 }, (_, i) => `s${i}`), 'new').length === 20 && I.pushSessionHistory(['a'], 'a').length === 1 && I.pushSessionHistory(undefined, 'a')[0] === 'a' && I.pushSessionHistory(['a'], null).length === 1);

  // ── recording ──
  const t0 = 1_700_000_000_000;
  let r = I.applyEvidence(null, { examId: 'E', userId: 'U', type: 'forged_session', detail: 'abc', now: t0 });
  s.check('the first piece of evidence of a kind is recorded and mailed', r.email === true && r.record.counts.forged_session === 1 && r.record.emailCount === 1 && r.record.events.length === 1);
  let r2 = I.applyEvidence(r.record, { examId: 'E', userId: 'U', type: 'forged_session', detail: 'abc', now: t0 + 1000 });
  s.check('the same kind again is counted but not mailed again', r2.email === false && r2.record.counts.forged_session === 2 && r2.record.emailCount === 1);
  let r3 = I.applyEvidence(r2.record, { examId: 'E', userId: 'U', type: 'foreign_question', detail: 'q9', now: t0 + 2000 });
  s.check('a different kind is mailed once too', r3.email === true && r3.record.emailCount === 2);
  const r4 = I.applyEvidence(r3.record, { examId: 'E', userId: 'U', type: 'client_score_fields', detail: 'score', now: t0 + 3000 });
  const r5 = I.applyEvidence(r4.record, { examId: 'E', userId: 'U', type: 'invalid_selection', detail: '99', now: t0 + 4000 });
  s.check('never more than 3 mails for one attempt', r4.email === true && r5.email === false && r5.record.emailCount === 3 && r5.record.counts.invalid_selection === 1);

  let late = null;
  const sent = [];
  for (let i = 0; i < 5; i += 1) { late = I.applyEvidence(late?.record, { examId: 'E', userId: 'U', type: 'late_write', detail: '', now: t0 + i }); sent.push(late.email); }
  s.check('late writes are mailed on the third one only', JSON.stringify(sent) === JSON.stringify([false, false, true, false, false]));

  let many = null;
  for (let i = 0; i < 100; i += 1) many = I.applyEvidence(many?.record, { examId: 'E', userId: 'U', type: 'invalid_selection', detail: String(i), now: t0 + i });
  s.check('only the newest 40 events are kept but the count keeps growing', many.record.events.length === 40 && many.record.counts.invalid_selection === 100 && many.record.events[39].detail === '99');

  s.check('an unknown evidence type is refused', (() => { try { I.applyEvidence(null, { examId: 'E', userId: 'U', type: 'made_up', now: 1 }); return false; } catch (e) { return true; } })());
  const before = JSON.stringify(r.record);
  I.applyEvidence(r.record, { examId: 'E', userId: 'U', type: 'foreign_question', detail: 'x', now: 5 });
  s.check('recording does not change the record it was given', JSON.stringify(r.record) === before);

  // ── text ──
  const dirty = 'a' + String.fromCharCode(13, 10) + 'b' + String.fromCharCode(0) + 'c';
  const bad = (t) => t.split('').some((ch) => ch.charCodeAt(0) < 32);
  s.check('detail is cleaned: line breaks, control characters and length', I.cleanDetail(dirty + 'x'.repeat(200)).length === 80 && !bad(I.cleanDetail(dirty)));
  const mails = I.buildEmails({ student: { name: 'Asha K', rollNo: '21CS001' }, exam: { title: 'Mid Test' }, type: 'forged_session', record: r.record, link: 'https://x.example/faculty/exams/E/integrity' });
  s.check('the student mail says what happened, that it is automatic, and that it is not a decision', /Mid Test/.test(mails.student.text) && /never had/.test(mails.student.text) && /automatically/.test(mails.student.text) && /not a decision/.test(mails.student.text));
  s.check('the admin mail names the student, the exam, the reason and the link', /Asha K/.test(mails.admin.text) && /21CS001/.test(mails.admin.text) && /Mid Test/.test(mails.admin.text) && /never had/.test(mails.admin.text) && /integrity/.test(mails.admin.text));
  const hostile = I.buildEmails({ student: { name: 'Eve\r\nBcc: someone@else.example' }, exam: { title: 'T\nSubject: x' }, type: 'foreign_question', record: I.applyEvidence(null, { examId: 'E', userId: 'U', type: 'foreign_question', detail: 'q\r\n9', now: 1 }).record });
  s.check('names and details from the database cannot add mail headers or lines', !/[\r]/.test(hostile.student.subject + hostile.admin.subject) && !/\n/.test(hostile.student.subject) && !/\n/.test(hostile.admin.subject));
  s.check('every evidence type has a label and a reason', I.TYPES.length === 5 && I.TYPES.every((t) => I.EVIDENCE[t].label && I.EVIDENCE[t].reason));
};
