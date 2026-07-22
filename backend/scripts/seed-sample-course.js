// One-off: seed a sample course + modules into Firestore, referencing the
// sample problems created via the faculty API. Not wired to any npm script —
// run manually: node scripts/seed-sample-course.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const courseRepo = require('../src/repositories/courseRepository');

async function main() {
  const [twoSum, reverseString, binarySearch, validParens, lcs] = [
    '2479bb2e-59bf-4eb0-a66a-eda7178fe17d',
    '4aa1eb2f-005a-4ee7-9eae-9f23d372c65b',
    'a7043a6f-479e-4927-ad5b-4c8e0852cf29',
    '1fed4884-3a00-4481-a13d-396a8b796977',
    'd4befd19-5511-4eef-9a54-ac10d3109f25',
  ];

  const course = await courseRepo.create({
    title: 'Data Structures & Algorithms Foundations',
    description: 'A structured path through core DSA topics — arrays, strings, searching, and dynamic programming.',
    sortOrder: 0,
    isPublished: true,
  });
  console.log('Created course', course.id);

  await courseRepo.addModule(course.id, {
    title: 'Arrays & Hashing',
    sortOrder: 0,
    problemIds: [twoSum],
  });
  await courseRepo.addModule(course.id, {
    title: 'Strings & Stacks',
    sortOrder: 1,
    problemIds: [reverseString, validParens],
  });
  await courseRepo.addModule(course.id, {
    title: 'Searching',
    sortOrder: 2,
    problemIds: [binarySearch],
  });
  await courseRepo.addModule(course.id, {
    title: 'Dynamic Programming',
    sortOrder: 3,
    problemIds: [lcs],
  });
  console.log('Added 4 modules');

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
