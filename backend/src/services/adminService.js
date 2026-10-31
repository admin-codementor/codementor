// The Admin's work: people, college settings, the audit log and login history, and the college overview.
// The HTTP layer (controllers/admin.controller.js) passes the actor and the body; every rule is checked here and in utils/adminRules.js.
//
// No password is ever shown to the Admin, and no link that would let the Admin set someone's password is ever shown either: an emailed
// set-password link goes only to the account's own address. If mail is not set up, creating or resetting is refused with a clear message.
const crypto = require('crypto');
const userRepo = require('../repositories/userRepository');
const adminRepo = require('../repositories/adminRepository');
const mailService = require('./mailService');
const accountGate = require('../middleware/accountGate');
const R = require('../utils/adminRules');
const judgeJobRepo = require('../repositories/judgeJobRepository');
const selfCheck = require('./selfCheck');
const reports = require('./problemReportService');
const { breaker } = require('./judgeBreaker');

class AdminError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new AdminError(status, code, message); };

function assertAdmin(actor) {
  if (actor?.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an Admin can do this.');
}

const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime());

// ── a short in-process copy of the people list: every Admin screen needs all of it (about 3000 reads), so it is read once per 20 seconds ──
let peopleMemo = null;
const PEOPLE_MS = 20_000;
function loadPeople() {
  if (peopleMemo && Date.now() - peopleMemo.at < PEOPLE_MS) return peopleMemo.value;
  const value = userRepo.getAllUsersMap().then((m) => [...m.values()]).catch((e) => { peopleMemo = null; throw e; });
  peopleMemo = { at: Date.now(), value };
  return value;
}
const clearPeople = () => { peopleMemo = null; };

const shapePerson = (u) => ({
  id: u.id, name: u.name || 'Unknown', email: u.email || null, role: u.role, department: u.department ?? null, rollNo: u.rollNo ?? null,
  year: u.year ?? null, section: u.section ?? null, disabled: u.disabled === true, twofa: u.totpEnabled === true,
  last_login_ms: toMs(u.lastLoginAt), test_account: u.isTestAccount === true,
});

// ── settings (also read by the AI gate on every AI request, so held for 30 seconds) ──
let settingsMemo = null;
const SETTINGS_MS = 30_000;
async function getSettings() {
  if (settingsMemo && Date.now() - settingsMemo.at < SETTINGS_MS) return settingsMemo.value;
  let value;
  try { value = R.normaliseSettings(await adminRepo.getSettings()); } catch (e) {
    if (settingsMemo) return settingsMemo.value; // keep the last good copy through a database blip
    return R.normaliseSettings(null);
  }
  settingsMemo = { at: Date.now(), value };
  return value;
}
const clearSettings = () => { settingsMemo = null; };

async function saveSettings(actor, input) {
  assertAdmin(actor);
  const current = await getSettings();
  const v = R.validateSettingsChange(input, current);
  if (v.error) fail(400, 'INVALID', v.error);
  const change = R.describeSettingsChange(current, v.value);
  if (!change) return { settings: current, change: '' };
  await adminRepo.saveSettings(v.value, actor.id);
  clearSettings();
  return { settings: v.value, change };
}

// ── people ──
async function listPeople(actor, filters = {}) {
  assertAdmin(actor);
  const people = (await loadPeople()).map(shapePerson);
  const page = R.filterPeople(people, filters);
  return { ...page, staff_roles: R.STAFF_ROLES };
}

async function getPerson(actor, id) {
  assertAdmin(actor);
  const u = (await loadPeople()).find((p) => p.id === id);
  if (!u) fail(404, 'NOT_FOUND', 'Account not found.');
  const events = await adminRepo.loginsFor(id, 30);
  return {
    ...shapePerson(u),
    logins: events.map((e) => ({ at_ms: e.atMs, kind: e.kind, ip: e.ip || null, agent: e.agent || null })),
  };
}

function resetMessage(name, link) {
  return `Hello ${name},\n\nAn account has been created or updated for you on CodeMentor. Open this link to choose your password:\n\n${link}\n\nIf you were not expecting this, ignore this message: nothing changes until you open the link.\n\nCodeMentor`;
}

/** Emails a set-password link to the account's own address. Never returns the link. */
async function emailSetPasswordLink(email, name, subject) {
  const { firebaseAuth } = require('../config/firebaseAdmin');
  const link = await firebaseAuth.generatePasswordResetLink(email);
  return mailService.send({ to: email, subject, text: resetMessage(name, link) });
}

const NO_MAIL = 'Email is not set up on the server (SMTP_HOST and MAIL_FROM), so a set-password link cannot be sent. The Admin never sees a password or a link; ask whoever runs the server to set up email.';

async function createAccount(actor, body) {
  assertAdmin(actor);
  const v = R.validateNewAccount(body, await getSettings());
  if (v.error) fail(400, 'INVALID', v.error);
  if (!mailService.isConfigured()) fail(409, 'MAIL_NOT_CONFIGURED', NO_MAIL);
  if (v.value.role === 'admin' && !R.confirmed(body?.typed, { email: v.value.email })) fail(400, 'CONFIRM', 'Making someone an Admin needs the email typed in full to confirm.');
  if (await userRepo.getByEmail(v.value.email)) fail(409, 'EXISTS', 'An account with this email already exists.');

  const { firebaseAuth } = require('../config/firebaseAdmin');
  let uid;
  let createdAuth = false;
  const existing = await firebaseAuth.getUserByEmail(v.value.email).catch(() => null);
  if (existing) uid = existing.uid;
  else {
    // A password nobody knows: the person chooses their own through the emailed link.
    uid = (await firebaseAuth.createUser({ email: v.value.email, password: crypto.randomBytes(24).toString('base64url'), displayName: v.value.name, emailVerified: false })).uid;
    createdAuth = true;
  }
  try {
    await userRepo.update(uid, v.value.role, {
      name: v.value.name, email: v.value.email, role: v.value.role, department: v.value.department, permissions: {}, firebaseUid: uid,
      totpSecret: null, totpEnabled: false, rating: 1200, createdAt: new Date(), createdBy: actor.id, lastLoginAt: null,
    });
  } catch (e) {
    if (createdAuth) await firebaseAuth.deleteUser(uid).catch(() => {}); // no sign-in left behind without a profile
    throw e;
  }
  clearPeople();
  const mail = await emailSetPasswordLink(v.value.email, v.value.name, 'Your CodeMentor account');
  return { id: uid, email: v.value.email, role: v.value.role, mail: mail.status, mail_error: mail.error || null };
}

async function sendResetLink(actor, id) {
  assertAdmin(actor);
  const u = (await loadPeople()).find((p) => p.id === id);
  if (!u || !u.email) fail(404, 'NOT_FOUND', 'Account not found.');
  if (u.disabled === true) fail(409, 'DISABLED', 'This account is disabled. Enable it first.');
  if (!mailService.isConfigured()) fail(409, 'MAIL_NOT_CONFIGURED', NO_MAIL);
  const mail = await emailSetPasswordLink(u.email, u.name || 'there', 'Choose a new CodeMentor password');
  if (mail.status !== 'sent') fail(502, 'MAIL_FAILED', 'The email could not be sent. Try again in a minute.');
  return { email: u.email };
}

async function setDisabled(actor, id, disabled, typed) {
  assertAdmin(actor);
  const people = await loadPeople();
  const target = people.find((p) => p.id === id);
  if (!target) fail(404, 'NOT_FOUND', 'Account not found.');
  if (disabled) {
    const c = R.checkAccountChange({ actor, target, people, change: 'disable', typed });
    if (!c.ok) fail(c.code === 'NOT_FOUND' ? 404 : 400, c.code, c.error);
  } else if (!R.STAFF_ROLES.includes(target.role)) fail(400, 'NOT_STAFF', 'Only staff accounts are managed here.');
  await userRepo.update(id, target.role, { disabled, disabledAt: disabled ? new Date() : null, disabledBy: disabled ? actor.id : null });
  // End every session now. A disabled account is also refused at once by the account gate; enabling it lets it sign in again.
  await userRepo.bumpTokenVersion(id, target.role);
  accountGate.mark(id, disabled);
  clearPeople();
  return { id, disabled, email: target.email };
}

async function changeRole(actor, id, body) {
  assertAdmin(actor);
  const people = await loadPeople();
  const target = people.find((p) => p.id === id);
  const c = R.checkAccountChange({ actor, target, people, change: 'role', newRole: body?.role, typed: body?.typed });
  if (!c.ok) fail(c.code === 'NOT_FOUND' ? 404 : 400, c.code, c.error);
  const d = R.departmentAfterRoleChange(target, body.role, body.department, await getSettings());
  if (d.error) fail(400, 'DEPARTMENT', d.error);
  // Every staff role lives in the same collection, so the account stays where it is; only its role and department change.
  await userRepo.update(id, target.role, { role: body.role, department: d.value, permissions: {} });
  await userRepo.bumpTokenVersion(id, body.role);
  clearPeople();
  return { id, from: target.role, to: body.role, department: d.value, email: target.email };
}

async function changeDepartment(actor, id, body) {
  assertAdmin(actor);
  const target = (await loadPeople()).find((p) => p.id === id);
  if (!target || !R.STAFF_ROLES.includes(target.role)) fail(404, 'NOT_FOUND', 'Account not found.');
  const v = R.validateDepartmentChange({ target, department: body?.department }, await getSettings());
  if (v.error) fail(400, 'INVALID', v.error);
  await userRepo.update(id, target.role, { department: v.value });
  await userRepo.bumpTokenVersion(id, target.role); // the department is in the token, so old tokens must not keep the old one
  clearPeople();
  return { id, department: v.value, email: target.email };
}

// ── audit log ──
const SCAN_PAGE = 500;
const SCAN_MAX = 5000;

/** Scans the newest entries in pages, keeping those that match, until `want` matches or SCAN_MAX entries were looked at. */
async function scanAudit(filters, want, people = new Map()) {
  const kept = [];
  let after = null;
  let looked = 0;
  while (kept.length < want && looked < SCAN_MAX) {
    const page = await adminRepo.auditPage({ afterMs: after, pageSize: SCAN_PAGE });
    if (page.length === 0) return { rows: kept, looked, exhausted: true };
    looked += page.length;
    // The person's name and email are added first, so a search for a name finds their entries.
    kept.push(...R.filterAudit(page.map((r) => ({ ...r, userName: people.get(r.userId)?.name, userEmail: people.get(r.userId)?.email })), filters));
    const last = toMs(page[page.length - 1].createdAt);
    if (page.length < SCAN_PAGE || last == null) return { rows: kept, looked, exhausted: true };
    if (filters.fromMs != null && last < filters.fromMs) return { rows: kept, looked, exhausted: true }; // older than the search window
    after = last;
  }
  return { rows: kept, looked, exhausted: false };
}

const parseDay = (s, end) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
  const t = Date.parse(`${s}T${end ? '23:59:59' : '00:00:00'}+05:30`);
  return Number.isNaN(t) ? null : t;
};

async function withNames(rows) {
  const people = new Map((await loadPeople()).map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id, action: r.action, detail: r.detail || null, ip: r.ip || null, at_ms: toMs(r.createdAt),
    user_id: r.userId || null, user_name: people.get(r.userId)?.name || null, user_email: people.get(r.userId)?.email || null,
  }));
}

function auditFilters(q) {
  return {
    action: q.action ? String(q.action).slice(0, 60) : undefined, userId: q.user_id ? String(q.user_id).slice(0, 80) : undefined,
    q: q.q ? String(q.q).slice(0, 60) : undefined, fromMs: parseDay(q.from, false) ?? undefined, toMs: parseDay(q.to, true) ?? undefined,
  };
}

async function listAudit(actor, query = {}) {
  assertAdmin(actor);
  const filters = auditFilters(query);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 200);
  const people = new Map((await loadPeople()).map((p) => [p.id, p]));
  // Stops as soon as `limit` entries match, so opening the log with no filter reads one page, not the whole log.
  const scan = await scanAudit(filters, limit, people);
  void maybePrune();
  return { rows: await withNames(scan.rows.slice(0, limit)), looked_at: scan.looked, whole_log: scan.exhausted, more: !scan.exhausted };
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function exportAudit(actor, query = {}) {
  assertAdmin(actor);
  const filters = auditFilters(query);
  const people = new Map((await loadPeople()).map((p) => [p.id, p]));
  const scan = await scanAudit(filters, SCAN_MAX, people);
  const rows = await withNames(scan.rows.slice(0, SCAN_MAX));
  const head = ['When', 'Who', 'Email', 'Action', 'Detail', 'Address'];
  const lines = rows.map((r) => [r.at_ms ? new Date(r.at_ms).toISOString() : '', r.user_name, r.user_email, r.action, r.detail, r.ip].map(csvCell).join(','));
  return { csv: `${[head.join(','), ...lines].join('\r\n')}\r\n`, count: rows.length, filters };
}

// ── retention: one year, for the audit log and the login history, pruned at most once a day when the Admin opens the log ──
let pruning = false;
async function maybePrune(now = Date.now()) {
  if (pruning) return;
  pruning = true;
  try {
    const state = await adminRepo.getPruneState();
    if (state.lastPruneMs && now - state.lastPruneMs < 86400000) return;
    const cutoff = R.retentionCutoff(now);
    let removed = 0;
    for (let i = 0; i < 10; i += 1) { // up to 4000 of each per run; a long backlog finishes over the next days
      const a = await adminRepo.pruneAudit(cutoff);
      const b = await adminRepo.pruneLogins(cutoff);
      removed += a + b;
      if (a < 400 && b < 400) break;
    }
    await adminRepo.setPruneState({ lastPruneMs: now, lastRemoved: removed });
  } catch (e) {
    console.error('audit prune failed:', String(e?.message || e).slice(0, 120));
  } finally { pruning = false; }
}

async function recentLogins(actor, { failedOnly } = {}) {
  assertAdmin(actor);
  const people = new Map((await loadPeople()).map((p) => [p.id, p]));
  let rows = await adminRepo.recentLogins(200);
  if (failedOnly) rows = rows.filter((r) => r.kind !== 'login');
  return rows.slice(0, 100).map((r) => ({ at_ms: r.atMs, kind: r.kind, role: r.role, ip: r.ip || null, user_id: r.userId, user_name: people.get(r.userId)?.name || null, user_email: people.get(r.userId)?.email || null }));
}

// ── overview ──
async function overview(actor) {
  assertAdmin(actor);
  const now = Date.now();
  const [people, settings] = await Promise.all([loadPeople(), getSettings()]);
  const students = people.filter((p) => p.role === 'student' && p.graduated !== true);
  const staff = people.filter((p) => R.STAFF_ROLES.includes(p.role));
  const since = (days) => now - days * 86400000;
  const active = (list, days) => list.filter((p) => (toMs(p.lastLoginAt) ?? 0) >= since(days)).length;
  const countBy = (list, key) => Object.entries(list.reduce((m, p) => { const k = p[key] ?? 'Unassigned'; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([name, count]) => ({ name: String(name), count })).sort((a, b) => b.count - a.count);
  const ai = await adminRepo.aiUseOnDay(R.dayKey(now)).catch(() => null);
  const logins = await adminRepo.recentLogins(200).catch(() => []);
  const day = since(1);
  return {
    students: { total: students.length, active_7d: active(students, 7), active_30d: active(students, 30), by_department: countBy(students, 'department'), by_year: countBy(students, 'year') },
    staff: {
      total: staff.length, by_role: R.STAFF_ROLES.map((r) => ({ role: r, label: R.ROLE_LABEL[r], count: staff.filter((p) => p.role === r).length })),
      disabled: staff.filter((p) => p.disabled === true).length, active_7d: active(staff, 7),
      without_two_factor: staff.filter((p) => (p.role === 'admin' || p.role === 'tnp') && p.disabled !== true && p.totpEnabled !== true).map((p) => ({ id: p.id, name: p.name || 'Unknown', role: p.role })),
    },
    security: { failed_two_factor_24h: logins.filter((e) => e.kind === 'twofa_failed' && (e.atMs || 0) >= day).length, blocked_24h: logins.filter((e) => e.kind === 'blocked_disabled' && (e.atMs || 0) >= day).length, sign_ins_24h: logins.filter((e) => e.kind === 'login' && (e.atMs || 0) >= day).length },
    system: { mail_configured: mailService.isConfigured(), ai_enabled: settings.ai.enabled, ai_daily_limit: settings.ai.dailyLimit, ai_uses_today: ai?.uses ?? null, ai_people_today: ai?.people ?? null },
    settings_set_up: settings.departments.length > 0,
  };
}

// ── health: the judge connection, the last self-check, jobs given up on, and problem reports ──
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
  AdminError, listPeople, getPerson, createAccount, sendResetLink, setDisabled, changeRole, changeDepartment,
  getSettings, saveSettings, clearSettings, clearPeople, listAudit, exportAudit, recentLogins, overview, maybePrune,
};
