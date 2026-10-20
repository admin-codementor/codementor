// How one submission changes a student's mastery of one topic. Pure: the repository runs it inside a transaction.
//
// A topic's solved count is the number of DISTINCT problems the student has solved in it. It used to add one for
// every accepted submission, so re-submitting the same solved problem five times read as five problems of mastery.
// A failed submission to a problem the student has already solved is not a failure in the topic, so it is not counted.

/**
 * @param {object|null} current  the stored mastery document, or null for the first attempt
 * @param {{userId: string, topic: string, solved: boolean, hintUsed?: boolean, problemId?: string}} attempt
 * @returns {object} the document to store
 */
function applyAttempt(current, { userId, topic, solved, hintUsed, problemId }) {
  const doc = { ...(current || { userId, topic, solvedCount: 0, failedCount: 0, hintUsageCount: 0 }) };
  const ids = new Set(doc.solvedProblemIds || []);
  if (solved) {
    if (problemId) {
      ids.add(problemId);
      doc.solvedProblemIds = [...ids];
      doc.solvedCount = ids.size;
    } else {
      doc.solvedCount = (doc.solvedCount || 0) + 1; // a caller that does not know the problem: keep the old behaviour
    }
  } else if (!(problemId && ids.has(problemId))) {
    doc.failedCount = (doc.failedCount || 0) + 1;
  }
  if (hintUsed) doc.hintUsageCount = (doc.hintUsageCount || 0) + 1;
  return doc;
}

module.exports = { applyAttempt };
