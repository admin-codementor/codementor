// The student dashboard payload.
//
// The thing worth protecting here is a product rule, not an HTTP status: a
// student is shown the work they have SOLVED, never a feed of their failed
// attempts. That rule is easy to undo by accident the next time this endpoint is
// touched, so these checks seed real submissions and assert the filtering.
const { tokenFor, get, Suite, purge, userId, db } = require('../harness');

const HOUR = 3600_000;

module.exports = async function studentDashboardSuite() {
  const s = new Suite('Student dashboard: solved-only history');

  const STUDENT_ID = userId('sd-student');
  const STUDENT = tokenFor('sd-student', 'student');

  s.onCleanup(() => purge('submissions', 'userId', [STUDENT_ID]), 'seeded submissions');

  // Two real problems to attach submissions to.
  const problems = (await get('/api/problems?page=1', STUDENT)).body?.data?.problems
    ?? (await get('/api/problems', STUDENT)).body?.data
    ?? [];
  if (problems.length < 2) {
    s.skip('solved-only checks', `needs 2 problems in the catalogue, found ${problems.length}`);
    return s;
  }
  const solvedId = String(problems[0].id);
  const failedId = String(problems[1].id);

  // Seeded directly rather than through the judge: this suite is about what the
  // dashboard reports, and driving Judge0 would make it depend on an external
  // service that is legitimately unavailable in some environments.
  const now = Date.now();
  const seed = [
    // Same problem solved twice — the newer one must win, and it must appear once.
    { userId: STUDENT_ID, problemId: solvedId, verdict: 'Accepted', language: 'python', submittedAt: new Date(now - 3 * HOUR) },
    { userId: STUDENT_ID, problemId: solvedId, verdict: 'Accepted', language: 'java', submittedAt: new Date(now - 1 * HOUR) },
    // Attempted but never solved — must not appear at all.
    { userId: STUDENT_ID, problemId: failedId, verdict: 'Wrong Answer', language: 'python', submittedAt: new Date(now) },
    { userId: STUDENT_ID, problemId: failedId, verdict: 'Runtime Error', language: 'python', submittedAt: new Date(now) },
  ];
  for (const row of seed) await db().collection('submissions').add(row);

  const res = await get('/api/student/dashboard', STUDENT);
  s.check('dashboard returns 200', res.status === 200, `status ${res.status}`);

  const data = res.body?.data;
  if (!data) {
    s.check('dashboard payload present', false, 'no data');
    return s;
  }

  const solved = data.recentSolved;
  s.check('payload exposes recentSolved', Array.isArray(solved), `got ${typeof solved}`);
  s.check('the old recentSubmissions field is gone', data.recentSubmissions === undefined);

  if (!Array.isArray(solved)) return s;

  s.check('an unsolved problem never appears',
    !solved.some((r) => String(r.problem_id) === failedId),
    `failed problem ${failedId} present`);

  const forSolved = solved.filter((r) => String(r.problem_id) === solvedId);
  s.check('a problem solved twice appears once', forSolved.length === 1, `${forSolved.length} rows`);
  s.check('the latest accepted attempt wins', forSolved[0]?.language === 'java', `language ${forSolved[0]?.language}`);
  s.check('solved_at is a parseable date', !Number.isNaN(new Date(forSolved[0]?.solved_at).getTime()), String(forSolved[0]?.solved_at));

  s.check('no verdict is leaked back to the student', solved.every((r) => r.verdict === undefined));
  s.check('rows carry a problem title', solved.every((r) => typeof r.problem_title === 'string' && r.problem_title.length > 0));

  // Stats are derived from the same submissions, so they must agree.
  s.check('problemsSolved counts the solved problem', data.stats?.problemsSolved >= 1, `got ${data.stats?.problemsSolved}`);
  s.check('acceptance rate stays within 0-100',
    data.stats?.acRate >= 0 && data.stats?.acRate <= 100, `got ${data.stats?.acRate}`);

  // ── Daily challenge ────────────────────────────────────────────────────────
  const daily = await get('/api/student/daily-challenge', STUDENT);
  s.check('daily challenge returns 200', daily.status === 200, `status ${daily.status}`);
  const pick = daily.body?.data;
  if (pick) {
    s.check('daily challenge says whether it is solved', typeof pick.solved === 'boolean', `got ${typeof pick.solved}`);
    s.check('daily challenge carries an id and title', !!pick.id && typeof pick.title === 'string');
  } else {
    s.skip('daily challenge shape', 'no problems in the catalogue');
  }

  return s;
};
