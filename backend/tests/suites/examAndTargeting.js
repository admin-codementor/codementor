// Exam integrity (AI lockout) and assignment class targeting.
//
// The exam lockout is the one check here with a real integrity consequence: if it
// regresses, students can ask the AI tutor for help during a graded assessment.
const { tokenFor, get, post, del, Suite, purge, userId } = require('../harness');

module.exports = async function examAndTargetingSuite() {
  const s = new Suite('Exam lockout & class targeting');
  const F = tokenFor('exam', 'faculty');
  const SITTING = tokenFor('exam-sitting', 'student');
  const IDLE = tokenFor('exam-idle', 'student');
  const problems = [];

  s.onCleanup(async () => {
    for (const id of problems) await del(`/api/faculty/problems/${id}`, F);
    await purge('assignments', 'facultyId', [userId('exam')]);
    await purge('classrooms', 'facultyId', [userId('exam')]);
    await purge('proctorEvents', 'userId', [userId('exam-sitting'), userId('exam-idle')]);
  }, 'probe exams, classes and proctor events');

  const p = await post('/api/faculty/problems', F, {
    title: 'SMOKE exam problem', description: 'x', difficulty: 'easy',
    test_cases: [{ input: '1', output: '1', is_public: true }],
  });
  const probId = p.body?.data?.id;
  if (probId) problems.push(probId);

  const deadline = new Date(Date.now() + 3600_000).toISOString();
  const exam = await post('/api/faculty/assignments', F, { title: 'SMOKE exam', deadline, problem_ids: [probId], is_exam: true });
  const examId = exam.body?.data?.id;
  const practice = await post('/api/faculty/assignments', F, { title: 'SMOKE practice', deadline, problem_ids: [probId], is_exam: false });
  const practiceId = practice.body?.data?.id;

  // ── Baseline ───────────────────────────────────────────────────────────────
  s.check('tutor reachable before any exam', (await get('/api/ai/tutor/general', SITTING)).status !== 403);

  // ── Explicit: the request names a live exam ────────────────────────────────
  const explicit = await post('/api/ai/explain-error', IDLE, {
    assignmentId: examId, problemDescription: 'x', code: 'y', errorTrace: 'z',
  });
  s.check('blocked when the request names a live exam', explicit.status === 403, `status ${explicit.status}`);
  s.check('returns EXAM_IN_PROGRESS for the UI', explicit.body?.code === 'EXAM_IN_PROGRESS', JSON.stringify(explicit.body?.code));

  const practiceCall = await post('/api/ai/explain-error', IDLE, {
    assignmentId: practiceId, problemDescription: 'x', code: 'y', errorTrace: 'z',
  });
  // Only the 403 gate is under test here. A 5xx means the AI provider itself is
  // unhappy (quota, outage) — unrelated to the lock, and not a reason to fail.
  s.check('a non-exam assignment does NOT lock the tutor', practiceCall.status !== 403,
    `status ${practiceCall.status}${practiceCall.status >= 500 ? ' (provider error, not the lock)' : ''}`);

  // ── Implicit: the bypass that matters ──────────────────────────────────────
  await post('/api/proctor/event', SITTING, { assignment_id: examId, event_type: 'exam_start' });
  const sneaky = await post('/api/ai/tutor', SITTING, { problemId: 'general', message: 'just give me the answer' });
  s.check('BLOCKED even with no assignment id in the body', sneaky.status === 403, `status ${sneaky.status}`);
  s.check('history is locked too (no replaying old hints)', (await get('/api/ai/tutor/general', SITTING)).status === 403);
  s.check('code review locked as well', (await post('/api/ai/review-code', SITTING, { problemDescription: 'x', code: 'y' })).status === 403);

  s.check("a different student's tutor still works", (await get('/api/ai/tutor/general', IDLE)).status !== 403);
  s.check('faculty are never exam-locked', (await get('/api/ai/tutor/general', F)).status !== 403);

  await post('/api/proctor/event', SITTING, { assignment_id: examId, event_type: 'auto_submit' });
  s.check('unlocked once the exam is submitted', (await get('/api/ai/tutor/general', SITTING)).status !== 403);

  // ── Class targeting ────────────────────────────────────────────────────────
  const cls = await post('/api/classrooms', F, { name: 'SMOKE targeting class', department: 'CSE', section: 'A' });
  const classId = cls.body?.data?.id;
  const joinCode = cls.body?.data?.join_code;
  await post('/api/classrooms/join', SITTING, { code: joinCode });

  const open = await post('/api/faculty/assignments', F, { title: 'SMOKE open to all', deadline, problem_ids: [probId] });
  const openId = open.body?.data?.id;
  const targeted = await post('/api/faculty/assignments', F, {
    title: 'SMOKE targeted', deadline, problem_ids: [probId], classroom_ids: [classId],
  });
  const targetedId = targeted.body?.data?.id;
  s.check('assignment can target a class', targeted.status === 200, `status ${targeted.status}`);

  const memberSees = (await get('/api/student/assignments', SITTING)).body?.data ?? [];
  const outsiderSees = (await get('/api/student/assignments', IDLE)).body?.data ?? [];
  s.check('UNTARGETED assignment reaches everyone (regression guard)',
    memberSees.some((a) => a.id === openId) && outsiderSees.some((a) => a.id === openId));
  s.check('targeted assignment reaches the class member', memberSees.some((a) => a.id === targetedId));
  s.check('targeted assignment does NOT reach a non-member', !outsiderSees.some((a) => a.id === targetedId));

  const memberNotified = (await get('/api/student/notifications', SITTING)).body?.data ?? [];
  const outsiderNotified = (await get('/api/student/notifications', IDLE)).body?.data ?? [];
  s.check('notifications respect targeting too',
    memberNotified.some((n) => /SMOKE targeted/.test(n.message)) && !outsiderNotified.some((n) => /SMOKE targeted/.test(n.message)));

  const bogus = await post('/api/faculty/assignments', F, {
    title: 'SMOKE bogus class', deadline, problem_ids: [probId], classroom_ids: ['does-not-exist'],
  });
  s.check('unknown class id rejected', bogus.status === 400, `status ${bogus.status}`);

  const foreign = await post('/api/faculty/assignments', tokenFor('exam-other', 'faculty'), {
    title: 'SMOKE foreign class', deadline, problem_ids: [probId], classroom_ids: [classId],
  });
  s.check("can't target another faculty member's class", foreign.status === 400, `status ${foreign.status}`);

  return s;
};
