// Exam scoring in one place. Pure: no I/O, so every mark is checkable against a hand-built fixture.
//
// Used by submitting an exam, by the faculty results report, and when an attempt that ran out of time is
// scored. They used to score separately and disagreed:
//   - the faculty report read `correct_index` / `negative_marks` from raw documents that store `correctIndex` /
//     `negativeMarks`, so a correct answer never scored;
//   - the exam's default negative marking was saved but never applied;
//   - the mark for a coding problem was the LAST submission, so a broken re-submit could cancel an accepted answer.
//
// Question objects may be either the stored shape (camelCase) or the API shape (snake_case); both are read.

const round2 = (n) => Math.round(n * 100) / 100;

const correctIndexOf = (q) => q.correctIndex ?? q.correct_index;
const questionNegative = (q) => q.negativeMarks ?? q.negative_marks;

/**
 * Marks taken off for a wrong answer: the question's own value, else its section's, else the exam's default.
 * @returns {number}
 */
function negativeFor(question, section, exam) {
  return questionNegative(question) ?? section?.negativeMarking ?? exam?.negativeMarkingDefault ?? 0;
}

/** Score of one MCQ section. An unanswered question scores nothing and costs nothing. */
function scoreMcqSection(section, questions, questionState, exam) {
  let score = 0;
  let total = 0;
  for (const q of questions) {
    const marks = q.marks ?? section.marksPerQuestion ?? 1;
    total += marks;
    const entry = (questionState || {})[q.id];
    const selected = entry && Number.isInteger(entry.selectedIndex) ? entry.selectedIndex : null;
    if (selected == null) continue;
    if (selected === correctIndexOf(q)) score += marks;
    else score -= negativeFor(q, section, exam);
  }
  return { id: section.id, title: section.title, type: 'mcq', score: round2(score), total: round2(total) };
}

/** Score of one coding section: the sum of the marks recorded for its problems. */
function scoreCodingSection(section, codingState) {
  const problemIds = section.problemIds || [];
  let score = 0;
  for (const pid of problemIds) score += (codingState || {})[pid]?.score || 0;
  return { id: section.id, title: section.title, type: 'coding', score: round2(score), total: round2(problemIds.length * (section.marksPerQuestion || 1)) };
}

/**
 * A whole attempt.
 * @param {{sections: object[], questionsBySection: Map<string, object[]>, attempt: object, exam: object}} a
 * @returns {{score: number, total: number, sections: object[]}}
 */
function scoreAttempt({ sections, questionsBySection, attempt, exam }) {
  const rows = sections.map((s) => (s.type === 'mcq'
    ? scoreMcqSection(s, questionsBySection.get(s.id) || [], attempt.questionState, exam)
    : scoreCodingSection(s, attempt.codingState)));
  return {
    score: round2(rows.reduce((n, r) => n + r.score, 0)),
    total: round2(rows.reduce((n, r) => n + r.total, 0)),
    sections: rows,
  };
}

/**
 * What to store for a coding problem after a new submission: the BEST mark so far, not the latest. A worse (or
 * broken) later submission never lowers an earlier accepted one. A tie keeps the newer submission's details.
 * @param {object|undefined} previous  the stored coding state for this problem
 * @param {object} next                the state this submission would store
 */
function betterCodingAnswer(previous, next) {
  if (!previous || previous.score == null || (next.score ?? 0) >= previous.score) return next;
  return { ...previous, status: 'answered' };
}

/** Has this attempt run past its time window without being submitted? */
function isExpiredUnsubmitted(attempt, now = Date.now()) {
  if (!attempt || attempt.submittedAt) return false;
  const ms = attempt.windowExpiresAt?.toMillis?.() ?? (attempt.windowExpiresAt ? new Date(attempt.windowExpiresAt).getTime() : null);
  return ms != null && Number.isFinite(ms) && now > ms;
}

module.exports = { negativeFor, scoreMcqSection, scoreCodingSection, scoreAttempt, betterCodingAnswer, isExpiredUnsubmitted };
