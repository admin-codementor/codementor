// Additive "peak production" demo seed — populates realistic volume across
// every collection/table the app reads from today (Firestore for
// students/faculty/problems/courses; Postgres for everything not yet
// migrated: submissions, assignments, classrooms, contests, MCQ, coding
// profiles, rating history, audit logs, proctor events, plagiarism).
//
// NEVER deletes anything — purely additive. Safe to run once for demo data;
// re-running will add a second batch (not idempotent by design, since the
// ask was "initial prod seeding", not a repeatable fixture).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { v4: uuidv4 } = require('uuid');

const db = require('../src/config/db');
const userRepo = require('../src/repositories/userRepository');
const problemRepo = require('../src/repositories/problemRepository');
const courseRepo = require('../src/repositories/courseRepository');

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);

const FIRST_NAMES = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan',
  'Ananya','Diya','Saanvi','Aadhya','Kavya','Myra','Anika','Riya','Ira','Prisha',
  'Kabir','Advait','Dhruv','Yash','Karan','Meera','Tara','Naina','Sanya','Zoya'];
const LAST_NAMES = ['Sharma','Verma','Reddy','Iyer','Nair','Gupta','Rao','Menon','Pillai','Kumar',
  'Patel','Singh','Das','Bose','Chatterjee','Naidu','Pandey','Mishra','Joshi','Kapoor'];
const DEPARTMENTS = ['CSE', 'ECE', 'MECH', 'CIVIL'];
const SECTIONS = ['A', 'B'];
const TOPICS = ['arrays','strings','hashing','two pointers','sliding window','stack','queue','linked list',
  'trees','graphs','dynamic programming','greedy','backtracking','binary search','math','bit manipulation'];

function makeName() { return `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`; }
function makeCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => alphabet[randInt(0, alphabet.length - 1)]).join('');
}

// ── Students / Faculty ──────────────────────────────────────────────────────
// Synthetic accounts get a placeholder firebaseUid (not a real Firebase Auth
// user) — they exist purely as data for volume/analytics, not for login.
// Only the real test@sreyas.ac.in / test-faculty@sreyas.ac.in accounts (and
// the separately-existing teststudent*@codementor.test Firebase accounts,
// untouched here) can actually sign in.
async function seedPeople() {
  const students = [];
  for (let i = 0; i < 34; i++) {
    const id = uuidv4();
    const name = makeName();
    const dept = rand(DEPARTMENTS);
    const section = rand(SECTIONS);
    const year = randInt(1, 4);
    const rollNo = `${dept}${year}${section}${String(i + 1).padStart(3, '0')}`;
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${i}@sreyas.ac.in`;
    const rating = randInt(900, 1900);
    const lastLoginAt = daysAgo(randInt(0, 30));

    await db.query(
      `INSERT INTO users (id, name, email, role, department, section, year, roll_no, firebase_uid, rating)
       VALUES ($1,$2,$3,'student',$4,$5,$6,$7,$8,$9)`,
      [id, name, email, dept, section, year, rollNo, `seed-${id}`, rating]
    );
    await userRepo.create(id, {
      name, email, role: 'student', department: dept, section, year, rollNo,
      firebaseUid: `seed-${id}`, lastLoginAt,
    });
    students.push({ id, name, department: dept, section, year, rollNo });
  }
  console.log(`Seeded ${students.length} students`);

  const facultyDefs = [
    { name: 'Dr. Meenal Krishnan', role: 'faculty' },
    { name: 'Dr. Suresh Baskaran', role: 'faculty' },
    { name: 'Prof. Lakshmi Narayan', role: 'faculty' },
    { name: 'Dr. Ramesh Chandra', role: 'hod' },
    { name: 'Admin Office', role: 'admin' },
  ];
  const faculty = [];
  for (const f of facultyDefs) {
    const id = uuidv4();
    const email = `${f.name.toLowerCase().replace(/[^a-z]+/g, '.')}@sreyas.ac.in`.replace(/^\.+/, '');
    const dept = rand(DEPARTMENTS);
    await db.query(
      `INSERT INTO users (id, name, email, role, department, firebase_uid, permissions)
       VALUES ($1,$2,$3,$4,$5,$6,'{}')`,
      [id, f.name, email, f.role, dept, `seed-${id}`]
    );
    await userRepo.create(id, {
      name: f.name, email, role: f.role, department: dept, permissions: {}, firebaseUid: `seed-${id}`, lastLoginAt: daysAgo(randInt(0, 10)),
    });
    faculty.push({ id, name: f.name, role: f.role });
  }
  console.log(`Seeded ${faculty.length} faculty/hod/admin`);

  return { students, faculty };
}

// ── Problems (15 more, on top of the 5 already seeded) ──────────────────────
const PROBLEM_DEFS = [
  { title: 'Group Anagrams', difficulty: 'medium', tags: ['strings','hashing'] },
  { title: 'Longest Substring Without Repeating Characters', difficulty: 'medium', tags: ['strings','sliding window'] },
  { title: 'Minimum Window Substring', difficulty: 'hard', tags: ['strings','sliding window'] },
  { title: 'Valid Palindrome', difficulty: 'easy', tags: ['strings','two pointers'] },
  { title: '3Sum', difficulty: 'medium', tags: ['arrays','two pointers'] },
  { title: 'Container With Most Water', difficulty: 'medium', tags: ['arrays','two pointers'] },
  { title: 'Merge Two Sorted Lists', difficulty: 'easy', tags: ['linked list'] },
  { title: 'Reverse Linked List', difficulty: 'easy', tags: ['linked list'] },
  { title: 'Binary Tree Level Order Traversal', difficulty: 'medium', tags: ['trees'] },
  { title: 'Validate Binary Search Tree', difficulty: 'medium', tags: ['trees'] },
  { title: 'Number of Islands', difficulty: 'medium', tags: ['graphs'] },
  { title: 'Course Schedule', difficulty: 'medium', tags: ['graphs'] },
  { title: 'Climbing Stairs', difficulty: 'easy', tags: ['dynamic programming'] },
  { title: 'Coin Change', difficulty: 'medium', tags: ['dynamic programming'] },
  { title: 'N-Queens', difficulty: 'hard', tags: ['backtracking'] },
];

async function seedProblems(facultyIds) {
  const created = [];
  for (const def of PROBLEM_DEFS) {
    const p = await problemRepo.create({
      title: def.title,
      description: `Solve **${def.title}**. (Demo seed data — full statement to be authored.)`,
      difficulty: def.difficulty, tags: def.tags,
      createdBy: rand(facultyIds), stubs: {}, scoringMode: 'acm', maxScore: 100,
      timeLimit: 2, memoryLimit: 256,
    }, [
      { input: 'sample input 1', output: 'sample output 1', is_public: true },
      { input: 'sample input 2', output: 'sample output 2', is_public: true },
      { input: 'hidden input', output: 'hidden output', is_public: false },
    ]);
    created.push(p);
  }
  console.log(`Seeded ${created.length} additional problems`);
  return created;
}

// ── Courses (2 more, on top of the 1 already seeded) ─────────────────────────
async function seedCourses(problems) {
  const byTag = (tag) => problems.filter(p => p.tags.includes(tag)).map(p => p.id);

  const c1 = await courseRepo.create({
    title: 'Interview Prep: Company Patterns', description: 'Curated patterns frequently asked in FAANG-style interviews.',
    sortOrder: 1, isPublished: true,
  });
  await courseRepo.addModule(c1.id, { title: 'Hashing & Two Pointers', sortOrder: 0, problemIds: [...byTag('hashing'), ...byTag('two pointers')].slice(0, 4) });
  await courseRepo.addModule(c1.id, { title: 'Trees & Graphs', sortOrder: 1, problemIds: [...byTag('trees'), ...byTag('graphs')].slice(0, 4) });
  await courseRepo.addModule(c1.id, { title: 'Dynamic Programming', sortOrder: 2, problemIds: byTag('dynamic programming') });

  const c2 = await courseRepo.create({
    title: 'Competitive Programming Basics', description: 'Foundational patterns for contest-style problem solving.',
    sortOrder: 2, isPublished: true,
  });
  await courseRepo.addModule(c2.id, { title: 'Linked Lists', sortOrder: 0, problemIds: byTag('linked list') });
  await courseRepo.addModule(c2.id, { title: 'Backtracking', sortOrder: 1, problemIds: byTag('backtracking') });

  console.log('Seeded 2 additional courses');
}

// ── Classrooms ────────────────────────────────────────────────────────────────
async function seedClassrooms(students, faculty) {
  const classrooms = [];
  for (let i = 0; i < 2; i++) {
    const owner = faculty[i % faculty.length];
    const dept = rand(DEPARTMENTS);
    const section = rand(SECTIONS);
    const { rows: [c] } = await db.query(
      `INSERT INTO classrooms (faculty_id, name, department, section, join_code)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [owner.id, `${dept} ${section} — ${i === 0 ? 'Morning' : 'Evening'} Batch`, dept, section, makeCode()]
    );
    const members = shuffle(students).slice(0, randInt(10, 16));
    for (const s of members) {
      await db.query(
        `INSERT INTO classroom_members (classroom_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [c.id, s.id]
      );
    }
    classrooms.push({ id: c.id, members });
  }
  console.log(`Seeded ${classrooms.length} classrooms with rosters`);
  return classrooms;
}

// ── Assignments ───────────────────────────────────────────────────────────────
async function seedAssignments(faculty, problems) {
  const defs = [
    { title: 'Week 1: Arrays & Hashing Practice', deadline: daysAgo(20), isExam: false },
    { title: 'Week 3: Trees & Graphs Homework', deadline: daysAgo(5), isExam: false },
    { title: 'Midterm Proctored Assessment', deadline: daysFromNow(3), isExam: true },
    { title: 'Week 6: Dynamic Programming Set', deadline: daysFromNow(10), isExam: false },
  ];
  const assignments = [];
  for (const def of defs) {
    const owner = rand(faculty);
    const { rows: [a] } = await db.query(
      `INSERT INTO assignments (faculty_id, title, deadline, is_exam) VALUES ($1,$2,$3,$4) RETURNING id`,
      [owner.id, def.title, def.deadline, def.isExam]
    );
    const chosen = shuffle(problems).slice(0, randInt(3, 5));
    for (const p of chosen) {
      await db.query(`INSERT INTO assignment_problems (assignment_id, problem_id) VALUES ($1,$2)`, [a.id, p.id]);
    }
    assignments.push({ id: a.id, isExam: def.isExam, problems: chosen });
  }
  console.log(`Seeded ${assignments.length} assignments`);
  return assignments;
}

// ── Code submissions (the bulk of "activity" data) ──────────────────────────
const VERDICTS = ['Accepted','Wrong Answer','Time Limit Exceeded','Runtime Error','Compilation Error'];
const VERDICT_WEIGHTS = [0.55, 0.25, 0.08, 0.07, 0.05];
const LANGUAGES = ['cpp','python','java','javascript'];

function weightedVerdict() {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < VERDICTS.length; i++) {
    acc += VERDICT_WEIGHTS[i];
    if (r <= acc) return VERDICTS[i];
  }
  return 'Accepted';
}

async function seedSubmissions(students, problems, assignments) {
  let count = 0;
  const activeStudents = shuffle(students).slice(0, 26); // some students stay fully inactive (at-risk demo)
  for (const student of activeStudents) {
    const attemptCount = randInt(3, 22);
    for (let i = 0; i < attemptCount; i++) {
      const problem = rand(problems);
      const verdict = weightedVerdict();
      const submittedAt = daysAgo(randInt(0, 75));
      const inAssignment = Math.random() < 0.3 ? rand(assignments.filter(a => a.problems.some(p => p.id === problem.id))) : null;
      await db.query(
        `INSERT INTO code_submissions (user_id, problem_id, code, language, verdict, runtime, memory, submitted_at, assignment_id, test_results)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          student.id, problem.id, `// demo seed submission ${i}\nfunction solve() { return true; }`,
          rand(LANGUAGES), verdict, randInt(20, 900), randInt(1024, 65536), submittedAt,
          inAssignment ? inAssignment.id : null,
          JSON.stringify([verdict === 'Accepted', verdict === 'Accepted', Math.random() > 0.3]),
        ]
      );
      count++;
    }
  }
  console.log(`Seeded ${count} code submissions across ${activeStudents.length} active students`);
}

// ── Coding profiles ──────────────────────────────────────────────────────────
async function seedCodingProfiles(students) {
  const platforms = ['leetcode', 'codeforces', 'hackerrank'];
  let count = 0;
  for (const student of shuffle(students).slice(0, 14)) {
    for (const platform of shuffle(platforms).slice(0, randInt(1, 2))) {
      await db.query(
        `INSERT INTO coding_profiles (user_id, platform, handle, solved, rating, max_rating, sync_status, last_synced)
         VALUES ($1,$2,$3,$4,$5,$6,'ok',$7)
         ON CONFLICT (user_id, platform) DO NOTHING`,
        [student.id, platform, `${student.rollNo.toLowerCase()}`, randInt(20, 400),
         platform === 'codeforces' ? randInt(900, 1900) : null,
         platform === 'codeforces' ? randInt(1000, 2000) : null,
         daysAgo(randInt(0, 5))]
      );
      count++;
    }
  }
  console.log(`Seeded ${count} coding profile links`);
}

// ── Contests ──────────────────────────────────────────────────────────────────
async function seedContests(faculty, students, problems) {
  const owner = rand(faculty);
  const contestProblems = shuffle(problems).slice(0, 5);

  const { rows: [past] } = await db.query(
    `INSERT INTO contests (faculty_id, title, description, starts_at, ends_at, scoreboard_mode)
     VALUES ($1,$2,$3,$4,$5,'public') RETURNING id`,
    [owner.id, 'Weekly Contest #1', 'A 90-minute ACM-style contest.', daysAgo(14), daysAgo(14 - 0.06)]
  );
  for (const [i, p] of contestProblems.entries()) {
    await db.query(`INSERT INTO contest_problems (contest_id, problem_id, sort_order) VALUES ($1,$2,$3)`, [past.id, p.id, i]);
  }
  const participants = shuffle(students).slice(0, 15);
  for (const s of participants) {
    await db.query(`INSERT INTO contest_registrations (contest_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [past.id, s.id]);
  }
  // Simulated final standings + rating deltas.
  const ranked = shuffle(participants).map((s, i) => ({ ...s, rank: i + 1 }));
  for (const p of ranked) {
    const solvedCount = Math.max(0, 5 - Math.floor(p.rank / 3));
    for (let i = 0; i < solvedCount; i++) {
      await db.query(
        `INSERT INTO contest_submissions (contest_id, user_id, problem_id, verdict, score, penalty_minutes)
         VALUES ($1,$2,$3,'Accepted',100,$4)`,
        [past.id, p.id, contestProblems[i].id, randInt(0, 40)]
      );
    }
    const { rows: [u] } = await db.query('SELECT rating FROM users WHERE id = $1', [p.id]);
    const oldRating = u.rating;
    const delta = Math.round((15 - p.rank) * 4 + randInt(-15, 15));
    const newRating = Math.max(600, oldRating + delta);
    await db.query('UPDATE users SET rating = $1 WHERE id = $2', [newRating, p.id]);
    await db.query(
      `INSERT INTO rating_history (user_id, contest_id, old_rating, new_rating, rank) VALUES ($1,$2,$3,$4,$5)`,
      [p.id, past.id, oldRating, newRating, p.rank]
    );
  }

  const { rows: [upcoming] } = await db.query(
    `INSERT INTO contests (faculty_id, title, description, starts_at, ends_at, scoreboard_mode)
     VALUES ($1,$2,$3,$4,$5,'frozen') RETURNING id`,
    [owner.id, 'Weekly Contest #2', 'Scoreboard freezes in the final 10 minutes.', daysFromNow(4), daysFromNow(4.06)]
  );
  for (const [i, p] of shuffle(problems).slice(0, 5).entries()) {
    await db.query(`INSERT INTO contest_problems (contest_id, problem_id, sort_order) VALUES ($1,$2,$3)`, [upcoming.id, p.id, i]);
  }
  for (const s of shuffle(students).slice(0, 10)) {
    await db.query(`INSERT INTO contest_registrations (contest_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [upcoming.id, s.id]);
  }

  console.log('Seeded 2 contests (1 past with standings/ratings, 1 upcoming with registrations)');
}

// ── MCQ ───────────────────────────────────────────────────────────────────────
async function seedMcq(faculty, students) {
  const defs = [
    { title: 'Aptitude Screening Round', category: 'aptitude', questions: [
      { q: 'If a train travels 60 km in 45 minutes, its speed in km/h is?', opts: ['70','80','90','100'], correct: 1 },
      { q: 'Find the next number: 2, 6, 12, 20, 30, ?', opts: ['40','42','44','36'], correct: 1 },
      { q: 'A is twice as old as B. In 10 years, A will be 1.5x B. Current age of B?', opts: ['10','15','20','25'], correct: 1 },
    ] },
    { title: 'Core CS Fundamentals', category: 'technical', questions: [
      { q: 'What is the time complexity of binary search?', opts: ['O(n)','O(log n)','O(n log n)','O(1)'], correct: 1 },
      { q: 'Which data structure uses LIFO order?', opts: ['Queue','Stack','Heap','Graph'], correct: 1 },
      { q: 'What does ACID stand for in databases (first letter)?', opts: ['Atomicity','Availability','Aggregation','Abstraction'], correct: 0 },
    ] },
  ];
  for (const def of defs) {
    const owner = rand(faculty);
    const { rows: [t] } = await db.query(
      `INSERT INTO mcq_tests (faculty_id, title, category, duration_minutes, is_published) VALUES ($1,$2,$3,30,true) RETURNING id`,
      [owner.id, def.title, def.category]
    );
    const questionIds = [];
    for (const [i, q] of def.questions.entries()) {
      const { rows: [qRow] } = await db.query(
        `INSERT INTO mcq_questions (test_id, question_text, options, correct_index, marks, topic, position)
         VALUES ($1,$2,$3,$4,1,$5,$6) RETURNING id`,
        [t.id, q.q, JSON.stringify(q.opts), q.correct, def.category, i]
      );
      questionIds.push({ id: qRow.id, correct: q.correct });
    }
    for (const s of shuffle(students).slice(0, randInt(8, 14))) {
      const responses = {};
      let score = 0;
      for (const q of questionIds) {
        const answer = Math.random() < 0.65 ? q.correct : randInt(0, 3);
        responses[q.id] = answer;
        if (answer === q.correct) score++;
      }
      await db.query(
        `INSERT INTO mcq_attempts (test_id, user_id, submitted_at, score, total, responses)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (test_id, user_id) DO NOTHING`,
        [t.id, s.id, daysAgo(randInt(1, 20)), score, questionIds.length, JSON.stringify(responses)]
      );
    }
  }
  console.log('Seeded 2 MCQ tests with questions and attempts');
}

// ── Proctor events + plagiarism (tied to the exam assignment) ────────────────
async function seedProctorAndPlagiarism(assignments, students) {
  const exam = assignments.find(a => a.isExam);
  if (exam) {
    const EVENTS = ['tab_switch','fullscreen_exit','blur','paste','exam_start'];
    for (const s of shuffle(students).slice(0, 8)) {
      const n = randInt(1, 4);
      for (let i = 0; i < n; i++) {
        await db.query(
          `INSERT INTO proctor_events (user_id, assignment_id, event_type, detail) VALUES ($1,$2,$3,$4)`,
          [s.id, exam.id, rand(EVENTS), 'Demo seed event']
        );
      }
    }
    console.log('Seeded proctor events for the exam assignment');

    const [a, b] = shuffle(students).slice(0, 2);
    await db.query(
      `INSERT INTO plagiarism_results (assignment_id, student_a, student_b, similarity, language)
       VALUES ($1,$2,$3,$4,'cpp')`,
      [exam.id, a.id, b.id, 87.5]
    );
    console.log('Seeded 1 plagiarism pair');
  }
}

// ── Audit logs ────────────────────────────────────────────────────────────────
async function seedAuditLogs(faculty) {
  const actions = [
    { action: 'problem.delete', detail: 'problem (demo cleanup)' },
    { action: 'permissions.update', detail: 'faculty permissions adjusted' },
    { action: 'marks.export', detail: 'assignment marks exported (42 rows)' },
    { action: 'problem.delete', detail: 'problem (demo cleanup)' },
    { action: 'permissions.update', detail: 'faculty permissions adjusted' },
  ];
  for (const a of actions) {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [rand(faculty).id, a.action, a.detail, '127.0.0.1', daysAgo(randInt(0, 25))]
    );
  }
  console.log(`Seeded ${actions.length} audit log entries`);
}

async function main() {
  const { students, faculty } = await seedPeople();
  const newProblems = await seedProblems(faculty.map(f => f.id));

  // Full catalog for course/assignment/contest seeding = the 5 pre-existing + 15 new.
  const existing = await problemRepo.getAll();
  const problems = existing.map(p => ({ id: p.id, tags: p.tags || [] }));

  await seedCourses(problems);
  await seedClassrooms(students, faculty);
  const assignments = await seedAssignments(faculty, problems);
  await seedSubmissions(students, problems, assignments);
  await seedCodingProfiles(students);
  await seedContests(faculty, students, problems);
  await seedMcq(faculty, students);
  await seedProctorAndPlagiarism(assignments, students);
  await seedAuditLogs(faculty);

  console.log('\nDone. Nothing was deleted — this was purely additive.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
