// Per-student topic mastery (solved/failed/hint counts) — Firestore only.
// Doc ID is `${userId}_${topic}` (mirrors the old (user_id, topic) PK).
const { db } = require('../config/firestore');
const { applyAttempt } = require('../utils/topicMastery');

const col = () => db.collection('topicMastery');
const docId = (userId, topic) => `${userId}_${topic}`;

async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function recordAttempt(userId, topic, { solved, hintUsed, problemId }) {
  const ref = col().doc(docId(userId, topic));
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    tx.set(ref, applyAttempt(doc.exists ? doc.data() : null, { userId, topic, solved, hintUsed, problemId }), { merge: true });
  });
}

module.exports = { listByUser, recordAttempt };
