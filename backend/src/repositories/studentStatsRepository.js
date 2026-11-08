// Per-student "problems solved" record — Firestore only. Document id = the student's id.
//
// Why it exists: the ranking used to be rebuilt by reading every Accepted submission of every student. With this record the same
// table is built from one small document per student (about 3000 reads instead of hundreds of thousands).
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');
const { applyAttempt, mergeBackfill } = require('../utils/solvedStats');

const col = () => db.collection('studentStats');
// Set to done by scripts/backfill-student-stats.js once every existing student's record has been built. Until then the ranking keeps
// using the old (slower) scan, so a half-built set of records can never produce a wrong rank.
const flagRef = () => db.collection('collegeSettings').doc('studentStatsBackfill');

/** Record one judged attempt (any verdict). Returns true when it was the student's first Accepted on that problem. */
async function recordAttempt(userId, problemId, accepted) {
  const ref = col().doc(userId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const { next, isNew } = applyAttempt(doc.exists ? doc.data() : null, { problemId, accepted });
    tx.set(ref, { userId, ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return isNew;
  });
}

/** Fold the scan of existing submissions into one student's record (backfill / re-check). Safe while the student is still solving. */
async function recordBackfill(userId, scan) {
  const ref = col().doc(userId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const next = mergeBackfill(doc.exists ? doc.data() : null, scan);
    tx.set(ref, { userId, ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next.solvedCount;
  });
}

/** One student's record, or null. */
async function get(userId) {
  const d = await col().doc(userId).get();
  return d.exists ? d.data() : null;
}

/** { userId: {solved, total, accepted} } for every student that has a record. Only the three counters are downloaded. */
async function listAggregates() {
  const snap = await col().select('solvedCount', 'totalSubmissions', 'acceptedSubmissions').get();
  const out = {};
  for (const d of snap.docs) {
    const v = d.data();
    out[d.id] = { solved: v.solvedCount || 0, total: v.totalSubmissions || 0, accepted: v.acceptedSubmissions || 0 };
  }
  return out;
}

async function isBackfilled() {
  const d = await flagRef().get();
  return d.exists && d.data()?.done === true;
}

async function markBackfilled(info = {}) {
  await flagRef().set({ done: true, at: FieldValue.serverTimestamp(), ...info }, { merge: true });
}

module.exports = { recordAttempt, recordBackfill, get, listAggregates, isBackfilled, markBackfilled };
