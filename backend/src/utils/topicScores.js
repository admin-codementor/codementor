// Shared strengths/weaknesses scoring, used by both the faculty student-detail
// endpoint and the student's own skills endpoint so the two views never disagree.

// Minimum attempts on a topic before it's confident enough to call a strength/
// weakness (otherwise a single lucky/unlucky submission would dominate the ranking).
const TOPIC_CONFIDENCE_THRESHOLD = 3;

/**
 * @param {{topic: string, solved_count: number|string, failed_count: number|string, hint_usage_count: number|string}[]} masteryRows
 * @returns {{strengths: object[], weaknesses: object[]}}
 */
function computeStrengthsWeaknesses(masteryRows) {
  const topicScores = masteryRows
    .map((r) => {
      const solved = parseInt(r.solved_count) || 0;
      const failed = parseInt(r.failed_count) || 0;
      const attempts = solved + failed;
      return {
        topic: r.topic,
        solvedCount: solved,
        failedCount: failed,
        hintUsageCount: parseInt(r.hint_usage_count) || 0,
        attempts,
        acRate: attempts ? Math.round((solved / attempts) * 100) : 0,
      };
    })
    .filter((t) => t.attempts >= TOPIC_CONFIDENCE_THRESHOLD);

  const strengths = [...topicScores]
    .sort((a, b) => b.acRate - a.acRate || b.attempts - a.attempts)
    .slice(0, 5)
    .map((t) => ({ ...t, reason: `${t.solvedCount}/${t.attempts} solved (${t.acRate}% success)` }));

  const weaknesses = [...topicScores]
    .sort((a, b) => a.acRate - b.acRate || b.failedCount - a.failedCount)
    .slice(0, 5)
    .map((t) => ({
      ...t,
      reason: t.hintUsageCount > 0
        ? `${t.failedCount} failed attempts, ${t.hintUsageCount} hints used`
        : `${t.failedCount}/${t.attempts} attempts failed`,
    }));

  return { strengths, weaknesses };
}

module.exports = { computeStrengthsWeaknesses, TOPIC_CONFIDENCE_THRESHOLD };
