/**
 * Additive course seeder — inserts the CDP 699 + Advanced-DSA courses against the
 * problems ALREADY in Firestore. Never touches problems, submissions, or test
 * cases; only resets the `courses` collection (and its `modules`
 * subcollections), so it is safe to re-run.
 *
 * This previously wrote to Postgres tables (`courses`, `course_modules`,
 * `module_problems`) that nothing in the live app reads — the actual course
 * catalogue has always been served from Firestore via `courseRepository.js`
 * (see `docs/product/analytics-redesign-and-modules-plan.md` §1, finding F5).
 * That meant every course this script ever seeded was invisible to students.
 * This version writes through the same repository the API reads from.
 *
 *   node src/scripts/seedCourses.js
 */
const path = require('path');
// Resolve backend/.env from this file's location (not the cwd) so the script works
// regardless of where it's launched from.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { db } = require('../config/firestore');
const problemRepo = require('../repositories/problemRepository');
const courseRepo = require('../repositories/courseRepository');

// Module definitions (title → tags to pull existing problems from). Tags are matched
// case-insensitively against the tags already on the problems in the database.
// Tags matched case-insensitively against whatever's actually on the problems
// in the database — not an idealized taxonomy. Audited 2026-08-16 against the
// live 77-problem catalogue (`programming-basics` alone covers 20 of them and
// was missing from every module before this pass).
const CDP_MODULES = [
  { title: 'Basics', tags: ['Math', 'programming-basics', 'basic math', 'sum'] },
  { title: 'Arrays', tags: ['Arrays', 'array', 'Prefix Sum', 'Matrix'] },
  { title: 'Strings', tags: ['Strings'] },
  { title: 'Hashing', tags: ['Hashing'] },
  { title: 'Two Pointers & Sliding Window', tags: ['Two Pointers', 'Sliding Window'] },
  { title: 'Searching & Sorting', tags: ['Binary Search', 'Greedy', 'backtracking'] },
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

async function insertCourse(title, description, sortOrder, modules, byTag) {
  const course = await courseRepo.create({ title, description, sortOrder, isPublished: true });
  let mOrder = 0;
  let attached = 0;
  for (const mod of modules) {
    const problemIds = mod.problemIds
      ? mod.problemIds
      : [...new Set((mod.tags || []).flatMap((t) => byTag.get(String(t).toLowerCase()) || []))];
    await courseRepo.addModule(course.id, { title: mod.title, problemIds, sortOrder: mOrder++ });
    attached += problemIds.length;
  }
  return { courseId: course.id, attached };
}

async function run() {
  try {
    console.log('Seeding courses (additive — existing problems are preserved)…');

    // Read the problems already in Firestore. Draft problems 404 for students,
    // so a module pointing at one would look broken — only published ones
    // (an absent `status` means published, same rule the authoring flow uses).
    const allProblems = await problemRepo.getAll();
    const problems = allProblems.filter((p) => (p.status || 'published') === 'published');
    if (problems.length === 0) {
      console.warn('⚠ No published problems found. Courses will be created but empty. Seed/publish problems first.');
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

    // Reset only the courses collection (and each course's modules
    // subcollection) — problems and submissions are never touched.
    await courseRepo.removeAll();

    const cdp = await insertCourse(
      'CDP 699 – Career Placement Program – AIML – 2025',
      'The Coding and Problem-Solving Series accommodates varying proficiency levels, offering challenges ranging from foundational to intermediate and advanced complexities.',
      0,
      CDP_MODULES,
      byTag,
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
      byTag,
    );

    console.log(`✅ CDP 699 seeded with ${CDP_MODULES.length} modules (${cdp.attached} problems attached by tag).`);
    console.log(`✅ Advanced DSA seeded with ${COMPANY_MODULES.length} company modules (${adv.attached} sample problems; the rest are placeholders until company-specific problems are added).`);
    console.log('Done. No problems or submissions were modified.');
    process.exitCode = 0;
  } catch (error) {
    console.error('❌ Course seeding failed:', error);
    process.exitCode = 1;
  } finally {
    // Firestore's gRPC handles make a bare process.exit() crash libuv — set
    // exitCode and let the event loop drain instead (same fix as elsewhere).
    await db.terminate();
  }
}

run();
