// Plagiarism detection results — Firestore only.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('plagiarismResults');

const toResult = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function replaceForAssignment(assignmentId, pairs) {
  const existing = await col().where('assignmentId', '==', assignmentId).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  pairs.forEach((p) => {
    batch.set(col().doc(), { ...p, assignmentId, ranAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

async function listByAssignment(assignmentId) {
  const snap = await col().where('assignmentId', '==', assignmentId).get();
  return snap.docs.map(toResult).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
}

async function getById(id) {
  return toResult(await col().doc(id).get());
}

// Every stored pair, reduced to who and how similar. Full-collection scan: only
// call from a cached aggregate (see services/courseAnalyticsService.js).
async function listAllPairs() {
  const snap = await col().select('studentA', 'studentB', 'similarity').get();
  return snap.docs.map((d) => d.data());
}

module.exports = { replaceForAssignment, listByAssignment, getById, listAllPairs };
