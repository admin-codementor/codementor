// Contests — Firestore only. Doc ID is an app-generated UUID (kept consistent
// with the rest of the migration even though nothing outside this domain
// references contests(id) via FK anymore — contest_problems/registrations/
// submissions/virtual_participations all move here in the same phase).
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('contests');
const registrationsCol = (contestId) => col().doc(contestId).collection('registrations');
const submissionsCol = (contestId) => col().doc(contestId).collection('submissions');
const virtualCol = (contestId) => col().doc(contestId).collection('virtualParticipations');

const toContest = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toContest(await col().doc(id).get());
}

async function update(id, partial) {
  await col().doc(id).set(partial, { merge: true });
  return getById(id);
}

async function listAll() {
  const snap = await col().get();
  return snap.docs.map(toContest);
}

async function addRegistration(contestId, userId) {
  await registrationsCol(contestId).doc(userId).set({ registeredAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function getRegistrationCount(contestId) {
  const snap = await registrationsCol(contestId).count().get();
  return snap.data().count;
}

async function isRegistered(contestId, userId) {
  const doc = await registrationsCol(contestId).doc(userId).get();
  return doc.exists;
}

async function addSubmission(contestId, data) {
  await submissionsCol(contestId).add({ ...data, submittedAt: FieldValue.serverTimestamp() });
}

async function listSubmissions(contestId) {
  const snap = await submissionsCol(contestId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listSubmissionsByUser(contestId, userId, { virtualOnly = false } = {}) {
  const all = await listSubmissions(contestId);
  return all.filter((s) => s.userId === userId && (!virtualOnly || s.isVirtual === true));
}

async function getVirtualParticipation(contestId, userId) {
  const doc = await virtualCol(contestId).doc(userId).get();
  return doc.exists ? { userId, ...doc.data() } : null;
}

async function startVirtualParticipation(contestId, userId) {
  const existing = await getVirtualParticipation(contestId, userId);
  if (existing) return existing;
  await virtualCol(contestId).doc(userId).set({ startedAt: FieldValue.serverTimestamp() });
  return getVirtualParticipation(contestId, userId);
}

module.exports = {
  create, getById, update, listAll,
  addRegistration, getRegistrationCount, isRegistered,
  addSubmission, listSubmissions, listSubmissionsByUser,
  getVirtualParticipation, startVirtualParticipation,
};
