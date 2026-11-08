// The ranking table every dashboard and leaderboard shares.
//
// Before: each dashboard or leaderboard load read all 3000 student profiles and every submission on the platform (failed ones
// included) and ranked everybody, to find one student's place. Now that work happens at most about once a minute for the whole
// college, and the result is shared through Redis (and a few seconds of per-process memory).
//
//   getBoard() -> { solved: {userId: distinctProblemsSolved}, students: {userId: slim profile}, builtAt }
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const publicHandleRepo = require('../repositories/publicHandleRepository');
const { buildBoard } = require('../utils/rankingBoard');

const REDIS_TTL = 60;      // seconds, shared by every API copy
const MEMO_MS = 10 * 1000; // per process, so a busy minute does not parse the table for every request

let memo = null;     // { at, value }
let inflight = null; // one build at a time per process: 1000 people at the minute mark must not start 1000 scans

async function build() {
  const [studentsMap, accepted, handles] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAcceptedForRanking(),
    publicHandleRepo.mapByUser(),
  ]);
  return buildBoard(studentsMap, accepted, handles);
}

async function getBoard() {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  if (!inflight) {
    inflight = cached('ranking:board:v1', REDIS_TTL, build)
      .then((value) => { memo = { at: Date.now(), value }; return value; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** For tests, and for an admin who needs the table rebuilt right now. */
function reset() { memo = null; inflight = null; }

module.exports = { getBoard, reset };
