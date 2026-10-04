// A student's private note on a problem they haven't solved yet ("forgot the
// empty-array case"). Visible only to its author — faculty analytics never read
// this collection.
//
// Doc ID is `${userId}_${problemId}`, mirroring topicMasteryRepository, so a
// note is a single get/set with no query or composite index.
const { db } = require('../config/firestore');

const col = () => db.collection('mistakeNotes');
const docId = (userId, problemId) => `${userId}_${problemId}`;

async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Upserts the note. An empty string deletes it rather than storing a blank. */
async function set(userId, problemId, note) {
  const ref = col().doc(docId(userId, problemId));
  if (!note) {
    await ref.delete().catch(() => {});
    return null;
  }
  const row = { userId, problemId: String(problemId), note, updatedAt: new Date() };
  await ref.set(row, { merge: true });
  return row;
}

module.exports = { listByUser, set };
