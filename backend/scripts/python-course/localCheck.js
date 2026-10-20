// Runs every reference solution against every test case on THIS machine's Python, using exactly the program the
// judge would build (student code + driver) and exactly the comparison the problem uses. It proves the dataset
// agrees with itself; it does not prove the platform (Python 3.12 on Judge0): --verify does that.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { buildSource } = require('../../src/utils/sourceBuilder');
const { outputsMatch } = require('../../src/utils/outputCompare');
const { PYTHON_LANGUAGE_ID } = require('./lib');

function findPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version.split()[0])'], { encoding: 'utf8' });
    if (r.status === 0) return { cmd, version: r.stdout.trim() };
  }
  return null;
}

function runOne(cmd, file, input, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, ['-I', '-X', 'utf8', file], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ out, err, code, timedOut }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function localCheck(problems, { concurrency = 8, timeoutMs = 10000, onProgress } = {}) {
  const py = findPython();
  if (!py) throw new Error('Python was not found on this machine (tried python, python3, py).');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pycourse-'));
  const jobs = [];
  for (const p of problems) {
    const file = path.join(dir, `${p.key}.py`);
    fs.writeFileSync(file, buildSource(p.data.referenceSolution, PYTHON_LANGUAGE_ID, p.data.harness), 'utf8');
    p.testCases.forEach((t, i) => jobs.push({ p, file, t, i }));
  }
  const failures = [];
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await runOne(py.cmd, job.file, job.t.input, timeoutMs);
      const ok = !r.timedOut && r.code === 0 && outputsMatch(r.out, job.t.output, job.p.data.comparison);
      if (!ok) {
        failures.push({
          id: job.p.sourceId, test: job.i + 1, hidden: !job.t.isPublic,
          why: r.timedOut ? 'timed out' : r.code !== 0 ? `crashed: ${r.err.trim().split('\n').pop()}` : 'output differs',
          input: job.t.input.slice(0, 80), expected: job.t.output.slice(0, 80), got: r.out.slice(0, 80),
        });
      }
      done++;
      if (onProgress && done % 250 === 0) onProgress(done, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  fs.rmSync(dir, { recursive: true, force: true });
  return { python: py, total: jobs.length, passed: jobs.length - failures.length, failures };
}

module.exports = { localCheck, findPython };
