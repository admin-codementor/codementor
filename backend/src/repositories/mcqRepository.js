// MCQ / aptitude tests — Firestore only. Nothing else references mcq_tests(id).
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('mcqTests');
const questionsCol = (testId) => col().doc(testId).collection('questions');
const attemptsCol = (testId) => col().doc(testId).collection('attempts');

const toTest = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toTest(await col().doc(id).get());
}

async function update(id, partial) {
  await col().doc(id).set(partial, { merge: true });
}

async function remove(id) {
  const [questions, attempts] = await Promise.all([questionsCol(id).get(), attemptsCol(id).get()]);
  const batch = db.batch();
  questions.docs.forEach((d) => batch.delete(d.ref));
  attempts.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(col().doc(id));
  await batch.commit();
}

async function listAll() {
  const snap = await col().get();
  return snap.docs.map(toTest);
}

async function listByFaculty(facultyId) {
  const snap = await col().where('facultyId', '==', facultyId).get();
  return snap.docs.map(toTest);
}

async function listPublished() {
  const snap = await col().where('isPublished', '==', true).get();
  return snap.docs.map(toTest);
}

async function replaceQuestions(testId, questions) {
  const existing = await questionsCol(testId).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  questions.forEach((q, i) => {
    batch.set(questionsCol(testId).doc(), {
      questionText: q.question_text, options: q.options, correctIndex: q.correct_index,
      marks: q.marks, topic: q.topic, explanation: q.explanation, position: i,
    });
  });
  await batch.commit();
}

async function getQuestions(testId) {
  const snap = await questionsCol(testId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

async function getQuestionCount(testId) {
  const snap = await questionsCol(testId).count().get();
  return snap.data().count;
}

async function getAttempt(testId, userId) {
  const doc = await attemptsCol(testId).doc(userId).get();
  return doc.exists ? { userId, ...doc.data() } : null;
}

async function startAttempt(testId, userId) {
  const ref = attemptsCol(testId).doc(userId);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({ startedAt: FieldValue.serverTimestamp(), submittedAt: null, score: null, total: null, responses: {} });
  }
}

async function submitAttempt(testId, userId, { score, total, responses }) {
  await attemptsCol(testId).doc(userId).set({
    submittedAt: FieldValue.serverTimestamp(), score, total, responses,
  }, { merge: true });
}

async function listSubmittedAttempts(testId) {
  const snap = await attemptsCol(testId).get();
  return snap.docs
    .map((d) => ({ userId: d.id, ...d.data() }))
    .filter((a) => a.submittedAt != null);
}

async function getAttemptCount(testId) {
  return (await listSubmittedAttempts(testId)).length;
}

module.exports = {
  create, getById, update, remove, listAll, listByFaculty, listPublished,
  replaceQuestions, getQuestions, getQuestionCount,
  getAttempt, startAttempt, submitAttempt, listSubmittedAttempts, getAttemptCount,
};
