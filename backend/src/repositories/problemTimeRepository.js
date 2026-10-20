// Time a student has spent on a problem, kept on the server so it follows them across devices.
// One small document per student and problem: { seconds, solvedAtSeconds, updatedAt }.
// Written about once a minute while the problem is open, so cost grows with active students, not with clicks.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('problemTimes');
const docId = (userId, problemId) => `${userId}_${problemId}`;

async function get(userId, problemId) {
  const doc = await col().doc(docId(userId, problemId)).get();
  if (!doc.exists) return { seconds: 0, solvedAtSeconds: null };
  const d = doc.data();
  return { seconds: d.seconds || 0, solvedAtSeconds: d.solvedAtSeconds ?? null };
}

// Adds `seconds` of active time. When `solved` is true and no solve time has been recorded yet, the total at that
// moment is kept as the time-to-solve, once.
async function add(userId, problemId, seconds, solved, courseId = null) {
  const ref = col().doc(docId(userId, problemId));
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : {};
    const total = (cur.seconds || 0) + seconds;
    const solvedAtSeconds = cur.solvedAtSeconds ?? (solved ? total : null);
    tx.set(ref, { userId, problemId, seconds: total, solvedAtSeconds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { seconds: total, solvedAtSeconds };
  });
  if (courseId) await addToCourse(userId, courseId, seconds);
  return result;
}

// Course roll-up: one small document per student and course, with the total and a per-day map, so the faculty activity
// report reads one document per student instead of every problem record. Best effort: a failure here must never lose
// the problem time the student just earned.
const courseCol = () => db.collection('courseTimes');
const istDay = (ms = Date.now()) => new Date(ms + 330 * 60 * 1000).toISOString().slice(0, 10); // the college's calendar day

async function addToCourse(userId, courseId, seconds) {
  try {
    await courseCol().doc(`${userId}_${courseId}`).set({
      userId, courseId, seconds: FieldValue.increment(seconds), byDay: { [istDay()]: FieldValue.increment(seconds) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('Course time roll-up failed:', e.message);
  }
}

// Everyone's time on one course (activity report): one document per student.
async function listByCourse(courseId) {
  const snap = await courseCol().where('courseId', '==', courseId).select('userId', 'seconds', 'byDay').get();
  return snap.docs.map((d) => d.data());
}

// One student's time on each course (the per-student page): total seconds per course.
async function listCourseTimesByUser(userId) {
  const snap = await courseCol().where('userId', '==', userId).select('courseId', 'seconds').get();
  return snap.docs.map((d) => d.data());
}

// Everyone's time on one problem (per-question statistics).
async function listByProblem(problemId) {
  const snap = await col().where('problemId', '==', problemId).select('userId', 'seconds', 'solvedAtSeconds').get();
  return snap.docs.map((d) => d.data());
}

// Every problem this student has spent time on, with when they last did. One query, no document bodies beyond these fields.
async function listByUser(userId) {
  const snap = await col().where('userId', '==', userId).select('problemId', 'seconds', 'solvedAtSeconds', 'updatedAt').get();
  return snap.docs.map((d) => d.data());
}

module.exports = { get, add, listByUser, listByCourse, listByProblem, listCourseTimesByUser, istDay };
