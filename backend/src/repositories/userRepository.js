// Basic user-profile storage — Firestore is the source of truth for identity
// and profile fields (name, email, role, department, section, year, rollNo,
// permissions). Students live in `students`, everyone else (faculty/hod/admin)
// in `faculty`. Doc ID equals the legacy Postgres `users.id` UUID so existing
// FK-referencing tables still in Postgres (code_submissions, plagiarism_results, etc.) keep working
// unchanged — Postgres still holds a minimal stub row for those FKs, but is
// never read here for profile data.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const COLLECTIONS = { student: 'students', faculty: 'faculty', hod: 'faculty', admin: 'faculty' };
const ALL_COLLECTIONS = ['students', 'faculty'];

const collectionFor = (role) => COLLECTIONS[role] || 'students';

const toUser = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function getById(id, role) {
  if (role) {
    const doc = await db.collection(collectionFor(role)).doc(id).get();
    return toUser(doc);
  }
  for (const col of ALL_COLLECTIONS) {
    const doc = await db.collection(col).doc(id).get();
    if (doc.exists) return toUser(doc);
  }
  return null;
}

async function getByFirebaseUid(uid) {
  for (const col of ALL_COLLECTIONS) {
    const snap = await db.collection(col).where('firebaseUid', '==', uid).limit(1).get();
    if (!snap.empty) return toUser(snap.docs[0]);
  }
  return null;
}

async function getByEmail(email) {
  for (const col of ALL_COLLECTIONS) {
    const snap = await db.collection(col).where('email', '==', email).limit(1).get();
    if (!snap.empty) return toUser(snap.docs[0]);
  }
  return null;
}

async function create(id, data) {
  const col = collectionFor(data.role);
  await db.collection(col).doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id, data.role);
}

async function update(id, role, partial) {
  await db.collection(collectionFor(role)).doc(id).set(partial, { merge: true });
}

async function listByRole(role) {
  const snap = await db.collection(collectionFor(role)).get();
  return snap.docs.map(toUser);
}

// Map(id -> user) for hydrating Postgres aggregate query results in application code.
async function getMapByRole(role) {
  const users = await listByRole(role);
  return new Map(users.map((u) => [u.id, u]));
}

async function getAllUsersMap() {
  const [students, faculty] = await Promise.all([listByRole('student'), listByRole('faculty')]);
  return new Map([...students, ...faculty].map((u) => [u.id, u]));
}

module.exports = {
  collectionFor,
  getById,
  getByFirebaseUid,
  getByEmail,
  create,
  update,
  listByRole,
  getMapByRole,
  getAllUsersMap,
};
