// The exam flow end to end: the real routes and controllers, with an in-memory stand-in for the database (no network, no Firestore).
// start -> save -> stale save -> second device takes over -> violations lock -> staff resume -> double submit -> late coding submission.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const examRepo = require('../../src/repositories/examRepository');
const userRepo = require('../../src/repositories/userRepository');
const nudgeRepo = require('../../src/repositories/nudgeRepository');
const proctorEventRepo = require('../../src/repositories/proctorEventRepository');
const auditLogRepo = require('../../src/repositories/auditLogRepository');
const problemRepo = require('../../src/repositories/problemRepository');
const { loadAppWithMounts } = require('../routeAudit');

// ── the stand-in database ──
const EXAM_ID = '11111111-1111-4111-8111-111111111111';
const SEC_MCQ = 'secMcq';
const SEC_CODE = 'secCode';
const PROBLEM = '22222222-2222-4222-8222-222222222222';
const NOW0 = Date.now();

const db = { attempts: new Map(), nudges: [], events: [] };
const exam = { id: EXAM_ID, title: 'Mock Test', isPublished: true, facultyId: 'owner1', durationMinutes: 60, windowStart: new Date(NOW0 - 3600000), windowEnd: new Date(NOW0 + 7200000), violationLimit: 1, classroomIds: [], groupIds: [] };
const sections = [
  { id: SEC_MCQ, type: 'mcq', order: 0, title: 'Aptitude', marksPerQuestion: 1, negativeMarking: 0 },
  { id: SEC_CODE, type: 'coding', order: 1, title: 'Coding', marksPerQuestion: 10, problemIds: [PROBLEM] },
];
const questions = [
  { id: 'q1', questionText: 'Q1?', options: ['a', 'b', 'c', 'd'], correctIndex: 1, marks: 1, position: 0 },
  { id: 'q2', questionText: 'Q2?', options: ['a', 'b', 'c', 'd'], correctIndex: 2, marks: 1, position: 1 },
];
const users = new Map([
  ['owner1', { id: 'owner1', name: 'Owner Faculty', role: 'faculty', department: 'CSE' }],
  ['other1', { id: 'other1', name: 'Other Faculty', role: 'faculty', department: 'CSE' }],
  ['hodCSE', { id: 'hodCSE', name: 'HOD CSE', role: 'hod', department: 'CSE' }],
  ['hodECE', { id: 'hodECE', name: 'HOD ECE', role: 'hod', department: 'ECE' }],
  ['adm1', { id: 'adm1', name: 'Admin', role: 'admin' }],
]);
for (const id of ['stu1', 'stu2', 'stu3', 'stuLate', 'stuDone', 'stuLock', 'stuSess']) users.set(id, { id, name: `Student ${id}`, role: 'student', rollNo: `R-${id}`, section: 'A' });

const setPath = (obj, path, value) => {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) { if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
  cur[parts[parts.length - 1]] = value;
};
const applyUpdate = (doc, update) => { for (const [k, v] of Object.entries(update)) { if (k.includes('.')) setPath(doc, k, structuredClone(v)); else doc[k] = structuredClone(v); } };
const view = (userId) => { const d = db.attempts.get(userId); return d ? { userId, ...structuredClone(d) } : null; };

function installFakes() {
  Object.assign(examRepo, {
    getById: async (id) => (id === EXAM_ID ? { ...exam } : null),
    listPublished: async () => [{ ...exam }],
    getSections: async () => sections.map((s) => ({ ...s })),
    getSection: async (_e, sid) => { const s = sections.find((x) => x.id === sid); return s ? { ...s } : null; },
    getSectionQuestions: async () => questions.map((q) => ({ ...q })),
    getSectionCount: async () => sections.length,
    getAttempt: async (_e, uid) => view(uid),
    startAttempt: async (_e, uid, windowExpiresAt) => {
      if (!db.attempts.has(uid)) db.attempts.set(uid, { startedAt: new Date(), windowExpiresAt, submittedAt: null, score: null, total: null, questionState: {}, codingState: {} });
      return view(uid);
    },
    mutateAttempt: async (_e, uid, decide) => {
      const r = decide(view(uid)) || {};
      if (r.update && db.attempts.has(uid)) applyUpdate(db.attempts.get(uid), r.update);
      return r.outcome;
    },
    listAttempts: async () => [...db.attempts.keys()].map(view),
    finishAttempt: async (_e, uid, f) => { applyUpdate(db.attempts.get(uid), { submittedAt: f.submittedAt ?? new Date(), score: f.score, total: f.total, ...(f.autoSubmitted ? { autoSubmitted: true } : {}) }); },
  });
  Object.assign(userRepo, { getById: async (id) => users.get(id) || null, getAllUsersMap: async () => new Map(users) });
  nudgeRepo.addMany = async (rows) => { db.nudges.push(...rows); };
  proctorEventRepo.create = async (e) => { db.events.push(e); };
  auditLogRepo.create = async () => {};
  problemRepo.getMapByIds = async (ids) => new Map((ids || []).map((id) => [id, { title: 'Two Sum', difficulty: 'easy' }]));
}

module.exports = async function (s) {
  installFakes();
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
  const answer = (who, session, qid, idx, seq) => call('PATCH', `/api/exams/${EXAM_ID}/attempt/questions/${qid}`, who, { session, body: { section_id: SEC_MCQ, selected_index: idx, seq } });
  const submit = (who, session) => call('POST', `/api/exams/${EXAM_ID}/submit`, who, { session });

  try {
    // ── start ──
    const st = await start('stu1');
    s.check('starting an exam gives a session, the server clock and about an hour', st.status === 200 && /^[0-9a-f]{32}$/.test(st.data.session_id) && st.data.seconds_remaining > 3500 && !!st.data.server_time && st.data.locked === null);
    s.check('the exam payload never contains the answer key before submission', !JSON.stringify(st.data.sections).includes('correct_index') && !JSON.stringify(st.data.sections).includes('correctIndex'));
    const S1 = st.data.session_id;

    // ── saving ──
    const a1 = await answer('stu1', S1, 'q1', 1, 1);
    s.check('a save with the right session is accepted and stored', a1.status === 200 && a1.data.status === 'answered' && db.attempts.get('stu1').questionState.q1.selectedIndex === 1 && !!db.attempts.get('stu1').lastSaveAt);
    const stale = await answer('stu1', S1, 'q1', 3, 1);
    s.check('a delayed copy of an older save is acknowledged but does not overwrite the newer answer', stale.status === 200 && stale.data.stale === true && db.attempts.get('stu1').questionState.q1.selectedIndex === 1);
    const newer = await answer('stu1', S1, 'q1', 2, 2);
    s.check('a newer save replaces it', newer.status === 200 && db.attempts.get('stu1').questionState.q1.selectedIndex === 2 && db.attempts.get('stu1').questionState.q1.seq === 2);
    const noSession = await answer('stu1', null, 'q1', 0, 3);
    s.check('a save with no session is refused so an out-of-date page reloads', noSession.status === 409 && noSession.json.code === 'SESSION_REQUIRED');
    const bad = await answer('stu1', 'f'.repeat(32), 'q1', 0, 3);
    s.check('a save with someone else\'s session is refused', bad.status === 409 && bad.json.code === 'SESSION_REPLACED');
    s.check('an option that does not exist is a 400, an unknown question a 404', (await answer('stu1', S1, 'q1', 99, 4)).status === 400 && (await answer('stu1', S1, 'nope', 0, 4)).status === 404);
    s.check('a student cannot save into someone else\'s attempt: there is no way to name another student', (await answer('stu2', S1, 'q1', 0, 1)).json.code === 'NOT_STARTED');

    // ── a second device takes over ──
    const st2 = await start('stu1');
    const S2 = st2.data.session_id;
    s.check('starting again from another window makes it the active one', st2.status === 200 && S2 !== S1 && db.events.some((e) => e.eventType === 'session_takeover' && e.userId === 'stu1'));
    s.check('the first window is told it was replaced on its next save', (await answer('stu1', S1, 'q1', 0, 5)).json.code === 'SESSION_REPLACED');
    s.check('the new window saves, and its answers include what the first window saved', (await answer('stu1', S2, 'q2', 2, 1)).status === 200 && st2.data.question_state.q1.selectedIndex === 2);
    s.check('the clock was not reset by the takeover', Math.abs(st2.data.seconds_remaining - st.data.seconds_remaining) < 5);

    // ── violations lock the attempt ──
    await start('stuLock');
    const ev = await call('POST', '/api/proctor/event', 'stuLock', { body: { exam_id: EXAM_ID, event_type: 'fullscreen_exit' } });
    s.check('leaving fullscreen past the exam\'s limit pauses the attempt and says so at once', ev.status === 200 && ev.data.locked === true && ev.data.violation_count === 1 && ev.data.violation_limit === 1);
    const lockedSave = await answer('stuLock', db.attempts.get('stuLock').session.id, 'q1', 1, 1);
    s.check('a paused attempt refuses saves with 423 and tells the student to ask staff', lockedSave.status === 423 && lockedSave.json.code === 'EXAM_LOCKED' && /faculty|invigilator/.test(lockedSave.json.hint));
    const lockedSubmit = await submit('stuLock', db.attempts.get('stuLock').session.id);
    s.check('a paused attempt cannot be submitted either', lockedSubmit.status === 423);
    s.check('events that do not count (copy, fullscreen_enter) change nothing', (await call('POST', '/api/proctor/event', 'stu2', { body: { exam_id: EXAM_ID, event_type: 'copy' } })).data?.locked !== true);
    s.check('the raw event is still recorded for the report', db.events.some((e) => e.eventType === 'fullscreen_exit' && e.userId === 'stuLock'));

    // ── staff resume ──
    const path = (who) => `/api/exams/${EXAM_ID}/attempts/${who}/reopen`;
    s.check('another faculty member cannot resume a student on someone else\'s exam', (await call('POST', path('stuLock'), 'other1', { body: { reason: 'network drop', extra_minutes: 5 } })).status === 403);
    s.check('an HOD of another department cannot', (await call('POST', path('stuLock'), 'hodECE', { body: { reason: 'network drop', extra_minutes: 5 } })).status === 403);
    s.check('a student cannot', (await call('POST', path('stuLock'), 'stu2', { body: { reason: 'network drop', extra_minutes: 5 } })).status === 403);
    s.check('resuming needs a written reason', (await call('POST', path('stuLock'), 'owner1', { body: { reason: '', extra_minutes: 5 } })).json.code === 'REASON_REQUIRED');
    const before = db.attempts.get('stuLock').windowExpiresAt.getTime();
    const resume = await call('POST', path('stuLock'), 'owner1', { body: { reason: 'Wi-Fi dropped, not cheating', extra_minutes: 10 } });
    const after = db.attempts.get('stuLock');
    s.check('the owner resumes a paused student: the lock is cleared and 10 minutes are added', resume.status === 200 && after.locked === null && after.windowExpiresAt.getTime() === before + 10 * 60000 && after.violationCount === 0);
    s.check('the reopen is recorded on the attempt with who, why and when', after.reopens.length === 1 && after.reopens[0].byId === 'owner1' && after.reopens[0].reason === 'Wi-Fi dropped, not cheating');
    s.check('the student is told in the app', db.nudges.some((n) => n.studentId === 'stuLock' && /reopened/.test(n.message)));
    const oldSession = await answer('stuLock', after.session.id.replace(/./, (c) => (c === 'a' ? 'b' : 'a')), 'q1', 1, 1);
    s.check('the page that was paused cannot write: it has no valid session until the student starts again', oldSession.status === 409 && oldSession.json.code === 'SESSION_REPLACED');
    const again = await start('stuLock');
    s.check('starting again after being resumed gives a valid session and the saved answers', again.status === 200 && (await answer('stuLock', again.data.session_id, 'q1', 1, 1)).status === 200);
    s.check('the HOD of the owner\'s department and an Admin can resume too', (await call('POST', path('stuLock'), 'hodCSE', { body: { reason: 'second check', extra_minutes: 0 } })).json.code === 'STILL_RUNNING');

    // ── submit is idempotent ──
    await answer('stu1', S2, 'q1', 1, 9);
    const sub1 = await submit('stu1', S2);
    s.check('submitting scores the attempt from its current state (q1 right, q2 right = 2 of 12)', sub1.status === 200 && sub1.data.score === 2 && sub1.data.total === 12 && !sub1.data.already_submitted);
    const sub2 = await submit('stu1', S2);
    s.check('pressing Finish again returns the same result instead of an error', sub2.status === 200 && sub2.data.already_submitted === true && sub2.data.score === 2);
    s.check('a retry from the replaced window also returns the result, not an error', (await submit('stu1', S1)).data.already_submitted === true);
    s.check('after submitting, saves are refused with 409', (await answer('stu1', S2, 'q1', 0, 99)).json.code === 'ALREADY_SUBMITTED');
    s.check('starting a submitted exam again is refused', (await start('stu1')).json.code === 'ALREADY_SUBMITTED');
    s.check('a submit with a wrong session is refused and does not submit', await (async () => { await start('stu3'); const r = await submit('stu3', 'e'.repeat(32)); return r.status === 409 && r.json.code === 'SESSION_REPLACED' && !db.attempts.get('stu3').submittedAt; })());

    // ── reopen a submitted attempt, and a time-out ──
    const reopenDone = await call('POST', path('stu1'), 'adm1', { body: { reason: 'Browser crashed at the end', extra_minutes: 15 } });
    s.check('an Admin can reopen a submitted attempt; the old score is kept on the record', reopenDone.status === 200 && db.attempts.get('stu1').submittedAt === null && db.attempts.get('stu1').reopens[0].previous.score === 2);
    s.check('a reopened attempt needs the student to start again', (await answer('stu1', S2, 'q1', 0, 100)).json.code === 'SESSION_REPLACED');

    s.check('a still-running attempt cannot be reopened', (await call('POST', path('stuSessRun'), 'owner1', { body: { reason: 'no need at all', extra_minutes: 5 } })).json.code === 'NOT_STARTED');
    users.set('stuRunning', { id: 'stuRunning', name: 'x', role: 'student' });
    await start('stuRunning');
    s.check('an attempt that is running (not paused, not finished) says there is nothing to reopen', (await call('POST', path('stuRunning'), 'owner1', { body: { reason: 'no need at all', extra_minutes: 5 } })).json.code === 'STILL_RUNNING');

    // ── the roster ──
    const roster = await call('GET', `/api/exams/${EXAM_ID}/roster`, 'owner1');
    s.check('the owner sees the roster with state, answers and who can resume', roster.status === 200 && roster.data.rows.length >= 3 && roster.data.can_resume === true && roster.data.counts.total === roster.data.rows.length, JSON.stringify({ status: roster.status, error: roster.json?.error, rows: roster.data?.rows?.length, can: roster.data?.can_resume }));
    const rowLock = roster.data.rows.find((r) => r.userId === 'stuLock');
    s.check('a reopened student shows as reopened once, in progress', rowLock.reopenCount === 1 && rowLock.state === 'in_progress');
    s.check('another faculty member cannot see someone else\'s roster', (await call('GET', `/api/exams/${EXAM_ID}/roster`, 'other1')).status === 404);
    s.check('a student cannot read the roster', (await call('GET', `/api/exams/${EXAM_ID}/roster`, 'stu2')).status === 403);

    // ── time runs out ──
    await start('stuLate');
    db.attempts.get('stuLate').windowExpiresAt = new Date(Date.now() - 1000);
    const lateSid = db.attempts.get('stuLate').session.id;
    s.check('a save after the deadline is refused (the clock is the server\'s)', (await answer('stuLate', lateSid, 'q1', 1, 1)).json.code === 'TIME_UP');
    const lateSubmit = await submit('stuLate', lateSid);
    s.check('a manual submit after the deadline is refused, the attempt is marked when its state is next read', lateSubmit.status === 409 && lateSubmit.json.code === 'TIME_UP');
    const state = await call('GET', `/api/exams/${EXAM_ID}/attempt`, 'stuLate');
    s.check('reading the attempt after the deadline scores it as submitted when time ran out', state.status === 200 && state.data.submitted === true && db.attempts.get('stuLate').autoSubmitted === true);

    // ── coding submissions are gated by the attempt ──
    const code = (who, session) => call('POST', '/api/submit', who, { session, body: { source_code: 'print(1)', language_id: 71, problem_id: PROBLEM, exam_id: EXAM_ID, section_id: SEC_CODE } });
    users.set('stuExpired', { id: 'stuExpired', name: 'x', role: 'student' });
    await start('stuExpired');
    db.attempts.get('stuExpired').windowExpiresAt = new Date(Date.now() - 1000);
    const cExpired = await code('stuExpired', db.attempts.get('stuExpired').session.id);
    s.check('a coding submission after the deadline is refused with 409 TIME_UP (it used to be recorded)', cExpired.status === 409 && cExpired.json.code === 'TIME_UP');
    const cLateDone = await code('stuLate', lateSid);
    s.check('and once that attempt has been marked as submitted, it says so', cLateDone.status === 409 && cLateDone.json.code === 'ALREADY_SUBMITTED');
    await start('stuDone');
    db.attempts.get('stuDone').submittedAt = new Date();
    const doneSid = db.attempts.get('stuDone').session.id;
    const cDone = await code('stuDone', doneSid);
    s.check('a coding submission after the exam was submitted is refused with 409', cDone.status === 409 && cDone.json.code === 'ALREADY_SUBMITTED');
    await start('stuSess');
    const cWrong = await code('stuSess', 'a'.repeat(32));
    s.check('a coding submission from a replaced window is refused', cWrong.status === 409 && cWrong.json.code === 'SESSION_REPLACED');
    db.attempts.set('stuLockCode', { ...structuredClone(db.attempts.get('stuSess')), locked: { at: Date.now(), reason: 'violations', count: 1 } });
    users.set('stuLockCode', { id: 'stuLockCode', name: 'x', role: 'student' });
    const cLock = await code('stuLockCode', db.attempts.get('stuLockCode').session.id);
    s.check('a coding submission while paused is refused with 423', cLock.status === 423 && cLock.json.code === 'EXAM_LOCKED');
    users.set('stuNoSess', { id: 'stuNoSess', name: 'x', role: 'student' });
    await start('stuNoSess');
    const cNone = await code('stuNoSess', null); // a fresh user: the submit limiter allows one submission per 10 seconds per person
    const cAnon = await call('POST', '/api/submit', null, { body: { source_code: 'print(1)', language_id: 71, problem_id: PROBLEM, exam_id: EXAM_ID, section_id: SEC_CODE } });
    s.check('an anonymous submission naming an exam is refused', cAnon.status === 404 && cAnon.json.code === 'NOT_STARTED');
    s.check('a coding submission with no session, where the attempt has one, is refused', cNone.status === 409 && cNone.json.code === 'SESSION_REQUIRED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};
