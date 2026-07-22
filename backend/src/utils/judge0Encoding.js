// Judge0 base64 helpers. The judge0.conf on this deployment only accepts
// base64-encoded source_code/stdin/expected_output, and returns
// stdout/stderr/compile_output/message base64-encoded in turn.

const toB64 = (str) => Buffer.from(str ?? '', 'utf8').toString('base64');

// Judge0 returns null for fields that weren't produced (e.g. no stderr) —
// preserve null/undefined instead of decoding them into garbage.
const fromB64 = (str) => (str === null || str === undefined) ? str : Buffer.from(str, 'base64').toString('utf8');

module.exports = { toB64, fromB64 };
