// Proctor events that are routine bookkeeping, not signals of anything. ONE list, used by the exam report, the course
// analytics and the assignment proctor report. They used to disagree: `copy` counted as a flag on one screen and was
// ignored on the other two, so the same student was "medium risk" in one place and clean in another.
const BENIGN_PROCTOR_EVENTS = new Set(['fullscreen_enter', 'exam_start', 'copy']);

/** Events that count toward a student's flag total. */
const isFlagEvent = (eventType) => !BENIGN_PROCTOR_EVENTS.has(eventType);

module.exports = { BENIGN_PROCTOR_EVENTS, isFlagEvent };
