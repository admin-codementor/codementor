// Per-student "problems solved" record — Firestore only. Document id = the student's id.
//
// Why it exists: the ranking used to be rebuilt by reading every Accepted submission of every student. With this record the same
// table is built from one small document per student (about 3000 reads instead of hundreds of thousands).
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');
const { applySolve, mergeSolved } = require('../utils/solvedStats');

const col = () => db.collection('studentStats');
// Set to done by scripts/backfill-student-stats.js once every existing student's record has been built. Until then the ranking keeps
// using the old (slower) scan, so a half-built set of records can never produce a wrong rank.
const flagRef = () => db.collection('collegeSettings').doc('studentStatsBackfill');

/** Record one Accepted. Returns true when it was the student's first Accepted on that problem. */
async function recordSolve(userId, problemId) {
  const ref = col().doc(userId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const { next, isNew } = applySolve(doc.exists ? doc.data() : null, problemId);
    if (isNew) tx.set(ref, { userId, ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return isNew;
  });
}

/** Add many solved problems for one student (backfill / re-check). Safe while the student is still solving. */
async function recordSolves(userId, problemIds) {
  const ref = col().doc(userId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const next = mergeSolved(doc.exists ? doc.data() : null, problemIds);
    tx.set(ref, { userId, ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next.solvedCount;
  });
}

/** { userId: solvedCount } for every student that has a record. Only the counter is downloaded, not the id list. */
async function listCounts() {
  const snap = await col().select('solvedCount').get();
  const out = {};
  for (const d of snap.docs) out[d.id] = d.data().solvedCount || 0;
  return out;
}

async function isBackfilled() {
  const d = await flagRef().get();
  return d.exists && d.data()?.done === true;
}

async function markBackfilled(info = {}) {
  await flagRef().set({ done: true, at: FieldValue.serverTimestamp(), ...info }, { merge: true });
}

module.exports = { recordSolve, recordSolves, listCounts, isBackfilled, markBackfilled };
