const fs = require('fs');
const edit = (p, pairs) => {
  const raw = fs.readFileSync(p, 'utf8');
  const crlf = raw.includes('\r\n');
  let t = raw.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) throw new Error(`missing in ${p}: ${a.slice(0, 70)}`);
    t = t.replace(a, () => b);
  }
  fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t);
};

edit('src/app.js', [
  ["const adminRoutes = require('./routes/admin.routes');", "const adminRoutes = require('./routes/admin.routes');\nconst problemReportRoutes = require('./routes/problemReport.routes');"],
  ["app.use('/api/admin', adminRoutes);", "app.use('/api/admin', adminRoutes);\napp.use('/api/problem-reports', problemReportRoutes);"],
]);

edit('src/server.js', [
  ["const accountGate = require('./middleware/accountGate');", "const accountGate = require('./middleware/accountGate');\nconst maintenance = require('./services/maintenance');"],
  ["  accountGate.start(); // keeps the list of disabled accounts fresh", "  accountGate.start(); // keeps the list of disabled accounts fresh\n  maintenance.start(); // the judge reaper, the daily self-check and clean-up"],
]);

edit('src/config/accessMatrix.js', [
  ["  { path: '/api/2fa/**', roles: ANY,", "  { methods: ['POST'], path: '/api/problem-reports', roles: ANY, note: 'a person sends \"Report a problem\" from an error screen; a few an hour' },\n  { path: '/api/2fa/**', roles: ANY,"],
]);

// the Admin's health and problem-report endpoints
edit('src/services/adminService.js', [
  ["const R = require('../utils/adminRules');", "const R = require('../utils/adminRules');\nconst judgeJobRepo = require('../repositories/judgeJobRepository');\nconst selfCheck = require('./selfCheck');\nconst reports = require('./problemReportService');\nconst { breaker } = require('./judgeBreaker');"],
  ["module.exports = {\n  AdminError,", `// ── health: the judge connection, the last self-check, jobs given up on, and problem reports ──
async function health(actor) {
  assertAdmin(actor);
  const [dead, last, open] = await Promise.all([
    judgeJobRepo.listDeadLetters(Date.now() - 86400000, 20).catch(() => []),
    selfCheck.last().catch(() => null),
    reports.list('open').catch(() => []),
  ]);
  return {
    judge: breaker.snapshot(),
    self_check: last,
    given_up_24h: dead.map((d) => ({ job_id: d.jobId, at_ms: d.atMs, reason: d.reason, age_ms: d.ageMs, user_id: d.userId || null, problem_id: d.problemId || null, exam_id: d.examId || null })),
    open_reports: open.length,
  };
}
async function runSelfCheck(actor) {
  assertAdmin(actor);
  return selfCheck.runAll();
}
const listReports = (actor, status) => { assertAdmin(actor); return reports.list(status); };
const setReportStatus = (actor, id, status) => { assertAdmin(actor); return reports.setStatus(actor.id, id, status); };

module.exports = {
  health, runSelfCheck, listReports, setReportStatus,
  AdminError,`],
]);

edit('src/controllers/admin.controller.js', [
  ["exports.getSettings = handle(", `exports.health = handle((req, actor) => admin.health(actor));
exports.runSelfCheck = handle(async (req, actor) => {
  const r = await admin.runSelfCheck(actor);
  audit(req, 'selfcheck.run', \`\${r.status}; repaired \${r.results.reduce((n, x) => n + (x.repaired || 0), 0)}\`);
  return r;
});
exports.listReports = handle((req, actor) => admin.listReports(actor, req.query.status ? String(req.query.status).slice(0, 20) : undefined));
exports.setReportStatus = handle(async (req, actor) => {
  const r = await admin.setReportStatus(actor, req.params.id, req.body?.status);
  audit(req, 'report.status', \`\${req.params.id}: \${r.status}\`);
  return r;
});

exports.getSettings = handle(`],
]);
edit('src/controllers/admin.controller.js', [
  ["    if (e instanceof admin.AdminError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });\n    console.error('admin error:'", "    if (e instanceof admin.AdminError || e?.constructor?.name === 'ReportError') return res.status(e.status).json({ success: false, code: e.code, error: e.message });\n    console.error('admin error:'"],
]);

edit('src/routes/admin.routes.js', [
  ["router.get('/logins', c.recentLogins);", "router.get('/logins', c.recentLogins);\n\n// Health: the judge connection, the self-check (running it is a heavy read, so it is held tight), and problem reports.\nrouter.get('/health', c.health);\nrouter.post('/health/self-check', heavy, c.runSelfCheck);\nrouter.get('/problem-reports', c.listReports);\nrouter.post('/problem-reports/:id/status', c.setReportStatus);"],
]);

// the submit route: plain words when the judge is busy, and one key means one submission
edit('src/routes/submissions.routes.js', [
  ["    const user_id = extractUserId(req);", `    const user_id = extractUserId(req);
    // One key means one submission: a double click, or a retry after an answer that got lost, returns the first job instead of starting a second.
    const idemKey = /^[A-Za-z0-9-]{16,64}$/.test(String(req.get('idempotency-key') || '')) ? String(req.get('idempotency-key')) : null;`],
  ["    const jobId = job_id || uuidv4();\n", `    let jobId = job_id || uuidv4();
    if (idemKey && user_id) {
      const claim = await judgeJobRepo.claimSubmitKey(user_id, idemKey, jobId);
      if (claim.duplicate) return res.json({ success: true, jobId: claim.jobId, duplicate: true, message: 'Submission already queued' });
      jobId = claim.jobId;
    }
`],
  ["      console.error('Failed to start judging:', startErr.message);", `      // Starting failed, so nothing was queued: free the key so that a retry is a fresh attempt.
      if (idemKey && user_id) await judgeJobRepo.releaseSubmitKey(user_id, idemKey);
      if (startErr.code === 'JUDGE_OPEN') {
        return res.status(503).json({
          success: false, code: 'JUDGE_BUSY', retry_after_ms: Math.max(1000, (startErr.retryAtMs || Date.now() + 5000) - Date.now()),
          error: 'The code checker is busy right now. Your code is still in the editor. Try again in a few seconds.',
        });
      }
      console.error('Failed to start judging:', startErr.message);`],
  ["          : 'The judging service is unreachable. Please ensure Judge0 is running and try again.',", "          : 'The code checker is not available right now. Your code is still in the editor. Try again in a minute, and tell your faculty if it keeps happening.',"],
]);
console.log('ok');
