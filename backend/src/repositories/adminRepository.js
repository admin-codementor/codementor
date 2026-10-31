// Storage for the Admin's work: college settings, login history, daily AI use, and reading and pruning the audit log.
// Equality or single-field queries only, filtered in JS, so no composite index is needed.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const settingsDoc = () => db.collection('collegeSettings').doc('main');
const logins = () => db.collection('loginEvents');
const audit = () => db.collection('auditLogs');

async function getSettings() {
  const d = await settingsDoc().get();
  return d.exists ? d.data() : null;
}
async function saveSettings(value, byId) {
  await settingsDoc().set({ ...value, updatedBy: byId, updatedAtMs: Date.now() });
}

/** Counts one AI use for a person on a day and returns how many they have used including this one. A transaction, so two at once both count. */
async function countAiUse(dayKey, userId) {
  const ref = db.collection('aiUsage').doc(`${dayKey}_${userId}`);
  return db.runTransaction(async (tx) => {
    const d = await tx.get(ref);
    const n = (d.exists ? d.data().count || 0 : 0) + 1;
    tx.set(ref, { dayKey, userId, count: n, updatedAtMs: Date.now() });
    return n;
  });
}
async function getAiUse(dayKey, userId) {
  const d = await db.collection('aiUsage').doc(`${dayKey}_${userId}`).get();
  return d.exists ? d.data().count || 0 : 0;
}
/** Total AI uses on a day, for the overview. */
async function aiUseOnDay(dayKey) {
  const snap = await db.collection('aiUsage').where('dayKey', '==', dayKey).get();
  return { people: snap.size, uses: snap.docs.reduce((n, d) => n + (d.data().count || 0), 0) };
}

async function recordLogin(event) {
  await logins().add({ ...event, createdAt: FieldValue.serverTimestamp() });
}
async function loginsFor(userId, limit = 30) {
  const snap = await logins().where('userId', '==', userId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.atMs || 0) - (a.atMs || 0)).slice(0, limit);
}
async function recentLogins(limit = 200) {
  const snap = await logins().orderBy('atMs', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** The newest audit entries first, `pageSize` at a time after `after` (a createdAt in ms). */
async function auditPage({ afterMs = null, pageSize = 500 } = {}) {
  let q = audit().orderBy('createdAt', 'desc');
  if (afterMs != null) q = q.startAfter(new Date(afterMs));
  const snap = await q.limit(pageSize).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Removes up to `max` audit entries older than the cutoff. Returns how many went. */
async function pruneAudit(cutoffMs, max = 400) {
  const snap = await audit().where('createdAt', '<', new Date(cutoffMs)).orderBy('createdAt', 'asc').limit(max).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
async function pruneLogins(cutoffMs, max = 400) {
  const snap = await logins().where('atMs', '<', cutoffMs).orderBy('atMs', 'asc').limit(max).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
async function getPruneState() {
  const d = await db.collection('collegeSettings').doc('maintenance').get();
  return d.exists ? d.data() : {};
}
async function setPruneState(partial) {
  await db.collection('collegeSettings').doc('maintenance').set(partial, { merge: true });
}

module.exports = {
  getSettings, saveSettings, countAiUse, getAiUse, aiUseOnDay, recordLogin, loginsFor, recentLogins,
  auditPage, pruneAudit, pruneLogins, getPruneState, setPruneState,
};
