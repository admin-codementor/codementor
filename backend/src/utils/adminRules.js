// What an Admin may do to accounts and to college settings, as pure functions (no database, no clock of their own).
//
// Safety rules, all enforced here so one test file covers them:
//   - the last active Admin cannot be disabled or given another role
//   - an Admin cannot disable or demote themselves
//   - every change to one account needs the account's email typed in full as confirmation, and is one account at a time (never bulk)
//   - roles can move only inside the staff group: faculty, HOD, T&P, Admin. A student never becomes staff or the other way round.
//   - there is no "sign in as" anywhere (nothing here builds one, and the route audit would show one)

const STAFF_ROLES = ['faculty', 'hod', 'tnp', 'admin'];
const ROLE_LABEL = { faculty: 'Faculty', hod: 'HOD', tnp: 'Training & Placement', admin: 'Admin' };
const NEEDS_DEPARTMENT = ['faculty', 'hod'];
const MAX_LIST = 60;

const clean = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/**
 * A new staff account. A department is required for faculty and HOD, and is refused for T&P and Admin (they belong to the whole college).
 * @param {object} input  { name, email, role, department }
 * @param {{departments?: string[]}} settings  when the college has a department list, the department must be on it
 * @returns {{error: string} | {value: {name, email, role, department}}}
 */
function validateNewAccount(input, settings = {}) {
  const name = clean(input?.name, 80);
  if (name.length < 2) return { error: 'Enter the person\'s full name.' };
  const email = clean(input?.email, 160).toLowerCase();
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  const role = String(input?.role ?? '');
  if (!STAFF_ROLES.includes(role)) return { error: `Role must be one of: ${STAFF_ROLES.map((r) => ROLE_LABEL[r]).join(', ')}.` };
  let department = clean(input?.department, 60) || null;
  if (NEEDS_DEPARTMENT.includes(role)) {
    if (!department) return { error: `A ${ROLE_LABEL[role]} account needs a department.` };
    const list = settings.departments || [];
    if (list.length && !list.includes(department)) return { error: `"${department}" is not one of the college's departments. Choose one from the list, or add it in Settings first.` };
  } else {
    department = null;
  }
  return { value: { name, email, role, department } };
}

/** Confirmation by typing the account's email in full (case does not matter, spaces around it do not count). */
const confirmed = (typed, target) => !!target?.email && clean(typed, 160).toLowerCase() === String(target.email).toLowerCase();

const activeAdmins = (people) => people.filter((p) => p.role === 'admin' && p.disabled !== true);

/**
 * May the actor disable this account, or change its role? One decision for both, because both can lock the last Admin out.
 * @param {{actor: {id: string}, target: {id, role, email, disabled?}, people: {id, role, disabled?}[], change: 'disable'|'role', newRole?: string, typed?: string}} a
 * @returns {{ok: true} | {ok: false, code: string, error: string}}
 */
function checkAccountChange({ actor, target, people, change, newRole, typed }) {
  const no = (code, error) => ({ ok: false, code, error });
  if (!target) return no('NOT_FOUND', 'Account not found.');
  if (!STAFF_ROLES.includes(target.role)) return no('NOT_STAFF', 'Only staff accounts are managed here. A student is managed by their department.');
  if (!confirmed(typed, target)) return no('CONFIRM', 'Type the account\'s email address in full to confirm.');
  if (change === 'role') {
    if (!STAFF_ROLES.includes(newRole)) return no('BAD_ROLE', 'Choose faculty, HOD, T&P or Admin.');
    if (newRole === target.role) return no('NO_CHANGE', 'That is already this person\'s role.');
  }
  const losesAdmin = target.role === 'admin' && (change === 'disable' || (change === 'role' && newRole !== 'admin'));
  if (losesAdmin) {
    if (target.id === actor?.id) return no('SELF', change === 'disable' ? 'You cannot disable your own account.' : 'You cannot change your own role. Ask another Admin.');
    if (target.disabled !== true && activeAdmins(people).filter((p) => p.id !== target.id).length === 0) {
      return no('LAST_ADMIN', 'This is the last active Admin. Make someone else an Admin first.');
    }
  }
  if (change === 'disable' && target.id === actor?.id) return no('SELF', 'You cannot disable your own account.');
  return { ok: true };
}

/** Changing a faculty or HOD department. */
function validateDepartmentChange({ target, department }, settings = {}) {
  if (!NEEDS_DEPARTMENT.includes(target?.role)) return { error: 'Only faculty and HOD accounts have a department.' };
  const d = clean(department, 60);
  if (!d) return { error: 'Choose a department.' };
  const list = settings.departments || [];
  if (list.length && !list.includes(d)) return { error: `"${d}" is not one of the college's departments.` };
  return { value: d };
}

/** Role changes that need a department (to faculty or HOD) must have one; to T&P or Admin the department is cleared. */
function departmentAfterRoleChange(target, newRole, department, settings = {}) {
  if (!NEEDS_DEPARTMENT.includes(newRole)) return { value: null };
  const d = clean(department ?? target?.department, 60);
  if (!d) return { error: `A ${ROLE_LABEL[newRole]} needs a department. Choose one.` };
  const list = settings.departments || [];
  if (list.length && !list.includes(d)) return { error: `"${d}" is not one of the college's departments.` };
  return { value: d };
}

// ── settings ──
const MAX_NAMES = 60;

/** A list of names (departments, sections): trimmed, no empties, no repeats ignoring case, bounded. */
function cleanNames(list, what, max = 40) {
  if (!Array.isArray(list)) return { error: `${what} must be a list.` };
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const v = clean(raw, max);
    if (!v) continue;
    if (seen.has(v.toLowerCase())) return { error: `"${v}" is listed twice in ${what.toLowerCase()}.` };
    seen.add(v.toLowerCase());
    out.push(v);
  }
  if (out.length > MAX_NAMES) return { error: `${what} can have at most ${MAX_NAMES} entries.` };
  return { value: out };
}

const DEFAULT_SETTINGS = { departments: [], sections: [], ai: { enabled: true, dailyLimit: null } };

/**
 * Read stored settings safely: anything missing or wrong falls back to the default, so a half-written document never breaks a screen.
 */
function normaliseSettings(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const names = (v) => (Array.isArray(v) ? cleanNames(v, 'x').value || [] : []);
  const lim = Number.isInteger(s.ai?.dailyLimit) && s.ai.dailyLimit >= 1 && s.ai.dailyLimit <= 1000 ? s.ai.dailyLimit : null;
  return { departments: names(s.departments), sections: names(s.sections), ai: { enabled: s.ai?.enabled !== false, dailyLimit: lim } };
}

/** A settings change from the screen. Only the parts that are sent are changed; every sent part is checked strictly. */
function validateSettingsChange(input, current) {
  if (!input || typeof input !== 'object') return { error: 'Nothing to save.' };
  const next = { departments: [...current.departments], sections: [...current.sections], ai: { ...current.ai } };
  if (input.departments !== undefined) {
    const r = cleanNames(input.departments, 'Departments');
    if (r.error) return r;
    next.departments = r.value;
  }
  if (input.sections !== undefined) {
    const r = cleanNames(input.sections, 'Sections', 10);
    if (r.error) return r;
    next.sections = r.value;
  }
  if (input.ai !== undefined) {
    if (!input.ai || typeof input.ai !== 'object') return { error: 'AI settings must be an object.' };
    if (input.ai.enabled !== undefined) {
      if (typeof input.ai.enabled !== 'boolean') return { error: 'AI on or off must be true or false.' };
      next.ai.enabled = input.ai.enabled;
    }
    if (input.ai.dailyLimit !== undefined) {
      if (input.ai.dailyLimit === null || input.ai.dailyLimit === '') next.ai.dailyLimit = null;
      else {
        const n = Number(input.ai.dailyLimit);
        if (!Number.isInteger(n) || n < 1 || n > 1000) return { error: 'The daily limit must be a whole number from 1 to 1000, or empty for no limit.' };
        next.ai.dailyLimit = n;
      }
    }
  }
  return { value: next };
}

/** What changed, as short text for the audit log: "departments: 3 → 4; ai.enabled: true → false". */
function describeSettingsChange(before, after) {
  const parts = [];
  if (JSON.stringify(before.departments) !== JSON.stringify(after.departments)) parts.push(`departments: ${before.departments.length} → ${after.departments.length} (${after.departments.join(', ').slice(0, 120)})`);
  if (JSON.stringify(before.sections) !== JSON.stringify(after.sections)) parts.push(`sections: ${before.sections.length} → ${after.sections.length} (${after.sections.join(', ').slice(0, 80)})`);
  if (before.ai.enabled !== after.ai.enabled) parts.push(`ai.enabled: ${before.ai.enabled} → ${after.ai.enabled}`);
  if (before.ai.dailyLimit !== after.ai.dailyLimit) parts.push(`ai.dailyLimit: ${before.ai.dailyLimit ?? 'none'} → ${after.ai.dailyLimit ?? 'none'}`);
  return parts.join('; ');
}

/** The day an AI use counts for, in India (the college's day), as YYYY-MM-DD. */
const dayKey = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);

/** Does this person still have AI uses left today? `used` is how many they have made. */
function aiAllowed(settings, role, used) {
  if (settings.ai.enabled === false) return { ok: false, code: 'AI_OFF', error: 'AI help is switched off by your college right now.' };
  if (role === 'admin' || settings.ai.dailyLimit == null) return { ok: true };
  if (used >= settings.ai.dailyLimit) return { ok: false, code: 'AI_DAILY_LIMIT', error: `You have used your ${settings.ai.dailyLimit} AI questions for today. They come back tomorrow.` };
  return { ok: true };
}

// ── people list and audit search ──
/** Filter and page the people list. Search matches name, email and roll number. */
function filterPeople(people, { role, department, status, q, page = 1, size = 50 } = {}) {
  const needle = clean(q, 60).toLowerCase();
  const rows = people
    .filter((p) => !role || p.role === role)
    .filter((p) => !department || (p.department ?? null) === department)
    .filter((p) => !status || (status === 'disabled' ? p.disabled === true : p.disabled !== true))
    .filter((p) => !needle || `${p.name || ''} ${p.email || ''} ${p.rollNo || ''}`.toLowerCase().includes(needle))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const pageSize = Math.min(Math.max(Number(size) || 50, 1), MAX_LIST);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(Math.max(Number(page) || 1, 1), pages);
  return { total: rows.length, page: p, pages, rows: rows.slice((p - 1) * pageSize, p * pageSize) };
}

const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime());

/** Keep audit entries matching the filters (action prefix, person, text, dates). */
function filterAudit(rows, { action, userId, q, fromMs, toMs: until } = {}) {
  const needle = clean(q, 60).toLowerCase();
  return rows.filter((r) => {
    const at = toMs(r.createdAt);
    if (fromMs != null && (at == null || at < fromMs)) return false;
    if (until != null && (at == null || at > until)) return false;
    if (action && !String(r.action || '').startsWith(action)) return false;
    if (userId && r.userId !== userId) return false;
    if (needle && !`${r.action || ''} ${r.detail || ''} ${r.userName || ''} ${r.userEmail || ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

const RETENTION_DAYS = 365;
/** Entries older than this many days are removed (the audit log and the login history both). */
const retentionCutoff = (nowMs, days = RETENTION_DAYS) => nowMs - days * 86400000;

module.exports = {
  STAFF_ROLES, ROLE_LABEL, RETENTION_DAYS, DEFAULT_SETTINGS, MAX_LIST,
  validateNewAccount, confirmed, checkAccountChange, validateDepartmentChange, departmentAfterRoleChange,
  cleanNames, normaliseSettings, validateSettingsChange, describeSettingsChange, dayKey, aiAllowed,
  filterPeople, filterAudit, retentionCutoff,
};
