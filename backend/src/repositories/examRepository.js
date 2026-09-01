// Multi-section timed exams — Firestore only. Separate from mcqTests
// (aptitude/practice tests), which stays untouched: an exam composes one or more
// sections, each either an MCQ question bank or a set of references into the
// existing `problems` collection for a coding section.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('exams');
const sectionsCol = (examId) => col().doc(examId).collection('sections');
const questionsCol = (examId, sectionId) => sectionsCol(examId).doc(sectionId).collection('questions');
const attemptsCol = (examId) => col().doc(examId).collection('attempts');

const toExam = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);
const toSection = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

// ── Exam ─────────────────────────────────────────────────────────────────────
async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toExam(await col().doc(id).get());
}

async function update(id, partial) {
  await col().doc(id).set(partial, { merge: true });
}

// Cascades through sections → each section's questions, and attempts, batched
// like mcqRepository.remove — nothing is left orphaned.
async function remove(id) {
  const sections = await sectionsCol(id).get();
  const questionSnaps = await Promise.all(
    sections.docs.map((s) => questionsCol(id, s.id).get())
  );
  const attempts = await attemptsCol(id).get();

  const batch = db.batch();
  questionSnaps.forEach((snap) => snap.docs.forEach((d) => batch.delete(d.ref)));
  sections.docs.forEach((d) => batch.delete(d.ref));
  attempts.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(col().doc(id));
  await batch.commit();
}

async function listAll() {
  const snap = await col().get();
  return snap.docs.map(toExam);
}

async function listByFaculty(facultyId) {
  const snap = await col().where('facultyId', '==', facultyId).get();
  return snap.docs.map(toExam);
}

async function listPublished() {
  const snap = await col().where('isPublished', '==', true).get();
  return snap.docs.map(toExam);
}

// ── Sections ─────────────────────────────────────────────────────────────────
async function createSection(examId, data) {
  const ref = sectionsCol(examId).doc();
  await ref.set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return toSection(await ref.get());
}

async function getSections(examId) {
  const snap = await sectionsCol(examId).get();
  return snap.docs.map(toSection).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function getSection(examId, sectionId) {
  return toSection(await sectionsCol(examId).doc(sectionId).get());
}

async function updateSection(examId, sectionId, partial) {
  await sectionsCol(examId).doc(sectionId).set(partial, { merge: true });
}

async function deleteSection(examId, sectionId) {
  const questions = await questionsCol(examId, sectionId).get();
  const batch = db.batch();
  questions.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(sectionsCol(examId).doc(sectionId));
  await batch.commit();
}

async function reorderSections(examId, orderedIds) {
  const batch = db.batch();
  orderedIds.forEach((sid, i) => batch.set(sectionsCol(examId).doc(sid), { order: i }, { merge: true }));
  await batch.commit();
}

async function getSectionCount(examId) {
  const snap = await sectionsCol(examId).count().get();
  return snap.data().count;
}

// ── Section questions (mcq sections only) ───────────────────────────────────
async function replaceSectionQuestions(examId, sectionId, questions) {
  const existing = await questionsCol(examId, sectionId).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  questions.forEach((q, i) => {
    batch.set(questionsCol(examId, sectionId).doc(), {
      questionText: q.question_text, options: q.options, correctIndex: q.correct_index,
      marks: q.marks, topic: q.topic, explanation: q.explanation,
      negativeMarks: q.negative_marks ?? null, position: i,
    });
  });
  await batch.commit();
}

async function getSectionQuestions(examId, sectionId) {
  const snap = await questionsCol(examId, sectionId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

async function getSectionQuestionCount(examId, sectionId) {
  const snap = await questionsCol(examId, sectionId).count().get();
  return snap.data().count;
}

// ── Attempts ─────────────────────────────────────────────────────────────────
async function getAttempt(examId, userId) {
  const doc = await attemptsCol(examId).doc(userId).get();
  return doc.exists ? { userId, ...doc.data() } : null;
}

// windowExpiresAt is computed by the caller (now + exam.durationMinutes) and
// persisted here — the clock must be server-side because a coding-section
// handoff means the student navigates away from the exam page and back.
async function startAttempt(examId, userId, windowExpiresAt) {
  const ref = attemptsCol(examId).doc(userId);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      startedAt: FieldValue.serverTimestamp(),
      windowExpiresAt,
      submittedAt: null,
      score: null,
      total: null,
      questionState: {},
      codingState: {},
    });
  }
  return getAttempt(examId, userId);
}

// Dot-path field updates so concurrent per-question saves never clobber
// siblings under the same questionState/codingState map — unlike
// set(..., {merge:true}) this is unambiguous about touching only this one leaf.
async function patchQuestionState(examId, userId, questionId, patch) {
  await attemptsCol(examId).doc(userId).update({
    [`questionState.${questionId}`]: patch,
  });
}

async function recordCodingAnswer(examId, userId, problemId, patch) {
  await attemptsCol(examId).doc(userId).update({
    [`codingState.${problemId}`]: patch,
  });
}

async function finishAttempt(examId, userId, { score, total }) {
  await attemptsCol(examId).doc(userId).set({
    submittedAt: FieldValue.serverTimestamp(), score, total,
  }, { merge: true });
}

async function listSubmittedAttempts(examId) {
  const snap = await attemptsCol(examId).get();
  return snap.docs
    .map((d) => ({ userId: d.id, ...d.data() }))
    .filter((a) => a.submittedAt != null);
}

async function getAttemptCount(examId) {
  return (await listSubmittedAttempts(examId)).length;
}

module.exports = {
  create, getById, update, remove, listAll, listByFaculty, listPublished,
  createSection, getSections, getSection, updateSection, deleteSection, reorderSections, getSectionCount,
  replaceSectionQuestions, getSectionQuestions, getSectionQuestionCount,
  getAttempt, startAttempt, patchQuestionState, recordCodingAnswer, finishAttempt,
  listSubmittedAttempts, getAttemptCount,
};
