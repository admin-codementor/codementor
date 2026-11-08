// One-time build (and later safety re-check) of every student's "problems solved" record from the existing submissions.
//
//   node scripts/backfill-student-stats.js            LOOK ONLY: reads, counts, prints a summary, writes nothing
//   node scripts/backfill-student-stats.js --apply    writes the records, then switches the ranking to use them
//
// READS: every Accepted submission once (two fields each) plus the student list. On Firestore that is one read per Accepted
// submission, so run it on the Blaze plan or against a copy of the data, NOT on the free daily quota with many thousands of
// submissions. The look-only run costs the same reads as the real one.
//
// Order that is safe while the site is live:
//   1. deploy the code that keeps the records up to date (judgeService),
//   2. run this with --apply (it only ever ADDS solved problems, so a student solving a problem meanwhile is never lost),
//   3. the ranking switches to the records by itself once this finishes.
// Re-running is safe and repairs any record that fell behind. Use --no-flag to re-check without touching the switch.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apply = process.argv.includes('--apply');
const touchFlag = !process.argv.includes('--no-flag');

async function main() {
  const submissionRepo = require('../src/repositories/submissionRepository');
  const userRepo = require('../src/repositories/userRepository');
  const statsRepo = require('../src/repositories/studentStatsRepository');

  const [studentsMap, accepted] = await Promise.all([userRepo.getMapByRole('student'), submissionRepo.listAcceptedForRanking()]);
  const perUser = new Map();
  for (const r of accepted) {
    if (!r.userId || !r.problemId || !studentsMap.has(r.userId)) continue;
    if (!perUser.has(r.userId)) perUser.set(r.userId, new Set());
    perUser.get(r.userId).add(r.problemId);
  }
  const totalSolves = [...perUser.values()].reduce((n, s) => n + s.size, 0);
  console.log(`Students: ${studentsMap.size}`);
  console.log(`Accepted submissions read: ${accepted.length}`);
  console.log(`Students with at least one solved problem: ${perUser.size}`);
  console.log(`Distinct solved problems in total: ${totalSolves}`);

  if (!apply) {
    console.log('\nLook-only run: nothing was written. Add --apply to build the records.');
    process.exit(0);
  }

  let done = 0;
  for (const [userId, set] of perUser) {
    await statsRepo.recordSolves(userId, [...set]);
    if (++done % 100 === 0) console.log(`  ${done} / ${perUser.size} records written`);
  }
  console.log(`Wrote ${done} records.`);
  if (touchFlag) {
    await statsRepo.markBackfilled({ students: perUser.size, solves: totalSolves });
    console.log('Ranking will now use the records (within about a minute).');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
