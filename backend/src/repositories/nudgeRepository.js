// Reminders from staff to students. One document each. Equality-only queries, filtered and sorted in JS, so no composite index.
const { db } = require('../config/firestore');

const col = () => db.collection('nudges');
const toDoc = (d) => ({ id: d.id, ...d.data() });

/** Writes one reminder per student in a single batch. */
async function addMany(rows) {
  const batch = db.batch();
  for (const r of rows) batch.set(col().doc(), r);
  await batch.commit();
}

async function listByStudent(studentId) {
  return (await col().where('studentId', '==', studentId).get()).docs.map(toDoc);
}

async function listBySender(fromId) {
  return (await col().where('fromId', '==', fromId).get()).docs.map(toDoc);
}

/** Marks the student's unread reminders read. Returns how many changed. */
async function markAllRead(studentId, nowMs) {
  const unread = (await listByStudent(studentId)).filter((n) => !n.readAtMs);
  if (!unread.length) return 0;
  const batch = db.batch();
  for (const n of unread) batch.update(col().doc(n.id), { readAtMs: nowMs });
  await batch.commit();
  return unread.length;
}

module.exports = { addMany, listByStudent, listBySender, markAllRead };
