// Per-student question and option order, and the integrity evidence + mails, through the real routes (in-memory database).
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { createExamFakeDb, EXAM_ID, SEC_MCQ } = require('../fakes/examFakeDb');
const { loadAppWithMounts } = require('../routeAudit');
const integrityService = require('../../src/services/integrityService');
const examLive = require('../../src/services/examLiveService');

const fake = createExamFakeDb({ violationLimit: 5, questionCount: 12 });
// Realistic options (the default "Option A..." text is treated as position-dependent and so is never shuffled).
fake.questions.forEach((q) => { q.options = ['red', 'green', 'blue', 'pink']; });
const { db, users } = fake;
fake.addStudent('stuNew'); fake.addStudent('stuOld'); fake.addStudent('stuCheat'); fake.addStudent('stuOldWindow'); fake.addStudent('stuLate2');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond, ms = 1500) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await sleep(15); } return cond(); };

module.exports = async function (s) {
  fake.install();
  examLive.clearMemo();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const token = (id) => { const u = users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, { body, session } = {}) => {
    const res = await fetch(base + path, {
      method, signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who)}` } : {}), ...(session ? { 'x-exam-session': session } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json, data: json?.data };
  };
  const start = (who) => call('POST', `/api/exams/${EXAM_ID}/start`, who);
  const state = (who, session) => call('GET', `/api/exams/${EXAM_ID}/attempt`, who, { session });
  const save = (who, session, qid, idx, seq, extra) => call('PATCH', `/api/exams/${EXAM_ID}/attempt/questions/${qid}`, who, { session, body: { section_id: SEC_MCQ, selected_index: idx, seq, ...(extra || {}) } });
  const submit = (who, session, body) => call('POST', `/api/exams/${EXAM_ID}/submit`, who, { session, body });
  const original = (qid) => fake.questions.find((q) => q.id === qid);
  const mcq = (data) => data.sections.find((x) => x.id === SEC_MCQ).questions;
  const record = (who) => db.integrity.get(`${EXAM_ID}_${who}`);

  try {
    // ══ shuffling ══
    const a = await start('stu1'); const b = await start('stu2'); const c = await start('stu3');
    const orderOf = (r) => mcq(r.data).map((q) => q.id).join(',');
    const ids = fake.questions.map((q) => q.id).sort().join(',');
    s.check('every student gets every question exactly once', [a, b, c].every((r) => mcq(r.data).map((q) => q.id).sort().join(',') === ids));
    s.check('three students do not all see the same order (12 questions)', new Set([orderOf(a), orderOf(b), orderOf(c)]).size > 1);
    s.check('the options are the same four, shown in a student\'s own order for at least one question', mcq(a.data).every((q) => [...q.options].sort().join() === 'blue,green,pink,red') && mcq(a.data).some((q) => q.options.join() !== 'red,green,blue,pink'));
    s.check('the answer key is not in the payload', !JSON.stringify(a.data).includes('correct_index') && !JSON.stringify(a.data).includes('correctIndex'));
    s.check('the layout is kept on the attempt, and a session history starts', !!db.attempts.get('stu1').layout?.sections?.[SEC_MCQ] && Array.isArray(db.attempts.get('stu1').sessionHistory));

    // The student picks the option that is CORRECT in the original list, by what they see. Full marks proves the mapping.
    const S = a.data.session_id;
    let seq = 0;
    for (const q of mcq(a.data)) {
      const truth = original(q.id);
      const shownIndex = q.options.indexOf(truth.options[truth.correctIndex]);
      const r = await save('stu1', S, q.id, shownIndex, ++seq);
      if (r.status !== 200) { s.check('a save with a shown index is accepted (got ' + r.status + ' ' + JSON.stringify(r.json) + ' for ' + q.id + ' index ' + shownIndex + ' of ' + JSON.stringify(q.options) + ')', false); break; }
    }
    const firstQ = mcq(a.data)[0];
    const firstTruth = original(firstQ.id);
    const storedIdx = db.attempts.get('stu1').questionState[firstQ.id].selectedIndex;
    s.check('what is STORED is the option\'s place in the exam\'s own list (the correct one), whatever the student saw', storedIdx === firstTruth.correctIndex);
    const reload = await state('stu1', S);
    s.check('after a reload the student sees the same order and the same ticks', orderOf(reload) === orderOf(a) && mcq(reload.data).every((q) => q.options[reload.data.question_state[q.id].selectedIndex] === original(q.id).options[original(q.id).correctIndex]));
    const done = await submit('stu1', S);
    s.check('choosing the correct option by what is shown scores full marks, so display and scoring agree', done.status === 200 && done.data.score >= 12 && done.data.sections.length >= 1);
    const review = await state('stu1', S);
    s.check('the review shows the right answer at the position the student saw it', mcq(review.data).every((q) => q.options[q.correct_index] === original(q.id).options[original(q.id).correctIndex]) && mcq(review.data).every((q) => review.data.question_state[q.id].selectedIndex === q.correct_index));

    // a wrong shown choice does not score
    const w = await start('stu2');
    const wq = mcq(w.data)[0];
    const wrongShown = wq.options.findIndex((t) => t !== original(wq.id).options[original(wq.id).correctIndex]);
    await save('stu2', w.data.session_id, wq.id, wrongShown, 1);
    const wdone = await submit('stu2', w.data.session_id);
    s.check('a wrong choice scores nothing', wdone.status === 200 && wdone.data.score === 0);

    // taking over keeps the order (never reshuffled mid-exam)
    const again = await start('stu3');
    s.check('starting again from another window keeps the same question and option order', orderOf(again) === orderOf(c) && JSON.stringify(mcq(again.data).map((q) => q.options)) === JSON.stringify(mcq(c.data).map((q) => q.options)));

    // an attempt from before this feature has no layout: it keeps the written order and written options
    await start('stuOld');
    delete db.attempts.get('stuOld').layout;
    const old = await start('stuOld');
    s.check('an attempt without a layout (started before this feature) shows the written order and options', mcq(old.data).map((q) => q.id).join() === fake.questions.map((q) => q.id).join() && mcq(old.data).every((q) => q.options.join() === 'red,green,blue,pink'));
    await save('stuOld', old.data.session_id, 'q1', 2, 1);
    s.check('and its saves are stored as sent (no translation)', db.attempts.get('stuOld').questionState.q1.selectedIndex === 2);

    // ══ integrity: hard evidence ══
    const ch = await start('stuCheat');
    const SC = ch.data.session_id;
    const mails0 = db.mails.length;

    const forged = await save('stuCheat', 'e'.repeat(32), 'q1', 0, 1);
    s.check('a save with an invented session code is refused', forged.status === 409 && forged.json.code === 'SESSION_REPLACED');
    s.check('and recorded as hard evidence against the student who sent it', await waitFor(() => record('stuCheat')?.counts?.forged_session === 1));
    s.check('the student and the admin are both mailed, separately, with the reason', await waitFor(() => db.mails.length >= mails0 + 2)
      && db.mails.some((m) => m.to === 'stuCheat@student.test' && /never had/.test(m.text)) && db.mails.some((m) => m.to === 'admin@college.test' && /Student Student|stuCheat|R-stuCheat/.test(m.text)));
    s.check('staff who are not admins (faculty, HOD) are not mailed', !db.mails.some((m) => /owner1|hodcse|other1|hodece/.test(m.to)));
    s.check('the mail status is stored on the record', await waitFor(() => record('stuCheat')?.mail?.forged_session?.status === 'sent'));

    // an old window of the SAME attempt is not evidence
    const ow = await start('stuOldWindow');
    const SO1 = ow.data.session_id;
    await start('stuOldWindow');
    const replaced = await save('stuOldWindow', SO1, 'q1', 0, 1);
    await sleep(120);
    s.check('an old window of the same attempt is refused but is NOT evidence', replaced.status === 409 && !record('stuOldWindow'));

    // unknown question / section
    integrityService._lastWritten.clear();
    const fq = await save('stuCheat', SC, 'hacked-question', 1, 1);
    s.check('a made-up question id is a 404 and is recorded', fq.status === 404 && await waitFor(() => record('stuCheat')?.counts?.foreign_question === 1));
    const realShapedMissing = await save('stuCheat', SC, 'aB3dE5gH7jK9mN1pQ3rS', 1, 2);
    await sleep(120);
    s.check('a question id that looks real but is gone (a live edit) is a 404 and is NOT evidence', realShapedMissing.status === 404 && (record('stuCheat')?.counts?.foreign_question ?? 0) === 1);

    // options that cannot exist
    integrityService._lastWritten.clear();
    const bad99 = await save('stuCheat', SC, 'q1', 99, 3);
    s.check('an option of 99 is a 400 and is recorded', bad99.status === 400 && await waitFor(() => record('stuCheat')?.counts?.invalid_selection === 1));
    integrityService._lastWritten.clear();
    const near = await save('stuCheat', SC, 'q1', 6, 4);
    await sleep(120);
    s.check('an option just past the list (6 of 4, a live edit could cause it) is a 400 but is NOT evidence', near.status === 400 && record('stuCheat').counts.invalid_selection === 1);
    integrityService._lastWritten.clear();
    const str = await save('stuCheat', SC, 'q1', '2', 5);
    s.check('an option sent as text is a 400 and is recorded', str.status === 400 && await waitFor(() => record('stuCheat').counts.invalid_selection === 2));

    // score fields
    integrityService._lastWritten.clear();
    const withScore = await save('stuCheat', SC, 'q2', 1, 6, { score: 100, is_correct: true });
    s.check('a save carrying a score is still just a save: the fields are ignored and recorded', withScore.status === 200 && db.attempts.get('stuCheat').score == null && await waitFor(() => record('stuCheat')?.counts?.client_score_fields === 1));
    s.check('only the field NAMES are kept, never values', record('stuCheat').events.find((e) => e.type === 'client_score_fields').detail === 'score,is_correct');
    integrityService._lastWritten.clear();
    const subScore = await submit('stuCheat', SC, { score: 999 });
    s.check('a submit carrying a score is scored by the server, not the client', subScore.status === 200 && subScore.data.score !== 999);

    // the same kind again does not mail again, and a flood is one write
    const mailsBefore = db.mails.length;
    const writesBefore = db.integrityWrites;
    await Promise.all(Array.from({ length: 60 }, (_, i) => call('PATCH', `/api/exams/${EXAM_ID}/attempt/questions/junk${i}`, 'stuLate2', { session: 'f'.repeat(32), body: { section_id: SEC_MCQ, selected_index: 0, seq: i } })));
    await sleep(200);
    s.check('60 bad requests in a burst cost at most one evidence write', db.integrityWrites - writesBefore <= 1);
    s.check('no more than 3 mails were ever sent for one attempt', (record('stuCheat').emailCount ?? 0) <= 3 && db.mails.filter((m) => m.to === 'stuCheat@student.test').length <= 3);
    s.check('a burst of the same kind sends no extra mails', db.mails.length - mailsBefore <= 2);

    // ══ mail trouble never touches the exam ══
    db.mailMode = 'not_configured';
    await start('stuLate2');
    integrityService._lastWritten.clear();
    const nc = await save('stuLate2', 'a'.repeat(32), 'q1', 0, 1);
    s.check('with no mail server configured the exam still answers normally', nc.status === 409 && nc.json.code === 'SESSION_REPLACED');
    s.check('the evidence is still recorded, and the mail status says "not_configured"', await waitFor(() => record('stuLate2')?.mail?.forged_session?.status === 'not_configured'));

    db.mailMode = 'throw';
    fake.addStudent('stuBoom'); await start('stuBoom');
    const boom = await save('stuBoom', 'b'.repeat(32), 'q1', 0, 1);
    s.check('a mail library that throws changes nothing for the student', boom.status === 409);
    s.check('and the evidence is still on record', await waitFor(() => !!record('stuBoom')?.counts?.forged_session));
    db.mailMode = 'fail';
    fake.addStudent('stuFail'); await start('stuFail');
    await save('stuFail', 'c'.repeat(32), 'q1', 0, 1);
    s.check('a mail server that refuses is recorded as "failed" so staff can resend', await waitFor(() => record('stuFail')?.mail?.forged_session?.status === 'failed'));
    db.mailMode = 'ok';

    // ══ staff report ══
    const rep = await call('GET', `/api/exams/${EXAM_ID}/integrity`, 'adm1');
    const row = rep.data?.rows?.find((r) => r.userId === 'stuCheat');
    s.check('an Admin can read the integrity report: who, what, how many, mail status', rep.status === 200 && !!row && row.total >= 4 && row.types.some((t) => t.type === 'forged_session' && t.mail?.status === 'sent') && rep.data.mail_configured === true);
    s.check('the report lists the worst first and keeps recent events with plain labels', rep.data.rows[0].total >= rep.data.rows[rep.data.rows.length - 1].total && row.events.length > 0 && row.events.every((e) => e.label && e.at));
    s.check('the exam\'s owner can read it', (await call('GET', `/api/exams/${EXAM_ID}/integrity`, 'owner1')).status === 200);
    s.check('the owner\'s HOD can read it, another department\'s HOD cannot', (await call('GET', `/api/exams/${EXAM_ID}/integrity`, 'hodCSE')).status === 200 && (await call('GET', `/api/exams/${EXAM_ID}/integrity`, 'hodECE')).status === 403);
    s.check('other faculty and students cannot', (await call('GET', `/api/exams/${EXAM_ID}/integrity`, 'other1')).status === 403 && (await call('GET', `/api/exams/${EXAM_ID}/integrity`, 'stu1')).status === 403);
    s.check('without signing in it is refused', (await call('GET', `/api/exams/${EXAM_ID}/integrity`, null)).status === 401);

    const mBefore = db.mails.length;
    const resend = await call('POST', `/api/exams/${EXAM_ID}/integrity/stuCheat/resend`, 'adm1', { body: { type: 'forged_session' } });
    s.check('staff can send the mails again', resend.status === 200 && resend.data.status === 'sent' && db.mails.length >= mBefore + 2);
    s.check('resend needs a real kind of evidence and an existing record', (await call('POST', `/api/exams/${EXAM_ID}/integrity/stuCheat/resend`, 'adm1', { body: { type: 'made_up' } })).status === 400 && (await call('POST', `/api/exams/${EXAM_ID}/integrity/stu2/resend`, 'adm1', { body: { type: 'forged_session' } })).status === 404);
    s.check('a student or another department\'s HOD cannot resend', (await call('POST', `/api/exams/${EXAM_ID}/integrity/stuCheat/resend`, 'stuCheat', { body: { type: 'forged_session' } })).status === 403 && (await call('POST', `/api/exams/${EXAM_ID}/integrity/stuCheat/resend`, 'hodECE', { body: { type: 'forged_session' } })).status === 403);

    // ══ late writes ══
    fake.addStudent('stuLateW'); const lw = await start('stuLateW');
    db.attempts.get('stuLateW').windowExpiresAt = new Date(Date.now() - 10 * 60000);
    const mailsLate = db.mails.length;
    const codes = [];
    for (let i = 0; i < 3; i += 1) { integrityService._lastWritten.clear(); codes.push((await save('stuLateW', lw.data.session_id, 'q1', 0, i + 1)).json.code); await waitFor(() => record('stuLateW')?.counts?.late_write === i + 1); }
    s.check('writes long after time ran out are refused with TIME_UP', codes.every((x) => x === 'TIME_UP'));
    s.check('they are counted every time but mailed only on the third', record('stuLateW').counts.late_write === 3 && await waitFor(() => db.mails.length >= mailsLate + 2) && db.mails.filter((m) => m.to === 'stuLateW@student.test').length === 1);
    fake.addStudent('stuJustLate'); const jl = await start('stuJustLate');
    db.attempts.get('stuJustLate').windowExpiresAt = new Date(Date.now() - 20000);
    await save('stuJustLate', jl.data.session_id, 'q1', 0, 1);
    await sleep(120);
    s.check('a save a few seconds after the deadline (slow connection) is refused but is NOT evidence', !record('stuJustLate'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};
