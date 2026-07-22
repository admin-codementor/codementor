const { Worker } = require('bullmq');
const axios = require('axios');
const { connection } = require('../config/queue');
const { getIO } = require('../config/io');
const { runChecker } = require('../utils/checkerRunner');
const problemRepo = require('../repositories/problemRepository');
const topicMasteryRepo = require('../repositories/topicMasteryRepository');
const contestRepo = require('../repositories/contestRepository');
const submissionRepo = require('../repositories/submissionRepository');

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const BATCH_SIZE  = parseInt(process.env.JUDGE0_BATCH_SIZE || '20', 10);
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 60; // 30 s

// Auth header sent on every Judge0 request — matches AUTHN_TOKEN in judge0.conf
const judge0Headers = () => {
  const token = process.env.JUDGE0_AUTH_TOKEN;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Auth-Token': token } : {}),
  };
};

// Translate a low-level error (axios / network / Judge0 HTTP status) into a clear,
// user-facing explanation so students/faculty understand WHAT went wrong, not just
// "connect ECONNREFUSED". Used by the worker's failed-job handler.
function friendlyJudgeError(err) {
  if (err?.name === 'QueueFullError') {
    return 'The judge is busy (submission queue is full). It will retry automatically — please wait a moment.';
  }
  const status = err?.response?.status;
  const code   = err?.code || err?.cause?.code || '';
  const msg    = err?.message || '';

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
  if (status === 503) {
    return 'The judge is temporarily overloaded. Please try again in a few seconds.';
  }
  if (/No test cases/i.test(msg)) {
    return 'This problem has no test cases configured yet. Please contact the faculty/administrator.';
  }
  if (/polling timed out/i.test(msg)) {
    return 'Judging timed out while waiting for results — the judge may be overloaded. Please try again.';
  }
  return `Judging failed: ${msg || 'unknown error'}. Please try again or contact the administrator.`;
}

// Per-language multipliers — slower runtimes get proportionally more time/memory.
// Keys are Judge0 language IDs.
// C/C++ = 1×, Java = 2×, Python/JS/TypeScript = 3×, others default to 2×
const LANG_MULTIPLIERS = {
  50: 1, // C (GCC 9.2)
  51: 1, // C++ (GCC 7.4)
  52: 1, // C++ (GCC 8.3)
  54: 1, // C++ (GCC 9.2)
  76: 1, // C++ (GCC 14.1)
  62: 2, // Java (OpenJDK 13)
  63: 3, // JavaScript (Node 12)
  71: 3, // Python 3 (3.8)
  72: 3, // Python 3 (3.11)
  73: 3, // TypeScript (3.7)
  74: 2, // TypeScript (5.0)
  75: 2, // Go (1.18)
};

const getLangMultiplier = (language_id) =>
  LANG_MULTIPLIERS[Number(language_id)] ?? 2;

// Single run — used only for custom-input jobs
const runSingle = async (source_code, language_id, stdin) => {
  const m = getLangMultiplier(language_id);
  try {
    const res = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
      { source_code, language_id, stdin, cpu_time_limit: 2 * m, wall_time_limit: 5 * m, memory_limit: 262144 * m },
      { headers: judge0Headers(), timeout: 15000 }
    );
    const r = res.data;
    return sanitizeResult({ status: r.status, time: r.time, memory: r.memory, stdout: r.stdout, stderr: r.stderr, compile_output: r.compile_output, message: r.message });
  } catch (err) {
    if (err.response?.status === 503) throw new QueueFullError();
    throw err;
  }
};

// Tagged error so the worker can detect queue-full vs other failures
class QueueFullError extends Error {
  constructor() { super('Judge0 queue is full'); this.name = 'QueueFullError'; }
}

// Submit a chunk of test cases in one HTTP call; returns array of token strings
const submitBatch = async (submissions) => {
  try {
    const res = await axios.post(
      `${JUDGE0_URL}/submissions/batch?base64_encoded=false`,
      { submissions },
      { headers: judge0Headers(), timeout: 15000 }
    );
    return res.data.map(t => t.token);
  } catch (err) {
    if (err.response?.status === 503) throw new QueueFullError();
    throw err;
  }
};

// Poll until every token has a terminal status (id > 2)
const pollBatch = async (tokens) => {
  const joined = tokens.join(',');
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await axios.get(
      `${JUDGE0_URL}/submissions/batch?tokens=${joined}&base64_encoded=false`,
      { headers: judge0Headers(), timeout: 15000 }
    );
    const subs = res.data.submissions;
    if (subs.every(s => s.status?.id > 2)) return subs;
  }
  throw new Error('Batch polling timed out after 30 s');
};

// Hard cap on any text field coming back from Judge0 — defence-in-depth on top
// of STDOUT_LIMIT in judge0.conf.  Keeps the DB column and socket payload safe.
const MAX_OUTPUT_BYTES = 65536; // 64 KB
const TRUNCATION_NOTICE = '\n[output truncated by server]';

const capOutput = (s) => {
  if (!s) return s;
  if (Buffer.byteLength(s, 'utf8') <= MAX_OUTPUT_BYTES) return s;
  // Slice by char index that keeps us under the byte limit
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
  stdout:         capOutput(r.stdout),
  stderr:         capOutput(r.stderr),
  compile_output: capOutput(r.compile_output),
  message:        capOutput(r.message),
});

const normalizeOutput = (str) => {
  if (!str) return '';
  // Fast-exit: if the string is huge it has already failed the cap check above
  const s = str.length > 4096 ? str.slice(0, 4096) : str;
  return s.replace(/\[|\]|\{|\}|"|'|,/g, ' ').trim().split(/\s+/).join(' ');
};

// Upsert topic mastery after a submission verdict
const updateTopicMastery = async (userId, problemId, isAccepted, hintUsed) => {
  try {
    const problem = await problemRepo.getById(problemId);
    const tags = problem?.tags || [];

    for (const tag of tags) {
      await topicMasteryRepo.recordAttempt(userId, tag, { solved: isAccepted, hintUsed });
    }
  } catch (err) {
    // Non-critical: log but don't fail the submission
    console.error('Topic mastery update failed:', err.message);
  }
};

const MAX_ATTEMPTS = 3;

const judgeWorker = new Worker('submissions', async job => {
  const { problem_id, source_code, language_id, user_id, custom_input, contest_id, assignment_id } = job.data;
  try {
    return await runJob(job, { problem_id, source_code, language_id, user_id, custom_input, contest_id, assignment_id });
  } catch (err) {
    if (err.name === 'QueueFullError') {
      getIO()?.to(job.id).emit('judging_retry', {
        attempt:     job.attemptsMade,
        maxAttempts: MAX_ATTEMPTS,
      });
    }
    throw err;
  }
}, { connection });

async function runJob(job, { problem_id, source_code, language_id, user_id, custom_input, contest_id, assignment_id }) {

  console.log(`Processing Job ${job.id} for Problem ${problem_id}${custom_input ? ' [custom input]' : ''}`);

  // Custom input: single run, no verdict persistence
  if (custom_input !== null && custom_input !== undefined) {
    await job.updateProgress(50);
    const result = await runSingle(source_code, language_id, custom_input);
    await job.updateProgress(100);
    return {
      verdict: result.status,
      time: parseFloat(result.time) || 0,
      memory: result.memory || 0,
      test_case_results: [result],
      custom_run: true
    };
  }

  const testCasesRaw = await problemRepo.getTestCases(problem_id);
  // Normalize to the snake_case shape the rest of this function already expects.
  const testCases = testCasesRaw.map(tc => ({
    input_data: tc.inputData, expected_output: tc.expectedOutput,
    score: tc.score || 0, is_public: !!tc.isPublic,
  }));

  if (testCases.length === 0) {
    throw new Error('No test cases found for problem');
  }

  // Fetch scoring mode + special-judge config for this problem
  const probMeta = await problemRepo.getById(problem_id);
  const scoringMode = probMeta?.scoringMode || 'acm';
  const maxScore    = probMeta?.maxScore    || 100;
  const isOI        = scoringMode === 'oi';

  // Special judge: when enabled, a faculty-provided checker program decides
  // AC/WA instead of the normalized string compare below.
  const usesChecker       = !!probMeta?.usesChecker;
  const checkerCode       = probMeta?.checkerCode || null;
  const checkerLanguageId = probMeta?.checkerLanguageId || null;

  // In OI mode: if all test-case scores are 0, distribute max_score evenly
  const totalTcScore = testCases.reduce((s, tc) => s + (tc.score || 0), 0);
  const useEvenSplit = isOI && totalTcScore === 0;
  const perTcScore   = useEvenSplit ? Math.floor(maxScore / testCases.length) : 0;

  let finalVerdict = { id: 3, description: 'Accepted' };
  let maxTime = 0;
  let maxMemory = 0;
  const results = [];
  let earlyExit = false;
  let earnedScore = 0;
  let passedCount = 0;

  // Split into chunks of BATCH_SIZE (Judge0 default max is 20)
  for (let chunkStart = 0; chunkStart < testCases.length && !earlyExit; chunkStart += BATCH_SIZE) {
    const chunk = testCases.slice(chunkStart, chunkStart + BATCH_SIZE);

    // One HTTP call for the whole chunk (limits applied per language)
    const m = getLangMultiplier(language_id);
    const tokens = await submitBatch(
      chunk.map(tc => ({
        source_code,
        language_id,
        stdin:           tc.input_data,
        cpu_time_limit:  2  * m,
        wall_time_limit: 5  * m,
        memory_limit:    262144 * m,
      }))
    );

    await job.updateProgress(Math.floor((chunkStart / testCases.length) * 80));

    // Poll until all tokens in this chunk are done
    const batchResults = await pollBatch(tokens);

    for (let i = 0; i < batchResults.length; i++) {
      const r  = batchResults[i];
      const tc = chunk[i];

      const result = sanitizeResult({
        status:         r.status,
        time:           r.time,
        memory:         r.memory,
        stdout:         r.stdout,
        stderr:         r.stderr,
        compile_output: r.compile_output,
        message:        r.message,
      });

      if (result.status.id === 3) {
        if (usesChecker) {
          // Special judge: delegate the verdict to the faculty checker program.
          const checkResult = await runChecker({
            checkerCode,
            checkerLanguageId,
            input:    tc.input_data,
            expected: tc.expected_output,
            actual:   result.stdout,
          });
          if (!checkResult.accepted) {
            result.status  = { id: 4, description: 'Wrong Answer' };
            result.message = checkResult.message || 'Rejected by special judge';
          }
        } else {
          const userOutput  = normalizeOutput(result.stdout);
          const expectedOut = normalizeOutput(tc.expected_output);
          if (userOutput !== expectedOut) {
            result.status  = { id: 4, description: 'Wrong Answer' };
            // Only reveal expected output for PUBLIC test cases.
            result.message = tc.is_public
              ? `Expected: ${tc.expected_output}\nGot: ${result.stdout}`
              : 'Wrong answer on a hidden test case.';
          }
        }
      }

      const passed = result.status.id === 3;
      if (passed) {
        passedCount++;
        earnedScore += useEvenSplit ? perTcScore : (tc.score || 0);
      }

      // Attach test metadata. Input/expected are exposed ONLY for public tests
      // so the UI and AI tutor never leak hidden-test answers.
      results.push({
        ...result,
        passed,
        tc_score:  useEvenSplit ? perTcScore : (tc.score || 0),
        is_public: !!tc.is_public,
        input:     tc.is_public ? tc.input_data      : null,
        expected:  tc.is_public ? tc.expected_output : null,
      });

      const time = parseFloat(result.time) || 0;
      if (time > maxTime) maxTime = time;
      if (result.memory > maxMemory) maxMemory = result.memory;

      if (!passed) {
        // ACM: stop immediately on first failure
        // OI: keep running all test cases to accumulate partial score
        if (!isOI) {
          finalVerdict = result.status;
          earlyExit = true;
          break;
        } else {
          // Record the first failing status for the overall verdict label
          if (finalVerdict.id === 3) finalVerdict = result.status;
        }
      }
    }
  }

  // Determine final OI verdict
  if (isOI) {
    if (passedCount === testCases.length) {
      finalVerdict = { id: 3, description: 'Accepted' };
    } else if (earnedScore > 0) {
      finalVerdict = { id: 7, description: 'Partial' };
    }
    // else keep the first error verdict (TLE / CE / WA)
  }

  await job.updateProgress(100);

  const finalScore = isOI ? earnedScore : null;
  // Ordered pass/fail per test case that ran (powers the concept heatmap).
  const testResultsArr = results.map(r => !!r.passed);

  // Insert submission record — cap source_code before writing
  const submission = await submissionRepo.create({
    userId: user_id || null,
    problemId: problem_id,
    code: capOutput(source_code),
    language: language_id.toString(),
    verdict: finalVerdict.description,
    runtime: Math.floor(maxTime * 1000),
    memory: maxMemory,
    score: finalScore,
    testResults: testResultsArr,
    assignmentId: assignment_id || null,
  });

  // Update topic mastery (non-blocking)
  if (user_id) {
    const isAccepted = finalVerdict.description === 'Accepted';
    await updateTopicMastery(user_id, problem_id, isAccepted, false);
  }

  // Record a contest submission when this was submitted within a contest.
  // Guarded: the contest must exist, be within its window, contain the problem,
  // and the user must be registered. Failures here never fail the judging.
  if (contest_id && user_id) {
    try {
      const contest = await contestRepo.getById(contest_id);
      const withinWindow = contest && new Date() >= new Date(contest.startsAt) && new Date() <= new Date(contest.endsAt);
      const hasProblem = contest && (contest.problemIds || []).includes(problem_id);
      const registration = contest ? await contestRepo.isRegistered(contest_id, user_id) : null;

      if (contest && withinWindow && hasProblem && registration) {
        await contestRepo.addSubmission(contest_id, {
          userId: user_id, problemId: problem_id, verdict: finalVerdict.description,
          score: finalScore || 0, isVirtual: false, penaltyMinutes: 0,
        });
        // Notify the contest room so live scoreboards refresh (A2).
        getIO()?.to(`contest:${contest_id}`).emit('scoreboard_update', { contest_id });
      }
    } catch (e) {
      console.error('Contest submission record failed:', e.message);
    }
  }

  return {
    submission_id: submission.id,
    verdict: finalVerdict,
    time: maxTime,
    memory: maxMemory,
    score: finalScore,
    max_score: isOI ? maxScore : null,
    scoring_mode: scoringMode,
    passed_count: passedCount,
    total_count: testCases.length,
    test_case_results: results,
  };

}

judgeWorker.on('completed', (job) => {
  const verdict = job.returnvalue?.verdict?.description;
  console.log(`Job ${job.id} completed — verdict: ${verdict}`);
  getIO()?.to(job.id).emit('verdict', { success: true, state: 'completed', result: job.returnvalue });
});

judgeWorker.on('failed', (job, err) => {
  const friendly = friendlyJudgeError(err);
  console.error(`Job ${job.id} failed: ${err.message}  →  "${friendly}"`);
  getIO()?.to(job.id).emit('verdict', {
    success: false,
    state: 'failed',
    error: friendly,
    code: err?.code || err?.response?.status || null,
  });
});

judgeWorker.on('error', err => {
  console.error('Judge worker error:', err.message);
});

module.exports = judgeWorker;
