// Generates test cases whose expected outputs come from EXECUTING CODE, never
// from the model's imagination.
//
// The rule this enforces (docs/scale-readiness/14-ai-features.md §14.4): a
// hallucinated expected output marks every student wrong, and wrong in the same
// way, which is worse than having no problem at all. The previous implementation
// asked the model for {input, output} pairs directly — this replaces it.
//
//   1. Model returns a REFERENCE SOLUTION + inputs only (never outputs)
//   2. The reference is checked against the samples in the statement
//      → if it can't reproduce those, the reference is wrong and we stop
//   3. Judge0 runs the reference on each generated input
//   4. Judge0's real stdout becomes the expected output
//
// Step 2 is the gate that makes step 4 trustworthy: without it, a plausible but
// incorrect reference would silently produce a full set of confidently wrong
// expected outputs.
const ai = require('./aiGateway');
const { runOnJudge0 } = require('../utils/judge0Run');

// Python 3 — fastest to start, no compile step, and the most reliable target for
// a model writing a short reference solution.
const REFERENCE_LANGUAGE_ID = 71;
const MAX_CASES = 25;

// Judge0 status ids: 3 = Accepted, 5 = TLE, 6 = compile error, 7..12 = runtime error.
const statusLabel = (id) => ({
  5: 'timed out', 6: 'failed to compile', 7: 'runtime error (SIGSEGV)',
  8: 'runtime error (SIGXFSZ)', 9: 'runtime error (SIGFPE)', 10: 'runtime error (SIGABRT)',
  11: 'runtime error (NZEC)', 12: 'runtime error',
}[id] || `status ${id}`);

// Compare program output the way a judge does: ignore trailing whitespace on each
// line and any trailing blank lines. Anything stricter rejects correct solutions
// over a missing final newline.
const normalise = (s) => String(s ?? '').replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
const outputsMatch = (a, b) => normalise(a) === normalise(b);

const PROMPT_SCHEMA = `{
  "suggestedDifficulty": "easy" | "medium" | "hard",
  "referenceSolution": "complete Python 3 program reading from stdin and printing to stdout",
  "samples": [ { "input": "string", "output": "string" } ],
  "inputs": [ "string", "string", ... ]
}`;

function buildPrompt({ title, description, count }) {
  return `You are an expert competitive-programming problem setter preparing a problem for automated judging.

Problem title: ${title}
Problem statement:
${description}

Produce THREE things:

1. "referenceSolution" — a complete, correct Python 3 program that reads the input from
   stdin exactly as the statement describes and prints only the required answer to stdout.
   No prompts, no extra text, no explanatory prints. It must run unmodified.

2. "samples" — the example input/output pairs stated in the problem above. Copy them
   exactly as given. If the statement contains no examples, return an empty array.

3. "inputs" — EXACTLY ${count} test inputs, as strings, in the same stdin format.
   Do NOT include expected outputs; they will be computed by running your reference
   solution. Cover: the smallest valid input, the largest allowed by the constraints,
   duplicates, negative values (if permitted), and any boundary the statement implies.
   Each input must be complete and independently runnable.

Output strictly valid JSON matching this schema, with no markdown formatting:
${PROMPT_SCHEMA}`;
}

/**
 * @returns {Promise<{
 *   testCases: Array<{input: string, output: string, is_public: boolean}>,
 *   suggestedDifficulty: string,
 *   referenceSolution: string,
 *   referenceLanguageId: number,
 *   verification: {
 *     verified: boolean, samplesChecked: number, samplesPassed: number,
 *     requested: number, produced: number, rejected: Array<{input: string, reason: string}>,
 *     sampleFailures: Array<{input: string, expected: string, got: string}>,
 *   },
 * }>}
 * @throws {Error} with `.code` set to REFERENCE_UNRELIABLE / NO_CASES / JUDGE0_UNREACHABLE
 */
// `run` is injectable so the pipeline's decision logic (the sample gate, dedupe,
// rejection reporting) can be exercised without a live Judge0.
async function generateVerifiedTestCases({ title, description, count = 12, run = runOnJudge0 }) {
  const requested = Math.min(Math.max(parseInt(count, 10) || 12, 1), MAX_CASES);

  // ── 1. Ask for reference + inputs (no outputs) ─────────────────────────────
  const { data } = await ai.generateJson({ prompt: buildPrompt({ title, description, count: requested }) });

  const referenceSolution = typeof data?.referenceSolution === 'string' ? data.referenceSolution.trim() : '';
  if (!referenceSolution) {
    const e = new Error('The model did not return a reference solution.');
    e.code = 'REFERENCE_UNRELIABLE';
    throw e;
  }

  const rawInputs = Array.isArray(data?.inputs) ? data.inputs : [];
  const samples = (Array.isArray(data?.samples) ? data.samples : [])
    .filter(s => s && typeof s.input === 'string' && typeof s.output === 'string');

  // ── 2. Gate: the reference must reproduce the statement's own samples ──────
  const sampleFailures = [];
  let samplesPassed = 0;
  for (const s of samples) {
    const out = await run({ source_code: referenceSolution, language_id: REFERENCE_LANGUAGE_ID, stdin: s.input });
    if (out.statusId === null) {
      const e = new Error(`Judge0 is unreachable: ${out.message}`);
      e.code = 'JUDGE0_UNREACHABLE';
      throw e;
    }
    if (!out.ok) {
      sampleFailures.push({ input: s.input, expected: s.output, got: `[${statusLabel(out.statusId)}] ${out.message || out.stderr}`.trim() });
      continue;
    }
    if (outputsMatch(out.stdout, s.output)) samplesPassed += 1;
    else sampleFailures.push({ input: s.input, expected: s.output, got: out.stdout });
  }

  // If the statement had samples and the reference disagrees with any of them, the
  // reference is wrong — refuse rather than emit a batch of confident wrong answers.
  if (samples.length > 0 && samplesPassed !== samples.length) {
    const e = new Error(
      `The generated reference solution failed ${samples.length - samplesPassed} of ${samples.length} example(s) from the statement, so its outputs cannot be trusted.`
    );
    e.code = 'REFERENCE_UNRELIABLE';
    e.details = { sampleFailures };
    throw e;
  }

  // ── 3+4. Execute the reference on each input; its stdout IS the expectation ─
  const seen = new Set(samples.map(s => normalise(s.input)));
  const testCases = [];
  const rejected = [];

  // Statement samples are trustworthy now (the reference reproduced them), and
  // they make the best public examples for students.
  for (const s of samples) {
    testCases.push({ input: s.input, output: s.output, is_public: true });
  }

  for (const raw of rawInputs) {
    if (testCases.length >= requested + samples.length) break;
    if (typeof raw !== 'string' || !raw.trim()) {
      rejected.push({ input: String(raw).slice(0, 80), reason: 'empty or non-string input' });
      continue;
    }
    const key = normalise(raw);
    if (seen.has(key)) {
      rejected.push({ input: raw.slice(0, 80), reason: 'duplicate of another case' });
      continue;
    }
    seen.add(key);

    const out = await run({ source_code: referenceSolution, language_id: REFERENCE_LANGUAGE_ID, stdin: raw });
    if (out.statusId === null) {
      const e = new Error(`Judge0 became unreachable: ${out.message}`);
      e.code = 'JUDGE0_UNREACHABLE';
      throw e;
    }
    if (!out.ok) {
      // The reference crashed or timed out on this input — usually the input
      // violates the constraints. Drop it and say so; never guess an output.
      rejected.push({ input: raw.slice(0, 80), reason: `reference ${statusLabel(out.statusId)}` });
      continue;
    }
    if (!out.stdout.trim()) {
      rejected.push({ input: raw.slice(0, 80), reason: 'reference produced no output' });
      continue;
    }
    testCases.push({ input: raw, output: out.stdout, is_public: false });
  }

  if (testCases.length === 0) {
    const e = new Error('No test case could be verified — every generated input failed against the reference solution.');
    e.code = 'NO_CASES';
    e.details = { rejected };
    throw e;
  }

  const difficulty = ['easy', 'medium', 'hard'].includes(data?.suggestedDifficulty) ? data.suggestedDifficulty : 'medium';

  return {
    testCases,
    suggestedDifficulty: difficulty,
    referenceSolution,
    referenceLanguageId: REFERENCE_LANGUAGE_ID,
    verification: {
      verified: true,
      samplesChecked: samples.length,
      samplesPassed,
      requested,
      produced: testCases.length,
      rejected,
      sampleFailures,
    },
  };
}

module.exports = { generateVerifiedTestCases, REFERENCE_LANGUAGE_ID, outputsMatch, normalise };
