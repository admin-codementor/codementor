// Additive supplement to seed-production-demo.js — that script only assigned
// ownership of assignments/classrooms/contests/MCQ tests to the newly-created
// synthetic faculty accounts, so the REAL test-faculty@sreyas.ac.in account
// (the one you'd actually log in as) saw an empty "my assignments" list. This
// adds a few more of each, owned by the real faculty account, reusing the
// existing seeded students/problems. Purely additive — nothing deleted.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('../src/config/db');
const problemRepo = require('../src/repositories/problemRepository');

const REAL_FACULTY_ID = '3e3a6937-ab9d-4047-966d-8809ec37366d';

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
function makeCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => alphabet[randInt(0, alphabet.length - 1)]).join('');
}

async function main() {
  const problems = (await problemRepo.getAll()).map(p => ({ id: p.id }));
  const { rows: students } = await db.query(`SELECT id FROM users WHERE role = 'student'`);

  // Assignments owned by the real faculty account.
  const defs = [
    { title: 'Week 2: Two Pointers Drill', deadline: daysAgo(12), isExam: false },
    { title: 'Final Proctored Exam', deadline: daysFromNow(7), isExam: true },
  ];
  const assignments = [];
  for (const def of defs) {
    const { rows: [a] } = await db.query(
      `INSERT INTO assignments (faculty_id, title, deadline, is_exam) VALUES ($1,$2,$3,$4) RETURNING id`,
      [REAL_FACULTY_ID, def.title, def.deadline, def.isExam]
    );
    const chosen = shuffle(problems).slice(0, randInt(3, 5));
    for (const p of chosen) {
      await db.query(`INSERT INTO assignment_problems (assignment_id, problem_id) VALUES ($1,$2)`, [a.id, p.id]);
    }
    assignments.push({ id: a.id, isExam: def.isExam });
  }
  console.log(`Seeded ${assignments.length} assignments for the real faculty account`);

  // A classroom owned by the real faculty account.
  const { rows: [classroom] } = await db.query(
    `INSERT INTO classrooms (faculty_id, name, department, section, join_code) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [REAL_FACULTY_ID, 'CSE A — My Section', 'CSE', 'A', makeCode()]
  );
  const members = shuffle(students).slice(0, 12);
  for (const s of members) {
    await db.query(`INSERT INTO classroom_members (classroom_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [classroom.id, s.id]);
  }
  console.log('Seeded 1 classroom for the real faculty account');

  // A contest owned by the real faculty account.
  const { rows: [contest] } = await db.query(
    `INSERT INTO contests (faculty_id, title, description, starts_at, ends_at, scoreboard_mode)
     VALUES ($1,$2,$3,$4,$5,'public') RETURNING id`,
    [REAL_FACULTY_ID, 'My Weekly Contest', 'Hosted by the faculty demo account.', daysFromNow(2), daysFromNow(2.06)]
  );
  for (const [i, p] of shuffle(problems).slice(0, 4).entries()) {
    await db.query(`INSERT INTO contest_problems (contest_id, problem_id, sort_order) VALUES ($1,$2,$3)`, [contest.id, p.id, i]);
  }
  for (const s of shuffle(students).slice(0, 10)) {
    await db.query(`INSERT INTO contest_registrations (contest_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [contest.id, s.id]);
  }
  console.log('Seeded 1 contest for the real faculty account');

  // An MCQ test owned by the real faculty account.
  const { rows: [test] } = await db.query(
    `INSERT INTO mcq_tests (faculty_id, title, category, duration_minutes, is_published) VALUES ($1,$2,$3,20,true) RETURNING id`,
    [REAL_FACULTY_ID, 'Quick Logic Check', 'logical']
  );
  const questions = [
    { q: 'All roses are flowers. Some flowers fade quickly. Therefore?', opts: ['All roses fade quickly','Some roses may fade quickly','No valid conclusion','Roses are not flowers'], correct: 2 },
    { q: 'What comes next: 1, 1, 2, 3, 5, 8, ?', opts: ['11','13','12','10'], correct: 1 },
  ];
  const qIds = [];
  for (const [i, q] of questions.entries()) {
    const { rows: [qRow] } = await db.query(
      `INSERT INTO mcq_questions (test_id, question_text, options, correct_index, marks, topic, position)
       VALUES ($1,$2,$3,$4,1,'logical',$5) RETURNING id`,
      [test.id, q.q, JSON.stringify(q.opts), q.correct, i]
    );
    qIds.push({ id: qRow.id, correct: q.correct });
  }
  for (const s of shuffle(students).slice(0, 8)) {
    const responses = {};
    let score = 0;
    for (const q of qIds) {
      const answer = Math.random() < 0.6 ? q.correct : randInt(0, 3);
      responses[q.id] = answer;
      if (answer === q.correct) score++;
    }
    await db.query(
      `INSERT INTO mcq_attempts (test_id, user_id, submitted_at, score, total, responses)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (test_id, user_id) DO NOTHING`,
      [test.id, s.id, daysAgo(randInt(1, 10)), score, qIds.length, JSON.stringify(responses)]
    );
  }
  console.log('Seeded 1 MCQ test for the real faculty account');

  console.log('\nDone. Nothing was deleted — this was purely additive.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
