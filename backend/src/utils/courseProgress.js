// How far along a course a student is. ONE definition, used by the faculty course analytics, the
// per-student course card and the student's own course pages, so the same student shows the same
// number everywhere. Pure: no I/O, so every figure is checkable against a hand-built fixture.
//
// What counts:
//   - A course problem is REQUIRED only if it still exists and is not a draft. A deleted problem used to
//     make 100% unreachable, and a draft problem cannot even be opened by a student.
//   - The course total is the number of DISTINCT required problems, so a problem that sits in two
//     modules counts once.
//   - "Solved" means an Accepted verdict at any time. "Attempted" means any submission, any verdict.
//
// A student is in exactly one state, so the three counts always add up to the class size:
//   completed    every required problem solved
//   in_progress  tried at least one problem, not complete
//   not_started  never submitted anything for this course
// (A student who tried and failed everything is in progress at 0%, not "not started".)

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** A problem a student can actually be asked to solve: it exists and is not a draft. */
const isRequired = (problem) => !!problem && (problem.status ?? 'published') !== 'draft';

/**
 * A share of the course as a whole number that never lies about being finished:
 * 100 only when everything is solved, at least 1 once anything is, at most 99 otherwise.
 */
function percentOf(solved, total) {
  if (!total || solved <= 0) return 0;
  if (solved >= total) return 100;
  return Math.min(99, Math.max(1, Math.floor((solved / total) * 100)));
}

/**
 * Keep only the required problems of each module, and work out the course's distinct required set.
 * @param {{id,title,description?,dueAt?,problemIds?: string[]}[]} modules
 * @param {Map<string, {status?: string}>} problemsById   existing problems (a missing id = deleted)
 * @returns {{units: {id,title,description,dueAt,problemIds: string[]}[], problems: Set<string>, skipped: {deleted: number, draft: number}}}
 */
function resolveCourse(modules, problemsById) {
  const problems = new Set();
  const skipped = { deleted: 0, draft: 0 };
  const seenSkipped = new Set();
  const units = modules.map((m) => {
    const keep = [];
    for (const pid of m.problemIds || []) {
      const p = problemsById.get(pid);
      if (isRequired(p)) {
        if (!keep.includes(pid)) keep.push(pid);
        problems.add(pid);
      } else if (!seenSkipped.has(pid)) {
        seenSkipped.add(pid);
        if (p) skipped.draft += 1; else skipped.deleted += 1;
      }
    }
    return { id: m.id, title: m.title, description: m.description ?? null, dueAt: m.dueAt ?? null, problemIds: keep };
  });
  return { units, problems, skipped };
}

/**
 * Who has solved / attempted which required problem, and when they were last active in the course.
 * @param {Set<string>} required        the course's required problem ids
 * @param {{id: string}[]} students
 * @param {{userId, problemId, verdict, submittedAt?}[]} submissions
 */
function tally(required, students, submissions) {
  const solved = new Map(students.map((s) => [s.id, new Set()]));
  const attempted = new Map(students.map((s) => [s.id, new Set()]));
  const lastActiveMs = new Map(students.map((s) => [s.id, 0]));
  for (const s of submissions) {
    const mine = solved.get(s.userId);
    if (!mine || !required.has(s.problemId)) continue;
    attempted.get(s.userId).add(s.problemId);
    if (s.verdict === 'Accepted') mine.add(s.problemId);
    const ms = toMillis(s.submittedAt);
    if (ms > lastActiveMs.get(s.userId)) lastActiveMs.set(s.userId, ms);
  }
  return { solved, attempted, lastActiveMs };
}

/** One student's standing in the course. */
function studentProgress(total, solvedSet, attemptedSet, units = []) {
  const solved = solvedSet.size;
  const status = total > 0 && solved >= total ? 'completed' : attemptedSet.size > 0 ? 'in_progress' : 'not_started';
  const workUnits = units.filter((u) => u.problemIds.length > 0);
  return {
    solved, total, percent: percentOf(solved, total), status,
    unitsDone: workUnits.filter((u) => u.problemIds.every((p) => solvedSet.has(p))).length,
    unitsTotal: workUnits.length,
  };
}

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * Class-level figures from per-student progress rows. The average never reads 100 unless everyone is complete.
 * @param {{percent: number, status: string, solved: number}[]} rows
 */
function summarise(rows, total) {
  const n = rows.length;
  const completed = rows.filter((r) => r.status === 'completed').length;
  const inProgress = rows.filter((r) => r.status === 'in_progress').length;
  const notStarted = rows.filter((r) => r.status === 'not_started').length;
  const exactMean = n && total ? rows.reduce((a, r) => a + (r.solved / total) * 100, 0) / n : 0;
  return {
    students: n, totalProblems: total, completed, inProgress, notStarted,
    avgPercent: n && total ? (completed === n ? 100 : Math.min(99, Math.round(exactMean))) : 0,
    medianPercent: median(rows.map((r) => r.percent)),
  };
}

module.exports = { isRequired, percentOf, resolveCourse, tally, studentProgress, summarise, median };
