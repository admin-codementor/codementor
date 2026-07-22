// Third-party coding-platform links (LeetCode/Codeforces/etc.) — Firestore
// only. Doc ID is `${userId}_${platform}` (mirrors the old (user_id, platform)
// unique constraint). Nothing else references this table's rows.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('codingProfiles');
const docId = (userId, platform) => `${userId}_${platform}`;

async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.platform.localeCompare(b.platform));
}

async function upsert(userId, platform, data) {
  await col().doc(docId(userId, platform)).set(
    { userId, platform, ...data, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function remove(userId, platform) {
  await col().doc(docId(userId, platform)).delete();
}

async function listAll() {
  const snap = await col().get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { listByUser, upsert, remove, listAll };
