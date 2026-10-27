// Exam integrity evidence: ONE document per attempt, `examIntegrity/{examId}_{userId}`, holding the newest events, the counts, and which
// mails went out. Written only by the server (utils/examIntegrity.js decides what is evidence); read only by staff.
const { db } = require('../config/firestore');
const { applyEvidence } = require('../utils/examIntegrity');

const col = () => db.collection('examIntegrity');
const docId = (examId, userId) => `${examId}_${userId}`;

/**
 * Add one piece of evidence in a transaction (two events at the same moment cannot both claim "the first, so mail it").
 * @returns {Promise<{record: object, email: boolean}>}
 */
async function record(examId, userId, { type, detail, now = Date.now() }) {
  const ref = col().doc(docId(examId, userId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const out = applyEvidence(snap.exists ? snap.data() : null, { examId, userId, type, detail, now });
    tx.set(ref, out.record);
    return out;
  });
}

async function get(examId, userId) {
  const snap = await col().doc(docId(examId, userId)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function listForExam(examId) {
  const snap = await col().where('examId', '==', examId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** What happened to the mails for one kind of evidence: { status: 'sent'|'failed'|'not_configured', at, recipients }. */
async function setMailStatus(examId, userId, type, status) {
  await col().doc(docId(examId, userId)).set({ mail: { [type]: status } }, { merge: true });
}

module.exports = { record, get, listForExam, setMailStatus, docId };
