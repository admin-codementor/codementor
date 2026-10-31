// Errors and self-healing end to end: the circuit breaker in front of the judge, a job that waits for the judge without using up its
// attempts, the reaper, one-key-one-submission, the self-check and its repairs, the one-server-at-a-time lease, and "Report a problem".
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { loadAppWithMounts } = require('../routeAudit');
const { users, add, state, install } = require('../fakes/adminFakeDb');
const judgeJobRepo = require('../../src/repositories/judgeJobRepository');
const maintenanceRepo = require('../../src/repositories/maintenanceRepository');
const placementRepo = require('../../src/repositories/placementRepository');
const reportRepo = require('../../src/repositories/problemReportRepository');
const judgeService = require('../../src/services/judgeService');
const judgeReaper = require('../../src/services/judgeReaper');
const selfCheck = require('../../src/services/selfCheck');
const maintenance = require('../../src/services/maintenance');
const academic = require('../../src/services/academicService');
const adminService = require('../../src/services/adminService');
const accountGate = require('../../src/middleware/accountGate');
const { breaker } = require('../../src/services/judgeBreaker');

const clone = (v) => (v == null ? v : structuredClone(v));
add({ id: 'stu1', role: 'student', name: 'Student One', email: 'stu1@c.test' });
add({ id: 'stu2', role: 'student', name: 'Student Two', email: 'stu2@c.test' });
add({ id: 'stu3', role: 'student', name: 'Student Three', email: 'stu3@c.test' });
add({ id: 'stu4', role: 'student', name: 'Student Four', email: 'stu4@c.test' });
add({ id: 'stu5', role: 'student', name: 'Student Five', email: 'stu5@c.test' });

const jobs = new Map(); const dead = []; const keys = new Map(); const reports = new Map(); const leases = new Map();
const apps = new Map(); const drives = new Map([['d1', { id: 'd1' }]]);
let selfCheckSaved = null; let syncResult = { classes: 3, positions: 0, mentorsUpdated: 0 };
const NOW = Date.now();

function installFakes() {
  Object.assign(judgeJobRepo, {
    create: async (id, d) => { jobs.set(id, { id, ...clone(d), createdAtMs: Date.now(), touchedAtMs: Date.now() }); return clone(jobs.get(id)); },
    getById: async (id) => clone(jobs.get(id) || null),
    update: async (id, p) => { jobs.set(id, { ...jobs.get(id), ...clone(p), touchedAtMs: Date.now() }); return clone(jobs.get(id)); },
    listOpen: async () => [...jobs.values()].filter((j) => ['single', 'tests', 'checker'].includes(j.phase)).map(clone),
    addDeadLetter: async (id, e) => { dead.push({ jobId: id, atMs: Date.now(), ...clone(e) }); },
    listDeadLetters: async (since) => dead.filter((d) => d.atMs >= since).map(clone),
    claimSubmitKey: async (uid, key, jobId) => { const k = `${uid}_${key}`; if (keys.has(k)) return { jobId: keys.get(k), duplicate: true }; keys.set(k, jobId); return { jobId, duplicate: false }; },
    releaseSubmitKey: async (uid, key) => { keys.delete(`${uid}_${key}`); },
  });
  Object.assign(maintenanceRepo, {
    takeLease: async (name, owner, now, rule) => { const d = leases.get(name) || null; const { decideLease } = require('../../src/utils/maintenanceRules'); const v = decideLease(d, owner, now, rule); if (v.take) leases.set(name, v.next); return v; },
    releaseLease: async (name, owner) => { const d = leases.get(name); if (d?.owner === owner) leases.set(name, { ...d, untilMs: 0 }); },
    saveSelfCheck: async (r) => { selfCheckSaved = clone(r); },
    getSelfCheck: async () => clone(selfCheckSaved),
  });
  Object.assign(placementRepo, {
    listAllApplications: async () => [...apps.values()].map(clone),
    listDrives: async () => [...drives.values()].map(clone),
    removeApplication: async (d, s) => { apps.delete(`${d}_${s}`); },
  });
  Object.assign(reportRepo, {
    create: async (d) => { const id = `r${reports.size + 1}`; reports.set(id, { id, ...clone(d), status: 'open', atMs: Date.now() + reports.size }); return id; },
    list: async (status) => [...reports.values()].filter((r) => !status || r.status === status).sort((a, b) => b.atMs - a.atMs).map(clone),
    get: async (id) => clone(reports.get(id) || null),
    setStatus: async (id, status) => { reports.get(id).status = status; },
  });
  academic.syncActiveTerm = async () => syncResult;
}

const net = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
const trip = async () => { for (let i = 0; i < 5; i += 1) await breaker.exec(async () => { throw net(); }).catch(() => {}); };

module.exports = async function (s) {
  install(); installFakes();
  accountGate.reset(); adminService.clearPeople(); adminService.clearSettings(); breaker.reset();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => { const u = users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, body, headers = {}) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who)}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json, data: json?.data, code: json?.code };
  };

  try {
    // ── a job waits for the judge without using up its attempts ──
    jobs.set('wait1', { id: 'wait1', phase: 'single', tokens: ['t'], attempts: 1, createdAtMs: Date.now(), touchedAtMs: Date.now(), job: { user_id: 'stu1' } });
    await trip();
    s.check('after five failures the breaker is open', breaker.state() === 'open' && breaker.snapshot().retry_at_ms > Date.now());
    const waiting = await judgeService.pollJudging('wait1');
    s.check('while the judge is down a poll says "retrying", names the judge as the reason, and does not use up an attempt', waiting.status === 'retrying' && waiting.waiting_for_judge === true && jobs.get('wait1').attempts === 1 && jobs.get('wait1').resumeAt > Date.now());
    const noCall = await judgeService.pollJudging('wait1');
    s.check('a poll before it is time to try again does nothing', noCall.status === 'retrying' && jobs.get('wait1').phase === 'single');
    s.check('the student-facing text is plain words, with no server names or settings', !/Judge0|JUDGE0|JUDGE0_URL|AUTH_TOKEN/.test([net(), Object.assign(new Error('x'), { code: 'ENOTFOUND' }), Object.assign(new Error('x'), { response: { status: 401 } }), Object.assign(new Error('x'), { response: { status: 422 } }), new Error('boom'), Object.assign(new Error('x'), { code: 'JUDGE_OPEN' })].map(judgeService.friendlyJudgeError).join(' ')));

    // ── the submit route ──
    const body = { source_code: 'print(1)', language_id: 71, custom_input: '' };
    const busy = await call('POST', '/api/submit', 'stu1', body, { 'idempotency-key': 'key-aaaaaaaaaaaaaaaa' });
    s.check('with the judge down, a submission is answered at once with a plain message, a code and when to try again', busy.status === 503 && busy.code === 'JUDGE_BUSY' && /code is still in the editor/.test(busy.json.error) && busy.json.retry_after_ms >= 1000);
    s.check('a submission that could not start frees its key, so a retry is a fresh attempt', !keys.has('stu1_key-aaaaaaaaaaaaaaaa'));
    breaker.reset();
    let started = 0;
    judgeService.startJudging = async () => { started += 1; };
    const first = await call('POST', '/api/submit', 'stu5', body, { 'idempotency-key': 'key-bbbbbbbbbbbbbbbb' });
    s.check('a submission with a key starts one job and the key is remembered for that person', first.status === 200 && started === 1 && keys.get('stu5_key-bbbbbbbbbbbbbbbb') === first.json.jobId && !first.json.duplicate);
    // The same person sending again within ten seconds is stopped by the submission rate limit before the key is looked at, so the
    // replay itself is checked on the claim: the first claim wins and every later one gets the first job id back.
    const claim2 = await judgeJobRepo.claimSubmitKey('stu5', 'key-bbbbbbbbbbbbbbbb', 'a-second-job-id');
    s.check('claiming the same key again returns the FIRST job id and says it is a duplicate', claim2.duplicate === true && claim2.jobId === first.json.jobId);
    const other = await call('POST', '/api/submit', 'stu2', body, { 'idempotency-key': 'key-bbbbbbbbbbbbbbbb' });
    s.check('another person using the same key text is not treated as a duplicate', other.status === 200 && started === 2 && other.json.jobId !== first.json.jobId && !other.json.duplicate);
    await call('POST', '/api/submit', 'stu3', body, {});
    await call('POST', '/api/submit', 'stu4', body, { 'idempotency-key': 'short' });
    s.check('no key, or a malformed key, behaves as before: the submission is simply queued', started === 4 && ![...keys.keys()].some((k) => k.startsWith('stu3_') || k.startsWith('stu4_')));

    // ── the reaper ──
    jobs.clear(); dead.length = 0;
    const polled = [];
    judgeService.pollJudging = async (id) => { polled.push(id); };
    const j = (id, createdAgoS, touchedAgoS, phase = 'tests') => jobs.set(id, { id, phase, attempts: 1, createdAtMs: NOW - createdAgoS * 1000, touchedAtMs: NOW - touchedAgoS * 1000, job: { user_id: 'stu1', problem_id: 'p1', exam_id: 'e1' } });
    j('fresh', 5, 5); j('polling', 100, 20); j('stuck', 300, 200); j('ancient', 1200, 5); j('finished', 5000, 5000, 'done');
    const round = await judgeReaper.reapOnce({ now: NOW });
    s.check('the reaper pushes on a job nobody has touched for 90 seconds, and only that one', round.advanced === 1 && polled.join() === 'stuck' && round.left === 2);
    s.check('a job open for more than 15 minutes is marked failed with a plain message', round.gaveUp === 1 && jobs.get('ancient').phase === 'done' && jobs.get('ancient').result.state === 'failed' && /safe in the editor/.test(jobs.get('ancient').result.error));
    s.check('and it is kept in the dead-letter list with who, what and why', dead.length === 1 && dead[0].jobId === 'ancient' && dead[0].userId === 'stu1' && dead[0].problemId === 'p1' && dead[0].examId === 'e1' && dead[0].reason === 'open too long');
    s.check('a finished job is never touched, and a second round finds nothing more to give up on', jobs.get('finished').phase === 'done' && (await judgeReaper.reapOnce({ now: NOW })).gaveUp === 0);

    // ── the lease: one server at a time ──
    leases.clear();
    let runs = 0;
    const task = { name: 'unit-task', everyMs: 60_000, ttlMs: 55_000, run: async () => { runs += 1; return 'ran'; } };
    const t1 = await maintenance.tryRun(task, NOW);
    const t2 = await maintenance.tryRun(task, NOW + 10_000);
    const t3 = await maintenance.tryRun(task, NOW + 60_000);
    s.check('a task runs once, not again before its interval, and again after it', t1.ran && t1.result === 'ran' && !t2.ran && t2.reason === 'too_soon' && t3.ran && runs === 2);
    leases.set('held-task', { owner: 'another-server', untilMs: NOW + 30_000, lastRunMs: NOW - 120_000 });
    s.check('a task another server is running is left to it', (await maintenance.tryRun({ ...task, name: 'held-task' }, NOW)).reason === 'held' && runs === 2);
    const crash = await maintenance.tryRun({ ...task, name: 'crash-task', run: async () => { throw new Error('boom'); } }, NOW);
    s.check('a task that crashes does not crash the server, is reported as an error, and the lease is let go', crash.ran === false && crash.reason === 'error' && leases.get('crash-task').untilMs === 0);
    s.check('every upkeep task has a name, an interval and a time limit', maintenance.TASKS.every((x) => x.name && x.everyMs >= 60_000 && x.ttlMs > 0 && typeof x.run === 'function') && maintenance.TASKS.map((x) => x.name).join() === 'judge-reaper,self-check,housekeeping');

    // ── the self-check ──
    apps.set('d1_s1', { driveId: 'd1', studentId: 's1' }); apps.set('gone_s2', { driveId: 'gone', studentId: 's2' }); apps.set('gone_s3', { driveId: 'gone', studentId: 's3' });
    syncResult = { classes: 3, positions: 1, mentorsUpdated: 4 };
    const check = await selfCheck.runAll({ now: NOW });
    const by = Object.fromEntries(check.results.map((r) => [r.key, r]));
    s.check('it repairs the leftover applications, and only those', by.placement_orphans.status === 'repaired' && by.placement_orphans.repaired === 2 && apps.has('d1_s1') && !apps.has('gone_s2') && !apps.has('gone_s3'));
    s.check('it puts right mentors that drifted, and says how many', by.mentors.status === 'repaired' && by.mentors.repaired === 5 && /4 mentors/.test(by.mentors.detail));
    s.check('it reports the jobs it gave up on (a warning, nothing to repair by itself)', by.judge_jobs.status === 'warn' && by.judge_jobs.found === 1 && by.judge_jobs.repaired === 0);
    s.check('the whole result is one word, saved with the time', check.status === 'warn' && selfCheckSaved.at_ms === NOW && selfCheckSaved.results.length === 4);
    syncResult = { classes: 3, positions: 0, mentorsUpdated: 0 }; dead.length = 0;
    const clean = await selfCheck.runAll({ now: NOW + 1 });
    s.check('with nothing wrong, everything is ok and nothing is changed', clean.status === 'ok' && clean.results.every((r) => r.status === 'ok' && r.repaired === 0));
    academic.syncActiveTerm = async () => { throw new Error('database down'); };
    const broken = await selfCheck.runAll({ now: NOW + 2 });
    s.check('one check that crashes is reported as an error and the others still run', broken.status === 'error' && broken.results.find((r) => r.key === 'mentors').status === 'error' && broken.results.find((r) => r.key === 'placement_orphans').status === 'ok');
    academic.syncActiveTerm = async () => syncResult;
    await trip();
    s.check('an open judge breaker shows as a warning', (await selfCheck.runAll({ now: NOW + 3 })).results.find((r) => r.key === 'judge_breaker').status === 'warn');
    breaker.reset();

    // ── the Admin sees it ──
    dead.push({ jobId: 'j-old', atMs: Date.now(), reason: 'open too long', ageMs: 900000, userId: 'stu1' });
    const health = await call('GET', '/api/admin/health', 'adm1');
    s.check('the Admin sees the judge connection, the last self-check, jobs given up on, and the open reports', health.status === 200 && health.data.judge.state === 'closed' && health.data.self_check.status && health.data.given_up_24h.length === 1 && health.data.open_reports === 0);
    const run = await call('POST', '/api/admin/health/self-check', 'adm1');
    s.check('the Admin can run the self-check now, and it is written to the audit log', run.status === 200 && run.data.results.length === 4 && state.audit.some((a) => a.action === 'admin.selfcheck.run'));
    s.check('nobody else can see health or run it', (await Promise.all(['stu1'].flatMap((u) => [call('GET', '/api/admin/health', u), call('POST', '/api/admin/health/self-check', u), call('GET', '/api/admin/problem-reports', u)]))).every((r) => r.status === 403));

    // ── "Report a problem" ──
    const rep = await call('POST', '/api/problem-reports', 'stu1', { requestId: '4F2A9C1B', page: '/app/problems/abc?token=secret#x', message: 'Run button did nothing', code: 'SERVER_ERROR', status: 500 });
    s.check('a student sends a report with the reference, the page and a note', rep.status === 201 && rep.data.requestId === '4F2A9C1B');
    const stored = [...reports.values()][0];
    s.check('only a path is kept (the query and fragment are dropped), with who sent it and the code', stored.page === '/app/problems/abc' && stored.userId === 'stu1' && stored.role === 'student' && stored.code === 'SERVER_ERROR' && stored.httpStatus === 500 && stored.status === 'open');
    s.check('a report with no reference and no words is refused', (await call('POST', '/api/problem-reports', 'stu1', { message: 'x' })).status === 400 && (await call('POST', '/api/problem-reports', 'stu1', null)).status === 400);
    s.check('a report with only a reference is fine, and a bad reference or code is dropped, not stored', (await call('POST', '/api/problem-reports', 'stu2', { requestId: 'no spaces allowed here!', message: 'it broke when I clicked save' })).status === 201 && [...reports.values()].at(-1).requestId === null);
    s.check('nobody signed in cannot send one', (await call('POST', '/api/problem-reports', null, { requestId: '4F2A9C1B' })).status === 401);
    const list = await call('GET', '/api/admin/problem-reports?status=open', 'adm1');
    s.check('the Admin sees the reports newest first, with who sent them', list.status === 200 && list.data.length === 2 && list.data[0].user_name === 'Student Two' && list.data[1].request_id === '4F2A9C1B' && list.data[1].http_status === 500);
    const seen = await call('POST', `/api/admin/problem-reports/${list.data[1].id}/status`, 'adm1', { status: 'resolved' });
    s.check('the Admin marks one resolved, and it leaves the open list', seen.status === 200 && (await call('GET', '/api/admin/problem-reports?status=open', 'adm1')).data.length === 1);
    s.check('an unknown status or report is refused', (await call('POST', `/api/admin/problem-reports/${list.data[0].id}/status`, 'adm1', { status: 'deleted' })).status === 400 && (await call('POST', '/api/admin/problem-reports/nope/status', 'adm1', { status: 'seen' })).status === 404);
    let limited = null;
    for (let i = 0; i < 8; i += 1) { const r = await call('POST', '/api/problem-reports', 'stu1', { requestId: `ABCDEF${i}0123`, message: 'again and again' }); if (r.status === 429) { limited = r; break; } }
    s.check('a person cannot send more than a few an hour', limited?.status === 429);
  } finally {
    server.close();
  }
};
