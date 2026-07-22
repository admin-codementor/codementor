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

const axios = require('axios');
const { toB64, fromB64 } = require('./judge0Encoding');

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const CHECKER_TIMEOUT_MS = 20000;

// Self-contained copy of the worker's auth-header helper — matches AUTHN_TOKEN
// in judge0.conf so we don't depend on the worker module.
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
 * Run a faculty-provided checker program against one test case.
 *
 * @param {Object}  args
 * @param {string}  args.checkerCode        Source code of the checker program.
 * @param {number}  args.checkerLanguageId  Judge0 language id the checker is written in.
 * @param {string}  args.input              The test case input fed to the contestant.
 * @param {string}  args.expected           The stored expected output.
 * @param {string}  args.actual             The contestant program's stdout.
 * @returns {Promise<{ accepted: boolean, message: string }>}
 */
exports.runChecker = async ({ checkerCode, checkerLanguageId, input, expected, actual }) => {
  // Guard: a problem flagged uses_checker but missing checker config can't judge.
  if (!checkerCode || !checkerLanguageId) {
    return { accepted: false, message: 'Special judge misconfigured: missing checker code or language.' };
  }

  const stdin = buildCheckerStdin(input, expected, actual);

  let res;
  try {
    res = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`,
      {
        source_code:     toB64(checkerCode),
        language_id:     Number(checkerLanguageId),
        stdin:           toB64(stdin),
        cpu_time_limit:  10,
        wall_time_limit: 15,
        memory_limit:    262144,
        base64_encoded:  true,
      },
      { headers: judge0Headers(), timeout: CHECKER_TIMEOUT_MS }
    );
  } catch (err) {
    // Judge0 unreachable / 5xx / timeout — fail safe to rejected.
    const detail = err.response?.data?.error || err.message || 'unknown error';
    return { accepted: false, message: `Checker execution failed: ${cap(detail)}` };
  }

  const r = res.data || {};
  const statusId = r.status?.id;
  const decodedStdout        = fromB64(r.stdout);
  const decodedStderr        = fromB64(r.stderr);
  const decodedCompileOutput = fromB64(r.compile_output);
  const decodedMessage       = fromB64(r.message);

  // Judge0 status ids: 3 = Accepted (ran cleanly), 6 = Compilation Error,
  // 5 = TLE, 7-12 = various runtime errors. Anything other than a clean run
  // means the checker itself is broken -> reject with diagnostics.
  if (statusId !== 3) {
    const reason =
      decodedCompileOutput ? `compile error: ${cap(decodedCompileOutput)}` :
      decodedStderr        ? `runtime error: ${cap(decodedStderr)}` :
      decodedMessage       ? cap(decodedMessage) :
      (r.status?.description || 'unknown checker failure');
    return { accepted: false, message: `Checker did not run cleanly (${reason}).` };
  }

  const stdout = (decodedStdout || '').trim();
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
  return { accepted: false, message: cap(stdout) || (decodedStderr ? cap(decodedStderr) : 'Rejected by checker') };
};
