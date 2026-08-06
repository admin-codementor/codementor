// Special judge / custom checker runner.
//
// Some problems accept multiple correct outputs (e.g. "print ANY valid path",
// floating-point answers within tolerance, multiple optimal solutions). For
// these, a plain string compare of the contestant's stdout against the stored
// expected_output is wrong. Instead the faculty supplies a CHECKER program that
// is fed the test input, the expected output, and the contestant's actual
// output, and decides Accepted / Wrong Answer.
//
// ── Checker stdin contract ──────────────────────────────────────────────────
// The checker receives the three values on stdin, each preceded by a delimiter
// line so it can split them deterministically even when any of the three values
// itself contains blank lines. The exact layout written to the checker's stdin
// is:
//
//   ---INPUT---\n
//   <test input>\n
//   ---EXPECTED---\n
//   <expected output>\n
//   ---ACTUAL---\n
//   <contestant output>\n
//
// (A trailing newline is appended after each section's payload.)
//
// ── Checker verdict contract ────────────────────────────────────────────────
// The checker signals ACCEPT in either of two ways:
//   1. It prints a line whose first whitespace-trimmed token is "AC" on stdout, OR
//   2. It exits with status 0 AND prints nothing meaningful that contradicts AC.
// To keep the contract simple and unambiguous we treat the FIRST token of the
// checker's trimmed stdout as authoritative:
//   - first token === "AC"  -> accepted, remainder of that output is the message
//   - anything else          -> rejected, the stdout (or stderr) is the message
// If the checker fails to compile, crashes, times out, or Judge0 itself errors,
// we fail safe to accepted:false with a descriptive message (never throw).
//
// ── Async, non-blocking usage ────────────────────────────────────────────────
// judgeService.js runs inside stateless HTTP requests (Vercel-safe), so this
// module never blocks waiting on Judge0: submitCheckerBatch() fires a batch of
// checker runs and returns immediately with tokens; pollCheckerBatch() does a
// single non-blocking status check per call (returns null until every token in
// the batch has a terminal status) — the caller is responsible for calling it
// again on a later request/poll rather than looping here.

const axios = require('axios');
const { toB64, fromB64 } = require('./judge0Encoding');

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const REQUEST_TIMEOUT_MS = 15000;

// Self-contained copy of the worker's auth-header helper — matches AUTHN_TOKEN
// in judge0.conf so we don't depend on any other module.
const judge0Headers = () => {
  const token = process.env.JUDGE0_AUTH_TOKEN;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Auth-Token': token } : {}),
  };
};

// Delimiter tokens — documented above.
const SEP_INPUT    = '---INPUT---';
const SEP_EXPECTED = '---EXPECTED---';
const SEP_ACTUAL   = '---ACTUAL---';

const buildCheckerStdin = (input, expected, actual) => {
  const norm = (v) => (v === null || v === undefined) ? '' : String(v);
  return [
    SEP_INPUT,    norm(input),
    SEP_EXPECTED, norm(expected),
    SEP_ACTUAL,   norm(actual),
  ].join('\n') + '\n';
};

// Cap any text we read back from Judge0 before putting it in a verdict message.
const MAX_MSG_LEN = 2000;
const cap = (s) => {
  if (!s) return '';
  const str = String(s);
  return str.length > MAX_MSG_LEN ? str.slice(0, MAX_MSG_LEN) + '…' : str;
};

/**
 * Interpret a checker program's completed Judge0 result into an accept/reject
 * verdict, per the contract documented above. Never throws — fails safe to
 * accepted:false with a descriptive message.
 *
 * @param {Object} r  Decoded Judge0 result: { status, stdout, stderr, compile_output, message }
 */
function interpretCheckerResult(r) {
  const statusId = r.status?.id;

  // Judge0 status ids: 3 = Accepted (ran cleanly), 6 = Compilation Error,
  // 5 = TLE, 7-12 = various runtime errors. Anything other than a clean run
  // means the checker itself is broken -> reject with diagnostics.
  if (statusId !== 3) {
    const reason =
      r.compile_output ? `compile error: ${cap(r.compile_output)}` :
      r.stderr          ? `runtime error: ${cap(r.stderr)}` :
      r.message          ? cap(r.message) :
      (r.status?.description || 'unknown checker failure');
    return { accepted: false, message: `Checker did not run cleanly (${reason}).` };
  }

  const stdout = (r.stdout || '').trim();
  if (!stdout) {
    // Ran cleanly (exit 0) but printed nothing. Per the contract we require an
    // explicit "AC" token, so treat empty output as a reject for safety.
    return { accepted: false, message: 'Checker produced no verdict (expected "AC").' };
  }

  const firstToken = stdout.split(/\s+/)[0];
  if (firstToken === 'AC') {
    return { accepted: true, message: cap(stdout) };
  }

  // Anything else is a rejection; surface the checker's own message.
  return { accepted: false, message: cap(stdout) || (r.stderr ? cap(r.stderr) : 'Rejected by checker') };
}

/**
 * Submit a batch of checker runs (one per test case needing special-judge
 * verification) without waiting for results.
 *
 * @param {Array<{checkerCode: string, checkerLanguageId: number, input: string, expected: string, actual: string}>} items
 * @returns {Promise<string[]>} Judge0 tokens, in the same order as `items`.
 */
exports.submitCheckerBatch = async function submitCheckerBatch(items) {
  const res = await axios.post(
    `${JUDGE0_URL}/submissions/batch?base64_encoded=true`,
    {
      submissions: items.map(({ checkerCode, checkerLanguageId, input, expected, actual }) => ({
        source_code: toB64(checkerCode),
        language_id: Number(checkerLanguageId),
        stdin: toB64(buildCheckerStdin(input, expected, actual)),
        cpu_time_limit: 10,
        wall_time_limit: 15,
        memory_limit: 262144,
      })),
    },
    { headers: judge0Headers(), timeout: REQUEST_TIMEOUT_MS }
  );
  return res.data.map((t) => t.token);
};

/**
 * Single non-blocking status check for a checker batch. Returns null if any
 * token is still pending; otherwise returns the interpreted accept/reject
 * verdict for every token, in the same order the tokens were passed in.
 *
 * @param {string[]} tokens
 * @returns {Promise<null|Array<{accepted: boolean, message: string}>>}
 */
exports.pollCheckerBatch = async function pollCheckerBatch(tokens) {
  const res = await axios.get(
    `${JUDGE0_URL}/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true`,
    { headers: judge0Headers(), timeout: REQUEST_TIMEOUT_MS }
  );
  const subs = res.data.submissions;
  if (!subs.every((s) => s.status?.id > 2)) return null;

  return subs.map((s) => interpretCheckerResult({
    status: s.status,
    stdout: fromB64(s.stdout),
    stderr: fromB64(s.stderr),
    compile_output: fromB64(s.compile_output),
    message: fromB64(s.message),
  }));
};
