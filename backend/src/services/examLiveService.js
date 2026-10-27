// Things the live exam endpoints need on every request, kept cheap, plus the one place a proctor event becomes a violation.
//
// Every answer a student saves is checked against the exam's section, and every proctor event against the exam's limit. Reading the
// whole section or the exam document from the database each time multiplied the reads by the number of questions and by 1000 students.
// Both are held for a minute in this process. A staff member editing a published exam mid-exam therefore takes up to a minute to
// show: acceptable, and editing a live exam is rare.
const examRepo = require('../repositories/examRepository');
const examAttempt = require('../utils/examAttempt');

const TTL_MS = 60000;
const MAX_ENTRIES = 500;
const sectionMemo = new Map();
const examMemo = new Map();

const remember = (map, key, value) => {
  if (map.size >= MAX_ENTRIES) map.clear();
  map.set(key, { value, until: Date.now() + TTL_MS });
  return value;
};
const recall = (map, key) => {
  const hit = map.get(key);
  return hit && hit.until > Date.now() ? hit : null;
};

/** @returns {Promise<{type: 'mcq'|'coding', ids: Set<string>, optionCounts?: Map<string, number>}|null>}  the ids a student may answer in this section, and for multiple choice how many options each question has */
async function sectionIds(examId, sectionId) {
  const key = `${examId}:${sectionId}`;
  const hit = recall(sectionMemo, key);
  if (hit) return hit.value;
  const section = await examRepo.getSection(examId, sectionId);
  let value = null;
  if (section?.type === 'mcq') {
    const qs = await examRepo.getSectionQuestions(examId, sectionId);
    value = { type: 'mcq', ids: new Set(qs.map((q) => q.id)), optionCounts: new Map(qs.map((q) => [q.id, (q.options || []).length])) };
  }
  else if (section?.type === 'coding') value = { type: 'coding', ids: new Set(section.problemIds || []) };
  return remember(sectionMemo, key, value);
}

async function examDoc(examId) {
  const hit = recall(examMemo, examId);
  if (hit) return hit.value;
  return remember(examMemo, examId, await examRepo.getById(examId));
}

/**
 * Record a proctor event against the student's own attempt: counts it if it counts, and locks the attempt when the exam's limit is
 * reached. Safe to call for any event; events that do not count change nothing.
 * @returns {Promise<{counted: boolean, count: number, locked: boolean, limit: number}>}
 */
async function recordViolation({ examId, userId, eventType }) {
  const exam = await examDoc(examId);
  if (!exam) return { counted: false, count: 0, locked: false, limit: examAttempt.DEFAULT_VIOLATION_LIMIT };
  const limit = Number.isInteger(exam.violationLimit) ? exam.violationLimit : examAttempt.DEFAULT_VIOLATION_LIMIT;
  const now = Date.now();
  const out = await examRepo.mutateAttempt(examId, userId, (attempt) => {
    // Only a running attempt can be paused; a finished or already paused one is left alone.
    if (!attempt || attempt.submittedAt || attempt.locked) return { outcome: { counted: false, count: attempt?.violationCount ?? 0, locked: !!attempt?.locked } };
    const v = examAttempt.applyViolation(attempt, exam, eventType, now);
    if (!v.counts) return { outcome: { counted: false, count: v.count, locked: false } };
    const update = { violationCount: v.count, lastViolationAt: new Date(now) };
    if (v.lock) update.locked = v.lock;
    return { outcome: { counted: true, count: v.count, locked: !!v.lock }, update };
  });
  return { ...out, limit };
}

/** For tests: forget what was remembered (another test may have loaded a different exam under the same id). */
const clearMemo = () => { sectionMemo.clear(); examMemo.clear(); };

module.exports = { sectionIds, examDoc, recordViolation, clearMemo };
