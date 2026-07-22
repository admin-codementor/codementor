// AI tutor conversation history — Firestore only.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('aiTutorConversations');

async function addMessage({ userId, problemId, role, content }) {
  await col().add({ userId, problemId, role, content, createdAt: FieldValue.serverTimestamp() });
}

async function getHistory(userId, problemId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.problemId === problemId)
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
}

module.exports = { addMessage, getHistory };
