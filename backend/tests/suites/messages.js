// Direct messages: who may write to whom, student consent, blocking, reporting,
// and who can read a reported conversation. Pure checks use fixtures; API checks use
// throwaway users, classes and threads in scratch departments, deleted afterwards.
const { tokenFor, userId, get, post, patch, Suite, db } = require('../harness');
const M = require('../../src/utils/messages');

const now = Date.UTC(2026, 9, 1, 12, 0, 0);
const hod = { id: 'h', role: 'hod', department: 'CSE' };
const fac = { id: 'f', role: 'faculty', department: 'CSE' };
const adm = { id: 'a', role: 'admin', department: null };
const stu = (id, department = 'CSE') => ({ id, role: 'student', department });

function pure(s) {
  s.check('body: empty, whitespace and non-strings are rejected', [undefined, null, 5, '', '   \n '].every((b) => !!M.validateBody(b).error));
  s.check('body: exactly the limit is accepted, one more is not', !M.validateBody('x'.repeat(M.MAX_BODY)).error && !!M.validateBody('x'.repeat(M.MAX_BODY + 1)).error);
  s.check('body: surrounding space is trimmed and line endings normalised', M.validateBody('  hi\r\nthere  ').body === 'hi\nthere');

  s.check('start: a student can never start a conversation', !!M.canStart({ sender: stu('s1'), recipient: fac }).error);
  s.check('start: nobody can message themselves', !!M.canStart({ sender: hod, recipient: hod }).error);
  s.check('start: a missing recipient is refused', !!M.canStart({ sender: hod, recipient: null }).error);
  s.check('start: staff to staff in the same department', !!M.canStart({ sender: fac, recipient: hod }).ok);
  s.check('start: staff to staff in another department is refused', !!M.canStart({ sender: fac, recipient: { ...hod, id: 'h2', department: 'ECE' } }).error);
  s.check('start: an admin may message any staff member and be messaged by them', !!M.canStart({ sender: adm, recipient: { ...hod, department: 'ECE' } }).ok && !!M.canStart({ sender: fac, recipient: adm }).ok);
  s.check('start: staff with no department do not match each other', !!M.canStart({ sender: { id: 'x', role: 'faculty', department: null }, recipient: { id: 'y', role: 'faculty', department: null } }).error);
  s.check('start: an HOD may message a student of their own department only', !!M.canStart({ sender: hod, recipient: stu('s1') }).ok && !!M.canStart({ sender: hod, recipient: stu('s2', 'ECE') }).error);
  s.check('start: faculty may message a student only when related', !!M.canStart({ sender: fac, recipient: stu('s1'), related: true }).ok && !!M.canStart({ sender: fac, recipient: stu('s1') }).error);
  s.check('start: an admin may message any student', !!M.canStart({ sender: adm, recipient: stu('s1', 'ECE') }).ok);

  const toStudent = M.newThread({ sender: fac, recipient: stu('s1'), now });
  s.check('thread: a conversation with a student starts pending and records the departments', toStudent.status === 'pending' && toStudent.studentId === 's1' && toStudent.departments.join() === 'CSE');
  s.check('thread: staff to staff starts active with no student', M.newThread({ sender: fac, recipient: hod, now }).status === 'active' && M.newThread({ sender: fac, recipient: hod, now }).studentId === null);
  s.check('thread: participants are stored sorted, so the pair is one thread whoever starts it', M.newThread({ sender: stu('s1') && fac, recipient: stu('s1'), now }).participants.join() === ['f', 's1'].sort().join());

  const pending = { ...toStudent, id: 't', staffMessages: 0 };
  s.check('send: the opening message is allowed to a pending student', !!M.canSend({ thread: pending, senderId: 'f' }).ok);
  s.check('send: a second message before acceptance is refused', M.canSend({ thread: { ...pending, staffMessages: 1 }, senderId: 'f' }).status === 403);
  s.check('send: a student reply is allowed and activates the thread', (() => { const v = M.canSend({ thread: { ...pending, staffMessages: 1 }, senderId: 's1' }); return v.ok && v.activates; })());
  s.check('send: an active thread lets staff write freely', !!M.canSend({ thread: { ...pending, status: 'active', staffMessages: 5 }, senderId: 'f' }).ok);
  s.check('send: a declined thread allows nothing from either side', M.canSend({ thread: { ...pending, status: 'declined' }, senderId: 'f' }).status === 403 && M.canSend({ thread: { ...pending, status: 'declined' }, senderId: 's1' }).status === 403);
  s.check('send: the person blocked cannot write, and neither can the blocker until they unblock', M.canSend({ thread: { ...pending, status: 'active', blockedBy: ['s1'] }, senderId: 'f' }).status === 403 && M.canSend({ thread: { ...pending, status: 'active', blockedBy: ['s1'] }, senderId: 's1' }).status === 403);
  s.check('send: a stranger gets "not found", not "forbidden"', M.canSend({ thread: pending, senderId: 'zzz' }).status === 404 && M.canSend({ thread: null, senderId: 'f' }).status === 404);

  s.check('action: only the student can accept or decline', M.applyAction({ thread: pending, userId: 'f', action: 'accept', now }).status === 403);
  s.check('action: accept activates, decline refuses', M.applyAction({ thread: pending, userId: 's1', action: 'accept', now }).patch.status === 'active' && M.applyAction({ thread: pending, userId: 's1', action: 'decline', now }).patch.status === 'declined');
  s.check('action: an active conversation cannot be declined, only blocked', M.applyAction({ thread: { ...pending, status: 'active' }, userId: 's1', action: 'decline', now }).status === 400);
  s.check('action: a declined thread can be accepted later', M.applyAction({ thread: { ...pending, status: 'declined' }, userId: 's1', action: 'accept', now }).patch.status === 'active');
  s.check('action: block and unblock toggle only the caller', JSON.stringify(M.applyAction({ thread: { ...pending, blockedBy: ['f'] }, userId: 's1', action: 'block', now }).patch.blockedBy.sort()) === '["f","s1"]' && M.applyAction({ thread: { ...pending, blockedBy: ['f', 's1'] }, userId: 's1', action: 'unblock', now }).patch.blockedBy.join() === 'f');
  const rep = M.applyAction({ thread: pending, userId: 's1', action: 'report', reason: '  rude  ', now });
  s.check('action: a report records who, when and why, and blocks the reporter side', rep.patch.isReported === true && rep.patch.reported.by === 's1' && rep.patch.reported.reason === 'rude' && rep.patch.blockedBy.includes('s1'));
  s.check('action: an open report cannot be filed twice, a resolved one can', M.applyAction({ thread: { ...pending, isReported: true, reported: { by: 's1' } }, userId: 'f', action: 'report', now }).status === 400 && !!M.applyAction({ thread: { ...pending, isReported: true, reported: { by: 's1', resolvedAtMs: 1 } }, userId: 'f', action: 'report', now }).patch);
  s.check('action: an over-long reason and an unknown action are refused', M.applyAction({ thread: pending, userId: 's1', action: 'report', reason: 'x'.repeat(M.MAX_REASON + 1), now }).status === 400 && M.applyAction({ thread: pending, userId: 's1', action: 'delete', now }).status === 400);
  s.check('action: a stranger gets not found', M.applyAction({ thread: pending, userId: 'zzz', action: 'block', now }).status === 404);

  const people = new Map([['f', { id: 'f', name: 'Fac', role: 'faculty' }], ['s1', { id: 's1', name: 'Stu', role: 'student' }]]);
  const row = M.threadRow({ ...pending, lastMessageBy: 'f', lastMessageAtMs: 5, reads: { s1: 3 }, lastPreview: 'hi' }, 's1', people);
  s.check('row: shows the other person, flags awaiting my answer and unread', row.with.name === 'Fac' && row.awaiting_my_answer === true && row.unread === true && row.i_started === false);
  s.check('row: my own last message is never unread, and a read clears it', M.threadRow({ ...pending, lastMessageBy: 's1', lastMessageAtMs: 5, reads: {} }, 's1', people).unread === false && M.threadRow({ ...pending, lastMessageBy: 'f', lastMessageAtMs: 5, reads: { s1: 5 } }, 's1', people).unread === false);
  s.check('row: a long preview is shortened to one line', M.preview('a\nb'.repeat(60)).length <= 80 && !M.preview('a\nb').includes('\n'));
}

module.exports = async function messagesSuite() {
  const s = new Suite('Messages');
  pure(s);

  const T = '/api/messages/threads';
  s.check('messages: unauthenticated → 401', (await get(T)).status === 401);

  const run = Date.now().toString(36).toUpperCase();
  const D = `SMOKEMSG${run}`;
  const O = `SMOKEMSGX${run}`;
  const made = [];
  const mk = async (col, id, data) => { await db().collection(col).doc(id).set({ ...data, isSmokeTest: true }); made.push([col, id]); };
  const threadIds = new Set();
  s.onCleanup(async () => {
    for (const id of threadIds) {
      const m = await db().collection('messageThreads').doc(id).collection('messages').get();
      for (const d of m.docs) await d.ref.delete().catch(() => {});
      await db().collection('messageThreads').doc(id).delete().catch(() => {});
    }
    for (const [col, id] of made) {
      if (col === 'classrooms') { const m = await db().collection('classrooms').doc(id).collection('members').get(); for (const d of m.docs) await d.ref.delete().catch(() => {}); }
      await db().collection(col).doc(id).delete().catch(() => {});
    }
  }, 'temporary message records');

  const id = (n) => userId(`msg-${n}`);
  await mk('faculty', id('hod'), { name: 'Smoke Msg Head', role: 'hod', department: D });
  await mk('faculty', id('teacher'), { name: 'Smoke Msg Teacher', role: 'faculty', department: D });
  await mk('faculty', id('teacher2'), { name: 'Smoke Msg Teacher Two', role: 'faculty', department: D });
  await mk('faculty', id('hodx'), { name: 'Smoke Msg Other Head', role: 'hod', department: O });
  await mk('faculty', id('admin'), { name: 'Smoke Msg Admin', role: 'admin' });
  await mk('students', id('s1'), { name: 'Smoke Msg Student One', role: 'student', department: D, rollNo: 'MSG001', email: 'msg1@example.test' });
  await mk('students', id('s2'), { name: 'Smoke Msg Student Two', role: 'student', department: D, rollNo: 'MSG002' });
  await mk('students', id('s3'), { name: 'Smoke Msg Student Three', role: 'student', department: O, rollNo: 'MSG003' });
  await mk('classrooms', id('class'), { name: 'Smoke Msg Class', facultyId: id('teacher'), department: D, joinCode: 'SMKMSG1' });
  await db().collection('classrooms').doc(id('class')).collection('members').doc(id('s1')).set({ joinedAt: new Date() });

  const tok = {
    hod: tokenFor('msg-hod', 'hod', { department: D }), teacher: tokenFor('msg-teacher', 'faculty', { department: D }),
    teacher2: tokenFor('msg-teacher2', 'faculty', { department: D }), hodx: tokenFor('msg-hodx', 'hod', { department: O }),
    admin: tokenFor('msg-admin', 'admin', { department: null }),
    s1: tokenFor('msg-s1', 'student', { department: D }), s2: tokenFor('msg-s2', 'student', { department: D }), s3: tokenFor('msg-s3', 'student', { department: O }),
  };
  const start = async (token, to, body = 'Hello there') => {
    const r = await post(T, token, { to, body });
    if (r.body?.data?.id) threadIds.add(r.body.data.id);
    return r;
  };

  // ── Who may start ──────────────────────────────────────────────────────────
  s.check('start: a student cannot start a conversation', (await start(tok.s1, id('teacher'))).status === 403);
  s.check('start: faculty cannot message a student they neither teach nor mentor', (await start(tok.teacher, id('s2'))).status === 403);
  s.check('start: an unknown recipient → 404', (await start(tok.teacher, 'no-such-user')).status === 404);
  s.check('start: an empty or over-long message → 400', (await start(tok.teacher, id('s1'), '  ')).status === 400 && (await start(tok.teacher, id('s1'), 'x'.repeat(1001))).status === 400);
  s.check('start: a non-string message → 400', (await post(T, tok.teacher, { to: id('s1'), body: { x: 1 } })).status === 400);

  const first = await start(tok.teacher, id('s1'), 'Please see me about your lab record');
  s.check('start: faculty may message a student in their class', first.status === 201, `status ${first.status}`);
  const tid = first.body?.data?.id;
  const second = await post(`${T}/${tid}/messages`, tok.teacher, { body: 'Are you there?' });
  s.check('consent: staff get only the opening message until the student accepts', second.status === 403, `status ${second.status}`);
  s.check('consent: starting again reuses the same conversation (and is refused for the same reason)', (await start(tok.teacher, id('s1'), 'again')).status === 403);

  const list1 = (await get(T, tok.s1)).body?.data || [];
  s.check('consent: the student sees it as awaiting their answer, unread, with the sender named', list1.length === 1 && list1[0].awaiting_my_answer === true && list1[0].unread === true && list1[0].with.name === 'Smoke Msg Teacher', JSON.stringify(list1));
  const open1 = await get(`${T}/${tid}`, tok.s1);
  s.check('thread: the student reads the opening message', open1.body?.data?.messages?.length === 1 && open1.body.data.messages[0].mine === false && /lab record/.test(open1.body.data.messages[0].body));
  s.check('thread: opening it marks it read', (await get(T, tok.s1)).body.data[0].unread === false);

  const reply = await post(`${T}/${tid}/messages`, tok.s1, { body: 'Yes, sir, I will come tomorrow' });
  s.check('consent: a student reply is accepted and activates the conversation', reply.status === 201 && (await get(T, tok.s1)).body.data[0].status === 'active', `status ${reply.status}`);
  s.check('consent: after that staff can keep writing', (await post(`${T}/${tid}/messages`, tok.teacher, { body: 'Thank you' })).status === 201);
  s.check('consent: the teacher sees the unread reply flow both ways', (await get(`${T}/${tid}`, tok.teacher)).body?.data?.messages?.length === 3);

  // ── Privacy ────────────────────────────────────────────────────────────────
  s.check('privacy: a non-participant cannot read the conversation', (await get(`${T}/${tid}`, tok.teacher2)).status === 404 && (await get(`${T}/${tid}`, tok.s2)).status === 404);
  s.check('privacy: a non-participant cannot write into it or change it', (await post(`${T}/${tid}/messages`, tok.teacher2, { body: 'hi' })).status === 404 && (await patch(`${T}/${tid}`, tok.teacher2, { action: 'block' })).status === 404);
  s.check('privacy: even the head of department cannot read it unless it is reported', (await get(`${T}/${tid}`, tok.hod)).status === 404);
  s.check('privacy: another person list does not show it', ((await get(T, tok.teacher2)).body?.data || []).length === 0);

  // ── Decline / accept ───────────────────────────────────────────────────────
  const fromHod = await start(tok.hod, id('s2'), 'Welcome to the department');
  s.check('start: an HOD may message a student of their department', fromHod.status === 201);
  const hid = fromHod.body?.data?.id;
  s.check('consent: only the student may decline', (await patch(`${T}/${hid}`, tok.hod, { action: 'decline' })).status === 403);
  s.check('consent: the student declines', (await patch(`${T}/${hid}`, tok.s2, { action: 'decline' })).status === 200);
  s.check('consent: a declined conversation stops both sides', (await post(`${T}/${hid}/messages`, tok.hod, { body: 'x' })).status === 403 && (await post(`${T}/${hid}/messages`, tok.s2, { body: 'x' })).status === 403);
  s.check('consent: the student can change their mind', (await patch(`${T}/${hid}`, tok.s2, { action: 'accept' })).status === 200 && (await post(`${T}/${hid}/messages`, tok.hod, { body: 'Glad to hear it' })).status === 201);
  s.check('consent: an active conversation cannot be declined', (await patch(`${T}/${hid}`, tok.s2, { action: 'decline' })).status === 400);

  // ── Staff scoping ──────────────────────────────────────────────────────────
  s.check('start: an HOD cannot message a student of another department', (await start(tok.hod, id('s3'))).status === 403);
  s.check('start: an admin can message a student of any department', (await start(tok.admin, id('s3'))).status === 201);
  s.check('start: staff to staff in the same department is active at once', (await start(tok.teacher, id('teacher2'), 'Cover my class?')).status === 201);
  const peerList = (await get(T, tok.teacher2)).body?.data || [];
  s.check('start: staff to staff needs no consent step', peerList.length === 1 && peerList[0].status === 'active' && peerList[0].awaiting_my_answer === false);
  s.check('start: staff cannot message staff of another department', (await start(tok.teacher, id('hodx'))).status === 403);
  s.check('start: anyone on staff can message an admin', (await start(tok.teacher, id('admin'), 'Question for you')).status === 201);

  // ── Block ──────────────────────────────────────────────────────────────────
  s.check('block: the student blocks the teacher', (await patch(`${T}/${tid}`, tok.s1, { action: 'block' })).status === 200);
  s.check('block: the teacher can no longer write, and is not told why', (await post(`${T}/${tid}/messages`, tok.teacher, { body: 'hello?' })).status === 403);
  s.check('block: the blocker must unblock before writing', (await post(`${T}/${tid}/messages`, tok.s1, { body: 'oops' })).status === 403);
  s.check('block: the row says it is blocked by me', (await get(T, tok.s1)).body.data[0].blocked_by_me === true);
  s.check('block: unblocking restores the conversation', (await patch(`${T}/${tid}`, tok.s1, { action: 'unblock' })).status === 200 && (await post(`${T}/${tid}/messages`, tok.teacher, { body: 'back again' })).status === 201);

  // ── Report ─────────────────────────────────────────────────────────────────
  s.check('report: an over-long reason → 400', (await patch(`${T}/${tid}`, tok.s1, { action: 'report', reason: 'x'.repeat(301) })).status === 400);
  s.check('report: the student reports the conversation', (await patch(`${T}/${tid}`, tok.s1, { action: 'report', reason: 'Pressuring me' })).status === 200);
  s.check('report: it cannot be reported twice while open', (await patch(`${T}/${tid}`, tok.teacher, { action: 'report' })).status === 400);
  s.check('report: reporting also stops further messages', (await post(`${T}/${tid}/messages`, tok.teacher, { body: 'x' })).status === 403);

  const REP = '/api/messages/reported';
  s.check('report: faculty and students cannot list reports', (await get(REP, tok.teacher)).status === 403 && (await get(REP, tok.s1)).status === 403);
  const seen = await get(REP, tok.hod);
  const item = (seen.body?.data || []).find((r) => r.id === tid);
  s.check('report: the HOD of the involved department sees the reported conversation', seen.status === 200 && !!item, JSON.stringify(seen.body));
  s.check('report: they can read the messages, who reported and why', item?.messages?.length === 4 && item.reported_by === 'Smoke Msg Student One' && item.reason === 'Pressuring me');
  s.check('report: an HOD of another department does not see it', !((await get(REP, tok.hodx)).body?.data || []).some((r) => r.id === tid));
  s.check('report: an admin sees it', ((await get(REP, tok.admin)).body?.data || []).some((r) => r.id === tid));
  s.check('report: only unreported conversations stay private (the others are not listed)', !(seen.body?.data || []).some((r) => r.id === hid));
  s.check('report: another department HOD cannot resolve it', (await patch(`${REP}/${tid}`, tok.hodx, {})).status === 404);
  s.check('report: the HOD marks it reviewed and it leaves the list', (await patch(`${REP}/${tid}`, tok.hod, {})).status === 200 && !((await get(REP, tok.hod)).body?.data || []).some((r) => r.id === tid));
  s.check('report: a reviewed report cannot be resolved twice', (await patch(`${REP}/${tid}`, tok.hod, {})).status === 404);

  // ── Finding people ─────────────────────────────────────────────────────────
  const names = async (token, q) => ((await get(`/api/messages/contacts?q=${encodeURIComponent(q)}`, token)).body?.data || []);
  s.check('contacts: a student cannot search', (await get('/api/messages/contacts?q=Smoke', tok.s1)).status === 403);
  s.check('contacts: a one-letter search returns nothing', (await names(tok.hod, 'S')).length === 0);
  const forTeacher = await names(tok.teacher, 'Smoke Msg');
  s.check('contacts: faculty find their own student and department staff, not unrelated students', forTeacher.some((p) => p.id === id('s1')) && !forTeacher.some((p) => p.id === id('s2') || p.id === id('s3')) && forTeacher.some((p) => p.id === id('hod')));
  const forHod = await names(tok.hod, 'Smoke Msg');
  s.check('contacts: an HOD finds students of their department and none of another', forHod.some((p) => p.id === id('s1')) && forHod.some((p) => p.id === id('s2')) && !forHod.some((p) => p.id === id('s3')));
  s.check('contacts: other-department staff are not offered to an HOD', !forHod.some((p) => p.id === id('hodx')));
  s.check('contacts: results carry no email addresses', !JSON.stringify([...forTeacher, ...forHod]).includes('@'));
  s.check('contacts: search by roll number works', (await names(tok.hod, 'MSG002')).some((p) => p.id === id('s2')));

  return s;
};
