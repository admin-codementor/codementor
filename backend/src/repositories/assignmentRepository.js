// Assignments — Firestore only.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('assignments');

const toAssignment = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toAssignment(await col().doc(id).get());
}

async function getAll() {
  const snap = await col().get();
  return snap.docs.map(toAssignment);
}

async function listByFacultyId(facultyId) {
  const snap = await col().where('facultyId', '==', facultyId).get();
  return snap.docs.map(toAssignment);
}

module.exports = { create, getById, getAll, listByFacultyId };
