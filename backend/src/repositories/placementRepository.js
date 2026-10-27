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

// ── CGPA and backlog records: one document per student, kept apart from the student profile so that no profile endpoint can leak them ──
const records = () => db.collection('placementRecords');
const batches = () => db.collection('placementRecordBatches');
const outside = () => db.collection('placementOutside');

async function listRecords() {
  const snap = await records().get();
  return new Map(snap.docs.map((d) => [d.id, d.data()]));
}
async function getRecord(studentId) {
  const d = await records().doc(studentId).get();
  return d.exists ? d.data() : null;
}
/** Writes records in chunks of 400 (a Firestore batch holds at most 500 writes). `items`: {studentId, data | null (delete)}. */
async function writeRecords(items) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    for (const it of items.slice(i, i + 400)) {
      if (it.data == null) batch.delete(records().doc(it.studentId));
      else batch.set(records().doc(it.studentId), it.data);
    }
    await batch.commit();
  }
}
async function createBatch(id, data) {
  await batches().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return id;
}
async function listBatches() {
  const snap = await batches().get();
  return snap.docs.map(toDoc).sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
}
async function getBatch(id) { return toDoc(await batches().doc(id).get()); }
async function updateBatch(id, partial) { await batches().doc(id).set(partial, { merge: true }); }

// ── applications made outside the portal, recorded by T&P ──
async function listOutside() {
  return (await outside().get()).docs.map(toDoc).sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
}
async function listOutsideByStudent(studentId) {
  return (await outside().where('studentId', '==', studentId).get()).docs.map(toDoc);
}
async function getOutside(id) { return toDoc(await outside().doc(id).get()); }
async function createOutside(data) {
  const id = uuidv4();
  await outside().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getOutside(id);
}
async function updateOutside(id, partial) {
  await outside().doc(id).set({ ...partial, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getOutside(id);
}
async function removeOutside(id) { await outside().doc(id).delete(); }

async function listApplicationsByStudent(studentId) {
  return (await apps().where('studentId', '==', studentId).get()).docs.map(toDoc);
}

module.exports = {
  ...module.exports,
  listRecords, getRecord, writeRecords, createBatch, listBatches, getBatch, updateBatch,
  listOutside, listOutsideByStudent, getOutside, createOutside, updateOutside, removeOutside, listApplicationsByStudent,
};
