// Per-student career preparation: the latest resume check and the last few mock interview scorecards. One small document per
// student, id = userId. The resume text itself is never stored, only the score and the advice it produced.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('careerPrep');
const KEEP_INTERVIEWS = 10;

async function get(userId) {
  const doc = await col().doc(userId).get();
  const d = doc.exists ? doc.data() : {};
  return { resume: d.resume || null, interviews: d.interviews || [] };
}

async function listAll() {
  const snap = await col().get();
  return snap.docs.map((d) => ({ userId: d.id, ...d.data() }));
}

async function saveResume(userId, resume) {
  await col().doc(userId).set({ resume: { ...resume, checkedAt: new Date() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Adds a scorecard, keeping the newest KEEP_INTERVIEWS. */
async function addInterview(userId, card) {
  const { interviews } = await get(userId);
  const next = [{ ...card, takenAt: new Date() }, ...interviews].slice(0, KEEP_INTERVIEWS);
  await col().doc(userId).set({ interviews: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return next;
}

module.exports = { get, listAll, saveResume, addInterview, KEEP_INTERVIEWS };
