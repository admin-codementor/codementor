// Pure aggregation for the exam report. No I/O, so every figure can be checked
// against a hand-built fixture.

/** Proctor events that are routine bookkeeping, not signals of anything. */
const BENIGN_PROCTOR_EVENTS = new Set(['fullscreen_enter', 'exam_start']);

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/**
 * Score distribution in fixed percentage bands. Bands (not raw scores) so the
 * shape is comparable between exams marked out of 20 and out of 100.
 */
function scoreBands(attempts) {
  const bands = [
    { label: '0-19%', from: 0, to: 20, count: 0 },
    { label: '20-39%', from: 20, to: 40, count: 0 },
    { label: '40-59%', from: 40, to: 60, count: 0 },
    { label: '60-79%', from: 60, to: 80, count: 0 },
    { label: '80-100%', from: 80, to: 101, count: 0 },
  ];
  for (const a of attempts) {
    if (!a.total) continue;
    const pct = ((a.score ?? 0) / a.total) * 100;
    const b = bands.find((x) => pct >= x.from && pct < x.to);
    if (b) b.count += 1;
  }
  return bands.map(({ label, count }) => ({ label, count }));
}

/**
 * Per-section score for one attempt, recomputed from the stored state.
 * Section scores are not persisted on the attempt (only the exam total is), so
 * this is the only way to answer "which section did the class lose marks on".
 */
function sectionScoresFor(attempt, sections, questionsBySection) {
  return sections.map((s) => {
    if (s.type === 'mcq') {
      const questions = questionsBySection.get(s.id) || [];
      let score = 0;
      let total = 0;
      for (const q of questions) {
        const marks = q.marks ?? s.marksPerQuestion ?? 1;
        const negative = q.negative_marks ?? s.negativeMarking ?? 0;
        total += marks;
        const entry = (attempt.questionState || {})[q.id];
        if (!entry || entry.selectedIndex == null) continue;
        if (entry.selectedIndex === q.correct_index) score += marks;
        else score -= negative;
      }
      return { id: s.id, title: s.title, type: 'mcq', score: Math.round(score * 100) / 100, total };
    }
    const problemIds = s.problemIds || [];
    const marks = s.marksPerQuestion ?? 1;
    let score = 0;
    for (const pid of problemIds) {
      const entry = (attempt.codingState || {})[pid];
      if (entry) score += entry.score || 0;
    }
    return { id: s.id, title: s.title, type: 'coding', score: Math.round(score * 100) / 100, total: problemIds.length * marks };
  });
}

/** Per-student proctor summary, same thresholds the assignment proctor report uses. */
function proctorSummary(events) {
  const byUser = new Map();
  for (const e of events) {
    const u = byUser.get(e.userId) || { counts: {}, total: 0 };
    u.counts[e.eventType] = (u.counts[e.eventType] || 0) + 1;
    if (!BENIGN_PROCTOR_EVENTS.has(e.eventType)) u.total += 1;
    byUser.set(e.userId, u);
  }
  const out = new Map();
  for (const [userId, u] of byUser) {
    out.set(userId, {
      tab_switches: u.counts.tab_switch || 0,
      fullscreen_exits: u.counts.fullscreen_exit || 0,
      pastes: u.counts.paste || 0,
      copies: u.counts.copy || 0,
      total: u.total,
      risk: u.total >= 8 ? 'high' : u.total >= 3 ? 'medium' : 'low',
    });
  }
  return out;
}

/**
 * Minutes between starting and submitting. Both timestamps live on the attempt;
 * nothing stores elapsed time directly, so this derives it rather than guessing.
 */
function minutesTaken(attempt) {
  const started = toMillis(attempt.startedAt);
  const submitted = toMillis(attempt.submittedAt);
  if (!started || !submitted || submitted < started) return null;
  return Math.max(0, Math.round((submitted - started) / 60000));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

module.exports = { scoreBands, sectionScoresFor, proctorSummary, minutesTaken, median, BENIGN_PROCTOR_EVENTS };
