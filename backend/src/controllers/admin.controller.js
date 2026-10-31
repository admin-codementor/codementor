// HTTP layer for the Admin (services/adminService.js does the work and checks every rule).
const admin = require('../services/adminService');
const { ReportError } = require('../services/problemReportService');
const { logAction } = require('../middleware/audit');

const actorOf = (req) => ({ id: req.user.id, role: req.user.role });

/** Wrap a handler: a service refusal becomes its own status and message, anything else a plain 500. */
const handle = (fn, status = 200) => async (req, res) => {
  try {
    res.status(status).json({ success: true, data: await fn(req, actorOf(req)) });
  } catch (e) {
    if (e instanceof admin.AdminError || e instanceof ReportError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });
    console.error('admin error:', String(e?.message || e).slice(0, 200));
    res.status(500).json({ success: false, error: 'Something went wrong on our side. Please try again.' });
  }
};
const audit = (req, what, detail) => logAction(req, `admin.${what}`, detail);

exports.overview = handle((req, actor) => admin.overview(actor));

exports.listPeople = handle((req, actor) => admin.listPeople(actor, {
  role: req.query.role ? String(req.query.role).slice(0, 20) : undefined,
  department: req.query.department ? String(req.query.department).slice(0, 60) : undefined,
  status: req.query.status === 'disabled' || req.query.status === 'active' ? req.query.status : undefined,
  q: req.query.q, page: req.query.page, size: req.query.size,
}));
exports.getPerson = handle((req, actor) => admin.getPerson(actor, req.params.id));
exports.createAccount = handle(async (req, actor) => {
  const r = await admin.createAccount(actor, req.body);
  audit(req, 'account.create', `${r.email} as ${r.role}; mail ${r.mail}`);
  return r;
}, 201);
exports.sendResetLink = handle(async (req, actor) => {
  const r = await admin.sendResetLink(actor, req.params.id);
  audit(req, 'account.reset_link', `sent to ${r.email}`);
  return r;
});
exports.setDisabled = handle(async (req, actor) => {
  const r = await admin.setDisabled(actor, req.params.id, req.body?.disabled === true, req.body?.typed);
  audit(req, r.disabled ? 'account.disable' : 'account.enable', r.email);
  return r;
});
exports.changeRole = handle(async (req, actor) => {
  const r = await admin.changeRole(actor, req.params.id, req.body);
  audit(req, 'account.role', `${r.email}: ${r.from} to ${r.to}${r.department ? ` (${r.department})` : ''}`);
  return r;
});
exports.changeDepartment = handle(async (req, actor) => {
  const r = await admin.changeDepartment(actor, req.params.id, req.body);
  audit(req, 'account.department', `${r.email}: ${r.department}`);
  return r;
});

exports.health = handle((req, actor) => admin.health(actor));
exports.runSelfCheck = handle(async (req, actor) => {
  const r = await admin.runSelfCheck(actor);
  audit(req, 'selfcheck.run', `${r.status}; repaired ${r.results.reduce((n, x) => n + (x.repaired || 0), 0)}`);
  return r;
});
exports.listReports = handle((req, actor) => admin.listReports(actor, req.query.status ? String(req.query.status).slice(0, 20) : undefined));
exports.setReportStatus = handle(async (req, actor) => {
  const r = await admin.setReportStatus(actor, req.params.id, req.body?.status);
  audit(req, 'report.status', `${req.params.id}: ${r.status}`);
  return r;
});

exports.getSettings = handle(() => admin.getSettings());
exports.saveSettings = handle(async (req, actor) => {
  const r = await admin.saveSettings(actor, req.body);
  if (r.change) audit(req, 'settings.change', r.change);
  return r.settings;
});

exports.listAudit = handle((req, actor) => admin.listAudit(actor, req.query));
exports.recentLogins = handle((req, actor) => admin.recentLogins(actor, { failedOnly: req.query.failed === '1' }));
exports.exportAudit = async (req, res) => {
  try {
    const out = await admin.exportAudit(actorOf(req), req.query);
    audit(req, 'audit.export', `${out.count} entries`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(String.fromCharCode(0xFEFF) + out.csv);
  } catch (e) {
    if (e instanceof admin.AdminError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });
    console.error('admin export error:', String(e?.message || e).slice(0, 200));
    res.status(500).json({ success: false, error: 'The export could not be made. Please try again.' });
  }
};
