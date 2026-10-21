// Reopen requests — Firestore only. See utils/reopen.js for the rules.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('reopenRequests');
const toRequest = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

/** One key per thing that can be reopened, so "one pending request per student and target" is a simple filter. */
const targetKey = (r) => (r.targetType === 'assignment' ? `assignment:${r.assignmentId}` : `module:${r.courseId}:${r.moduleId}`);

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, targetKey: targetKey(data), status: 'pending', createdAt: FieldValue.serverTimestamp() });
  return toRequest(await col().doc(id).get());
}

async function getById(id) {
  return toRequest(await col().doc(id).get());
}

async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs.map(toRequest);
}

// The whole collection: small (one row per request), and staff see only the slice they may manage after filtering.
async function listAll() {
  const snap = await col().get();
  return snap.docs.map(toRequest);
}

// Approved requests for one assignment (feeds the per-student cut-off in the marks).
async function listApprovedForAssignment(assignmentId) {
  const snap = await col().where('targetKey', '==', `assignment:${assignmentId}`).get();
  return snap.docs.map(toRequest).filter((r) => r.status === 'approved');
}

async function listApprovedForUser(userId) {
  return (await listByUser(userId)).filter((r) => r.status === 'approved');
}

async function decide(id, patch) {
  await col().doc(id).set({ ...patch, decidedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getById(id);
}

module.exports = { create, getById, listByUser, listAll, listApprovedForAssignment, listApprovedForUser, decide, targetKey };
