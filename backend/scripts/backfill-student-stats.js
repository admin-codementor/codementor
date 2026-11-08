// One-time build (and later safety re-check) of every student's "problems solved" record from the existing submissions.
//
//   node scripts/backfill-student-stats.js            LOOK ONLY: reads, counts, prints a summary, writes nothing
//   node scripts/backfill-student-stats.js --apply    writes the records, then switches the ranking to use them
//
// READS: every submission once (three fields each, never the source code) plus the student list. On Firestore that is one read per
// submission, so run it on the Blaze plan or against a copy of the data, NOT on the free daily quota with many thousands of
// submissions. The look-only run costs the same reads as the real one.
//
// Order that is safe while the site is live:
//   1. deploy the code that keeps the records up to date (judgeService),
//   2. run this with --apply when no exam is live (solved problems only ever ADD, so none is lost; an attempt that lands between
//      the read and the write can be missed in the attempt counters),
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

  const [studentsMap, rows] = await Promise.all([userRepo.getMapByRole('student'), submissionRepo.listAllForCounting()]);
  const perUser = new Map();
  for (const r of rows) {
    if (!r.userId || !studentsMap.has(r.userId)) continue;
    let e = perUser.get(r.userId);
    if (!e) { e = { total: 0, accepted: 0, problemIds: new Set() }; perUser.set(r.userId, e); }
    e.total += 1;
    if (r.verdict === 'Accepted') { e.accepted += 1; if (r.problemId) e.problemIds.add(r.problemId); }
  }
  const totalSolves = [...perUser.values()].reduce((n, e) => n + e.problemIds.size, 0);
  console.log(`Students: ${studentsMap.size}`);
  console.log(`Submissions read: ${rows.length}`);
  console.log(`Students with at least one submission: ${perUser.size}`);
  console.log(`Distinct solved problems in total: ${totalSolves}`);

  if (!apply) {
    console.log('\nLook-only run: nothing was written. Add --apply to build the records.');
    process.exit(0);
  }

  let done = 0;
  for (const [userId, e] of perUser) {
    await statsRepo.recordBackfill(userId, { total: e.total, accepted: e.accepted, problemIds: [...e.problemIds] });
    if (++done % 100 === 0) console.log(`  ${done} / ${perUser.size} records written`);
  }
  console.log(`Wrote ${done} records.`);
  if (touchFlag) {
    await statsRepo.markBackfilled({ students: perUser.size, solves: totalSolves });
    console.log('Rankings and faculty tables will now use the records (within about two minutes).');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
