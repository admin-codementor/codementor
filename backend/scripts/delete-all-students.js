// Delete EVERY student: their Firebase sign-in, their profile, and the data that
// belongs to them. Meant for the day the demo data is replaced with real students.
//
//   node scripts/delete-all-students.js
//       Dry run (the default). Writes nothing. Prints how many students and how many
//       linked records would go, and the project id you must repeat to confirm.
//
//   node scripts/delete-all-students.js --confirm-project <project-id>
//       Really deletes. It first saves a backup file, then deletes, then reports.
//
// KEPT: faculty, HOD and admin accounts (so you can still sign in), classes (their
// student lists are emptied), assignments, exams, MCQ tests, contests, problems,
// courses, roadmaps, placement drives and student groups (deleted students are
// removed from them).
// DELETED per student: sign-in (Firebase Auth), profile, submissions, mastery,
// mistake notes, coding profiles, rating history, portfolio, AI tutor chats,
// proctor events, public profile handle, placement applications, message
// conversations, exam/MCQ attempts, contest entries, class memberships, and the
// audit-log rows their own actions created.
//
// There is no undo. The backup (backend/backups/, gitignored) is the only way back,
// and restoring from it is a manual job. Run it against the live project only when
// you mean to.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const CONFIRM_PROJECT = opt('confirm-project');

const { FieldValue } = require('firebase-admin/firestore');
const { db } = require('../src/config/firestore');
const { firebaseApp, firebaseAuth } = require('../src/config/firebaseAdmin');

const IN_LIMIT = 30; // Firestore `in` accepts at most 30 values
const ARRAY_ANY_LIMIT = 10; // array-contains-any accepts at most 10

// Top-level collections where a document carries the student's id in one field.
const BY_FIELD = [
  ['submissions', 'userId'], ['topicMastery', 'userId'], ['mistakeNotes', 'userId'], ['codingProfiles', 'userId'],
  ['ratingHistory', 'userId'], ['portfolioItems', 'userId'], ['aiTutorConversations', 'userId'], ['proctorEvents', 'userId'],
  ['publicHandles', 'userId'], ['judgeJobs', 'userId'], ['placementApplications', 'studentId'], ['auditLogs', 'userId'],
];

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function projectId() {
  try { if (db.projectId) return db.projectId; } catch { /* not resolved yet */ }
  return firebaseApp.options?.projectId || process.env.FIREBASE_PROJECT_ID || 'unknown-project';
}

async function main() {
  const project = projectId();
  const real = CONFIRM_PROJECT !== null;
  console.log(`Project: ${project}`);
  console.log(real ? 'Mode: DELETE' : 'Mode: dry run (nothing is written)');

  if (real && CONFIRM_PROJECT !== project) {
    console.error(`--confirm-project "${CONFIRM_PROJECT}" does not match the project "${project}". Nothing was deleted.`);
    process.exit(1);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) console.log('(Using the local emulator.)');

  const studentSnap = await db.collection('students').get();
  const students = studentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const ids = students.map((s) => s.id);
  console.log(`\nStudents found: ${students.length}`);
  if (students.length === 0) { console.log('Nothing to delete.'); return; }
  const authUids = [...new Set(students.map((s) => s.firebaseUid).filter(Boolean))];
  console.log(`  with a Firebase sign-in: ${authUids.length}   without (profile only): ${students.length - authUids.length}`);
  console.log(`  sample: ${students.slice(0, 3).map((s) => s.name || s.email || s.id).join(', ')}${students.length > 3 ? ', …' : ''}`);

  // ── Count (dry run) or collect (real run) everything that belongs to them ────
  const plan = []; // { label, refs: DocumentReference[] | count }
  const labelled = (label, refs) => plan.push({ label, refs });

  for (const [col, field] of BY_FIELD) {
    const refs = [];
    for (const c of chunks(ids, IN_LIMIT)) {
      const snap = await db.collection(col).where(field, 'in', c).get();
      snap.docs.forEach((d) => refs.push(d.ref));
    }
    labelled(col, refs);
  }

  // Conversations: delete the thread and its messages when a student is a participant.
  const threadRefs = new Map();
  for (const c of chunks(ids, ARRAY_ANY_LIMIT)) {
    const snap = await db.collection('messageThreads').where('participants', 'array-contains-any', c).get();
    snap.docs.forEach((d) => threadRefs.set(d.id, d.ref));
  }
  const messageRefs = [];
  for (const ref of threadRefs.values()) (await ref.collection('messages').get()).docs.forEach((d) => messageRefs.push(d.ref));
  labelled('messageThreads', [...threadRefs.values()]);
  labelled('messageThreads/*/messages', messageRefs);

  // Documents keyed by the student's id under a parent document.
  const idSet = new Set(ids);
  const keyed = async (label, parentCol, sub) => {
    const refs = [];
    for (const parent of (await db.collection(parentCol).select().get()).docs) {
      (await parent.ref.collection(sub).select().get()).docs.forEach((d) => { if (idSet.has(d.id)) refs.push(d.ref); });
    }
    labelled(label, refs);
  };
  await keyed('classrooms/*/members', 'classrooms', 'members');
  await keyed('exams/*/attempts', 'exams', 'attempts');
  await keyed('mcqTests/*/attempts', 'mcqTests', 'attempts');
  await keyed('contests/*/registrations', 'contests', 'registrations');
  await keyed('contests/*/virtualParticipations', 'contests', 'virtualParticipations');
  const contestSubs = [];
  for (const contest of (await db.collection('contests').select().get()).docs) {
    for (const c of chunks(ids, IN_LIMIT)) (await contest.ref.collection('submissions').where('userId', 'in', c).get()).docs.forEach((d) => contestSubs.push(d.ref));
  }
  labelled('contests/*/submissions', contestSubs);

  // Student groups are kept; the deleted students are only removed from them.
  const groupRefs = new Map();
  for (const c of chunks(ids, ARRAY_ANY_LIMIT)) {
    (await db.collection('studentGroups').where('studentIds', 'array-contains-any', c).get()).docs.forEach((d) => groupRefs.set(d.id, d.ref));
  }

  console.log('\nLinked records that belong to those students:');
  for (const p of plan) if (p.refs.length) console.log(`  ${p.label.padEnd(36)} ${p.refs.length}`);
  console.log(`  ${'studentGroups (members removed, group kept)'.padEnd(36)} ${groupRefs.size}`);
  console.log(`  ${'Firebase Auth sign-ins'.padEnd(36)} ${authUids.length}`);
  console.log(`  ${'students (profiles)'.padEnd(36)} ${students.length}`);
  console.log('\nKept: faculty, HOD and admin accounts, classes, assignments, exams, MCQ tests, contests, problems, courses, roadmaps, placement drives.');

  if (!real) {
    console.log(`\nDry run only. To delete for real, run:\n  node scripts/delete-all-students.js --confirm-project ${project}`);
    return;
  }

  // ── Backup first. If this fails nothing is deleted. ─────────────────────────
  const dir = path.join(__dirname, '../backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `students-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`);
  const out = fs.createWriteStream(file);
  const write = (kind, id, data) => out.write(`${JSON.stringify({ kind, id, data })}\n`);
  students.forEach((s) => write('students', s.id, s));
  for (const p of plan) {
    for (const ref of p.refs) {
      const doc = await ref.get();
      if (doc.exists) write(ref.path, doc.id, doc.data());
    }
  }
  await new Promise((resolve, reject) => { out.end((e) => (e ? reject(e) : resolve())); });
  console.log(`\nBackup written: ${file}  (${fs.statSync(file).size} bytes). It contains personal data: keep it private.`);

  // ── Delete: linked data, then sign-ins, then profiles last (so a re-run resumes). ──
  const writer = db.bulkWriter();
  let failed = 0;
  writer.onWriteError((err) => { if (err.failedAttempts < 5) return true; failed += 1; console.error(`  could not delete ${err.documentRef.path}: ${err.message}`); return false; });
  for (const p of plan) for (const ref of p.refs) writer.delete(ref);
  await writer.flush();

  // Remove the students from groups in batches (arrayRemove takes the ids to remove).
  for (const ref of groupRefs.values()) {
    for (const c of chunks(ids, 400)) await ref.update({ studentIds: FieldValue.arrayRemove(...c) });
  }

  let authDeleted = 0;
  for (const c of chunks(authUids, 1000)) {
    const r = await firebaseAuth.deleteUsers(c);
    authDeleted += r.successCount;
    // "user not found" just means a sign-in is already gone; anything else is reported.
    r.errors.filter((e) => e.error?.code !== 'auth/user-not-found').forEach((e) => { failed += 1; console.error(`  could not delete sign-in ${c[e.index]}: ${e.error?.message}`); });
  }

  const w2 = db.bulkWriter();
  students.forEach((s) => w2.delete(db.collection('students').doc(s.id)));
  await w2.close();
  await writer.close();

  console.log(`\nDone. Sign-ins deleted: ${authDeleted}. Profiles deleted: ${students.length}. Linked records deleted: ${plan.reduce((n, p) => n + p.refs.length, 0)}.`);
  if (failed) { console.error(`${failed} deletion(s) failed: see the messages above and run the script again.`); process.exit(1); }
  console.log('Cached dashboards may show old numbers for up to 10 minutes.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message); process.exit(1); });
