// Async-judging progress — Firestore only. One doc per in-flight (or
// recently-completed) submission, keyed by the same jobId the client polls
// with. Replaces the old in-memory BullMQ job state now that judging is a
// series of independent, stateless HTTP requests (see judgeService.js) —
// each poll needs somewhere durable to pick up exactly where the last one
// left off.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('judgeJobs');

const toJob = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(jobId, data) {
  await col().doc(jobId).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(jobId);
}

async function getById(jobId) {
  return toJob(await col().doc(jobId).get());
}

async function update(jobId, partial) {
  await col().doc(jobId).set(partial, { merge: true });
  return getById(jobId);
}

module.exports = { create, getById, update };
