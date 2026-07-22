const axios = require('axios');
const { toB64, fromB64 } = require('./judge0Encoding');

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';

const headers = () => {
  const token = process.env.JUDGE0_AUTH_TOKEN;
  return { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) };
};

// Run one program on Judge0 (synchronous wait). Returns { ok, stdout, stderr, message, statusId }.
async function runOnJudge0({ source_code, language_id, stdin = '', cpu = 5, wall = 10 }) {
  try {
    const res = await axios.post(
      `${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`,
      {
        source_code: toB64(source_code), language_id, stdin: toB64(stdin),
        cpu_time_limit: cpu, wall_time_limit: wall, memory_limit: 262144,
        base64_encoded: true,
      },
      { headers: headers(), timeout: 20000 }
    );
    const r = res.data || {};
    const statusId = r.status?.id;
    const compileOutput = fromB64(r.compile_output);
    return {
      ok: statusId === 3, // Accepted/finished cleanly
      stdout: fromB64(r.stdout) || '',
      stderr: fromB64(r.stderr) || '',
      message: fromB64(r.message) || compileOutput || (r.status?.description) || '',
      statusId,
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: '', message: err.message, statusId: null };
  }
}

module.exports = { runOnJudge0, JUDGE0_URL };
