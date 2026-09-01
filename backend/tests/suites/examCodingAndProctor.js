// PR-4: coding-section Judge0 reconciliation into an exam attempt, the AI-tutor
// exam lock extended to Exam (not just exam-assignment) proctor events, and the
// exam-aware branch of the CIDR allowlist.
const { tokenFor, get, post, put, del, patch, Suite, purge, userId, capabilities } = require('../harness');

// Poll /api/submit/status until pollJudging returns a terminal result (a
// `success` boolean present) or the timeout elapses — no existing suite does a
// full submit+poll cycle over HTTP yet, so this is written fresh here.
async function submitAndWait(token, body, timeoutMs = 25000) {
  const start = await post('/api/submit', token, body);
  if (!start.body?.success || !start.body?.jobId) return { started: false, body: start.body, status: start.status };
  const jobId = start.body.jobId;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const poll = await get(`/api/submit/status/${jobId}`, token);
    if (poll.body && typeof poll.body.success === 'boolean') return { started: true, body: poll.body };
    await new Promise((r) => setTimeout(r, 600));
  }
  return { started: true, timeout: true };
}

module.exports = async function examCodingAndProctorSuite() {
  const s = new Suite('Exams: coding reconciliation, AI lock, CIDR');
  const F = tokenFor('examcp', 'faculty');
  const STUDENT = tokenFor('examcp-student', 'student');
  const problems = [];
  const exams = [];

  s.onCleanup(async () => {
    for (const id of problems) await del(`/api/faculty/problems/${id}`, F);
    await purge('exams', 'facultyId', [userId('examcp')]);
    await purge('proctorEvents', 'userId', [userId('examcp-student')]);
  }, 'probe problems, exams and proctor events');

  const now = Date.now();
  const windowStart = new Date(now - 60_000).toISOString();
  const windowEnd = new Date(now + 3600_000).toISOString();

  // A real, Judge0-gradeable problem: sum two integers.
  const p = await post('/api/faculty/problems', F, {
    title: 'SMOKE exam coding reconciliation', description: 'Read two integers and print their sum.', difficulty: 'easy',
    test_cases: [{ input: '2 3', output: '5', is_public: true }],
  });
  const probId = p.body?.data?.id;
  if (probId) problems.push(probId);

  // ── Exam A: coding reconciliation ────────────────────────────────────────
  const examA = await post('/api/exams', F, { title: 'SMOKE coding reconciliation exam', window_start: windowStart, window_end: windowEnd, duration_minutes: 30 });
  const examAId = examA.body?.data?.id;
  exams.push(examAId);
  const secA = await post(`/api/exams/${examAId}/sections`, F, { title: 'Coding', type: 'coding', marks_per_question: 10 });
  const secAId = secA.body?.data?.id;
  await put(`/api/exams/${examAId}/sections/${secAId}/problems`, F, { problem_ids: [probId] });
  const pubA = await patch(`/api/exams/${examAId}/publish`, F, { is_published: true });
  s.check('exam A (coding reconciliation) published', pubA.status === 200, `status ${pubA.status} ${JSON.stringify(pubA.body)}`);

  const startA = await post(`/api/exams/${examAId}/start`, STUDENT, {});
  s.check('student starts exam A', startA.status === 200, `status ${startA.status}`);

  const visit = await patch(`/api/exams/${examAId}/attempt/visit/${probId}`, STUDENT, { section_id: secAId });
  s.check('visit ping before deep-link records visited', visit.status === 200 && visit.body?.data?.status === 'visited', JSON.stringify(visit.body));

  const caps = await capabilities();
  if (!caps.judge0Executes) {
    s.skip('coding submission reconciles into the exam attempt', `Judge0 not executing — ${caps.judge0Detail}`);
    s.skip('exam submit score includes the coding section', 'same');
  } else {
    const solveResult = await submitAndWait(STUDENT, {
      source_code: 'a, b = map(int, input().split())\nprint(a + b)',
      language_id: 71, // Python3
      problem_id: probId,
      exam_id: examAId,
      section_id: secAId,
    });
    s.check('coding submission judges to a terminal result', solveResult.started && !solveResult.timeout, JSON.stringify(solveResult.body || 'timeout'));
    s.check('submission accepted', solveResult.body?.result?.verdict?.description === 'Accepted' || solveResult.body?.state === 'completed', JSON.stringify(solveResult.body));

    const attemptAfter = await get(`/api/exams/${examAId}/attempt`, STUDENT);
    const cState = attemptAfter.body?.data?.coding_state?.[probId];
    s.check('coding_state reconciled to answered', cState?.status === 'answered', JSON.stringify(cState));
    s.check('reconciled score equals the section marksPerQuestion (ACM, full marks on Accepted)', cState?.score === 10, `score ${cState?.score}`);

    const submitA = await post(`/api/exams/${examAId}/submit`, STUDENT, {});
    s.check('exam submit succeeds', submitA.status === 200, `status ${submitA.status} ${JSON.stringify(submitA.body)}`);
    s.check('final score includes the coding section marks', submitA.body?.data?.score === 10 && submitA.body?.data?.total === 10, JSON.stringify(submitA.body?.data));
  }

  // ── AI-tutor lock: an Exam's proctor events, not just exam-assignments ───
  s.check('tutor reachable before any exam', (await get('/api/ai/tutor/general', STUDENT)).status !== 403);

  const examLockTest = await post('/api/exams', F, { title: 'SMOKE AI-lock exam', window_start: windowStart, window_end: windowEnd, duration_minutes: 30 });
  const lockExamId = examLockTest.body?.data?.id;
  exams.push(lockExamId);
  const secLock = await post(`/api/exams/${lockExamId}/sections`, F, { title: 'MCQ', type: 'mcq', marks_per_question: 1 });
  await put(`/api/exams/${lockExamId}/sections/${secLock.body?.data?.id}/questions`, F, {
    questions: [{ question_text: 'x', options: ['a', 'b'], correct_index: 0, marks: 1 }],
  });
  await patch(`/api/exams/${lockExamId}/publish`, F, { is_published: true });
  await post(`/api/exams/${lockExamId}/start`, STUDENT, {});

  await post('/api/proctor/event', STUDENT, { exam_id: lockExamId, event_type: 'exam_start' });
  const locked = await post('/api/ai/tutor', STUDENT, { problemId: 'general', message: 'just give me the answer' });
  s.check('AI tutor BLOCKED by an Exam proctor event (not just exam-assignments)', locked.status === 403, `status ${locked.status}`);
  s.check('returns EXAM_IN_PROGRESS', locked.body?.code === 'EXAM_IN_PROGRESS', JSON.stringify(locked.body?.code));

  await post('/api/proctor/event', STUDENT, { exam_id: lockExamId, event_type: 'auto_submit' });
  s.check('unlocked once the Exam is auto-submitted', (await get('/api/ai/tutor/general', STUDENT)).status !== 403);

  // ── CIDR: exam-aware branch of enforceExamIP ─────────────────────────────
  const examCidr = await post('/api/exams', F, { title: 'SMOKE CIDR exam', window_start: windowStart, window_end: windowEnd, duration_minutes: 30 });
  const cidrExamId = examCidr.body?.data?.id;
  exams.push(cidrExamId);
  const secCidr = await post(`/api/exams/${cidrExamId}/sections`, F, { title: 'Coding', type: 'coding', marks_per_question: 10 });
  const secCidrId = secCidr.body?.data?.id;
  await put(`/api/exams/${cidrExamId}/sections/${secCidrId}/problems`, F, { problem_ids: [probId] });
  // TEST-NET-3 (RFC 5737) — guaranteed not to match a local test runner's IP,
  // so this proves the exam-aware branch is wired without needing to spoof
  // a client IP.
  const cidrUpdate = await put(`/api/exams/${cidrExamId}`, F, { allowed_cidrs: ['203.0.113.0/24'] });
  s.check('exam updated with a restrictive CIDR', cidrUpdate.status === 200, `status ${cidrUpdate.status} ${JSON.stringify(cidrUpdate.body)}`);
  await patch(`/api/exams/${cidrExamId}/publish`, F, { is_published: true });
  await post(`/api/exams/${cidrExamId}/start`, STUDENT, {});

  const blocked = await post('/api/submit', STUDENT, {
    source_code: 'print(1)', language_id: 71, problem_id: probId, exam_id: cidrExamId, section_id: secCidrId,
  });
  s.check("submission from outside the exam's allowed CIDR is rejected", blocked.status === 403 && blocked.body?.ip_restricted === true, `status ${blocked.status} ${JSON.stringify(blocked.body)}`);

  for (const id of exams) await del(`/api/exams/${id}`, F);

  return s;
};
