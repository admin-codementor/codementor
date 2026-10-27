// Each student sees the multiple-choice questions of an exam in their own order, and each question's options in their own order, so a
// neighbour's screen does not show the same thing. The order is decided ONCE, when the attempt is created, and stored on the attempt
// (`layout`), so a reload, a second device or a resume always shows the same order.
//
// Everything the server stores stays in the ORIGINAL numbering (selectedIndex is the index in the exam's own option list), so scoring,
// the faculty report and analytics are untouched. Only what is SENT to and RECEIVED from the student's page is translated:
//   page -> server: toOriginal(perm, displayedIndex)
//   server -> page: toDisplayed(perm, originalIndex), and the questions/options in display order
//
// layout = { v: 1, sections: { [sectionId]: { order: [questionId...], options: { [questionId]: [originalIndex...] } } } }
// (maps of arrays only: Firestore does not allow an array inside an array)
const crypto = require('crypto');

// Options that refer to other options ("All of the above", "Both A and B", "None of these") break if reordered, so such a question keeps
// its options in the written order (its place among the questions is still shuffled).
const POSITIONAL_OPTION = /\b(all|none|both|neither|any)\s+of\s+(the\s+)?(above|these|them|following)\b|\b(above|below)\b|\b(both|and|&|,)\s*\(?[a-d]\)?\s*(and|&|,|or)\s*\(?[a-d]\)?\b|\boption\s+[a-d]\b|^\(?[a-d]\)?\s+(and|&)\s+\(?[a-d]\)?$/i;

function needsFixedOptionOrder(options) {
  return (options || []).some((o) => POSITIONAL_OPTION.test(String(o ?? '')));
}

/** Uniform shuffle (Fisher-Yates with a cryptographic source). Returns a new array. */
function shuffle(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {{id: string, questions: {id: string, options?: string[]}[]}[]} mcqSections the exam's multiple-choice sections
 * @returns {object} the layout to store on a NEW attempt
 */
function buildLayout(mcqSections) {
  const sections = {};
  for (const s of mcqSections || []) {
    const qs = s.questions || [];
    const options = {};
    for (const q of qs) {
      const n = (q.options || []).length;
      if (n < 2 || needsFixedOptionOrder(q.options)) continue;
      options[q.id] = shuffle(Array.from({ length: n }, (_, i) => i));
    }
    sections[s.id] = { order: shuffle(qs.map((q) => q.id)), options };
  }
  return { v: 1, sections };
}

function isPermutation(p, n) {
  return Array.isArray(p) && p.length === n && new Set(p).size === n && p.every((i) => Number.isInteger(i) && i >= 0 && i < n);
}

/** The stored option order for a question, or null (= the written order) when there is none or it no longer fits the question. */
function permFor(sectionLayout, questionId, optionCount) {
  const p = sectionLayout?.options?.[questionId];
  return isPermutation(p, optionCount) ? p : null;
}

const toOriginal = (perm, displayedIndex) => (perm ? perm[displayedIndex] : displayedIndex);
function toDisplayed(perm, originalIndex) {
  if (!perm) return originalIndex;
  const i = perm.indexOf(originalIndex);
  return i === -1 ? originalIndex : i;
}

/**
 * The questions of one section in the order this student sees them, each with its options in that student's order.
 * A question added after the layout was made (a faculty edit during the exam) goes at the end; one that was removed is dropped.
 * @returns {{question: object, perm: number[]|null}[]}
 */
function arrange(questions, sectionLayout) {
  const byId = new Map((questions || []).map((q) => [q.id, q]));
  const seen = new Set();
  const ordered = [];
  for (const id of sectionLayout?.order || []) {
    if (byId.has(id) && !seen.has(id)) { ordered.push(byId.get(id)); seen.add(id); }
  }
  for (const q of questions || []) if (!seen.has(q.id)) ordered.push(q);
  return ordered.map((question) => ({ question, perm: permFor(sectionLayout, question.id, (question.options || []).length) }));
}

/** Options re-ordered for display. */
const displayOptions = (options, perm) => (perm ? perm.map((i) => options[i]) : options);

/**
 * The student's saved state, with each chosen option translated from the original numbering to what that student sees.
 * @param permsByQuestion Map<questionId, number[]|null>
 */
function displayState(questionState, permsByQuestion) {
  const out = {};
  for (const [qid, st] of Object.entries(questionState || {})) {
    out[qid] = Number.isInteger(st?.selectedIndex) ? { ...st, selectedIndex: toDisplayed(permsByQuestion.get(qid) ?? null, st.selectedIndex) } : st;
  }
  return out;
}

module.exports = { buildLayout, arrange, permFor, toOriginal, toDisplayed, displayOptions, displayState, needsFixedOptionOrder, shuffle, isPermutation };
