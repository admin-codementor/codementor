// DEV ONLY. Runs the real API with an in-memory database holding one demo exam, so the exam screens can be tried in a browser with no
// real data, no real credentials and no network. Nothing here touches Firestore, Redis or any real service (tests/hermeticEnv.js blocks them).
//
//   node scripts/exam-sandbox.js                 # API on http://localhost:3003
//   PORT=3004 SANDBOX_LIMIT=2 node scripts/exam-sandbox.js
//
// Then run the website against it:  API_PROXY_TARGET=http://localhost:3003 npx next dev --webpack -p 3300  (in frontend-next)
// Load testing (see loadtest/README.md): SANDBOX_STUDENTS=1000 adds students ld0001..ld1000 and SANDBOX_TOKENS=<file> writes their sign-in
// tokens for k6; SANDBOX_DURATION_MIN sets the exam length; SANDBOX_LATENCY_MS adds a pause to every database call (Firestore round trips);
// SANDBOX_STATS=<file> logs server CPU, memory and event-loop delay every 5 seconds. SANDBOX_LIMIT=0 means nobody is ever paused.
// It writes browser snippets that sign you in as a student, the exam's owner or an Admin (signed with a throwaway key that only this
// process knows). Paste one into the browser console on the website.
if (process.env.NODE_ENV === 'production') {
  console.error('exam-sandbox is a development tool and refuses to run with NODE_ENV=production.');
  process.exit(1);
}
require('../tests/hermeticEnv');
// There is no Redis here; do not make every request wait for one (see config/redis.js).
if (process.env.REDIS_RETRIES === undefined) process.env.REDIS_RETRIES = '0';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createExamFakeDb, EXAM_ID } = require('../tests/fakes/examFakeDb');

const PORT = Number(process.env.PORT) || 3003;
const fake = createExamFakeDb({
  violationLimit: Number(process.env.SANDBOX_LIMIT ?? 3), questionCount: Number(process.env.SANDBOX_QUESTIONS ?? 12),
  studentCount: Number(process.env.SANDBOX_STUDENTS ?? 0), durationMinutes: Number(process.env.SANDBOX_DURATION_MIN ?? 60), latencyMs: Number(process.env.SANDBOX_LATENCY_MS ?? 0),
});
// Realistic options, so the per-student shuffle of options is exercised (the default "Option A..." text is never shuffled).
fake.questions.forEach((q) => { q.options = ['red', 'green', 'blue', 'pink']; });
fake.install();

const app = require('../src/app');

const snippet = (id, target) => {
  const u = fake.users.get(id);
  const claims = { id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 };
  const access = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
  const refresh = jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: '12h' });
  const user = { id, name: u.name, email: `${id}@sandbox.test`, role: u.role, department: u.department ?? null };
  return `localStorage.setItem("accessToken",${JSON.stringify(access)});localStorage.setItem("refreshToken",${JSON.stringify(refresh)});localStorage.setItem("user",${JSON.stringify(JSON.stringify(user))});try{sessionStorage.clear()}catch(e){};location.href=${JSON.stringify(target)};`;
};

const out = process.env.SANDBOX_OUT;
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'sandbox-student1.js'), snippet('stu1', `/app/exams/${EXAM_ID}`));
  fs.writeFileSync(path.join(out, 'sandbox-student2.js'), snippet('stu2', `/app/exams/${EXAM_ID}`));
  fs.writeFileSync(path.join(out, 'sandbox-owner.js'), snippet('owner1', `/faculty/exams/${EXAM_ID}/roster`));
  fs.writeFileSync(path.join(out, 'sandbox-admin.js'), snippet('adm1', `/faculty/exams/${EXAM_ID}/roster`));
}

const tokensOut = process.env.SANDBOX_TOKENS;
if (tokensOut && fake.loadStudentIds.length) {
  fs.mkdirSync(path.dirname(path.resolve(tokensOut)), { recursive: true });
  const rows = fake.loadStudentIds.map((id) => ({ id, token: jwt.sign({ id, role: 'student', permissions: {}, department: null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '12h' }) }));
  fs.writeFileSync(tokensOut, JSON.stringify(rows));
}

const statsOut = process.env.SANDBOX_STATS;
if (statsOut) {
  const { monitorEventLoopDelay } = require('perf_hooks');
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  fs.mkdirSync(path.dirname(path.resolve(statsOut)), { recursive: true });
  const EOL = String.fromCharCode(10);
  fs.writeFileSync(statsOut, ['time', 'rss_mb', 'heap_mb', 'cpu_pct', 'loop_p99_ms', 'loop_max_ms'].join(',') + EOL);
  let lastCpu = process.cpuUsage(); let lastAt = process.hrtime.bigint();
  setInterval(() => {
    const cpu = process.cpuUsage(lastCpu); const now = process.hrtime.bigint();
    const cpuPct = ((cpu.user + cpu.system) / 1000) / (Number(now - lastAt) / 1e6) * 100; // percent of ONE core
    lastCpu = process.cpuUsage(); lastAt = now;
    const m = process.memoryUsage();
    fs.appendFileSync(statsOut, `${new Date().toISOString()},${(m.rss / 1048576).toFixed(1)},${(m.heapUsed / 1048576).toFixed(1)},${cpuPct.toFixed(1)},${(loop.percentile(99) / 1e6).toFixed(1)},${(loop.max / 1e6).toFixed(1)}` + EOL);
    loop.reset();
  }, 5000).unref();
}

const httpServer = app.listen(PORT, '127.0.0.1', () => {
  console.log(`exam sandbox on http://127.0.0.1:${PORT}  (exam ${EXAM_ID}, pause after ${process.env.SANDBOX_LIMIT ?? 3} violations)`);
  if (out) console.log(`sign-in snippets written to ${out}`);
});
// The same keep-alive settings as the real server, so the load test measures what production will do.
require('../src/utils/serverTimeouts').applyServerTimeouts(httpServer);
