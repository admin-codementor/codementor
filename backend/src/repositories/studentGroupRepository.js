// Custom student groups — Firestore only.
//
// A group is an explicit list of student ids, deliberately independent of
// classrooms: that is the whole point of the feature. A classroom is one
// faculty member's section; a group can hold students from several sections,
// several years, or several branches at once (a placement batch, a "needs
// improvement" cohort), which classrooms cannot express.
//
// Membership is stored as a plain array rather than a subcollection: a group is
// read whole every time it is used (to target an exam, to scope analytics), and
// it is bounded — see MAX_MEMBERS in the controller — so one document read beats
// a subcollection query.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('studentGroups');

const toGroup = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toGroup(await col().doc(id).get());
}

async function update(id, partial) {
  await col().doc(id).set({ ...partial, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getById(id);
}

async function remove(id) {
  await col().doc(id).delete();
}

async function listAll() {
  const snap = await col().get();
  return snap.docs
    .map(toGroup)
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

async function getMapByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const docs = await db.getAll(...unique.map((id) => col().doc(id)));
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, { id: d.id, ...d.data() }]));
}

/** Groups a given student belongs to. Small collection, so a scan is fine. */
async function listByStudentId(studentId) {
  const snap = await col().where('studentIds', 'array-contains', studentId).get();
  return snap.docs.map(toGroup);
}

module.exports = { create, getById, update, remove, listAll, getMapByIds, listByStudentId };
