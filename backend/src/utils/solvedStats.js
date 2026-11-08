// A student's running "problems solved" record. Pure, so the rules are tested without a database.
//
// One document per student: { userId, solvedCount, solvedProblemIds }. It changes only when the student gets an Accepted on a
// problem they had NOT solved before, so it is written a few times per student, not on every attempt.

/**
 * Add one solved problem.
 * @param {{solvedProblemIds?: string[]} | null} doc  the current record, or null for a new student
 * @returns {{ next: {solvedCount: number, solvedProblemIds: string[]}, isNew: boolean }}
 */
function applySolve(doc, problemId) {
  const ids = Array.isArray(doc?.solvedProblemIds) ? doc.solvedProblemIds : [];
  if (!problemId || ids.includes(problemId)) return { next: { solvedCount: ids.length, solvedProblemIds: ids }, isNew: false };
  const next = [...ids, problemId];
  return { next: { solvedCount: next.length, solvedProblemIds: next }, isNew: true };
}

/**
 * Add many solved problems at once (the one-time build from existing submissions, and the safety re-check).
 * Only ever adds, so it can run while students are still solving problems.
 */
function mergeSolved(doc, problemIds) {
  const set = new Set(Array.isArray(doc?.solvedProblemIds) ? doc.solvedProblemIds : []);
  for (const id of problemIds || []) if (id) set.add(id);
  const ids = [...set];
  return { solvedCount: ids.length, solvedProblemIds: ids };
}

module.exports = { applySolve, mergeSolved };
