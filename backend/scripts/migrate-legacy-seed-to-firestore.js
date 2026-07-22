// One-off: port the demo data from seed-production-demo.js / seed-for-real-faculty.js
// (written directly to Postgres, before Phases B-F moved these domains to
// Firestore) into their new Firestore homes, preserving the original
// Postgres-generated UUIDs as Firestore doc IDs so cross-references
// (code_submissions.assignment_id, contest_submissions.contest_id,
// mcq_attempts.test_id, etc.) stay valid without any remapping.
// Purely additive — reads Postgres, writes Firestore, deletes nothing.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pg = require('../src/config/db');
const { db } = require('../src/config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

async function migrateAssignments() {
  const { rows: assignments } = await pg.query('SELECT * FROM assignments');
  const { rows: aps } = await pg.query('SELECT * FROM assignment_problems');
  const byAssignment = new Map();
  for (const ap of aps) {
    if (!byAssignment.has(ap.assignment_id)) byAssignment.set(ap.assignment_id, []);
    byAssignment.get(ap.assignment_id).push(ap.problem_id);
  }
  for (const a of assignments) {
    await db.collection('assignments').doc(a.id).set({
      facultyId: a.faculty_id, title: a.title, deadline: a.deadline,
      isExam: a.is_exam, allowedCidrs: a.allowed_cidrs || [],
      problemIds: byAssignment.get(a.id) || [],
      createdAt: a.created_at,
    });
  }
  console.log(`Migrated ${assignments.length} assignments`);
}

async function migrateClassrooms() {
  const { rows: classrooms } = await pg.query('SELECT * FROM classrooms');
  const { rows: members } = await pg.query('SELECT * FROM classroom_members');
  for (const c of classrooms) {
    await db.collection('classrooms').doc(c.id).set({
      facultyId: c.faculty_id, name: c.name, department: c.department, section: c.section,
      joinCode: c.join_code, createdAt: c.created_at,
    });
  }
  for (const m of members) {
    await db.collection('classrooms').doc(m.classroom_id).collection('members').doc(m.user_id)
      .set({ joinedAt: m.joined_at });
  }
  console.log(`Migrated ${classrooms.length} classrooms, ${members.length} memberships`);
}

async function migrateContests() {
  const { rows: contests } = await pg.query('SELECT * FROM contests');
  const { rows: cps } = await pg.query('SELECT * FROM contest_problems ORDER BY sort_order');
  const { rows: regs } = await pg.query('SELECT * FROM contest_registrations');
  const { rows: subs } = await pg.query('SELECT * FROM contest_submissions');
  const { rows: vps } = await pg.query('SELECT * FROM virtual_participations');

  const problemsByContest = new Map();
  for (const cp of cps) {
    if (!problemsByContest.has(cp.contest_id)) problemsByContest.set(cp.contest_id, []);
    problemsByContest.get(cp.contest_id).push(cp.problem_id);
  }

  for (const c of contests) {
    await db.collection('contests').doc(c.id).set({
      facultyId: c.faculty_id, title: c.title, description: c.description,
      startsAt: c.starts_at, endsAt: c.ends_at, scoreboardMode: c.scoreboard_mode,
      freezeAt: c.freeze_at, problemIds: problemsByContest.get(c.id) || [],
      createdAt: c.created_at,
    });
  }
  for (const r of regs) {
    await db.collection('contests').doc(r.contest_id).collection('registrations').doc(r.user_id)
      .set({ registeredAt: r.registered_at });
  }
  for (const s of subs) {
    await db.collection('contests').doc(s.contest_id).collection('submissions').doc(s.id).set({
      userId: s.user_id, problemId: s.problem_id, verdict: s.verdict, score: s.score,
      penaltyMinutes: s.penalty_minutes, isVirtual: s.is_virtual,
      virtualElapsedMinutes: s.virtual_elapsed_minutes, submittedAt: s.submitted_at,
    });
  }
  for (const v of vps) {
    await db.collection('contests').doc(v.contest_id).collection('virtualParticipations').doc(v.user_id)
      .set({ startedAt: v.started_at });
  }
  console.log(`Migrated ${contests.length} contests, ${regs.length} registrations, ${subs.length} contest submissions, ${vps.length} virtual participations`);
}

async function migrateMcq() {
  const { rows: tests } = await pg.query('SELECT * FROM mcq_tests');
  const { rows: questions } = await pg.query('SELECT * FROM mcq_questions ORDER BY position');
  const { rows: attempts } = await pg.query('SELECT * FROM mcq_attempts');

  for (const t of tests) {
    await db.collection('mcqTests').doc(t.id).set({
      facultyId: t.faculty_id, title: t.title, description: t.description,
      category: t.category, durationMinutes: t.duration_minutes, isPublished: t.is_published,
      createdAt: t.created_at,
    });
  }
  for (const q of questions) {
    await db.collection('mcqTests').doc(q.test_id).collection('questions').doc(q.id).set({
      questionText: q.question_text, options: q.options, correctIndex: q.correct_index,
      marks: q.marks, topic: q.topic, explanation: q.explanation, position: q.position,
    });
  }
  for (const a of attempts) {
    await db.collection('mcqTests').doc(a.test_id).collection('attempts').doc(a.user_id).set({
      startedAt: a.started_at, submittedAt: a.submitted_at, score: a.score, total: a.total,
      responses: a.responses || {},
    });
  }
  console.log(`Migrated ${tests.length} MCQ tests, ${questions.length} questions, ${attempts.length} attempts`);
}

async function migrateSubmissions() {
  const { rows: subs } = await pg.query('SELECT * FROM code_submissions');
  for (const s of subs) {
    await db.collection('submissions').doc(s.id).set({
      userId: s.user_id, problemId: s.problem_id, code: s.code, language: s.language,
      verdict: s.verdict, runtime: s.runtime, memory: s.memory, score: s.score,
      testResults: s.test_results || [], assignmentId: s.assignment_id, submittedAt: s.submitted_at,
    });
  }
  console.log(`Migrated ${subs.length} code submissions`);
}

async function migrateCodingProfiles() {
  const { rows: profiles } = await pg.query('SELECT * FROM coding_profiles');
  for (const p of profiles) {
    await db.collection('codingProfiles').doc(`${p.user_id}_${p.platform}`).set({
      userId: p.user_id, platform: p.platform, handle: p.handle, solved: p.solved,
      rating: p.rating, maxRating: p.max_rating, extra: p.extra || {},
      syncStatus: p.sync_status, lastSynced: p.last_synced, updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`Migrated ${profiles.length} coding profiles`);
}

async function migrateRatingHistory() {
  const { rows } = await pg.query('SELECT * FROM rating_history');
  for (const r of rows) {
    await db.collection('ratingHistory').add({
      userId: r.user_id, contestId: r.contest_id, oldRating: r.old_rating,
      newRating: r.new_rating, rank: r.rank, createdAt: r.created_at,
    });
  }
  console.log(`Migrated ${rows.length} rating history rows`);
}

async function migrateAuditLogs() {
  const { rows } = await pg.query('SELECT * FROM audit_logs');
  for (const r of rows) {
    await db.collection('auditLogs').add({
      userId: r.user_id, action: r.action, detail: r.detail, ip: r.ip, createdAt: r.created_at,
    });
  }
  console.log(`Migrated ${rows.length} audit log rows`);
}

async function migrateProctorEvents() {
  const { rows } = await pg.query('SELECT * FROM proctor_events');
  for (const r of rows) {
    await db.collection('proctorEvents').add({
      userId: r.user_id, assignmentId: r.assignment_id, problemId: r.problem_id,
      eventType: r.event_type, detail: r.detail, createdAt: r.created_at,
    });
  }
  console.log(`Migrated ${rows.length} proctor events`);
}

async function migratePlagiarismResults() {
  const { rows } = await pg.query('SELECT * FROM plagiarism_results');
  for (const r of rows) {
    await db.collection('plagiarismResults').doc(r.id).set({
      assignmentId: r.assignment_id, studentA: r.student_a, studentB: r.student_b,
      similarity: Number(r.similarity), language: r.language, ranAt: r.ran_at,
    });
  }
  console.log(`Migrated ${rows.length} plagiarism results`);
}

async function main() {
  await migrateAssignments();
  await migrateClassrooms();
  await migrateContests();
  await migrateMcq();
  await migrateSubmissions();
  await migrateCodingProfiles();
  await migrateRatingHistory();
  await migrateAuditLogs();
  await migrateProctorEvents();
  await migratePlagiarismResults();
  console.log('\nDone. Postgres rows were only read, never deleted.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
