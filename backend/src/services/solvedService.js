// "Which problems has this student solved?" as a Set of problem ids.
//
// Fast path: the student's own small solved record (one read), used once the one-time backfill has built every record
// (scripts/backfill-student-stats.js). Before that it falls back to the student's own submissions, without the source code.
const statsRepo = require('../repositories/studentStatsRepository');
const submissionRepo = require('../repositories/submissionRepository');

const READY_MS = 60 * 1000;
let ready = { at: 0, value: false };

async function recordsReady() {
  if (Date.now() - ready.at < READY_MS) return ready.value;
  let value;
  try { value = await statsRepo.isBackfilled(); } catch { value = false; }
  ready = { at: Date.now(), value };
  return value;
}

async function solvedSetFor(userId) {
  if (await recordsReady()) {
    const doc = await statsRepo.get(userId);
    return new Set(doc?.solvedProblemIds || []);
  }
  const subs = await submissionRepo.listByUserLight(userId);
  return new Set(subs.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId));
}

function reset() { ready = { at: 0, value: false }; }

module.exports = { solvedSetFor, recordsReady, reset };
