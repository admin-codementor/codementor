// Ranking students by problems solved. Pure.
//
// One rule for the dashboard rank and the leaderboard (they used to disagree: the dashboard broke ties in arbitrary
// order, the leaderboard by name and gave tied students consecutive ranks, so the same student was "#7" on one and "#9"
// on the other):
//   - students on the same score share a rank, and the next rank skips ("1, 2, 2, 4");
//   - a student who has not solved anything is UNRANKED (rank 0): on day one nobody has solved anything, and calling
//     all 657 of them "#1" would be wrong;
//   - the list is ordered by score, then by name, so it is stable.
// "Same class" means same department, same YEAR and same section: section A exists in every year.

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => number} scoreOf
 * @param {(row: T) => string} nameOf
 * @returns {(T & {rank: number})[]}
 */
function rankRows(rows, scoreOf, nameOf = (r) => r.name || '') {
  const sorted = [...rows].sort((a, b) => scoreOf(b) - scoreOf(a) || String(nameOf(a)).localeCompare(String(nameOf(b))));
  let rank = 0;
  let prevScore = null;
  return sorted.map((row, i) => {
    const score = scoreOf(row);
    if (score !== prevScore) { rank = i + 1; prevScore = score; }
    return { ...row, rank: score > 0 ? rank : 0 };
  });
}

/** Are these two student profiles in the same class (department + year + section)? A missing year is a wildcard. */
function sameClass(a, b) {
  if (!a?.department || !a?.section) return false;
  if (a.department !== b?.department || a.section !== b?.section) return false;
  return a.year == null || b?.year == null || String(a.year) === String(b.year);
}

module.exports = { rankRows, sameClass };
