// Proctor events — Firestore only. Nothing references proctor_events(id).
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('proctorEvents');

async function create({ userId, assignmentId, problemId, eventType, detail }) {
  await col().add({
    userId, assignmentId: assignmentId || null, problemId: problemId || null,
    eventType, detail: detail || null, createdAt: FieldValue.serverTimestamp(),
  });
}

async function listByAssignment(assignmentId) {
  const snap = await col().where('assignmentId', '==', assignmentId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { create, listByAssignment };
