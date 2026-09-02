// Fix PR: the IDE's "Run" button now grades against a problem's public/sample
// test cases only (a free, unofficial check) — Submit is still the only thing
// that grades every test case, hidden included, and actually counts. This
// covers the split at the API level: a sample-only Run must never touch the
// hidden test cases, never create a submission record, and must give a clear
// error when a problem has hidden cases but no public ones to Run against.
const { tokenFor, get, post, del, Suite, capabilities } = require('../harness');

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

module.exports = async function codingRunAndSubmitSuite() {
  const s = new Suite('Coding: sample-only Run vs graded Submit');
  // Three separate identities, one /api/submit call each — the burst limiter
  // (1 submission per 10s per user) would otherwise 429 the second and third
  // calls this suite makes back-to-back under a single student.
  const STUDENT = tokenFor('codingrun-student', 'student');
  const STUDENT_NO_PUBLIC = tokenFor('codingrun-student-nopublic', 'student');
  const STUDENT_SUBMIT = tokenFor('codingrun-student-submit', 'student');
  const F = tokenFor('codingrun-faculty', 'faculty');
  const problems = [];

  s.onCleanup(async () => {
    for (const id of problems) await del(`/api/faculty/problems/${id}`, F);
  }, 'probe problems');

  const caps = await capabilities();
  if (!caps.judge0Executes) {
    s.skip('sample Run grades only the public test cases', `Judge0 not executing — ${caps.judge0Detail}`);
    s.skip('sample Run never creates a submission record', 'same');
    s.skip('a Run with no sample test cases gives a distinct error', 'same');
    s.skip('Submit (no run_mode) still grades every test case and records it', 'same');
    return s;
  }

  const p = await post('/api/faculty/problems', F, {
    title: 'SMOKE sample-run vs submit', description: 'Echo a fixed number.', difficulty: 'easy',
    test_cases: [
      { input: '1', output: '6', is_public: true },
      { input: '2', output: '6', is_public: false },
      { input: '3', output: '6', is_public: false },
    ],
  });
  const probId = p.body?.data?.id;
  if (probId) problems.push(probId);
  s.check('problem created with 1 public + 2 hidden test cases', !!probId, JSON.stringify(p.body));

  // ── Run (sample_only): must see only the public test case ──────────────────
  const run = await submitAndWait(STUDENT, {
    source_code: 'print(6)', language_id: 71, problem_id: probId, run_mode: 'sample',
  });
  s.check('sample Run judges to a terminal result', run.started && !run.timeout, JSON.stringify(run.body || 'timeout'));
  const runResult = run.body?.result;
  s.check(
    'sample Run grades only the public test cases',
    runResult?.sample_only === true && runResult?.total_count === 1 && runResult?.test_case_results?.length === 1,
    JSON.stringify(runResult),
  );
  s.check('sample Run reports the public case Accepted', runResult?.passed_count === 1 && runResult?.verdict?.description === 'Accepted', JSON.stringify(runResult?.verdict));

  const historyAfterRun = await get(`/api/submit/history/${probId}`, STUDENT);
  s.check('sample Run never creates a submission record', runResult?.submission_id === null && (historyAfterRun.body?.data || []).length === 0, JSON.stringify({ submissionId: runResult?.submission_id, history: historyAfterRun.body?.data }));

  // ── Run against a problem with hidden cases but no public ones ─────────────
  const pNoPublic = await post('/api/faculty/problems', F, {
    title: 'SMOKE sample-run no public cases', description: 'Echo a fixed number.', difficulty: 'easy',
    test_cases: [{ input: '1', output: '6', is_public: false }],
  });
  const probNoPublicId = pNoPublic.body?.data?.id;
  if (probNoPublicId) problems.push(probNoPublicId);

  const runNoPublic = await submitAndWait(STUDENT_NO_PUBLIC, {
    source_code: 'print(6)', language_id: 71, problem_id: probNoPublicId, run_mode: 'sample',
  });
  s.check(
    'a Run with no sample test cases gives a distinct error',
    runNoPublic.body?.success === false && /sample test cases/i.test(runNoPublic.body?.error || ''),
    JSON.stringify(runNoPublic.body),
  );

  // ── Submit (no run_mode): must still grade everything and record it ────────
  const submit = await submitAndWait(STUDENT_SUBMIT, {
    source_code: 'print(6)', language_id: 71, problem_id: probId,
  });
  const submitResult = submit.body?.result;
  s.check(
    'Submit (no run_mode) still grades every test case and records it',
    submitResult?.sample_only !== true && submitResult?.total_count === 3 && !!submitResult?.submission_id,
    JSON.stringify(submitResult),
  );

  const historyAfterSubmit = await get(`/api/submit/history/${probId}`, STUDENT_SUBMIT);
  s.check('the real Submit shows up in submission history (the Run never did)', (historyAfterSubmit.body?.data || []).length === 1, JSON.stringify(historyAfterSubmit.body?.data));

  return s;
};
