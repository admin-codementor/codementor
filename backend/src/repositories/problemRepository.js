// Problem catalog storage — Firestore only. Doc ID is an app-generated UUID
// (kept from the earlier migration phases, when it still had to stay valid
// for not-yet-migrated Postgres FK columns) — no Postgres involvement remains.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('problems');
const testCasesCol = (problemId) => col().doc(problemId).collection('testCases');

const toProblem = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function getAll() {
  const snap = await col().get();
  return snap.docs.map(toProblem);
}

async function getById(id) {
  const doc = await col().doc(id).get();
  return toProblem(doc);
}

async function getMapByIds(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const docs = await db.getAll(...unique.map((id) => col().doc(id)));
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, { id: d.id, ...d.data() }]));
}

async function getTestCases(problemId) {
  const snap = await testCasesCol(problemId).orderBy('createdAt', 'asc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getPublicTestCases(problemId) {
  return (await getTestCases(problemId)).filter((t) => t.isPublic);
}

async function create(data, testCases = []) {
  const id = uuidv4();
  const now = FieldValue.serverTimestamp();

  await col().doc(id).set({ ...data, createdAt: now });

  const batch = db.batch();
  testCases.forEach((tc, i) => {
    batch.set(testCasesCol(id).doc(), {
      inputData: tc.input ?? tc.inputData ?? '',
      expectedOutput: tc.output ?? tc.expected_output ?? tc.expectedOutput ?? '',
      isPublic: !!(tc.is_public ?? tc.isPublic),
      score: tc.score || 0,
      createdAt: FieldValue.serverTimestamp(),
      _order: i,
    });
  });
  if (testCases.length) await batch.commit();

  return getById(id);
}

async function update(id, partial) {
  await col().doc(id).set(partial, { merge: true });
  return getById(id);
}

async function remove(id) {
  const testCases = await testCasesCol(id).get();
  const batch = db.batch();
  testCases.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(col().doc(id));
  await batch.commit();
}

async function replaceTestCases(problemId, testCases) {
  const existing = await testCasesCol(problemId).get();
  const batch = db.batch();
  existing.docs.forEach((d) => batch.delete(d.ref));
  testCases.forEach((tc, i) => {
    batch.set(testCasesCol(problemId).doc(), {
      inputData: tc.input ?? tc.inputData ?? '',
      expectedOutput: tc.output ?? tc.expected_output ?? tc.expectedOutput ?? '',
      isPublic: !!(tc.is_public ?? tc.isPublic),
      score: tc.score || 0,
      createdAt: FieldValue.serverTimestamp(),
      _order: i,
    });
  });
  await batch.commit();
}

async function addTestCases(problemId, testCases) {
  const batch = db.batch();
  testCases.forEach((tc) => {
    batch.set(testCasesCol(problemId).doc(), {
      inputData: tc.input ?? tc.inputData ?? '',
      expectedOutput: tc.output ?? tc.expected_output ?? tc.expectedOutput ?? '',
      isPublic: !!(tc.is_public ?? tc.isPublic),
      score: tc.score || 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

module.exports = {
  getAll, getById, getMapByIds, getTestCases, getPublicTestCases,
  create, update, remove, replaceTestCases, addTestCases,
};
