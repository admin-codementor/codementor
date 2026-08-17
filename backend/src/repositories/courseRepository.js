// Course catalog storage — Firestore only. Nothing else in the Postgres
// schema references courses/course_modules/module_problems, so unlike
// problems there is no FK-stub requirement here; this table can move over
// cleanly with no Postgres residue at all.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('courses');
const modulesCol = (courseId) => col().doc(courseId).collection('modules');

const toCourse = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function listPublished() {
  const snap = await col().where('isPublished', '==', true).get();
  return snap.docs.map(toCourse).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

// Faculty management view — draft and published alike, since a faculty member
// needs to see (and finish) a course before it's ready to publish.
async function listAll() {
  const snap = await col().get();
  return snap.docs.map(toCourse).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

async function getById(id) {
  return toCourse(await col().doc(id).get());
}

async function getModules(courseId) {
  const snap = await modulesCol(courseId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function update(id, data) {
  await col().doc(id).set(data, { merge: true });
  return getById(id);
}

async function addModule(courseId, data) {
  const id = uuidv4();
  await modulesCol(courseId).doc(id).set(data);
  return { id, ...data };
}

async function updateModule(courseId, moduleId, data) {
  await modulesCol(courseId).doc(moduleId).set(data, { merge: true });
  const doc = await modulesCol(courseId).doc(moduleId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function deleteModule(courseId, moduleId) {
  await modulesCol(courseId).doc(moduleId).delete();
}

// Wipes every course and its modules subcollection. Firestore doesn't cascade
// subcollection deletes on its own, so each course's modules are deleted
// first. Used by the seed script's "safe to re-run" reset — not exposed to
// any authenticated route.
async function removeAll() {
  const snap = await col().get();
  for (const doc of snap.docs) {
    const modSnap = await modulesCol(doc.id).get();
    await Promise.all(modSnap.docs.map((m) => m.ref.delete()));
    await doc.ref.delete();
  }
}

module.exports = {
  listPublished, listAll, getById, getModules, create, update, addModule, updateModule, deleteModule, removeAll,
};
