// Where should a student continue in a course?
//
// "Resume" is the problem they last worked on and have not solved (so they come back to the exact place they stopped);
// when nothing is in progress it is the first unsolved problem in course order ("next up"); when everything is solved
// there is nothing to resume. "Last worked on" comes from the time record (visiting a problem counts, even without a
// submission) and from submissions, whichever is more recent.
//
// Pure: callers pass plain arrays and maps.

/**
 * @param {Array<{id: string, title: string, moduleId: string, moduleTitle: string, position: number, moduleTotal: number}>} ordered
 *        every problem of the course in course order
 * @param {Set<string>} solved problem ids the student has solved
 * @param {Map<string, number>} touchedAt problem id -> last time (ms) the student visited or submitted it
 */
function resolveResume(ordered, solved, touchedAt) {
  const unsolved = ordered.filter((p) => !solved.has(p.id));
  if (unsolved.length === 0) return null;

  let inProgress = null;
  for (const p of unsolved) {
    const t = touchedAt.get(p.id);
    if (t && (!inProgress || t > inProgress.t)) inProgress = { p, t };
  }
  const pick = inProgress ? inProgress.p : unsolved[0];
  return {
    problemId: pick.id,
    title: pick.title,
    moduleId: pick.moduleId,
    moduleTitle: pick.moduleTitle,
    position: pick.position,
    moduleTotal: pick.moduleTotal,
    reason: inProgress ? 'in_progress' : 'next',
    touchedAt: inProgress ? inProgress.t : null,
  };
}

module.exports = { resolveResume };
