// Academic structure storage (Firestore): terms, classes, enrollments, teaching assignments and access requests.
// The rules that decide anything live in utils/academic.js; this file only reads and writes.
//
//   terms/{id}                 { label, academicYear, semester, startDate, endDate, status: 'planned'|'active'|'closed' }
//   classes/{id}               { termId, kind: 'section'|'elective', department, year, section, name, classTeacherId, subMentors: [{mentorId, from, to}] }
//   enrollments/{classId_studentId}  { termId, classId, studentId, primary: boolean, source: 'auto'|'manual'|'csv', rollNo? }
//   teachingAssignments/{id}   { termId, classId, facultyId, subject, from, to|null, createdBy, endedBy? }   (ended, never deleted)
//   accessRequests/{id}        { facultyId, classId, termId, department, reason, status, requestedAt, decidedBy, decidedAt, expiresAt, note }
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const terms = () => db.collection('terms');
const classes = () => db.collection('classes');
const enrollments = () => db.collection('enrollments');
const assignments = () => db.collection('teachingAssignments');
const requests = () => db.collection('accessRequests');

const doc = (d) => (d.exists ? { id: d.id, ...d.data() } : null);
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const enrollmentId = (classId, studentId) => `${classId}_${studentId}`;

// ── terms ──
async function listTerms() { return docs(await terms().get()).sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? ''))); }
async function getTerm(id) { return doc(await terms().doc(id).get()); }
async function getActiveTerm() {
  const snap = await terms().where('status', '==', 'active').limit(1).get();
  return snap.empty ? null : doc(snap.docs[0]);
}
async function createTerm(data) {
  const id = uuidv4();
  await terms().doc(id).set({ ...data, createdAt: FieldValue.serverTimestamp() });
  return getTerm(id);
}
async function updateTerm(id, partial) { await terms().doc(id).set(partial, { merge: true }); }

// ── classes ──
async function listClasses(termId, { department } = {}) {
  let q = classes().where('termId', '==', termId);
  if (department) q = q.where('department', '==', department);
  return docs(await q.get());
}
async function getClass(id) { return doc(await classes().doc(id).get()); }
/** Classes (any term) where this person is class teacher or a sub-mentor. Filtered by term by the caller, so no composite index is needed. */
async function listClassesByStaff(staffId) { return docs(await classes().where('staffIds', 'array-contains', staffId).get()); }
/** Create when missing; never overwrite an existing class (so generating twice cannot undo a HOD's changes). @returns {Promise<{created: boolean, class: object}>} */
async function createClassIfMissing(id, data) {
  const ref = classes().doc(id);
  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { ...data, classTeacherId: data.classTeacherId ?? null, subMentors: data.subMentors ?? [], createdAt: FieldValue.serverTimestamp() });
    return true;
  });
  return { created, class: await getClass(id) };
}
async function updateClass(id, partial) { await classes().doc(id).set(partial, { merge: true }); }

// ── enrollments ──
async function listEnrollmentsForTerm(termId) { return docs(await enrollments().where('termId', '==', termId).get()); }
async function listEnrollmentsForClass(classId) { return docs(await enrollments().where('classId', '==', classId).get()); }
async function listEnrollmentsForStudent(termId, studentId) {
  return docs(await enrollments().where('termId', '==', termId).where('studentId', '==', studentId).get());
}
/** Put a student in a class. For a primary enrollment, the student's other primary enrollment of this term is removed in the same batch. */
async function enroll({ termId, classId, studentId, primary, source, rollNo }) {
  const batch = db.batch();
  if (primary) {
    const mine = await enrollments().where('termId', '==', termId).where('studentId', '==', studentId).where('primary', '==', true).get();
    mine.docs.forEach((d) => { if (d.id !== enrollmentId(classId, studentId)) batch.delete(d.ref); });
  }
  batch.set(enrollments().doc(enrollmentId(classId, studentId)), { termId, classId, studentId, primary: !!primary, source, ...(rollNo ? { rollNo } : {}), at: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}
/** Many primary or elective enrolments at once (in batches), for building a whole department. Does not look for earlier ones: the caller only passes students who have none. */
async function enrollBulk(entries) {
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const e of entries.slice(i, i + 400)) {
      batch.set(enrollments().doc(enrollmentId(e.classId, e.studentId)), { termId: e.termId, classId: e.classId, studentId: e.studentId, primary: !!e.primary, source: e.source, ...(e.rollNo ? { rollNo: e.rollNo } : {}), at: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
}
async function setEnrollmentPosition(classId, studentId, position) { await enrollments().doc(enrollmentId(classId, studentId)).set({ position }, { merge: true }); }
async function unenroll(classId, studentId) { await enrollments().doc(enrollmentId(classId, studentId)).delete(); }

// ── teaching assignments ──
async function listAssignments({ termId, classId, facultyId } = {}) {
  let q = assignments();
  if (termId) q = q.where('termId', '==', termId);
  if (classId) q = q.where('classId', '==', classId);
  if (facultyId) q = q.where('facultyId', '==', facultyId);
  return docs(await q.get());
}
async function getAssignment(id) { return doc(await assignments().doc(id).get()); }
async function createAssignment(data) {
  const id = uuidv4();
  await assignments().doc(id).set({ ...data, to: data.to ?? null, createdAt: FieldValue.serverTimestamp() });
  return getAssignment(id);
}
async function endAssignment(id, to, endedBy) { await assignments().doc(id).set({ to, endedBy }, { merge: true }); }
/** End one assignment and start its replacement in one write, so there is never a moment with two teachers or none. */
async function reallocate({ endId, endAt, endedBy, next }) {
  const batch = db.batch();
  const newId = uuidv4();
  batch.set(assignments().doc(endId), { to: endAt, endedBy }, { merge: true });
  batch.set(assignments().doc(newId), { ...next, to: null, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return getAssignment(newId);
}

// ── access requests (an approved, unexpired one is a grant) ──
async function createRequest(data) {
  const id = uuidv4();
  await requests().doc(id).set({ ...data, status: 'pending', requestedAt: FieldValue.serverTimestamp() });
  return doc(await requests().doc(id).get());
}
async function getRequest(id) { return doc(await requests().doc(id).get()); }
async function listRequests({ facultyId, department, status } = {}) {
  let q = requests();
  if (facultyId) q = q.where('facultyId', '==', facultyId);
  if (department) q = q.where('department', '==', department);
  if (status) q = q.where('status', '==', status);
  return docs(await q.get());
}
async function decideRequest(id, partial) { await requests().doc(id).set({ ...partial, decidedAt: FieldValue.serverTimestamp() }, { merge: true }); }

module.exports = {
  enrollmentId,
  listTerms, getTerm, getActiveTerm, createTerm, updateTerm,
  listClasses, getClass, listClassesByStaff, createClassIfMissing, updateClass,
  listEnrollmentsForTerm, listEnrollmentsForClass, listEnrollmentsForStudent, enroll, enrollBulk, setEnrollmentPosition, unenroll,
  listAssignments, getAssignment, createAssignment, endAssignment, reallocate,
  createRequest, getRequest, listRequests, decideRequest,
};
