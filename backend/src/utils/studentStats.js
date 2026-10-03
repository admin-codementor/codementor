// Pure aggregation helper for the problem list. No I/O, so it can be verified
// with plain arrays.

/**
 * Per-problem popularity/difficulty signal from raw submissions.
 *   attempts → every submission, accepted → Accepted submissions,
 *   solvers  → distinct users with at least one Accepted submission.
 * Returns a plain object (JSON-safe, so it can sit in the Redis cache).
 */
exports.aggregateProblemStats = (subs) => {
  const stats = {};
  const solverSets = {};
  for (const s of subs) {
    if (!s.problemId) continue;
    const row = stats[s.problemId] || (stats[s.problemId] = { attempts: 0, accepted: 0, solvers: 0 });
    row.attempts += 1;
    if (s.verdict === 'Accepted') {
      row.accepted += 1;
      (solverSets[s.problemId] || (solverSets[s.problemId] = new Set())).add(s.userId);
    }
  }
  for (const [pid, set] of Object.entries(solverSets)) stats[pid].solvers = set.size;
  return stats;
};
