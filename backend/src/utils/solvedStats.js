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

/**
 * Record one judged attempt (any verdict). Counts every attempt and every Accepted, and keeps the set of distinct solved problems.
 * @returns {{ next: {solvedCount, solvedProblemIds, totalSubmissions, acceptedSubmissions}, isNew: boolean }}  isNew = first solve of that problem
 */
function applyAttempt(doc, { problemId, accepted }) {
  const total = (Number(doc?.totalSubmissions) || 0) + 1;
  const acc = (Number(doc?.acceptedSubmissions) || 0) + (accepted ? 1 : 0);
  if (!accepted) {
    const ids = Array.isArray(doc?.solvedProblemIds) ? doc.solvedProblemIds : [];
    return { next: { solvedCount: ids.length, solvedProblemIds: ids, totalSubmissions: total, acceptedSubmissions: acc }, isNew: false };
  }
  const { next, isNew } = applySolve(doc, problemId);
  return { next: { ...next, totalSubmissions: total, acceptedSubmissions: acc }, isNew };
}

/**
 * Fold the one-time scan of existing submissions into a record. Solved problems only ever ADD. The attempt counters take the larger of
 * the stored value and the scan, so a record that already counted live attempts is not reset; an attempt that lands between the scan
 * and this write can be missed, so run the backfill when no exam is live.
 */
function mergeBackfill(doc, { total = 0, accepted = 0, problemIds = [] }) {
  const solved = mergeSolved(doc, problemIds);
  return {
    ...solved,
    totalSubmissions: Math.max(Number(doc?.totalSubmissions) || 0, total),
    acceptedSubmissions: Math.max(Number(doc?.acceptedSubmissions) || 0, accepted),
  };
}

/**
 * Per-student numbers from submission rows (userId, problemId, verdict): the slow way, used until the records are backfilled.
 * @returns {Record<string, {solved: number, total: number, accepted: number}>}
 */
function aggregateRows(rows) {
  const per = new Map();
  for (const r of rows) {
    if (!r?.userId) continue;
    let e = per.get(r.userId);
    if (!e) { e = { ids: new Set(), total: 0, accepted: 0 }; per.set(r.userId, e); }
    e.total += 1;
    if (r.verdict === 'Accepted') { e.accepted += 1; if (r.problemId) e.ids.add(r.problemId); }
  }
  const out = {};
  for (const [id, e] of per) out[id] = { solved: e.ids.size, total: e.total, accepted: e.accepted };
  return out;
}

module.exports = { applySolve, mergeSolved, applyAttempt, mergeBackfill, aggregateRows };
