// The course catalogue, shared by every student.
//
// Before: each course-list request (and the dashboard fires one on every load) read every module of every course and then every
// problem document in them (about 700 for the Python and Java courses), per student. Now one build serves everyone for a couple of
// minutes: it is kept in Redis, keyed on the "courses" version that faculty edits already bump, plus a few seconds in each API
// copy's own memory, and only one build runs at a time per copy.
const { cached, getVersion } = require('../utils/cache');
const courseRepo = require('../repositories/courseRepository');
const problemRepo = require('../repositories/problemRepository');
const { buildCatalog } = require('../utils/courseCatalog');

const REDIS_TTL = 120;
const MEMO_MS = 10 * 1000;

let memo = null; // { at, ver, value }
let inflight = null;

async function build() {
  const courses = await courseRepo.listPublished();
  const modulesByCourse = await Promise.all(courses.map((c) => courseRepo.getModules(c.id)));
  const ids = [...new Set(modulesByCourse.flatMap((ms) => ms.flatMap((m) => m.problemIds || [])))];
  const problemsById = await problemRepo.getSlimMapByIds(ids);
  return buildCatalog(courses, modulesByCourse, problemsById);
}

/** @param {{fresh?: boolean}} opts  fresh = skip every cache (used once when a course is not found, in case it was just published) */
async function getCatalog({ fresh = false } = {}) {
  if (fresh) { memo = null; return build(); }
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  if (!inflight) {
    inflight = (async () => {
      const ver = await getVersion('courses');
      const value = await cached(`course-catalog:v1.${ver}`, REDIS_TTL, build);
      memo = { at: Date.now(), ver, value };
      return value;
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

/** The catalogue as the shapes the course screens expect: a Map of problems by id. */
function problemMap(catalog) {
  return new Map(Object.entries(catalog.problems));
}

function reset() { memo = null; inflight = null; }

module.exports = { getCatalog, problemMap, reset };
