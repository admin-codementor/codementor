// An in-memory stand-in for the Admin's storage, the staff and student records, email and the sign-in provider (no network, no Firestore).
// Used by tests/pure/adminFlow.js and by scripts/admin-sandbox.js. Installing it replaces functions on the repository and service modules.
const userRepo = require('../../src/repositories/userRepository');
const adminRepo = require('../../src/repositories/adminRepository');
const auditLogRepo = require('../../src/repositories/auditLogRepository');
const mailService = require('../../src/services/mailService');
const { firebaseAuth } = require('../../src/config/firebaseAdmin');

const clone = (v) => (v == null ? v : structuredClone(v));
const users = new Map();
const add = (u) => users.set(u.id, { tokenVersion: 0, ...u });
add({ id: 'adm1', role: 'admin', name: 'Admin One', email: 'adm1@c.test', totpEnabled: true, lastLoginAt: new Date() });
add({ id: 'adm2', role: 'admin', name: 'Admin Two', email: 'adm2@c.test', totpEnabled: true });
add({ id: 'f1', role: 'faculty', name: 'Faculty One', email: 'f1@c.test', department: 'CSE', lastLoginAt: new Date() });
add({ id: 'h1', role: 'hod', name: 'HOD CSE', email: 'h1@c.test', department: 'CSE' });
add({ id: 'tp1', role: 'tnp', name: 'T&P One', email: 'tp1@c.test', totpEnabled: false });
add({ id: 's1', role: 'student', name: 'Student One', email: 's1@c.test', rollNo: '22CS001', department: 'CSE', year: 4, lastLoginAt: new Date() });
add({ id: 's2', role: 'student', name: 'Student Two', email: 's2@c.test', rollNo: '22EC001', department: 'ECE', year: 4 });

const state = { audit: [], mails: [], mailOn: true, settings: null, aiUse: new Map(), logins: [], authUsers: new Map(), links: 0, created: [], deleted: [], failProfile: false };

function install() {
  Object.assign(userRepo, {
    getAllUsersMap: async () => new Map([...users].map(([k, v]) => [k, clone(v)])),
    getByEmail: async (email) => clone([...users.values()].find((u) => u.email === email) || null),
    getById: async (id) => clone(users.get(id) || null),
    update: async (id, role, partial) => {
      if (state.failProfile) throw new Error('database down');
      users.set(id, { tokenVersion: 0, ...(users.get(id) || { id }), ...clone(partial) });
    },
    bumpTokenVersion: async (id) => { users.get(id).tokenVersion = (users.get(id).tokenVersion || 0) + 1; },
    listDisabledIds: async () => [...users.values()].filter((u) => u.disabled === true).map((u) => u.id),
  });
  Object.assign(adminRepo, {
    getSettings: async () => clone(state.settings),
    saveSettings: async (v) => { state.settings = clone(v); },
    countAiUse: async (day, uid) => { const k = `${day}_${uid}`; state.aiUse.set(k, (state.aiUse.get(k) || 0) + 1); return state.aiUse.get(k); },
    getAiUse: async (day, uid) => state.aiUse.get(`${day}_${uid}`) || 0,
    aiUseOnDay: async (day) => { const e = [...state.aiUse].filter(([k]) => k.startsWith(day)); return { people: e.length, uses: e.reduce((n, [, v]) => n + v, 0) }; },
    recordLogin: async (e) => { state.logins.push(clone(e)); },
    loginsFor: async (uid) => state.logins.filter((e) => e.userId === uid).sort((a, b) => b.atMs - a.atMs),
    recentLogins: async () => [...state.logins].sort((a, b) => b.atMs - a.atMs),
    auditPage: async ({ afterMs, pageSize }) => state.audit.filter((r) => afterMs == null || r.createdAt < afterMs).sort((a, b) => b.createdAt - a.createdAt).slice(0, pageSize).map(clone),
    pruneAudit: async (cutoff) => { const n = state.audit.filter((r) => r.createdAt < cutoff); state.audit = state.audit.filter((r) => r.createdAt >= cutoff); return n.length; },
    pruneLogins: async (cutoff) => { const n = state.logins.filter((r) => r.atMs < cutoff); state.logins = state.logins.filter((r) => r.atMs >= cutoff); return n.length; },
    getPruneState: async () => state.prune || {},
    setPruneState: async (p) => { state.prune = { ...(state.prune || {}), ...p }; },
  });
  auditLogRepo.create = async (row) => { state.audit.push({ id: `a${state.audit.length}`, ...clone(row), createdAt: Date.now() + state.audit.length }); };
  Object.assign(mailService, {
    isConfigured: () => state.mailOn,
    send: async ({ to, subject, text }) => { if (!state.mailOn) return { status: 'not_configured' }; state.mails.push({ to, subject, text }); return { status: 'sent' }; },
  });
  Object.assign(firebaseAuth, {
    getUserByEmail: async (email) => { const u = state.authUsers.get(email); if (!u) throw new Error('none'); return u; },
    createUser: async ({ email, password }) => { const u = { uid: `uid_${email}`, password }; state.authUsers.set(email, u); state.created.push(u); return u; },
    deleteUser: async (uid) => { state.deleted.push(uid); for (const [k, v] of state.authUsers) if (v.uid === uid) state.authUsers.delete(k); },
    generatePasswordResetLink: async (email) => { state.links += 1; return `https://example.test/reset?e=${encodeURIComponent(email)}&n=${state.links}`; },
  });
}

module.exports = { users, add, state, install };
