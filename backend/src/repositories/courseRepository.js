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

async function addModule(courseId, data) {
  const id = uuidv4();
  await modulesCol(courseId).doc(id).set(data);
  return { id, ...data };
}

module.exports = { listPublished, getById, getModules, create, addModule };
