// Per-student topic mastery (solved/failed/hint counts) — Firestore only.
// Doc ID is `${userId}_${topic}` (mirrors the old (user_id, topic) PK).
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('topicMastery');
const docId = (userId, topic) => `${userId}_${topic}`;

async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function recordAttempt(userId, topic, { solved, hintUsed }) {
  const ref = col().doc(docId(userId, topic));
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const cur = doc.exists ? doc.data() : { userId, topic, solvedCount: 0, failedCount: 0, hintUsageCount: 0 };
    if (solved) cur.solvedCount = (cur.solvedCount || 0) + 1;
    else cur.failedCount = (cur.failedCount || 0) + 1;
    if (hintUsed) cur.hintUsageCount = (cur.hintUsageCount || 0) + 1;
    tx.set(ref, cur, { merge: true });
  });
}

module.exports = { listByUser, recordAttempt };
