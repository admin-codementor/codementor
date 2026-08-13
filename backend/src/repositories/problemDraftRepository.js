// Staging area for imported problems — Firestore only.
//
// Imports never write to the live `problems` collection. They land here first so a
// human reviews and approves before students can see anything: a model that
// misreads a constraint, or a malformed spreadsheet row, would otherwise put a
// broken problem in front of a whole cohort.
//
// Lifecycle: draft ──(faculty edits/approves)──> published
//                 └─(faculty discards)────────> deleted
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('problemDrafts');

const toDraft = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

/** Insert a batch of parsed drafts. Returns the created rows. */
async function createMany(drafts) {
  if (!drafts.length) return [];
  const batch = db.batch();
  const created = [];
  drafts.forEach((d, i) => {
    const id = uuidv4();
    const row = { ...d, status: d.status || 'draft', position: i, createdAt: FieldValue.serverTimestamp() };
    batch.set(col().doc(id), row);
    created.push({ id, ...row });
  });
  await batch.commit();
  return created;
}

async function getById(id) {
  return toDraft(await col().doc(id).get());
}

// Two equality filters — served by single-field indexes, no composite index
// needed (same convention as the other repos here).
async function listByBatch(batchId) {
  const snap = await col().where('batchId', '==', batchId).get();
  return snap.docs.map(toDraft).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Pending drafts for one importer, newest batch first. */
async function listPendingByUser(userId) {
  const snap = await col().where('createdBy', '==', userId).where('status', '==', 'draft').get();
  return snap.docs
    .map(toDraft)
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0) || (a.position ?? 0) - (b.position ?? 0));
}

async function update(id, partial) {
  await col().doc(id).set(partial, { merge: true });
  return getById(id);
}

async function remove(id) {
  await col().doc(id).delete();
}

async function removeBatch(batchId) {
  const snap = await col().where('batchId', '==', batchId).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (snap.size) await batch.commit();
  return snap.size;
}

module.exports = { createMany, getById, listByBatch, listPendingByUser, update, remove, removeBatch };
