// Direct-message threads — Firestore only.
//
//   messageThreads/{id}              the conversation (id = the two user ids, sorted, joined)
//   messageThreads/{id}/messages/*   plain-text messages
//
// One thread per pair of people, so a second "start a conversation" reuses it
// instead of creating a duplicate. Sending runs in a transaction so the rule
// "staff get one opening message until the student accepts" cannot be raced.
const { db } = require('../config/firestore');
const { canSend, preview } = require('../utils/messages');

const col = () => db.collection('messageThreads');
const msgs = (id) => col().doc(id).collection('messages');
const toThread = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

const pairId = (a, b) => [a, b].sort().join('_');

async function getById(id) {
  return toThread(await col().doc(id).get());
}

/** @returns {Promise<{thread: object, created: boolean}>} */
async function createOrGet(data) {
  const id = pairId(data.participants[0], data.participants[1]);
  return db.runTransaction(async (tx) => {
    const ref = col().doc(id);
    const snap = await tx.get(ref);
    if (snap.exists) return { thread: toThread(snap), created: false };
    tx.set(ref, data);
    return { thread: { id, ...data }, created: true };
  });
}

async function listForUser(userId) {
  const snap = await col().where('participants', 'array-contains', userId).get();
  return snap.docs.map(toThread).sort((a, b) => (b.lastMessageAtMs ?? 0) - (a.lastMessageAtMs ?? 0));
}

async function listReported() {
  const snap = await col().where('isReported', '==', true).get();
  return snap.docs.map(toThread).sort((a, b) => (b.reported?.atMs ?? 0) - (a.reported?.atMs ?? 0));
}

/** Oldest first, capped at the most recent `limit`. */
async function listMessages(id, limit = 200) {
  const snap = await msgs(id).orderBy('createdAtMs', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
}

/**
 * Add a message if the rules allow it right now.
 * @returns {Promise<{ok: true, message: object} | {error: string, status: number}>}
 */
async function addMessage(threadId, senderId, body, now) {
  return db.runTransaction(async (tx) => {
    const ref = col().doc(threadId);
    const thread = toThread(await tx.get(ref));
    const verdict = canSend({ thread, senderId });
    if (verdict.error) return verdict;

    const message = { senderId, body, createdAtMs: now };
    const msgRef = msgs(threadId).doc();
    tx.set(msgRef, message);
    const senderIsStudent = thread.studentId === senderId;
    tx.update(ref, {
      lastMessageAtMs: now, lastMessageBy: senderId, lastPreview: preview(body),
      reads: { ...(thread.reads || {}), [senderId]: now },
      ...(thread.studentId && !senderIsStudent ? { staffMessages: (thread.staffMessages || 0) + 1 } : {}),
      ...(verdict.activates ? { status: 'active' } : {}),
    });
    return { ok: true, message: { id: msgRef.id, ...message } };
  });
}

async function update(id, patch) {
  await col().doc(id).update(patch);
}

async function markRead(id, userId, now) {
  await db.runTransaction(async (tx) => {
    const ref = col().doc(id);
    const thread = toThread(await tx.get(ref));
    if (thread) tx.update(ref, { reads: { ...(thread.reads || {}), [userId]: now } });
  });
}

module.exports = { pairId, getById, createOrGet, listForUser, listReported, listMessages, addMessage, update, markRead };
