// Contest rating history — Firestore only. Nothing references rating_history(id).
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('ratingHistory');

async function create({ userId, contestId, oldRating, newRating, rank }) {
  await col().add({ userId, contestId, oldRating, newRating, rank, createdAt: FieldValue.serverTimestamp() });
}

async function listByUser(userId) {
  // Sorted in JS rather than via .orderBy() to avoid needing a composite
  // Firestore index for (userId ==, createdAt asc).
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
}

async function countByContest(contestId) {
  const snap = await col().where('contestId', '==', contestId).count().get();
  return snap.data().count;
}

module.exports = { create, listByUser, countByContest };
