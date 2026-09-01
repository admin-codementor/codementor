// Proctor events — Firestore only. Nothing references proctor_events(id).
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('proctorEvents');

async function create({ userId, assignmentId, examId, problemId, eventType, detail }) {
  await col().add({
    userId, assignmentId: assignmentId || null, examId: examId || null, problemId: problemId || null,
    eventType, detail: detail || null, createdAt: FieldValue.serverTimestamp(),
  });
}

async function listByAssignment(assignmentId) {
  const snap = await col().where('assignmentId', '==', assignmentId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Two equality filters only — Firestore serves this from single-field indexes, so
// no composite index is needed (matching the convention in the other repos).
// Sorted newest-first in application code for the same reason.
async function listByUserAndType(userId, eventType) {
  const snap = await col().where('userId', '==', userId).where('eventType', '==', eventType).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

module.exports = { create, listByAssignment, listByUserAndType };
