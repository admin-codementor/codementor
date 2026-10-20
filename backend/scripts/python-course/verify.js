// Runs every reference solution on the REAL Judge0 (the instance the app uses, language 100 = Python 3.12) and
// compares with the problem's own rules. Same program (student code + driver), same time and memory limits,
// same comparison as the app, but without Firestore job documents, so a full run costs no database quota.
const axios = require('axios');
const { toB64, fromB64 } = require('../../src/utils/judge0Encoding');
const { buildSource } = require('../../src/utils/sourceBuilder');
const { outputsMatch } = require('../../src/utils/outputCompare');
const { PYTHON_LANGUAGE_ID } = require('./lib');

const BATCH = 20;
const MULT = 3; // the judge's multiplier for Python (judgeService LANG_MULTIPLIERS)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers() {
  const token = process.env.JUDGE0_AUTH_TOKEN;
  return { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) };
}

async function runBatch(url, items) {
  const created = await axios.post(`${url}/submissions/batch?base64_encoded=true`, {
    submissions: items.map((it) => ({
      source_code: toB64(it.source), language_id: PYTHON_LANGUAGE_ID, stdin: toB64(it.input),
      cpu_time_limit: 2 * MULT, wall_time_limit: 5 * MULT, memory_limit: 262144 * MULT,
    })),
  }, { headers: headers(), timeout: 30000 });
  const tokens = created.data.map((t) => t.token);
  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(attempt < 3 ? 1500 : 2500);
    const res = await axios.get(`${url}/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time`, { headers: headers(), timeout: 30000 });
    const subs = res.data.submissions;
    if (subs.every((s) => s.status?.id > 2)) {
      return subs.map((s) => ({
        status: s.status, stdout: fromB64(s.stdout) || '', stderr: fromB64(s.stderr) || '',
        compile: fromB64(s.compile_output) || '', message: fromB64(s.message) || '', time: Number(s.time) || 0,
      }));
    }
  }
  throw new Error('Judge0 did not finish a batch in time.');
}

async function verifyOnJudge(problems, { onProgress } = {}) {
  const url = process.env.JUDGE0_URL || 'http://localhost:2358';
  const jobs = [];
  for (const p of problems) {
    const source = buildSource(p.data.referenceSolution, PYTHON_LANGUAGE_ID, p.data.harness);
    p.testCases.forEach((t, i) => jobs.push({ p, t, i, source, input: t.input }));
  }
  const failures = [];
  let passed = 0;
  let slowest = { time: 0, id: '' };
  for (let at = 0; at < jobs.length; at += BATCH) {
    const slice = jobs.slice(at, at + BATCH);
    let results;
    for (let retry = 0; ; retry++) {
      try { results = await runBatch(url, slice); break; } catch (e) {
        if (retry >= 3) throw e;
        await sleep(4000 * (retry + 1));
      }
    }
    results.forEach((r, k) => {
      const job = slice[k];
      const ok = r.status.id === 3 && outputsMatch(r.stdout, job.t.output, job.p.data.comparison);
      if (r.time > slowest.time) slowest = { time: r.time, id: job.p.sourceId };
      if (ok) { passed++; return; }
      failures.push({
        id: job.p.sourceId, test: job.i + 1, hidden: !job.t.isPublic,
        why: r.status.id !== 3 ? `${r.status.description}${r.stderr ? `: ${r.stderr.trim().split('\n').pop()}` : ''}` : 'output differs',
        expected: job.t.output.slice(0, 80), got: r.stdout.slice(0, 80),
      });
    });
    if (onProgress) onProgress(Math.min(at + BATCH, jobs.length), jobs.length);
  }
  return { total: jobs.length, passed, failures, slowest };
}

module.exports = { verifyOnJudge };
