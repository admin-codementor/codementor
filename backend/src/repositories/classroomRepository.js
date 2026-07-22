// Classrooms — Firestore only. Nothing else in the Postgres schema
// references classrooms(id) anymore once this phase lands, so no FK-stub
// is needed here (unlike users/problems, which still have not-yet-migrated
// Postgres dependents at earlier phases).
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('classrooms');
const membersCol = (classroomId) => col().doc(classroomId).collection('members');

const toClassroom = (doc) => (doc.exists ? { id: doc.id, ...doc.data() } : null);

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getById(id);
}

async function getById(id) {
  return toClassroom(await col().doc(id).get());
}

async function getByJoinCode(code) {
  const snap = await col().where('joinCode', '==', code).limit(1).get();
  return snap.empty ? null : toClassroom(snap.docs[0]);
}

async function isJoinCodeTaken(code) {
  const snap = await col().where('joinCode', '==', code).limit(1).get();
  return !snap.empty;
}

async function listByFacultyId(facultyId) {
  const snap = await col().where('facultyId', '==', facultyId).get();
  return snap.docs.map(toClassroom).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}

async function listByStudentId(studentId) {
  // Membership subcollections are per-classroom, so we scan the (small)
  // classrooms collection and check each — fine at this app's scale.
  const all = await col().get();
  const results = [];
  for (const doc of all.docs) {
    const memberDoc = await membersCol(doc.id).doc(studentId).get();
    if (memberDoc.exists) {
      results.push({ id: doc.id, ...doc.data(), joinedAt: memberDoc.data().joinedAt });
    }
  }
  return results.sort((a, b) => (b.joinedAt?.toMillis?.() ?? 0) - (a.joinedAt?.toMillis?.() ?? 0));
}

async function addMember(classroomId, userId) {
  await membersCol(classroomId).doc(userId).set({ joinedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function getMemberCount(classroomId) {
  const snap = await membersCol(classroomId).count().get();
  return snap.data().count;
}

async function listMembers(classroomId) {
  const snap = await membersCol(classroomId).get();
  return snap.docs.map((d) => ({ userId: d.id, joinedAt: d.data().joinedAt }));
}

module.exports = {
  create, getById, getByJoinCode, isJoinCodeTaken, listByFacultyId, listByStudentId,
  addMember, getMemberCount, listMembers,
};
