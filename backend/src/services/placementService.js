// Training & Placement: drives, applications, CGPA records, outside offers, notices, analytics and exports.
// The HTTP layer (controllers/placement.controller.js) only passes the actor and the request body; every permission check is here.
//
//   Who may do what
//     T&P and Admin   everything: make, publish and change drives, mark results, add a student who does not pass the rules (with a
//                     written reason), upload CGPA lists, record outside offers, export.
//     HOD             read only: the drives, applicants and results of their own department's students, and their CGPA.
//     Student         see the drives that are for their department, why they can or cannot apply, apply and withdraw; see their own record.
const { v4: uuidv4 } = require('uuid');
const placementRepo = require('../repositories/placementRepository');
const userRepo = require('../repositories/userRepository');
const nudgeRepo = require('../repositories/nudgeRepository');
const { activeStudents } = require('../utils/students');
const { validateApplicationUpdate, MAX_UPDATES } = require('../utils/placement');
const { buildPlacementAnalytics } = require('../utils/placementAnalytics');
const P = require('../utils/placementPolicy');

class PlacementError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, message, extra) => { throw new PlacementError(status, code, message, extra); };

const clean = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isManager = (a) => a?.role === 'tnp' || a?.role === 'admin';

function assertManager(actor) {
  if (!isManager(actor)) fail(403, 'FORBIDDEN', 'Only the Training & Placement office or the Admin can do this.');
}

/** The students an actor may see: everyone for T&P and Admin, the own department for an HOD. */
function inScope(actor, student) {
  if (isManager(actor)) return true;
  return actor?.role === 'hod' && actor.department != null && (student.department ?? null) === actor.department;
}
const driveInScope = (actor, drive) => isManager(actor) || (actor?.role === 'hod' && actor.department != null && P.driveDepartments(drive).includes(actor.department));

// ── the data every screen needs ──
// Reading every student or every CGPA record costs one database read each (about 3000), and every T&P screen needs them, so they are kept in
// this process for a short time. Concurrent requests share one read. A change made here clears the record copy at once.
const MEMO_MS = { students: 30000, records: 20000 };
const memos = new Map();
function memo(key, load) {
  const hit = memos.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS[key]) return hit.value;
  const value = load().catch((e) => { memos.delete(key); throw e; });
  memos.set(key, { at: Date.now(), value });
  return value;
}
const clearMemo = () => memos.clear();

const loadStudents = () => memo('students', async () => activeStudents([...(await userRepo.getMapByRole('student')).values()]));
const loadRecords = () => memo('records', () => placementRepo.listRecords());

/** Who holds an offer: selected in a published drive, or an outside offer. @returns {Set<string>} student ids */
function offerHolders(drives, applications, outside) {
  const published = new Set(drives.filter((d) => P.shapeDrive(d).publish_state === 'published').map((d) => d.id));
  const byStudent = new Map();
  for (const a of applications) { if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, []); byStudent.get(a.studentId).push(a); }
  const outBy = new Map();
  for (const o of outside) { if (!outBy.has(o.studentId)) outBy.set(o.studentId, []); outBy.get(o.studentId).push(o); }
  const ids = new Set([...byStudent.keys(), ...outBy.keys()]);
  return new Set([...ids].filter((id) => P.hasOffer({ applications: byStudent.get(id), outside: outBy.get(id), publishedDriveIds: published })));
}

const shapeRecord = (r) => (r ? { cgpa: r.cgpa ?? null, backlogs: r.backlogs ?? null } : { cgpa: null, backlogs: null });

// ── drives ──
async function listDrives(actor) {
  const [drives, apps, students, records] = await Promise.all([placementRepo.listDrives(), placementRepo.listAllApplications(), loadStudents(), loadRecords()]);
  const outside = await placementRepo.listOutside();
  const offers = offerHolders(drives, apps, outside);
  const now = Date.now();
  const visible = drives.filter((d) => driveInScope(actor, d) && (isManager(actor) || P.shapeDrive(d).publish_state === 'published'));
  return visible.map((d) => {
    const a = apps.filter((x) => x.driveId === d.id);
    const pool = students.filter((s) => inScope(actor, s) && P.driveDepartments(d).includes(s.department ?? null));
    const eligible = pool.filter((s) => P.evaluate({ student: s, record: records.get(s.id), drive: d, hasOffer: offers.has(s.id), now }).eligible);
    const count = (st) => a.filter((x) => x.status === st).length;
    return {
      ...P.shapeDrive(d),
      eligible: eligible.length, applied: a.length, shortlisted: count('shortlisted'), selected: count('selected'), rejected: count('rejected'),
    };
  }).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
}

async function getDrive(actor, id) {
  const drive = await placementRepo.getDrive(id);
  if (!drive || !driveInScope(actor, drive) || (!isManager(actor) && P.shapeDrive(drive).publish_state !== 'published')) fail(404, 'NOT_FOUND', 'Drive not found.');
  const [apps, students, records, allDrives, allApps, outside] = await Promise.all([
    placementRepo.listApplicationsByDrive(id), loadStudents(), loadRecords(), placementRepo.listDrives(), placementRepo.listAllApplications(), placementRepo.listOutside(),
  ]);
  const offers = offerHolders(allDrives, allApps.filter((a) => a.driveId !== id), outside); // an offer from THIS drive does not count against being in it
  const byStudent = new Map(apps.map((a) => [a.studentId, a]));
  const now = Date.now();
  const rows = students
    .filter((s) => inScope(actor, s) && (P.driveDepartments(drive).includes(s.department ?? null) || byStudent.has(s.id)))
    .map((s) => {
      const a = byStudent.get(s.id);
      const e = P.evaluate({ student: s, record: records.get(s.id), drive, hasOffer: offers.has(s.id), now });
      return {
        id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null, department: s.department || null, section: s.section || null, year: s.year ?? null,
        ...shapeRecord(records.get(s.id)), has_offer: offers.has(s.id),
        status: a?.status ?? null, round_results: a?.roundResults ?? {}, applied_by: a?.source ?? null, override_reason: a?.overrideReason ?? null,
        eligible: e.eligible, reasons: e.reasons.map((r) => r.message),
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
  return { drive: P.shapeDrive(drive), students: rows };
}

async function createDrive(actor, body) {
  assertManager(actor);
  const v = P.validateDrive(body);
  if (v.error) fail(400, 'INVALID', v.error);
  const drive = await placementRepo.createDrive({ ...v.drive, createdBy: actor.id });
  return P.shapeDrive(drive);
}

async function updateDrive(actor, id, body) {
  assertManager(actor);
  const drive = await placementRepo.getDrive(id);
  if (!drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  const merged = { ...P.shapeDrive(drive), ...(body || {}) };
  const v = P.validateDrive(merged);
  if (v.error) fail(400, 'INVALID', v.error);
  // Taking a published drive back to a draft would hide it from students who have already applied; refuse once anyone has.
  if (v.drive.publishState === 'draft' && P.shapeDrive(drive).publish_state === 'published' && (await placementRepo.listApplicationsByDrive(id)).length > 0) {
    fail(400, 'HAS_APPLICATIONS', 'Students have already applied, so this drive cannot go back to a draft. Close it instead.');
  }
  const updated = await placementRepo.updateDrive(id, v.drive);
  // A removed round must not leave results behind that no longer mean anything.
  const keep = new Set(v.drive.rounds);
  for (const a of await placementRepo.listApplicationsByDrive(id)) {
    const kept = Object.fromEntries(Object.entries(a.roundResults || {}).filter(([r]) => keep.has(r)));
    if (Object.keys(kept).length !== Object.keys(a.roundResults || {}).length) await placementRepo.upsertApplication(id, a.studentId, { ...a, roundResults: kept });
  }
  return P.shapeDrive(updated);
}

async function deleteDrive(actor, id) {
  assertManager(actor);
  const drive = await placementRepo.getDrive(id);
  if (!drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  await placementRepo.removeDrive(id);
  return { company: drive.company };
}

/**
 * Mark results, or add a student by hand. body.updates: [{ student_id, status | null, round_results?, override_reason? }].
 * Everything is checked before anything is written. A student who does not pass the rules can still be added, but only with a written reason.
 */
async function saveApplications(actor, id, updates) {
  assertManager(actor);
  const drive = await placementRepo.getDrive(id);
  if (!drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  if (!Array.isArray(updates) || updates.length === 0) fail(400, 'INVALID', 'Nothing to save.');
  if (updates.length > MAX_UPDATES) fail(400, 'TOO_MANY', `You can save at most ${MAX_UPDATES} students at a time.`);

  const [studentMap, records, allDrives, allApps, outside, existingApps] = await Promise.all([
    userRepo.getMapByRole('student'), loadRecords(), placementRepo.listDrives(), placementRepo.listAllApplications(), placementRepo.listOutside(), placementRepo.listApplicationsByDrive(id),
  ]);
  const existing = new Map(existingApps.map((a) => [a.studentId, a]));
  const offersElsewhere = offerHolders(allDrives, allApps.filter((a) => a.driveId !== id), outside);
  const d = P.shapeDrive(drive);
  const now = Date.now();
  const planned = [];

  for (const u of updates) {
    const student = studentMap.get(String(u?.student_id));
    if (!student) fail(400, 'NOT_FOUND', 'One or more students were not found.');
    const who = student.name || 'A student';
    const r = validateApplicationUpdate(u, { rounds: d.rounds });
    if (r.error) fail(400, 'INVALID', `${who}: ${r.error}`);
    if (r.clear) { planned.push({ studentId: student.id, clear: true }); continue; }

    const had = existing.get(student.id);
    let source = had?.source ?? 'staff';
    let override = had?.overrideReason ? { overrideReason: had.overrideReason, overriddenBy: had.overriddenBy } : {};
    if (!had) {
      // A new application added by staff: the same rules as a student's own, unless a reason is written down.
      const check = P.checkApply({ student, record: records.get(student.id), drive, hasOffer: offersElsewhere.has(student.id), now, existing: null });
      if (!check.ok) {
        if (!check.overridable) fail(400, check.code, `${who}: ${check.error}`);
        const o = P.validateOverride({ reason: u.override_reason });
        if (o.error) fail(400, 'OVERRIDE_REASON', `${who} does not meet the rules (${check.error}) ${o.error}`);
        override = { overrideReason: o.reason, overriddenBy: actor.id, overriddenCodes: check.reasons.map((x) => x.code) };
      }
    }
    // Marking someone selected is giving them an offer; the dream-tier rule applies to the offer, not only to the application.
    if (r.value.status === 'selected' && offersElsewhere.has(student.id) && d.tier !== 'dream') {
      fail(400, 'HAS_OFFER', `${who} already has an offer, and this is not a dream drive.`);
    }
    planned.push({ studentId: student.id, value: r.value, source, override, had });
  }

  for (const p of planned) {
    if (p.clear) await placementRepo.removeApplication(id, p.studentId);
    else {
      await placementRepo.upsertApplication(id, p.studentId, {
        status: p.value.status, roundResults: p.value.roundResults, source: p.source, appliedAtMs: p.had?.appliedAtMs ?? now, ...p.override,
      });
    }
  }
  return { saved: planned.length, company: drive.company };
}

/** An in-app reminder to every eligible student of a published drive who has not applied yet. */
async function notifyEligible(actor, id, message) {
  assertManager(actor);
  const drive = await placementRepo.getDrive(id);
  if (!drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  const d = P.shapeDrive(drive);
  if (d.publish_state !== 'published') fail(400, 'DRAFT', 'Publish the drive before telling students about it.');
  if (d.status === 'closed') fail(400, 'CLOSED', 'This drive is closed.');
  const text = clean(message, 200) || `${d.company}${d.role ? ` (${d.role})` : ''} is open for applications${d.apply_by ? '. Check the last date on the Placements page' : ''}.`;
  if (text.length < 3) fail(400, 'INVALID', 'Write a short message first.');

  const [students, records, allDrives, allApps, outside, sender] = await Promise.all([
    loadStudents(), loadRecords(), placementRepo.listDrives(), placementRepo.listAllApplications(), placementRepo.listOutside(), userRepo.getById(actor.id),
  ]);
  const offers = offerHolders(allDrives, allApps, outside);
  const applied = new Set(allApps.filter((a) => a.driveId === id).map((a) => a.studentId));
  const now = Date.now();
  const targets = students.filter((s) => !applied.has(s.id) && P.evaluate({ student: s, record: records.get(s.id), drive, hasOffer: offers.has(s.id), now }).eligible);
  const rows = targets.map((s) => ({ studentId: s.id, fromId: actor.id, fromName: sender?.name || 'Training & Placement', message: text, createdAtMs: now, readAtMs: null, kind: 'placement', driveId: id }));
  for (let i = 0; i < rows.length; i += 400) await nudgeRepo.addMany(rows.slice(i, i + 400));
  return { sent: rows.length, company: drive.company };
}

// ── what a student sees and does ──
async function studentView(user) {
  const [student, drives, myApps, records, allApps, outside] = await Promise.all([
    userRepo.getById(user.id, 'student'), placementRepo.listDrives(), placementRepo.listApplicationsByStudent(user.id), placementRepo.getRecord(user.id),
    placementRepo.listAllApplications(), placementRepo.listOutside(),
  ]);
  if (!student) fail(404, 'NOT_FOUND', 'Account not found.');
  const mine = new Map(myApps.map((a) => [a.driveId, a]));
  const myOutside = outside.filter((o) => o.studentId === user.id);
  const offers = offerHolders(drives, allApps, outside);
  const hasOffer = offers.has(user.id);
  const now = Date.now();

  const rows = drives
    .filter((d) => P.shapeDrive(d).publish_state === 'published' && (P.driveDepartments(d).includes(student.department ?? null) || mine.has(d.id)))
    .map((d) => {
      const s = P.shapeDrive(d);
      const a = mine.get(d.id);
      // Whether THIS drive's own selection counts against the student: it does not, they are in it already.
      const e = P.evaluate({ student, record: records, drive: d, hasOffer, now });
      const w = a ? P.canWithdraw({ application: a, drive: d, now }) : { ok: false };
      return {
        ...s, applied: !!a, status: a?.status ?? null, round_results: a?.roundResults ?? {},
        can_apply: !a && e.eligible, reasons: a ? [] : e.reasons.map((r) => r.message), can_withdraw: !!a && w.ok,
      };
    })
    .sort((x, y) => Number(y.can_apply) - Number(x.can_apply) || String(y.apply_by || y.date || '').localeCompare(String(x.apply_by || x.date || '')));

  return {
    record: shapeRecord(records),
    has_offer: hasOffer,
    drives: rows,
    outside: myOutside.map((o) => ({ id: o.id, company: o.company, role: o.role || '', ctc: o.ctc || '', status: o.status })),
  };
}

async function studentApply(user, driveId, body) {
  if (body?.consent !== true) fail(400, 'CONSENT', 'Please confirm that your details may be shared with the company.');
  const [student, drive, record, drives, allApps, outside, existing] = await Promise.all([
    userRepo.getById(user.id, 'student'), placementRepo.getDrive(driveId), placementRepo.getRecord(user.id), placementRepo.listDrives(), placementRepo.listAllApplications(), placementRepo.listOutside(),
    placementRepo.listApplicationsByDrive(driveId),
  ]);
  if (!student || !drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  const check = P.checkApply({
    student, record, drive, hasOffer: offerHolders(drives, allApps, outside).has(user.id), now: Date.now(),
    existing: existing.find((a) => a.studentId === user.id) || null,
  });
  if (!check.ok) fail(409, check.code, check.error, { reasons: check.reasons.map((r) => r.message) });
  const now = Date.now();
  await placementRepo.upsertApplication(driveId, user.id, { status: 'applied', roundResults: {}, source: 'student', appliedAtMs: now, consentAtMs: now });
  return { company: drive.company };
}

async function studentWithdraw(user, driveId) {
  const [drive, existing] = await Promise.all([placementRepo.getDrive(driveId), placementRepo.listApplicationsByDrive(driveId)]);
  if (!drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  const a = existing.find((x) => x.studentId === user.id) || null;
  const w = P.canWithdraw({ application: a, drive, now: Date.now() });
  if (!w.ok) fail(409, 'CANNOT_WITHDRAW', w.error);
  await placementRepo.removeApplication(driveId, user.id);
  return { company: drive.company };
}

// ── CGPA and backlog records ──
async function studentsByRoll(actor) {
  const students = (await loadStudents()).filter((s) => inScope(actor, s) && s.rollNo);
  return new Map(students.map((s) => [String(s.rollNo).trim().toUpperCase(), { id: s.id, name: s.name }]));
}

async function previewRecords(actor, text) {
  assertManager(actor);
  const plan = P.planRecordUpload(text, await studentsByRoll(actor), await loadRecords());
  if (plan.error) fail(400, 'INVALID', plan.error);
  return plan;
}

/** Applies the valid rows of an upload and keeps what each one replaced, so the whole upload can be undone. Rows with errors are skipped. */
async function applyRecords(actor, text, note) {
  assertManager(actor);
  const current = await placementRepo.listRecords(); // fresh: an upload is built on what is stored now, not on a copy
  const plan = P.planRecordUpload(text, await studentsByRoll(actor), current);
  if (plan.error) fail(400, 'INVALID', plan.error);
  const todo = plan.rows.filter((r) => r.status === 'new' || r.status === 'changed');
  if (todo.length === 0) fail(400, 'NOTHING_TO_DO', plan.counts.error ? 'No row can be applied: every row has a problem. Run the check to see them.' : 'Nothing would change: every row already matches.');
  const now = Date.now();
  const batchId = uuidv4();
  const items = todo.map((r) => {
    const prev = current.get(r.studentId) || null;
    return {
      studentId: r.studentId,
      after: { cgpa: r.cgpa !== undefined ? r.cgpa : prev?.cgpa ?? null, backlogs: r.backlogs !== undefined ? r.backlogs : prev?.backlogs ?? null },
      before: prev ? { cgpa: prev.cgpa ?? null, backlogs: prev.backlogs ?? null } : null,
    };
  });
  // The upload is written down first, with what each record was before, so that even a failure half way through can be undone. Each
  // record carries the id of the upload that wrote it, so a rollback can tell whether a later upload has since changed it.
  await placementRepo.createBatch(batchId, {
    byId: actor.id, atMs: now, note: clean(note, 120) || null, applied: items.length, skipped: plan.counts.error + plan.counts.same, rolledBackAtMs: null,
    changes: items.map((it) => ({ studentId: it.studentId, before: it.before, after: it.after })),
  });
  await placementRepo.writeRecords(items.map((it) => ({ studentId: it.studentId, data: { ...it.after, batchId, updatedBy: actor.id, updatedAtMs: now } })));
  clearMemo();
  const id = batchId;
  return { batch_id: id, applied: items.length, skipped: plan.counts.error + plan.counts.same, errors: plan.counts.error };
}

async function listBatches(actor) {
  assertManager(actor);
  return (await placementRepo.listBatches()).slice(0, 50).map((b) => ({
    id: b.id, at_ms: b.atMs, note: b.note || null, applied: b.applied ?? (b.changes || []).length, skipped: b.skipped ?? 0, rolled_back: !!b.rolledBackAtMs,
  }));
}

/** Puts back what an upload replaced. A record that a LATER upload has changed since is left alone and counted, never overwritten. */
async function rollbackBatch(actor, id) {
  assertManager(actor);
  const batch = await placementRepo.getBatch(id);
  if (!batch) fail(404, 'NOT_FOUND', 'Upload not found.');
  if (batch.rolledBackAtMs) fail(409, 'ALREADY', 'This upload was already undone.');
  const current = await placementRepo.listRecords();
  const restore = [];
  let kept = 0;
  for (const c of batch.changes || []) {
    if (current.get(c.studentId)?.batchId !== id) { kept += 1; continue; }
    restore.push({ studentId: c.studentId, data: c.before ? { ...c.before, batchId: null, updatedBy: actor.id, updatedAtMs: Date.now() } : null });
  }
  await placementRepo.writeRecords(restore);
  clearMemo();
  await placementRepo.updateBatch(id, { rolledBackAtMs: Date.now(), rolledBackBy: actor.id });
  return { restored: restore.length, left_alone: kept };
}

/** Students with their record, for the T&P table. Department, year and a text search narrow it. */
async function listRecordRows(actor, { department, year, q } = {}) {
  const [students, records, drives, apps, outside] = await Promise.all([loadStudents(), loadRecords(), placementRepo.listDrives(), placementRepo.listAllApplications(), placementRepo.listOutside()]);
  const offers = offerHolders(drives, apps, outside);
  const needle = clean(q, 40).toLowerCase();
  return students
    .filter((s) => inScope(actor, s))
    .filter((s) => !department || (s.department ?? null) === department)
    .filter((s) => !year || String(s.year ?? '') === String(year))
    .filter((s) => !needle || `${s.name || ''} ${s.rollNo || ''}`.toLowerCase().includes(needle))
    .map((s) => ({ id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null, department: s.department || null, year: s.year ?? null, section: s.section || null, ...shapeRecord(records.get(s.id)), has_offer: offers.has(s.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── applications made outside the portal ──
const OUTSIDE_STATUSES = ['applied', 'selected', 'rejected'];
function readOutside(body) {
  const company = clean(body?.company, 80);
  if (company.length < 2) return { error: 'A company name of 2 to 80 characters is required.' };
  const status = body?.status == null ? 'applied' : String(body.status);
  if (!OUTSIDE_STATUSES.includes(status)) return { error: `Status must be one of: ${OUTSIDE_STATUSES.join(', ')}.` };
  const role = clean(body?.role, 80);
  const ctc = clean(body?.ctc, 40);
  return { value: { company, role, ctc, status } };
}

async function listOutside(actor) {
  const [rows, students] = await Promise.all([placementRepo.listOutside(), loadStudents()]);
  const by = new Map(students.map((s) => [s.id, s]));
  return rows.filter((o) => by.has(o.studentId) && inScope(actor, by.get(o.studentId))).map((o) => ({
    id: o.id, student_id: o.studentId, name: by.get(o.studentId).name || 'Unknown', roll_no: by.get(o.studentId).rollNo || null, department: by.get(o.studentId).department || null,
    company: o.company, role: o.role || '', ctc: o.ctc || '', status: o.status,
  }));
}
async function createOutside(actor, body) {
  assertManager(actor);
  const r = readOutside(body);
  if (r.error) fail(400, 'INVALID', r.error);
  const student = await userRepo.getById(String(body?.student_id || ''), 'student');
  if (!student) fail(404, 'NOT_FOUND', 'Student not found.');
  const row = await placementRepo.createOutside({ ...r.value, studentId: student.id, recordedBy: actor.id, atMs: Date.now() });
  return { id: row.id };
}
async function updateOutside(actor, id, body) {
  assertManager(actor);
  const row = await placementRepo.getOutside(id);
  if (!row) fail(404, 'NOT_FOUND', 'Record not found.');
  const r = readOutside({ ...row, ...(body || {}) });
  if (r.error) fail(400, 'INVALID', r.error);
  await placementRepo.updateOutside(id, r.value);
  return { id };
}
async function removeOutside(actor, id) {
  assertManager(actor);
  if (!(await placementRepo.getOutside(id))) fail(404, 'NOT_FOUND', 'Record not found.');
  await placementRepo.removeOutside(id);
  return { id };
}

// ── analytics and export ──
async function analytics(actor, { section, year, department } = {}) {
  const [drives, apps, students, outside] = await Promise.all([placementRepo.listDrives(), placementRepo.listAllApplications(), loadStudents(), placementRepo.listOutside()]);
  const dept = isManager(actor) ? (clean(department, 60) || null) : actor.department ?? null;
  const inView = students
    .filter((s) => inScope(actor, s))
    .filter((s) => dept === null || (s.department ?? null) === dept)
    .filter((s) => !section || (s.section ?? null) === section)
    .filter((s) => !year || String(s.year ?? '') === String(year))
    .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo, section: s.section, year: s.year, department: s.department || null }));
  const shown = drives.filter((d) => driveInScope(actor, d) && P.shapeDrive(d).publish_state === 'published' && (dept === null || P.driveDepartments(d).includes(dept)));
  const data = buildPlacementAnalytics({ students: inView, drives: shown, applications: apps, outside });
  const departments = [...new Set(students.filter((s) => inScope(actor, s)).map((s) => s.department).filter(Boolean))].sort();
  return { ...data, scope: { department: dept, section: section || null, year: year || null }, departments };
}

/** The departments and years that exist, for the pickers on the drive form and the filters. */
async function meta(actor) {
  const students = (await loadStudents()).filter((s) => inScope(actor, s));
  return {
    departments: [...new Set(students.map((s) => s.department).filter(Boolean))].sort(),
    years: [...new Set(students.map((s) => Number(s.year)).filter((y) => Number.isInteger(y)))].sort(),
  };
}

/** The rows of an export, with only the chosen fields in them. The caller writes the audit entry. */
async function exportRows(actor, { fields, department, year, driveId }) {
  assertManager(actor);
  const f = P.validateExportFields(fields);
  if (f.error) fail(400, 'INVALID', f.error);
  const [students, records, drive] = await Promise.all([loadStudents(), loadRecords(), driveId ? placementRepo.getDrive(String(driveId)) : null]);
  if (driveId && !drive) fail(404, 'NOT_FOUND', 'Drive not found.');
  const applicants = drive ? new Set((await placementRepo.listApplicationsByDrive(drive.id)).map((a) => a.studentId)) : null;
  let scores = new Map();
  if (f.fields.includes('codingScore')) {
    try {
      scores = new Map((await require('./platformScoreService').collegeScores()).rows.map((r) => [r.id, r.overall]));
    } catch (e) {
      fail(500, 'SCORES', 'The coding scores could not be read just now. Export again without them, or try later.');
    }
  }
  const rows = students
    .filter((s) => (!department || (s.department ?? null) === department) && (!year || String(s.year ?? '') === String(year)) && (!applicants || applicants.has(s.id)))
    .sort((a, b) => String(a.rollNo || '').localeCompare(String(b.rollNo || '')))
    .map((s) => ({
      name: s.name, rollNo: s.rollNo, department: s.department, year: s.year, section: s.section, email: s.email,
      cgpa: records.get(s.id)?.cgpa ?? null, backlogs: records.get(s.id)?.backlogs ?? null, codingScore: scores.get(s.id) ?? null,
    }));
  return { fields: f.fields, rows, drive: drive ? drive.company : null };
}

module.exports = {
  PlacementError, isManager, inScope, driveInScope, offerHolders, clearMemo,
  listDrives, getDrive, createDrive, updateDrive, deleteDrive, saveApplications, notifyEligible,
  studentView, studentApply, studentWithdraw,
  previewRecords, applyRecords, listBatches, rollbackBatch, listRecordRows,
  listOutside, createOutside, updateOutside, removeOutside,
  analytics, exportRows, meta,
};
