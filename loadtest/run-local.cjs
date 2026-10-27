// Runs one load scenario on THIS machine: starts the exam sandbox (real API, in-memory database), runs k6 against it, and reports what the
// server process used. See loadtest/README.md for what a local run does and does not prove.
//
//   node loadtest/run-local.cjs <burst|sustained|surge|storm|capacity> [--students 1000] [--questions 40] [--latency 30] [--duration-min 60] [--vus N]
//        [--start-window s] [--run-seconds s] [--think-min s] [--think-max s] [--surge-at s] [--surge-factor n] [--storm-at s] [--submit-window s]
//        [--reload-rate p] [--violation-rate p] [--port 3399]
//
// Sandbox options: students, questions, latency, duration-min, port. Every other option is passed to k6 as an environment value.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCENARIOS = { burst: 'exam-start-burst.js', sustained: 'exam-sustained.js', surge: 'exam-final-surge.js', storm: 'exam-reconnect-storm.js', capacity: 'exam-capacity.js' };
const SANDBOX_KEYS = new Set(['students', 'questions', 'latency', 'duration-min', 'port']);

const [name, ...rest] = process.argv.slice(2);
if (!SCENARIOS[name]) {
  console.error('Usage: node loadtest/run-local.cjs <' + Object.keys(SCENARIOS).join('|') + '> [--option value ...]');
  process.exit(2);
}
const opts = {};
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i].startsWith('--') || rest[i + 1] === undefined) { console.error('Options look like: --students 1000'); process.exit(2); }
  opts[rest[i].slice(2)] = rest[i + 1];
}

const root = path.resolve(__dirname, '..');
const resultsDir = path.join(__dirname, 'results');
fs.mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const tokensFile = path.join(resultsDir, 'tokens.json');
const statsFile = path.join(resultsDir, `${name}-${stamp}-server.csv`);
const summaryFile = path.join(resultsDir, `${name}-${stamp}-k6.json`);
const port = opts.port || '3399';
const students = Number(opts.students || 200);

function findK6() {
  if (process.env.K6_BIN) return process.env.K6_BIN;
  const installed = 'C:\\Program Files\\k6\\k6.exe';
  return fs.existsSync(installed) ? installed : 'k6';
}

const sandbox = spawn(process.execPath, [path.join(root, 'backend', 'scripts', 'exam-sandbox.js')], {
  env: Object.assign({}, process.env, {
    PORT: port, SANDBOX_LIMIT: '0', SANDBOX_STUDENTS: String(students), SANDBOX_TOKENS: tokensFile, SANDBOX_STATS: statsFile,
    SANDBOX_QUESTIONS: opts.questions || '40', SANDBOX_DURATION_MIN: opts['duration-min'] || '60', SANDBOX_LATENCY_MS: opts.latency || '0',
  }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let sandboxLog = '';
sandbox.stdout.on('data', (d) => { sandboxLog += d; });
sandbox.stderr.on('data', (d) => { sandboxLog += d; });
const stopSandbox = () => { try { sandbox.kill(); } catch (e) { /* already gone */ } };
process.on('SIGINT', () => { stopSandbox(); process.exit(130); });

async function waitReady() {
  for (let i = 0; i < 120; i += 1) {
    if (sandbox.exitCode !== null) throw new Error('The sandbox stopped at start-up:\n' + sandboxLog.slice(-1500));
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The sandbox did not become ready.\n' + sandboxLog.slice(-1500));
}

function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; }

// Capacity: one row per step of the ramp, read from the k6 summary file.
function reportCapacity() {
  if (!fs.existsSync(summaryFile)) return;
  const m = JSON.parse(fs.readFileSync(summaryFile, 'utf8')).metrics || {};
  const val = (key, stat) => { const x = m[key]; if (!x) return undefined; const v = x.values || x; return v[stat]; };
  const rates = (opts.rates || '50,100,200,300,400,500,600,700,800,1000').split(',').map(Number);
  const step = Number(opts['step-seconds'] || 20);
  console.log(String.fromCharCode(10) + 'Capacity (answer saves per second, one API process on this machine):');
  console.log('  target/s  achieved/s   p95 ms   errors');
  let best = null;
  for (const r of rates) {
    const count = val(`http_reqs{name:save,rate:${r}}`, 'count');
    const p95 = val(`http_req_duration{name:save,rate:${r}}`, 'p(95)');
    const errs = val(`bad_status{name:save,rate:${r}}`, 'count') || 0;
    if (count === undefined || p95 === undefined) { console.log(`  ${String(r).padStart(8)}   (no data)`); continue; }
    const achieved = count / step;
    const good = p95 < 500 && errs === 0 && achieved >= r * 0.9;
    if (good) best = r;
    console.log(`  ${String(r).padStart(8)}  ${achieved.toFixed(0).padStart(10)}  ${p95.toFixed(0).padStart(7)}  ${String(errs).padStart(7)}${good ? '' : '   <- over the limit'}`);
  }
  console.log(best ? `  Highest step that held p95 < 500 ms, no errors, and the full rate: ${best} saves/s.` : '  No step held the target.');
}

function reportServer() {
  if (!fs.existsSync(statsFile)) return;
  const rows = fs.readFileSync(statsFile, 'utf8').trim().split(String.fromCharCode(10)).slice(1).map((l) => [0].concat(l.split(',').slice(1).map(Number))).filter((r) => r.length === 6 && r.every((n) => !Number.isNaN(n)));
  if (rows.length < 2) { console.log('\nServer: too short a run for statistics (it samples every 5 seconds).'); return; }
  const col = (i) => rows.map((r) => r[i]);
  const rss = col(1);
  const n = rows.length;
  const early = rss.slice(Math.floor(n * 0.2), Math.floor(n * 0.4));
  const late = rss.slice(Math.floor(n * 0.8));
  const drift = early.length && late.length ? median(late) - median(early) : NaN;
  console.log('\nServer process (this machine, one Node process):');
  console.log(`  memory   peak ${Math.max(...rss).toFixed(0)} MB, drift ${Number.isNaN(drift) ? 'n/a (run too short)' : (drift >= 0 ? '+' : '') + drift.toFixed(1) + ' MB'} (late median minus early median)`);
  console.log(`  cpu      peak ${Math.max(...col(3)).toFixed(0)}% of one core, median ${median(col(3)).toFixed(0)}%`);
  console.log(`  event loop delay   p99 peak ${Math.max(...col(4)).toFixed(0)} ms, worst ${Math.max(...col(5)).toFixed(0)} ms`);
  console.log(`  samples  ${n} (every 5 s)   file: ${path.relative(process.cwd(), statsFile)}`);
}

(async () => {
  let code = 1;
  try {
    await waitReady();
    console.log(`Sandbox ready on port ${port}: ${students} students, ${opts.questions || 40} questions, database latency ${opts.latency || 0} ms.`);
    const args = ['run', '--summary-export', summaryFile, '-e', `BASE_URL=http://127.0.0.1:${port}`, '-e', `TOKENS_FILE=${tokensFile}`, '-e', `VUS=${opts.vus || students}`];
    for (const [k, v] of Object.entries(opts)) if (!SANDBOX_KEYS.has(k) && k !== 'vus') args.push('-e', `${k.toUpperCase().replace(/-/g, '_')}=${v}`);
    // Past the breaking point k6 would print one warning per failed request (thousands); the numbers are in the summary.
    if (name === 'capacity') args.push('--log-output', 'none');
    args.push(path.join(__dirname, 'scenarios', SCENARIOS[name]));
    code = await new Promise((resolve) => {
      const k6 = spawn(findK6(), args, { stdio: 'inherit' });
      k6.on('error', (e) => { console.error('Could not start k6 (' + e.message + '). Install it (winget install GrafanaLabs.k6) or set K6_BIN.'); resolve(3); });
      k6.on('exit', (c) => resolve(c === null ? 1 : c));
    });
  } catch (e) {
    console.error(e.message);
  } finally {
    stopSandbox();
    if (name === 'capacity') reportCapacity();
    reportServer();
    console.log(`\nk6 summary: ${path.relative(process.cwd(), summaryFile)}`);
    console.log(code === 0 ? 'RESULT: every threshold passed.' : `RESULT: a threshold failed or the run did not finish (k6 exit code ${code}).`);
    process.exit(code);
  }
})();
