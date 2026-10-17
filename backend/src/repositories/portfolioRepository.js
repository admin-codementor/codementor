// Student portfolio items (certification / project / achievement) — Firestore only.
// One small document per item, owned by a student. Queries are equality-only and
// sorted in JS, so no composite index is needed.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('portfolioItems');
const toItem = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);
const newestFirst = (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);

async function create(userId, data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, userId, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toItem(await col().doc(id).get());
}

async function update(id, partial) {
  await col().doc(id).set({ ...partial, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getById(id);
}

async function remove(id) {
  await col().doc(id).delete();
}

async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs.map(toItem).sort(newestFirst);
}

/** Every item, for department roll-ups. Small collection, so a scan is fine at this scale. */
async function listAll() {
  const snap = await col().get();
  return snap.docs.map(toItem);
}

module.exports = { create, getById, update, remove, listByUser, listAll };
