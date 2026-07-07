/**
 * Additive course seeder — inserts the CDP 699 + Advanced-DSA courses against the
 * problems ALREADY in the database. Unlike seed.js, this NEVER deletes problems,
 * submissions, or test cases. It only resets the course tables (courses →
 * course_modules → module_problems), so it is safe to re-run.
 *
 *   node src/scripts/seedCourses.js
 */
const path = require('path');
const { Pool } = require('pg');
// Resolve backend/.env from this file's location (not the cwd) so the script works
// regardless of where it's launched from.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://judge0:judge0_secret@localhost:5432/judge0',
});

// Module definitions (title → tags to pull existing problems from). Tags are matched
// case-insensitively against the tags already on the problems in the DB.
const CDP_MODULES = [
  { title: 'Basics', tags: ['Math'] },
  { title: 'Arrays', tags: ['Arrays', 'array', 'Prefix Sum', 'Matrix'] },
  { title: 'Strings', tags: ['Strings'] },
  { title: 'Hashing', tags: ['Hashing'] },
  { title: 'Two Pointers & Sliding Window', tags: ['Two Pointers', 'Sliding Window'] },
  { title: 'Searching & Sorting', tags: ['Binary Search', 'Greedy'] },
  { title: 'Linked Lists', tags: ['Linked List'] },
  { title: 'Stacks & Queues', tags: ['Stack', 'Heap'] },
  { title: 'Trees', tags: ['Trees'] },
  { title: 'Graphs', tags: ['Graphs', 'BFS', 'DFS'] },
  { title: 'Dynamic Programming', tags: ['Dynamic Programming'] },
  { title: 'Design', tags: ['Design'] },
];

const COMPANY_MODULES = [
  'TCS', 'Accenture', 'Wipro', 'Infosys', 'Cognizant',
  'Capgemini', 'Microsoft', 'Amazon', 'Google', 'Adobe',
];

async function ensureTables() {
  // Self-contained so this works even if the backend hasn't been restarted yet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_modules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
      title VARCHAR(120) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS module_problems (
      module_id UUID REFERENCES course_modules(id) ON DELETE CASCADE,
      problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (module_id, problem_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_module_problems_module ON module_problems(module_id);`);
}

async function insertCourse(title, description, sortOrder, modules, byTag, sampleIds) {
  const c = await pool.query(
    `INSERT INTO courses (title, description, sort_order) VALUES ($1, $2, $3) RETURNING id`,
    [title, description, sortOrder]
  );
  const courseId = c.rows[0].id;
  let mOrder = 0;
  let attached = 0;
  for (const mod of modules) {
    const m = await pool.query(
      `INSERT INTO course_modules (course_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id`,
      [courseId, mod.title, mOrder++]
    );
    const moduleId = m.rows[0].id;
    const pids = mod.problemIds
      ? mod.problemIds
      : [...new Set((mod.tags || []).flatMap((t) => byTag.get(String(t).toLowerCase()) || []))];
    let pOrder = 0;
    for (const pid of pids) {
      await pool.query(
        `INSERT INTO module_problems (module_id, problem_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [moduleId, pid, pOrder++]
      );
      attached++;
    }
  }
  return { courseId, attached };
}

async function run() {
  try {
    console.log('Seeding courses (additive — existing problems are preserved)…');
    await ensureTables();

    // Read the problems already in the DB.
    const { rows: problems } = await pool.query(`SELECT id, title, tags FROM problems`);
    if (problems.length === 0) {
      console.warn('⚠ No problems found in the database. Courses will be created but empty. Seed problems first.');
    }

    // Case-insensitive tag → problem ids (handles "Arrays" vs "array").
    const byTag = new Map();
    for (const p of problems) {
      for (const t of p.tags || []) {
        const key = String(t).toLowerCase();
        if (!byTag.has(key)) byTag.set(key, []);
        byTag.get(key).push(p.id);
      }
    }

    // Reset ONLY the course tables (cascades to modules + module_problems). This
    // does not touch problems, submissions, or test cases.
    await pool.query('DELETE FROM courses');

    const cdp = await insertCourse(
      'CDP 699 – Career Placement Program – AIML – 2025',
      'The Coding and Problem-Solving Series accommodates varying proficiency levels, offering challenges ranging from foundational to intermediate and advanced complexities.',
      0,
      CDP_MODULES,
      byTag
    );

    // Company modules: no company-tagged problems exist, so attach a few samples to
    // the first three and leave the rest as placeholders.
    const sample = problems.slice(0, 4).map((p) => p.id);
    const companyModuleDefs = COMPANY_MODULES.map((name, i) => ({
      title: `${name} Programs`,
      problemIds: i < 3 ? sample : [],
    }));
    const adv = await insertCourse(
      'Advanced DSA for Top Companies',
      'Company-focused problem sets curated for top-tier placement preparation across service and product companies.',
      1,
      companyModuleDefs,
      byTag
    );

    console.log(`✅ CDP 699 seeded with ${CDP_MODULES.length} modules (${cdp.attached} problems attached by tag).`);
    console.log(`✅ Advanced DSA seeded with ${COMPANY_MODULES.length} company modules (${adv.attached} sample problems; the rest are placeholders until company-specific problems are added).`);
    console.log('Done. No problems, submissions, or test cases were modified.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Course seeding failed:', error);
    process.exit(1);
  }
}

run();
