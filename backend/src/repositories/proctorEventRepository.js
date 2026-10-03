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

// Every event, reduced to the two fields analytics needs. Full-collection scan:
// only call from a cached aggregate (see services/courseAnalyticsService.js).
async function listAllForAnalytics() {
  const snap = await col().select('userId', 'eventType').get();
  return snap.docs.map((d) => d.data());
}

// Single equality filter — served from a single-field index, no composite needed.
async function listByExam(examId) {
  const snap = await col().where('examId', '==', examId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { create, listByAssignment, listByUserAndType, listAllForAnalytics, listByExam };
