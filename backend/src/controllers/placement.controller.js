// HTTP layer for Training & Placement (services/placementService.js does the work and every permission check).
const svc = require('../services/placementService');
const P = require('../utils/placementPolicy');
const { logAction } = require('../middleware/audit');

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, department: req.user.department ?? null });

/** Wrap a handler: a service refusal becomes its own status and message, anything else a plain 500. */
const handle = (fn, status = 200) => async (req, res) => {
  try {
    res.status(status).json({ success: true, data: await fn(req, actorOf(req)) });
  } catch (e) {
    if (e instanceof svc.PlacementError) return res.status(e.status).json({ success: false, code: e.code, error: e.message, ...(e.extra || {}) });
    console.error('placement error:', String(e?.message || e).slice(0, 200));
    res.status(500).json({ success: false, error: 'Something went wrong on our side. Please try again.' });
  }
};
const BOM = String.fromCharCode(0xFEFF); // so that a spreadsheet opens the CSV as UTF-8 and names keep their letters
const audit = (req, what, detail) => logAction(req, `placement.${what}`, detail);

// ── drives ──
exports.listDrives = handle((req, actor) => svc.listDrives(actor));
exports.getDrive = handle((req, actor) => svc.getDrive(actor, req.params.id));
exports.createDrive = handle(async (req, actor) => { const d = await svc.createDrive(actor, req.body); audit(req, 'drive.create', `${d.company}, ${d.tier}, ${d.publish_state}`); return d; }, 201);
exports.updateDrive = handle(async (req, actor) => { const d = await svc.updateDrive(actor, req.params.id, req.body); audit(req, 'drive.update', `${d.company}, ${d.publish_state}, ${d.status}`); return d; });
exports.deleteDrive = handle(async (req, actor) => { const r = await svc.deleteDrive(actor, req.params.id); audit(req, 'drive.delete', r.company); return {}; });
exports.saveApplications = handle(async (req, actor) => {
  const r = await svc.saveApplications(actor, req.params.id, req.body?.updates);
  const overrides = (req.body?.updates || []).filter((u) => u?.override_reason).length;
  audit(req, 'applications.save', `${r.company}: ${r.saved} student(s)${overrides ? `, ${overrides} with an override` : ''}`);
  return { saved: r.saved };
});
exports.notify = handle(async (req, actor) => { const r = await svc.notifyEligible(actor, req.params.id, req.body?.message); audit(req, 'drive.notify', `${r.company}: ${r.sent} student(s)`); return { sent: r.sent }; });

exports.meta = handle((req, actor) => svc.meta(actor));

// ── analytics ──
exports.analytics = handle((req, actor) => svc.analytics(actor, {
  section: String(req.query.section || '').trim().slice(0, 40) || null,
  year: String(req.query.year || '').trim().slice(0, 10) || null,
  department: req.query.department,
}));

// ── CGPA records ──
exports.listRecords = handle((req, actor) => svc.listRecordRows(actor, { department: req.query.department ? String(req.query.department).slice(0, 60) : null, year: req.query.year, q: req.query.q }));
exports.previewRecords = handle((req, actor) => svc.previewRecords(actor, req.body?.text));
exports.applyRecords = handle(async (req, actor) => { const r = await svc.applyRecords(actor, req.body?.text, req.body?.note); audit(req, 'records.upload', `${r.applied} applied, ${r.skipped} skipped, batch ${r.batch_id}`); return r; });
exports.listBatches = handle((req, actor) => svc.listBatches(actor));
exports.rollbackBatch = handle(async (req, actor) => { const r = await svc.rollbackBatch(actor, req.params.id); audit(req, 'records.rollback', `batch ${req.params.id}: ${r.restored} restored, ${r.left_alone} left alone`); return r; });

// ── applications made outside the portal ──
exports.listOutside = handle((req, actor) => svc.listOutside(actor));
exports.createOutside = handle(async (req, actor) => { const r = await svc.createOutside(actor, req.body); audit(req, 'outside.create', `student ${req.body?.student_id}`); return r; }, 201);
exports.updateOutside = handle(async (req, actor) => { const r = await svc.updateOutside(actor, req.params.id, req.body); audit(req, 'outside.update', `record ${req.params.id}`); return r; });
exports.removeOutside = handle(async (req, actor) => { const r = await svc.removeOutside(actor, req.params.id); audit(req, 'outside.delete', `record ${req.params.id}`); return r; });

// ── export: a CSV of chosen fields. Every export is written to the audit log, with what was taken and how many people were in it. ──
exports.exportStudents = async (req, res) => {
  try {
    const out = await svc.exportRows(actorOf(req), {
      fields: req.body?.fields, department: req.body?.department ? String(req.body.department).slice(0, 60) : null, year: req.body?.year, driveId: req.body?.drive_id,
    });
    audit(req, 'export', `${out.rows.length} student(s); fields ${out.fields.join(',')}${out.drive ? `; applicants of ${out.drive}` : ''}${req.body?.department ? `; ${String(req.body.department).slice(0, 60)}` : ''}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="placement-export.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(BOM + P.toCsv(out.fields, out.rows));
  } catch (e) {
    if (e instanceof svc.PlacementError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });
    console.error('placement export error:', String(e?.message || e).slice(0, 200));
    res.status(500).json({ success: false, error: 'The export could not be made. Please try again.' });
  }
};
exports.exportFields = handle(() => P.EXPORT_FIELDS);

// ── what a student sees ──
exports.myPlacements = handle((req) => svc.studentView(req.user));
exports.apply = handle(async (req) => { const r = await svc.studentApply(req.user, req.params.id, req.body); audit(req, 'apply', `drive ${req.params.id}`); return r; }, 201);
exports.withdraw = handle(async (req) => { const r = await svc.studentWithdraw(req.user, req.params.id); audit(req, 'withdraw', `drive ${req.params.id}`); return r; });
