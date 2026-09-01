// Judging engine — stateless, one-bounded-step-per-call version of what used
// to be an in-process BullMQ worker (backend/src/workers/judge.worker.js,
// now removed).
//
// Vercel serverless functions can't block for tens of seconds waiting on
// Judge0, and can't run a background process at all. So every Judge0 call
// here is submit-without-waiting; progress between HTTP requests is carried
// in a `judgeJobs/{jobId}` Firestore doc (judgeJobRepository.js), and each
// call to pollJudging() advances that doc by exactly one step (submit a
// batch, OR check a batch's status, OR submit a checker batch, OR check the
// checker batch's status, OR finalize) and returns immediately. The caller
// (the HTTP route) is polled repeatedly by the client until the response is
// terminal — see routes/submissions.routes.js.
//
// The actual judging RULES (ACM early-exit vs OI partial credit, output
// capping, special-judge/checker delegation, per-language time/memory
// multipliers) are unchanged from the old worker — only the control flow
// (blocking loop -> resumable state machine) is different.

const axios = require('axios');
const { toB64, fromB64 } = require('../utils/judge0Encoding');
const { submitCheckerBatch, pollCheckerBatch } = require('../utils/checkerRunner');
const problemRepo = require('../repositories/problemRepository');
const topicMasteryRepo = require('../repositories/topicMasteryRepository');
const contestRepo = require('../repositories/contestRepository');
const examRepo = require('../repositories/examRepository');
const submissionRepo = require('../repositories/submissionRepository');
const judgeJobRepo = require('../repositories/judgeJobRepository');

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const BATCH_SIZE = parseInt(process.env.JUDGE0_BATCH_SIZE || '20', 10);
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3; // matches the old BullMQ `attempts: 3` config
const RETRY_BASE_DELAY_MS = 2000; // matches the old exponential backoff base

const judge0Headers = () => {
  const token = process.env.JUDGE0_AUTH_TOKEN;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Auth-Token': token } : {}),
  };
};

// Translate a low-level error (axios / network / Judge0 HTTP status) into a
// clear, user-facing explanation. Ported unchanged from the old worker.
function friendlyJudgeError(err) {
  const status = err?.response?.status;
  const code = err?.code || err?.cause?.code || '';
  const msg = err?.message || '';

  if (status === 503) {
    return 'The judge is busy (submission queue is full). It will retry automatically — please wait a moment.';
  }
  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(msg)) {
    return 'The code-execution engine (Judge0) is offline or still starting up. Please make sure the judge service is running, then try again.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /ENOTFOUND|getaddrinfo/.test(msg)) {
    return 'Cannot reach the judge service (host not found). Check that Judge0 is running and JUDGE0_URL is correct.';
  }
  if (code === 'ECONNABORTED' || /timeout/i.test(msg)) {
    return 'The judge took too long to respond — it may be overloaded, or a program ran too long. Please try again.';
  }
  if (status === 422) {
    return 'The judge rejected this submission (invalid execution limits). This is a server configuration issue — please report it to the administrator.';
  }
  if (status === 401 || status === 403) {
    return 'The judge rejected the request (authentication failed). Check the JUDGE0_AUTH_TOKEN setting.';
  }
  if (/No test cases/i.test(msg)) {
    return 'This problem has no test cases configured yet. Please contact the faculty/administrator.';
  }
  return `Judging failed: ${msg || 'unknown error'}. Please try again or contact the administrator.`;
}

// Per-language multipliers — slower runtimes get proportionally more time/memory.
const LANG_MULTIPLIERS = {
  50: 1, 51: 1, 52: 1, 54: 1, 76: 1, // C/C++
  62: 2, // Java
  63: 3, // JavaScript
  71: 3, 72: 3, // Python 3
  73: 3, 74: 2, // TypeScript
  75: 2, // Go
};
const getLangMultiplier = (language_id) => LANG_MULTIPLIERS[Number(language_id)] ?? 2;

const MAX_OUTPUT_BYTES = 65536; // 64 KB
const TRUNCATION_NOTICE = '\n[output truncated by server]';

const capOutput = (s) => {
  if (!s) return s;
  if (Buffer.byteLength(s, 'utf8') <= MAX_OUTPUT_BYTES) return s;
  let byteCount = 0;
  let i = 0;
  while (i < s.length) {
    byteCount += Buffer.byteLength(s[i], 'utf8');
    if (byteCount > MAX_OUTPUT_BYTES) break;
    i++;
  }
  return s.slice(0, i) + TRUNCATION_NOTICE;
};

const sanitizeResult = (r) => ({
  ...r,
  stdout: capOutput(r.stdout),
  stderr: capOutput(r.stderr),
  compile_output: capOutput(r.compile_output),
  message: capOutput(r.message),
});

const normalizeOutput = (str) => {
  if (!str) return '';
  const s = str.length > 4096 ? str.slice(0, 4096) : str;
  return s.replace(/\[|\]|\{|\}|"|'|,/g, ' ').trim().split(/\s+/).join(' ');
};

// ── Judge0 calls — every one is fire-and-check-later, never blocking ────────

async function submitSingleAsync(source_code, language_id, stdin) {
  const m = getLangMultiplier(language_id);
  const res = await axios.post(
    `${JUDGE0_URL}/submissions?base64_encoded=true&wait=false`,
    {
      source_code: toB64(source_code), language_id, stdin: toB64(stdin),
      cpu_time_limit: 2 * m, wall_time_limit: 5 * m, memory_limit: 262144 * m,
      base64_encoded: true,
    },
    { headers: judge0Headers(), timeout: REQUEST_TIMEOUT_MS }
  );
  return res.data.token;
}

async function checkSingleStatus(token) {
  const res = await axios.get(
    `${JUDGE0_URL}/submissions/${token}?base64_encoded=true`,
    { headers: judge0Headers(), timeout: REQUEST_TIMEOUT_MS }
  );
  const r = res.data;
  if (!(r.status?.id > 2)) return null; // still queued/running
  return sanitizeResult({
    status: r.status, time: r.time, memory: r.memory,
    stdout: fromB64(r.stdout), stderr: fromB64(r.stderr),
    compile_output: fromB64(r.compile_output), message: fromB64(r.message),
  });
}

async function submitTestBatch(testCases, language_id) {
  const m = getLangMultiplier(language_id);
  const res = await axios.post(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=true`,
    {
      submissions: testCases.map((tc) => ({
        source_code: toB64(tc.source_code),
        language_id,
        stdin: toB64(tc.input_data),
        cpu_time_limit: 2 * m,
        wall_time_limit: 5 * m,
        memory_limit: 262144 * m,
      })),
    },
    { headers: judge0Headers(), timeout: REQUEST_TIMEOUT_MS }
  );
  return res.data.map((t) => t.token);
}

async function checkTestBatch(tokens) {
  const res = await axios.get(
    `${JUDGE0_URL}/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true`,
    { headers: judge0Headers(), timeout: REQUEST_TIMEOUT_MS }
  );
  const subs = res.data.submissions;
  if (!subs.every((s) => s.status?.id > 2)) return null; // still running
  return subs.map((s) => sanitizeResult({
    status: s.status, time: s.time, memory: s.memory,
    stdout: fromB64(s.stdout), stderr: fromB64(s.stderr),
    compile_output: fromB64(s.compile_output), message: fromB64(s.message),
  }));
}

// ── Scoring — identical rules to the old worker's runJob(), just applied to
// one already-resolved chunk of results instead of inline after a blocking
// poll loop. Mutates `acc` (the running score/verdict accumulator). ────────

// Which indices in this chunk actually need a special-judge (checker) call,
// and up to which index result-processing is even meaningful. For ACM
// (non-OI), once we hit the first raw non-Accepted result we know the loop
// will stop there regardless of any checker outcome for later indices, so
// later indices are excluded entirely (mirrors the old worker's `break`).
// For OI every index is always relevant (the old worker never breaks).
function planChunk(batchResults, { isOI, usesChecker }) {
  if (!usesChecker) {
    return { relevantIndices: batchResults.map((_, i) => i), checkerNeededIndices: [] };
  }
  if (isOI) {
    const relevantIndices = batchResults.map((_, i) => i);
    const checkerNeededIndices = relevantIndices.filter((i) => batchResults[i].status.id === 3);
    return { relevantIndices, checkerNeededIndices };
  }
  // ACM: walk until (and including) the first raw non-Accepted result.
  const relevantIndices = [];
  for (let i = 0; i < batchResults.length; i++) {
    relevantIndices.push(i);
    if (batchResults[i].status.id !== 3) break;
  }
  const checkerNeededIndices = relevantIndices.filter((i) => batchResults[i].status.id === 3);
  return { relevantIndices, checkerNeededIndices };
}

// Sequential scoring loop over `relevantIndices` (ascending) — breaks on the
// first ACM failure exactly like the old worker's inline loop. `resolvedStatus`
// lets checker verdicts override a raw-Accepted result for indices that went
// through special-judge verification.
function scoreChunk(batchResults, tcSlice, relevantIndices, { isOI, useEvenSplit, perTcScore }, acc, resolvedStatus = {}) {
  for (const i of relevantIndices) {
    const result = batchResults[i];
    const tc = tcSlice[i];
    const override = resolvedStatus[i];
    if (override) {
      result.status = override.status;
      result.message = override.message;
    }

    const passed = result.status.id === 3;
    if (passed) {
      acc.passedCount++;
      acc.earnedScore += useEvenSplit ? perTcScore : (tc.score || 0);
    }

    acc.results.push({
      ...result,
      passed,
      tc_score: useEvenSplit ? perTcScore : (tc.score || 0),
      is_public: !!tc.is_public,
      input: tc.is_public ? tc.input_data : null,
      expected: tc.is_public ? tc.expected_output : null,
    });

    const time = parseFloat(result.time) || 0;
    if (time > acc.maxTime) acc.maxTime = time;
    if (result.memory > acc.maxMemory) acc.maxMemory = result.memory;

    if (!passed) {
      if (!isOI) {
        acc.finalVerdict = result.status;
        acc.earlyExit = true;
        return; // ACM: stop immediately, like the old worker's `break`
      }
      if (acc.finalVerdict.id === 3) acc.finalVerdict = result.status;
    }
  }
}

// Non-checker WA determination — string-compare, ported unchanged.
function applyStringCompare(batchResults, tcSlice, relevantIndices) {
  for (const i of relevantIndices) {
    const result = batchResults[i];
    if (result.status.id !== 3) continue;
    const tc = tcSlice[i];
    const userOutput = normalizeOutput(result.stdout);
    const expectedOut = normalizeOutput(tc.expected_output);
    if (userOutput !== expectedOut) {
      result.status = { id: 4, description: 'Wrong Answer' };
      result.message = tc.is_public
        ? `Expected: ${tc.expected_output}\nGot: ${result.stdout}`
        : 'Wrong answer on a hidden test case.';
    }
  }
}

// Trim a decoded Judge0 result down to what's needed to resume scoring after
// a checker sub-phase. Drops stderr/compile_output (only ever surfaced via
// `message`, which we keep) but keeps a tightly-capped stdout — the frontend
// displays "Your output" for the first failing test case, so dropping it
// entirely would blank that out for checker-verified problems. Capped much
// harder than the normal 64 KB (checker chunks are held across a request
// boundary in Firestore, whose per-doc size limit is 1 MiB).
const CHECKER_WAIT_STDOUT_CAP = 2048;
function trimForCheckerWait(result) {
  return {
    status: result.status,
    time: result.time,
    memory: result.memory,
    message: result.message,
    stdout: result.stdout && result.stdout.length > CHECKER_WAIT_STDOUT_CAP
      ? result.stdout.slice(0, CHECKER_WAIT_STDOUT_CAP) + TRUNCATION_NOTICE
      : result.stdout,
  };
}

// Upsert topic mastery after a submission verdict — ported unchanged.
async function updateTopicMastery(userId, problemId, isAccepted, hintUsed) {
  try {
    const problem = await problemRepo.getById(problemId);
    const tags = problem?.tags || [];
    for (const tag of tags) {
      await topicMasteryRepo.recordAttempt(userId, tag, { solved: isAccepted, hintUsed });
    }
  } catch (err) {
    console.error('Topic mastery update failed:', err.message);
  }
}

// Finalize a fully-scored submission: persist it, update mastery, record the
// contest submission if applicable, mark the job doc done. Ported from the
// tail of the old worker's runJob().
async function finalize(jobId, job, acc, testCasesLength) {
  const { problem_id, user_id, contest_id, assignment_id, exam_id, section_id, source_code, language_id, meta } = job;
  const { isOI, maxScore, scoringMode } = meta;

  if (isOI) {
    if (acc.passedCount === testCasesLength) acc.finalVerdict = { id: 3, description: 'Accepted' };
    else if (acc.earnedScore > 0) acc.finalVerdict = { id: 7, description: 'Partial' };
  }

  const finalScore = isOI ? acc.earnedScore : null;
  const testResultsArr = acc.results.map((r) => !!r.passed);

  const submission = await submissionRepo.create({
    userId: user_id || null,
    problemId: problem_id,
    code: capOutput(source_code),
    language: language_id.toString(),
    verdict: acc.finalVerdict.description,
    runtime: Math.floor(acc.maxTime * 1000),
    memory: acc.maxMemory,
    score: finalScore,
    testResults: testResultsArr,
    assignmentId: assignment_id || null,
    examId: exam_id || null,
  });

  if (user_id) {
    await updateTopicMastery(user_id, problem_id, acc.finalVerdict.description === 'Accepted', false);
  }

  // Reconcile a coding-section submission back into the exam attempt it was
  // made under. Non-blocking and best-effort, same shape as the contest
  // reconciliation just below — a reconciliation failure must never fail the
  // student's actual judged verdict.
  if (exam_id && user_id) {
    try {
      // The awarded marks must be scaled to the exam SECTION's marksPerQuestion,
      // not the problem's own max_score — submitExam() later just sums these
      // directly, so the scaling has to happen here, once, at the source.
      const sections = await examRepo.getSections(exam_id);
      const section = (section_id && sections.find((s) => s.id === section_id))
        || sections.find((s) => (s.problemIds || []).includes(problem_id));
      const maxMarks = section?.marksPerQuestion ?? 0;
      const accepted = acc.finalVerdict.description === 'Accepted';
      const awardedScore = isOI
        ? (maxScore > 0 ? Math.round((acc.earnedScore / maxScore) * maxMarks * 100) / 100 : 0)
        : (accepted ? maxMarks : 0);

      await examRepo.recordCodingAnswer(exam_id, user_id, problem_id, {
        status: 'answered',
        sectionId: section?.id || section_id || null,
        submissionId: submission.id,
        verdict: acc.finalVerdict.description,
        score: awardedScore,
      });
    } catch (e) {
      console.error('Exam coding reconciliation failed:', e.message);
    }
  }

  if (contest_id && user_id) {
    try {
      const contest = await contestRepo.getById(contest_id);
      const withinWindow = contest && new Date() >= new Date(contest.startsAt) && new Date() <= new Date(contest.endsAt);
      const hasProblem = contest && (contest.problemIds || []).includes(problem_id);
      const registration = contest ? await contestRepo.isRegistered(contest_id, user_id) : null;
      if (contest && withinWindow && hasProblem && registration) {
        await contestRepo.addSubmission(contest_id, {
          userId: user_id, problemId: problem_id, verdict: acc.finalVerdict.description,
          score: finalScore || 0, isVirtual: false, penaltyMinutes: 0,
        });
      }
    } catch (e) {
      console.error('Contest submission record failed:', e.message);
    }
  }

  const result = {
    submission_id: submission.id,
    verdict: acc.finalVerdict,
    time: acc.maxTime,
    memory: acc.maxMemory,
    score: finalScore,
    max_score: isOI ? maxScore : null,
    scoring_mode: scoringMode,
    passed_count: acc.passedCount,
    total_count: testCasesLength,
    test_case_results: acc.results,
  };

  await judgeJobRepo.update(jobId, { phase: 'done', result: { success: true, state: 'completed', result } });
  return { success: true, state: 'completed', result };
}

// ── Retry bookkeeping — replicates the old BullMQ `attempts: 3` exponential
// backoff without a background process: on any Judge0/network error we bump
// an attempt counter and a resumeAt timestamp; polls before resumeAt just
// report 'retrying' without re-attempting anything. ─────────────────────────

async function handleStepError(jobId, doc, err) {
  const attempts = (doc.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const failure = { success: false, state: 'failed', error: friendlyJudgeError(err), code: err?.code || err?.response?.status || null };
    await judgeJobRepo.update(jobId, { phase: 'done', result: failure });
    return failure;
  }
  const resumeAt = Date.now() + RETRY_BASE_DELAY_MS * Math.pow(2, attempts - 1);
  await judgeJobRepo.update(jobId, { attempts, resumeAt });
  return { status: 'retrying', attempt: attempts, maxAttempts: MAX_ATTEMPTS };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Kick off judging for a newly-submitted job. Submits the first Judge0 call
 * (single run for sandbox/custom-input, or the first test-case batch for a
 * graded submission) and persists initial state — never blocks on a result.
 */
async function startJudging(jobId, jobData) {
  const { problem_id, source_code, language_id, user_id, custom_input, contest_id, assignment_id, exam_id, section_id } = jobData;

  if (custom_input !== null && custom_input !== undefined) {
    const token = await submitSingleAsync(source_code, language_id, custom_input);
    await judgeJobRepo.create(jobId, {
      job: { source_code, language_id, custom_input },
      phase: 'single',
      tokens: [token],
      attempts: 0,
    });
    return;
  }

  const testCasesRaw = await problemRepo.getTestCases(problem_id);
  if (testCasesRaw.length === 0) {
    await judgeJobRepo.create(jobId, { phase: 'done', result: { success: false, state: 'failed', error: friendlyJudgeError(new Error('No test cases found for problem')) } });
    return;
  }

  const probMeta = await problemRepo.getById(problem_id);
  const scoringMode = probMeta?.scoringMode || 'acm';
  const isOI = scoringMode === 'oi';
  const maxScore = probMeta?.maxScore || 100;
  const usesChecker = !!probMeta?.usesChecker;
  const checkerCode = probMeta?.checkerCode || null;
  const checkerLanguageId = probMeta?.checkerLanguageId || null;

  const testCasesLength = testCasesRaw.length;
  const totalTcScore = testCasesRaw.reduce((s, tc) => s + (tc.score || 0), 0);
  const useEvenSplit = isOI && totalTcScore === 0;
  const perTcScore = useEvenSplit ? Math.floor(maxScore / testCasesLength) : 0;

  const job = {
    problem_id, source_code, language_id, user_id,
    contest_id: contest_id || null, assignment_id: assignment_id || null,
    exam_id: exam_id || null, section_id: section_id || null,
    meta: { scoringMode, isOI, maxScore, usesChecker, checkerCode, checkerLanguageId, useEvenSplit, perTcScore, testCasesLength },
  };

  const chunk = testCasesRaw.slice(0, BATCH_SIZE).map((tc) => ({
    input_data: tc.inputData, expected_output: tc.expectedOutput,
    score: tc.score || 0, is_public: !!tc.isPublic, source_code,
  }));

  const tokens = await submitTestBatch(chunk, language_id);

  await judgeJobRepo.create(jobId, {
    job, phase: 'tests', chunkIndex: 0, tokens, attempts: 0,
    acc: { finalVerdict: { id: 3, description: 'Accepted' }, maxTime: 0, maxMemory: 0, results: [], earlyExit: false, earnedScore: 0, passedCount: 0 },
  });
}

/**
 * Advance a job by exactly one step and return the current status. Safe to
 * call repeatedly (idempotent once `phase === 'done'`).
 */
async function pollJudging(jobId) {
  const doc = await judgeJobRepo.getById(jobId);
  if (!doc) return { success: false, state: 'failed', error: 'Unknown job id.' };

  if (doc.phase === 'done') return doc.result;

  if (doc.resumeAt && Date.now() < doc.resumeAt) {
    return { status: 'retrying', attempt: doc.attempts, maxAttempts: MAX_ATTEMPTS };
  }

  try {
    if (doc.phase === 'single') return await stepSingle(jobId, doc);
    if (doc.phase === 'tests') return await stepTests(jobId, doc);
    if (doc.phase === 'checker') return await stepChecker(jobId, doc);
    throw new Error(`Unknown job phase: ${doc.phase}`);
  } catch (err) {
    return handleStepError(jobId, doc, err);
  }
}

async function stepSingle(jobId, doc) {
  const result = await checkSingleStatus(doc.tokens[0]);
  if (!result) return { status: 'pending' };
  const payload = {
    success: true, state: 'completed',
    result: {
      verdict: result.status,
      time: parseFloat(result.time) || 0,
      memory: result.memory || 0,
      test_case_results: [result],
      custom_run: true,
    },
  };
  await judgeJobRepo.update(jobId, { phase: 'done', result: payload });
  return payload;
}

async function stepTests(jobId, doc) {
  const batchResults = await checkTestBatch(doc.tokens);
  if (!batchResults) return { status: 'pending' };

  const { job, chunkIndex, acc } = doc;
  const { meta } = job;
  const testCasesRaw = await problemRepo.getTestCases(job.problem_id);
  const tcSlice = testCasesRaw
    .slice(chunkIndex * BATCH_SIZE, chunkIndex * BATCH_SIZE + BATCH_SIZE)
    .map((tc) => ({ input_data: tc.inputData, expected_output: tc.expectedOutput, score: tc.score || 0, is_public: !!tc.isPublic }));

  if (!meta.usesChecker) applyStringCompare(batchResults, tcSlice, batchResults.map((_, i) => i));

  const { relevantIndices, checkerNeededIndices } = planChunk(batchResults, meta);

  if (checkerNeededIndices.length === 0) {
    scoreChunk(batchResults, tcSlice, relevantIndices, meta, acc);
    return advanceAfterChunk(jobId, doc, acc, testCasesRaw.length);
  }

  const checkerItems = checkerNeededIndices.map((i) => ({
    checkerCode: meta.checkerCode, checkerLanguageId: meta.checkerLanguageId,
    input: tcSlice[i].input_data, expected: tcSlice[i].expected_output, actual: batchResults[i].stdout,
  }));
  const checkerTokens = await submitCheckerBatch(checkerItems);

  await judgeJobRepo.update(jobId, {
    phase: 'checker',
    checkerTokens,
    checkerNeededIndices,
    relevantIndices,
    pendingBatchResults: relevantIndices.map((i) => ({ index: i, ...trimForCheckerWait(batchResults[i]) })),
    pendingTcSlice: relevantIndices.map((i) => tcSlice[i]),
    attempts: 0,
  });
  return { status: 'pending' };
}

async function stepChecker(jobId, doc) {
  const verdicts = await pollCheckerBatch(doc.checkerTokens);
  if (!verdicts) return { status: 'pending' };

  const { job, acc, checkerNeededIndices, relevantIndices, pendingBatchResults, pendingTcSlice } = doc;
  const { meta } = job;

  // Rebuild the chunk's result/tc arrays (by relative position within
  // relevantIndices, since that's how they were trimmed for storage).
  const batchResults = pendingBatchResults.map((r) => ({ status: r.status, time: r.time, memory: r.memory, stdout: r.stdout ?? null, stderr: null, compile_output: null, message: r.message ?? null }));
  const tcSlice = pendingTcSlice;
  const resolvedStatus = {};
  checkerNeededIndices.forEach((origIdx, k) => {
    const pos = relevantIndices.indexOf(origIdx);
    const verdict = verdicts[k];
    resolvedStatus[pos] = {
      status: verdict.accepted ? { id: 3, description: 'Accepted' } : { id: 4, description: 'Wrong Answer' },
      message: verdict.accepted ? (batchResults[pos].message || null) : verdict.message,
    };
  });

  const localIndices = relevantIndices.map((_, pos) => pos);
  scoreChunk(batchResults, tcSlice, localIndices, meta, acc, resolvedStatus);

  const testCasesRaw = await problemRepo.getTestCases(job.problem_id);
  return advanceAfterChunk(jobId, doc, acc, testCasesRaw.length);
}

// Shared tail: decide whether to submit the next chunk or finalize.
async function advanceAfterChunk(jobId, doc, acc, testCasesLength) {
  const { job, chunkIndex } = doc;
  const nextStart = (chunkIndex + 1) * BATCH_SIZE;
  const hasMore = !acc.earlyExit && nextStart < testCasesLength;

  if (!hasMore) {
    return finalize(jobId, job, acc, testCasesLength);
  }

  const testCasesRaw = await problemRepo.getTestCases(job.problem_id);
  const chunk = testCasesRaw.slice(nextStart, nextStart + BATCH_SIZE).map((tc) => ({
    input_data: tc.inputData, expected_output: tc.expectedOutput,
    score: tc.score || 0, is_public: !!tc.isPublic, source_code: job.source_code,
  }));
  const tokens = await submitTestBatch(chunk, job.language_id);

  await judgeJobRepo.update(jobId, {
    phase: 'tests', chunkIndex: chunkIndex + 1, tokens, acc, attempts: 0,
    checkerTokens: null, checkerNeededIndices: null, relevantIndices: null, pendingBatchResults: null, pendingTcSlice: null,
  });
  return { status: 'pending' };
}

module.exports = { startJudging, pollJudging };
