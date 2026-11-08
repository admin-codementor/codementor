// Per-student numbers (distinct problems solved, attempts, accepted) for the faculty and HOD tables, shared by everyone.
//
// Before: each cohort or student table read every submission of every student, source code included, on every request.
// Now: once the per-student records are backfilled (scripts/backfill-student-stats.js) this is about one small read per student;
// until then it counts from a three-field scan of the submissions. Either way the result is shared through Redis for two
// minutes and a few seconds in each API copy's memory, and only one build runs at a time per copy.
//
//   getAggregates() -> { [userId]: { solved, total, accepted } }   (a student with no attempts has no entry: read it as zeros)
const { cached } = require('../utils/cache');
const statsRepo = require('../repositories/studentStatsRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { aggregateRows } = require('../utils/solvedStats');

const REDIS_TTL = 120;
const MEMO_MS = 10 * 1000;

let memo = null;
let inflight = null;

async function build() {
  const backfilled = await statsRepo.isBackfilled().catch(() => false);
  if (backfilled) return statsRepo.listAggregates();
  return aggregateRows(await submissionRepo.listAllForCounting());
}

async function getAggregates() {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  if (!inflight) {
    inflight = cached('student-aggregates:v1', REDIS_TTL, build)
      .then((value) => { memo = { at: Date.now(), value }; return value; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

const ZERO = Object.freeze({ solved: 0, total: 0, accepted: 0 });
/** One student's numbers, zeros when there are none. */
const statOf = (agg, id) => agg[id] || ZERO;

function reset() { memo = null; inflight = null; }

module.exports = { getAggregates, statOf, reset };
