// Placement drives and student applications — Firestore only.
// A drive is one document; an application is one document per (drive, student)
// with the id `${driveId}_${studentId}`, so "one application per student per
// drive" is enforced by the id rather than by a query. Equality-only queries,
// sorted in JS, so no composite index is needed.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const drives = () => db.collection('placementDrives');
const apps = () => db.collection('placementApplications');
const toDoc = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function createDrive(data) {
  const id = uuidv4();
  await drives().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getDrive(id);
}
async function getDrive(id) { return toDoc(await drives().doc(id).get()); }
async function updateDrive(id, partial) {
  await drives().doc(id).set({ ...partial, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getDrive(id);
}
async function listDrives() {
  const snap = await drives().get();
  return snap.docs.map(toDoc).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Deletes a drive and every application on it. */
async function removeDrive(id) {
  const snap = await apps().where('driveId', '==', id).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  await drives().doc(id).delete();
}

async function listApplicationsByDrive(driveId) {
  const snap = await apps().where('driveId', '==', driveId).get();
  return snap.docs.map(toDoc);
}
async function listAllApplications() {
  const snap = await apps().get();
  return snap.docs.map(toDoc);
}
// A full replace, not a merge: Firestore merges nested maps key by key, so a merge
// could never remove a round result. Callers always pass the whole application.
async function upsertApplication(driveId, studentId, data) {
  await apps().doc(`${driveId}_${studentId}`).set(
    { driveId, studentId, ...data, updatedAt: FieldValue.serverTimestamp() },
  );
}
async function removeApplication(driveId, studentId) {
  await apps().doc(`${driveId}_${studentId}`).delete();
}

module.exports = {
  createDrive, getDrive, updateDrive, listDrives, removeDrive,
  listApplicationsByDrive, listAllApplications, upsertApplication, removeApplication,
};
