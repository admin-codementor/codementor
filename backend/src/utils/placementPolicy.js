// The rules of Training & Placement, as pure functions: no database, no clock of their own (callers pass `now`), so every rule is
// checkable against a fixture.
//
//   drive      who may apply (departments, years, CGPA, backlogs, deadline, tier), validated here
//   evaluate   one student against one drive: eligible or not, and EVERY reason why not (the student sees them all at once)
//   CGPA list  reading an uploaded list of CGPA and backlogs by roll number, with a dry run that changes nothing
//   export     the fixed list of fields that may leave the system, and a spreadsheet-safe CSV writer
//
// The rule that decides most of the questions: a student who already has an offer may apply only to a "dream" drive.

const TIERS = ['normal', 'dream'];
const PUBLISH_STATES = ['draft', 'published'];
const DRIVE_STATUSES = ['open', 'closed'];
const MAX_ROUNDS = 8;
const MAX_DEPARTMENTS = 40;
const MAX_CSV_ROWS = 5000;
const IST_END_OF_DAY = 'T23:59:59+05:30'; // a date with no time means "until the end of that day" in India

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function realDate(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw; // round trip: 2026-02-31 would roll over to March
}

/** A deadline given as a date ("2026-11-20", end of that day) or a full date and time. Returns an ISO string, or null if it is not one. */
function parseDeadline(raw) {
  const s = clean(raw);
  if (!s) return null;
  if (realDate(s)) return new Date(`${s}${IST_END_OF_DAY}`).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

const toMs = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** The departments a drive is open to. Drives made before T&P existed carry one `department`. */
const driveDepartments = (drive) => (Array.isArray(drive?.departments) && drive.departments.length ? drive.departments : drive?.department ? [drive.department] : []);

/** @returns {{error: string} | {drive: object}} */
function validateDrive(input) {
  if (!input || typeof input !== 'object') return { error: 'Nothing to save.' };

  const company = clean(input.company);
  if (company.length < 2 || company.length > 80) return { error: 'A company name of 2 to 80 characters is required.' };
  const role = clean(input.role);
  if (role.length > 80) return { error: 'Role can be at most 80 characters.' };
  const ctc = clean(input.ctc);
  if (ctc.length > 40) return { error: 'Package can be at most 40 characters.' };
  const description = String(input.description ?? '').replace(/\r/g, '').trim();
  if (description.length > 2000) return { error: 'The description can be at most 2000 characters.' };

  let date = null;
  if (input.date != null && clean(input.date) !== '') {
    date = clean(input.date);
    if (!realDate(date)) return { error: 'Drive date must be a real date like 2026-11-20.' };
  }

  if (!Array.isArray(input.departments) || input.departments.length === 0) return { error: 'Choose at least one department.' };
  const departments = [...new Set(input.departments.map(clean).filter(Boolean))];
  if (departments.length === 0 || departments.length > MAX_DEPARTMENTS || departments.some((d) => d.length > 60)) return { error: 'Choose between 1 and 40 departments.' };

  let eligibleYears = [];
  if (input.eligible_years != null) {
    if (!Array.isArray(input.eligible_years)) return { error: 'Eligible years must be a list.' };
    eligibleYears = [...new Set(input.eligible_years.map(Number))];
    if (eligibleYears.some((y) => !Number.isInteger(y) || y < 1 || y > 6)) return { error: 'Eligible years must be whole numbers from 1 to 6.' };
    eligibleYears.sort((a, b) => a - b);
  }

  let minCgpa = null;
  if (input.min_cgpa != null && input.min_cgpa !== '') {
    minCgpa = Number(input.min_cgpa);
    if (!Number.isFinite(minCgpa) || minCgpa < 0 || minCgpa > 10) return { error: 'Minimum CGPA must be a number from 0 to 10.' };
    minCgpa = Math.round(minCgpa * 100) / 100;
  }
  let maxBacklogs = null;
  if (input.max_backlogs != null && input.max_backlogs !== '') {
    maxBacklogs = Number(input.max_backlogs);
    if (!Number.isInteger(maxBacklogs) || maxBacklogs < 0 || maxBacklogs > 50) return { error: 'Maximum backlogs must be a whole number from 0 to 50.' };
  }

  let applyBy = null;
  if (input.apply_by != null && clean(input.apply_by) !== '') {
    applyBy = parseDeadline(input.apply_by);
    if (!applyBy) return { error: 'The last date to apply must be a date like 2026-11-15 or a date and time like 2026-11-15T17:00.' };
  }

  let link = null;
  if (input.link != null && clean(input.link) !== '') {
    link = clean(input.link);
    let u = null;
    try { u = new URL(link); } catch { /* handled below */ }
    if (!u || u.protocol !== 'https:' || link.length > 400) return { error: 'The company link must be a full address starting with https://.' };
  }

  let rounds = [];
  if (input.rounds != null) {
    if (!Array.isArray(input.rounds)) return { error: 'Rounds must be a list.' };
    rounds = input.rounds.map(clean).filter(Boolean);
    if (rounds.length > MAX_ROUNDS) return { error: `A drive can have at most ${MAX_ROUNDS} rounds.` };
    if (rounds.some((r) => r.length > 40)) return { error: 'A round name can be at most 40 characters.' };
    if (new Set(rounds.map((r) => r.toLowerCase())).size !== rounds.length) return { error: 'Round names must be different from each other.' };
  }

  const tier = input.tier == null ? 'normal' : String(input.tier);
  if (!TIERS.includes(tier)) return { error: `Tier must be one of: ${TIERS.join(', ')}.` };
  const status = input.status == null ? 'open' : String(input.status);
  if (!DRIVE_STATUSES.includes(status)) return { error: `Status must be one of: ${DRIVE_STATUSES.join(', ')}.` };
  const publishState = input.publish_state == null ? 'draft' : String(input.publish_state);
  if (!PUBLISH_STATES.includes(publishState)) return { error: `Publish state must be one of: ${PUBLISH_STATES.join(', ')}.` };

  return { drive: { company, role, ctc, description, date, departments, eligibleYears, minCgpa, maxBacklogs, applyBy, link, rounds, tier, status, publishState } };
}

/** What a drive looks like in an API response. */
const shapeDrive = (d) => ({
  id: d.id, company: d.company, role: d.role || '', ctc: d.ctc || '', description: d.description || '', date: d.date || null,
  departments: driveDepartments(d), eligible_years: d.eligibleYears || [], min_cgpa: d.minCgpa ?? null, max_backlogs: d.maxBacklogs ?? null,
  apply_by: d.applyBy || null, link: d.link || null, rounds: d.rounds || [], tier: d.tier || 'normal', status: d.status || 'open',
  publish_state: d.publishState || 'published', // a drive made before drafts existed was already visible
});

// ── eligibility ──
const NOT_OVERRIDABLE = new Set(['NOT_PUBLISHED', 'CLOSED']);

/**
 * One student against one drive. Every reason is listed, so the student learns everything that stands in the way at once.
 * @param {{student: {department?, year?}, record: {cgpa?, backlogs?}|null, drive: object, hasOffer: boolean, now: number}} a
 * @returns {{eligible: boolean, reasons: {code: string, message: string}[], overridable: boolean}}
 */
function evaluate({ student, record, drive, hasOffer, now }) {
  const reasons = [];
  const add = (code, message) => reasons.push({ code, message });
  const d = shapeDrive(drive);

  if (d.publish_state !== 'published') add('NOT_PUBLISHED', 'This drive has not been published yet.');
  if (d.status === 'closed') add('CLOSED', 'This drive is closed.');
  const deadline = toMs(d.apply_by);
  if (deadline != null && now > deadline) add('DEADLINE', 'The last date to apply has passed.');

  if (!d.departments.includes(student?.department ?? null)) add('DEPARTMENT', `This drive is for ${d.departments.join(', ')} students.`);
  if (d.eligible_years.length && !d.eligible_years.includes(Number(student?.year))) add('YEAR', `This drive is for year ${d.eligible_years.join(', ')} students.`);

  if (d.min_cgpa != null) {
    if (record?.cgpa == null) add('CGPA_UNKNOWN', 'Your CGPA has not been added yet. Ask the Training & Placement office.');
    else if (record.cgpa < d.min_cgpa) add('CGPA_LOW', `This drive needs a CGPA of ${d.min_cgpa} or more. Yours is ${record.cgpa}.`);
  }
  if (d.max_backlogs != null) {
    if (record?.backlogs == null) add('BACKLOGS_UNKNOWN', 'Your backlog count has not been added yet. Ask the Training & Placement office.');
    else if (record.backlogs > d.max_backlogs) add('BACKLOGS', `This drive allows at most ${d.max_backlogs} backlog${d.max_backlogs === 1 ? '' : 's'}. You have ${record.backlogs}.`);
  }

  if (hasOffer && d.tier !== 'dream') add('HAS_OFFER', 'You already have an offer, so you can apply only to dream drives.');

  return { eligible: reasons.length === 0, reasons, overridable: reasons.every((r) => !NOT_OVERRIDABLE.has(r.code)) };
}

/** Why a student's apply, or a staff member's add-with-override, is refused or allowed. */
function checkApply({ student, record, drive, hasOffer, now, existing }) {
  if (existing) return { ok: false, code: 'ALREADY_APPLIED', error: 'You have already applied to this drive.', reasons: [] };
  const e = evaluate({ student, record, drive, hasOffer, now });
  if (!e.eligible) return { ok: false, code: e.reasons[0].code, error: e.reasons.map((r) => r.message).join(' '), reasons: e.reasons, overridable: e.overridable };
  return { ok: true, reasons: [] };
}

/** A student may take back an application only while it is still "applied" and before the deadline. */
function canWithdraw({ application, drive, now }) {
  if (!application) return { ok: false, error: 'You have not applied to this drive.' };
  if (application.status !== 'applied') return { ok: false, error: 'You can only withdraw while the company has not yet acted on your application. Ask the Training & Placement office.' };
  const d = shapeDrive(drive);
  const deadline = toMs(d.apply_by);
  if (d.status === 'closed' || (deadline != null && now > deadline)) return { ok: false, error: 'The last date has passed. Ask the Training & Placement office to withdraw you.' };
  return { ok: true };
}

/** Staff adding a student who does not pass the rules need a written reason that is kept. */
function validateOverride(input) {
  const reason = clean(input?.reason);
  if (reason.length < 10) return { error: 'Write a reason of at least 10 characters. It is kept with the record.' };
  if (reason.length > 300) return { error: 'The reason can be at most 300 characters.' };
  return { reason };
}

/** True if a student holds an offer: a drive they were selected in, or an outside offer recorded by T&P. */
function hasOffer({ applications, outside, publishedDriveIds }) {
  if ((applications || []).some((a) => a.status === 'selected' && (!publishedDriveIds || publishedDriveIds.has(a.driveId)))) return true;
  return (outside || []).some((o) => o.status === 'selected');
}

// ── who may see a student's CGPA ──
/** The student, the Training & Placement office, the Admin, and the HOD of the student's own department. Nobody else. */
function canSeeAcademicRecord(viewer, student) {
  if (!viewer || !student) return false;
  if (viewer.role === 'tnp' || viewer.role === 'admin') return true;
  if (viewer.role === 'student') return viewer.id === student.id;
  if (viewer.role === 'hod') return viewer.department != null && viewer.department === (student.department ?? null);
  return false;
}

// ── CGPA and backlog list ──
function parseCsvRows(text, keepBlank = false) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (keepBlank || row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const HEADERS = {
  rollNo: ['roll', 'rollno', 'rollnumber', 'rollnum', 'registerno', 'regno', 'htno', 'hallticketno', 'hallticketnumber'],
  cgpa: ['cgpa', 'gpa'],
  backlogs: ['backlogs', 'backlog', 'arrears', 'activebacklogs', 'noofbacklogs'],
};
const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Read an uploaded list of CGPA and backlogs, and work out what each row would do. Writes nothing.
 * @param {string} text   the CSV: a header row with a roll number column, and a CGPA and/or a backlogs column
 * @param {Map<string, {id, name, department}>} byRoll   students by upper-case roll number
 * @param {Map<string, {cgpa, backlogs}>} current   existing records by student id
 * @returns {{error: string} | {rows: object[], counts: {new, changed, same, error}}}
 */
function planRecordUpload(text, byRoll, current) {
  const raw = parseCsvRows(text, true); // blank lines are kept so that a row number here is the line number in the file
  if (raw.length < 2) return { error: 'The file needs a header row and at least one student.' };
  if (raw.length - 1 > MAX_CSV_ROWS) return { error: `A file can have at most ${MAX_CSV_ROWS} students. Split it and upload again.` };
  const head = raw[0].map(norm);
  const col = (k) => head.findIndex((h) => HEADERS[k].includes(h));
  const iRoll = col('rollNo');
  const iCgpa = col('cgpa');
  const iBack = col('backlogs');
  if (iRoll < 0) return { error: 'The file needs a "Roll number" column.' };
  if (iCgpa < 0 && iBack < 0) return { error: 'The file needs a "CGPA" column, a "Backlogs" column, or both.' };

  const seen = new Map();
  const rows = raw.slice(1).map((cells, n) => ({ cells, rowNo: n + 2 })).filter((r) => r.cells.some((c) => clean(c) !== '')).map(({ cells, rowNo }) => {
    const rollNo = clean(cells[iRoll]).toUpperCase();
    const out = { rowNo, rollNo, studentId: null, name: null, cgpa: undefined, backlogs: undefined, before: null, status: 'error', error: '' };
    if (!rollNo) { out.error = 'No roll number.'; return out; }
    const student = byRoll.get(rollNo);
    if (!student) { out.error = 'No student has this roll number.'; return out; }
    out.studentId = student.id; out.name = student.name || null;
    if (seen.has(rollNo)) { out.error = `This roll number is also on row ${seen.get(rollNo)}.`; return out; }
    seen.set(rollNo, rowNo);

    if (iCgpa >= 0 && clean(cells[iCgpa]) !== '') {
      const v = Number(clean(cells[iCgpa]));
      if (!Number.isFinite(v) || v < 0 || v > 10) { out.error = `CGPA "${clean(cells[iCgpa]).slice(0, 12)}" is not a number from 0 to 10.`; return out; }
      out.cgpa = Math.round(v * 100) / 100;
    }
    if (iBack >= 0 && clean(cells[iBack]) !== '') {
      const v = Number(clean(cells[iBack]));
      if (!Number.isInteger(v) || v < 0 || v > 50) { out.error = `Backlogs "${clean(cells[iBack]).slice(0, 12)}" is not a whole number from 0 to 50.`; return out; }
      out.backlogs = v;
    }
    if (out.cgpa === undefined && out.backlogs === undefined) { out.error = 'Neither a CGPA nor a backlog count is given.'; return out; }

    const before = current.get(student.id) || null;
    out.before = before ? { cgpa: before.cgpa ?? null, backlogs: before.backlogs ?? null } : null;
    const same = (out.cgpa === undefined || before?.cgpa === out.cgpa) && (out.backlogs === undefined || before?.backlogs === out.backlogs);
    out.status = !before ? 'new' : same ? 'same' : 'changed';
    return out;
  });
  const counts = { new: 0, changed: 0, same: 0, error: 0 };
  rows.forEach((r) => { counts[r.status] += 1; });
  return { rows, counts };
}

// ── export ──
const EXPORT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'rollNo', label: 'Roll number' },
  { key: 'department', label: 'Department' },
  { key: 'year', label: 'Year' },
  { key: 'section', label: 'Section' },
  { key: 'email', label: 'Email' },
  { key: 'cgpa', label: 'CGPA' },
  { key: 'backlogs', label: 'Backlogs' },
  { key: 'codingScore', label: 'Coding score' },
];
const EXPORT_KEYS = EXPORT_FIELDS.map((f) => f.key);

/** @returns {{error: string} | {fields: string[]}} */
function validateExportFields(list) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'Choose at least one field to export.' };
  const fields = [...new Set(list.map(String))];
  const bad = fields.find((f) => !EXPORT_KEYS.includes(f));
  if (bad) return { error: `"${bad.slice(0, 30)}" is not a field that can be exported.` };
  return { fields: EXPORT_KEYS.filter((k) => fields.includes(k)) }; // always in the same column order
}

/** One CSV cell that a spreadsheet will not run as a formula: text that starts with = + - @ tab or CR gets a leading apostrophe. */
function csvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v) : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(fields, rows) {
  const labels = fields.map((k) => EXPORT_FIELDS.find((f) => f.key === k).label);
  return `${[labels.map(csvCell).join(','), ...rows.map((r) => fields.map((k) => csvCell(r[k])).join(','))].join('\r\n')}\r\n`;
}

module.exports = {
  TIERS, PUBLISH_STATES, DRIVE_STATUSES, MAX_ROUNDS, MAX_CSV_ROWS, EXPORT_FIELDS,
  validateDrive, shapeDrive, driveDepartments, parseDeadline,
  evaluate, checkApply, canWithdraw, validateOverride, hasOffer, canSeeAcademicRecord,
  parseCsvRows, planRecordUpload, validateExportFields, csvCell, toCsv,
};
