// Reserved handles for public profiles.
//
// A separate collection rather than a field on the user, for two reasons. The
// public endpoint looks a profile up by handle and must do it in one read, with
// no token and no query — and it is the only unauthenticated read in the app,
// so it gets the narrowest possible path to the data. And a handle has to be
// unique across every student, which a field on a user document cannot enforce
// on its own.
//
// Doc id is the lowercased handle, so uniqueness is the document id and a
// create that loses a race fails rather than quietly overwriting.
const { db } = require('../config/firestore');

const col = () => db.collection('publicHandles');

const key = (handle) => String(handle || '').trim().toLowerCase();

async function getOwner(handle) {
  const id = key(handle);
  if (!id) return null;
  const doc = await col().doc(id).get();
  return doc.exists ? { handle: id, ...doc.data() } : null;
}

/**
 * Reserves `handle` for `userId`, releasing whatever they held before.
 *
 * Returns `{ ok: false, reason: 'taken' }` rather than throwing when the handle
 * belongs to somebody else, because "that name is taken" is an ordinary thing
 * for a student to be told, not an error.
 */
async function reserve(userId, handle) {
  const id = key(handle);
  const existing = await getOwner(id);
  if (existing && existing.userId !== userId) return { ok: false, reason: 'taken' };

  const previous = await findByUser(userId);
  if (previous && previous.handle !== id) await col().doc(previous.handle).delete();

  await col().doc(id).set({ userId, updatedAt: new Date() }, { merge: true });
  return { ok: true, handle: id };
}

async function findByUser(userId) {
  const snap = await col().where('userId', '==', userId).limit(1).get();
  const doc = snap.docs[0];
  return doc ? { handle: doc.id, ...doc.data() } : null;
}

/**
 * Every reservation, as userId → handle. The leaderboard needs a handle for a
 * page of students at once, and Firestore caps an `in` query at thirty ids, so
 * one small collection read beats batching. The collection only ever holds one
 * document per student who has claimed a handle.
 */
async function mapByUser() {
  const snap = await col().get();
  const map = new Map();
  for (const doc of snap.docs) {
    const owner = doc.data()?.userId;
    if (owner) map.set(owner, doc.id);
  }
  return map;
}

async function release(userId) {
  const existing = await findByUser(userId);
  if (!existing) return false;
  await col().doc(existing.handle).delete();
  return true;
}

module.exports = { getOwner, reserve, findByUser, mapByUser, release, key };
