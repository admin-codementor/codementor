// Time a student has spent on a problem, kept on the server so it follows them across devices.
// One small document per student and problem: { seconds, solvedAtSeconds, updatedAt }.
// Written about once a minute while the problem is open, so cost grows with active students, not with clicks.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('problemTimes');
const docId = (userId, problemId) => `${userId}_${problemId}`;

async function get(userId, problemId) {
  const doc = await col().doc(docId(userId, problemId)).get();
  if (!doc.exists) return { seconds: 0, solvedAtSeconds: null };
  const d = doc.data();
  return { seconds: d.seconds || 0, solvedAtSeconds: d.solvedAtSeconds ?? null };
}

// Adds `seconds` of active time. When `solved` is true and no solve time has been recorded yet, the total at that
// moment is kept as the time-to-solve, once.
async function add(userId, problemId, seconds, solved) {
  const ref = col().doc(docId(userId, problemId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : {};
    const total = (cur.seconds || 0) + seconds;
    const solvedAtSeconds = cur.solvedAtSeconds ?? (solved ? total : null);
    tx.set(ref, { userId, problemId, seconds: total, solvedAtSeconds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { seconds: total, solvedAtSeconds };
  });
}

module.exports = { get, add };
