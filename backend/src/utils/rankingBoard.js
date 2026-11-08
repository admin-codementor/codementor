// The shared ranking table, built from plain data so it can be tested without a database. Pure.
//
// Ranking needs only: who each student is (name, class, rating, public handle) and how many DISTINCT problems each has
// solved. Failed attempts are irrelevant, so the input is Accepted submissions only.

/**
 * @param {Map<string, object>} studentsMap     id -> student profile (role student)
 * @param {{userId?: string, problemId?: string}[]} acceptedRows   Accepted submissions, two fields each
 * @param {Map<string, string>} handleByUser    id -> public handle
 * @returns {{ solved: Record<string, number>, students: Record<string, object>, builtAt: number }}  JSON-safe
 */
function buildBoard(studentsMap, acceptedRows, handleByUser = new Map(), now = Date.now()) {
  const sets = new Map();
  for (const r of acceptedRows) {
    if (!r?.userId || !r?.problemId) continue;
    let set = sets.get(r.userId);
    if (!set) { set = new Set(); sets.set(r.userId, set); }
    set.add(r.problemId);
  }
  const solved = {};
  for (const [id, set] of sets) if (studentsMap.has(id)) solved[id] = set.size;

  const students = {};
  for (const [id, p] of studentsMap) {
    students[id] = {
      name: p.name || '',
      department: p.department || null,
      section: p.section || null,
      year: p.year ?? null,
      rating: p.rating ?? null,
      graduated: p.graduated === true,
      publicHandle: p.publicProfile?.published ? handleByUser.get(id) ?? null : null,
    };
  }
  return { solved, students, builtAt: now };
}

module.exports = { buildBoard };
