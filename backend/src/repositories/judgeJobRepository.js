// Async-judging progress — Firestore only. One doc per in-flight (or
// recently-completed) submission, keyed by the same jobId the client polls
// with. Replaces the old in-memory BullMQ job state now that judging is a
// series of independent, stateless HTTP requests (see judgeService.js) —
// each poll needs somewhere durable to pick up exactly where the last one
// left off.
//
// Every write stamps `touchedAtMs`, and a new job stamps `createdAtMs`: the reaper (services/judgeReaper.js) uses them to find jobs that
// stopped moving (a student closed the tab, the judge went quiet) and to give up on one that has been open too long.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('judgeJobs');
const dead = () => db.collection('judgeDeadLetters');
const keys = () => db.collection('submitKeys');

const toJob = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(jobId, data) {
  const now = Date.now();
  await col().doc(jobId).set({ ...data, createdAtMs: now, touchedAtMs: now, createdAt: FieldValue.serverTimestamp() });
  return getById(jobId);
}

async function getById(jobId) {
  return toJob(await col().doc(jobId).get());
}

async function update(jobId, partial) {
  await col().doc(jobId).set({ ...partial, touchedAtMs: Date.now() }, { merge: true });
  return getById(jobId);
}

/** Jobs that are not finished. A single-field `in` query, so no composite index. */
async function listOpen(limit = 200) {
  const snap = await col().where('phase', 'in', ['single', 'tests', 'checker']).limit(limit).get();
  return snap.docs.map(toJob);
}

/** Keeps a job that was given up on, with why, so the Admin can see it. */
async function addDeadLetter(jobId, entry) {
  await dead().doc(jobId).set({ ...entry, jobId, atMs: Date.now() });
}
async function listDeadLetters(sinceMs = 0, limit = 100) {
  const snap = await dead().where('atMs', '>=', sinceMs).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.atMs - a.atMs).slice(0, limit);
}

/**
 * Remembers that a person's submission with this key was already accepted. The first call wins (`create` fails if the document exists),
 * so two clicks, a double tap or a retry after a lost answer can never start two jobs. Returns the job id that won.
 */
async function claimSubmitKey(userId, key, jobId) {
  const ref = keys().doc(`${userId}_${key}`);
  try {
    await ref.create({ userId, key, jobId, atMs: Date.now() });
    return { jobId, duplicate: false };
  } catch (e) {
    const existing = await ref.get();
    if (existing.exists) return { jobId: existing.data().jobId, duplicate: true };
    throw e;
  }
}
async function releaseSubmitKey(userId, key) {
  await keys().doc(`${userId}_${key}`).delete().catch(() => {});
}
/** Removes submit keys older than `keysBefore` and FINISHED jobs untouched since `jobsBefore` (ms). Returns how many went. */
async function pruneOld(keysBefore, jobsBefore, max = 300) {
  let n = 0;
  const k = await keys().where('atMs', '<', keysBefore).limit(max).get();
  if (!k.empty) {
    const batch = db.batch();
    k.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += k.size;
  }
  const j = await col().where('touchedAtMs', '<', jobsBefore).limit(max).get();
  const finished = j.docs.filter((d) => d.data().phase === 'done');
  if (finished.length) {
    const batch = db.batch();
    finished.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    n += finished.length;
  }
  return n;
}

module.exports = { create, getById, update, listOpen, addDeadLetter, listDeadLetters, claimSubmitKey, releaseSubmitKey, pruneOld };
