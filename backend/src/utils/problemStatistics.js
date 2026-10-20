// Per-question statistics for faculty: for one problem and one group of students, who finished, who is stuck, how long it
// took, what kind of failures they hit, and who looks suspicious. Pure: callers hand in plain arrays.
//
// Definitions (kept in one place so the screen and its footnotes cannot drift apart):
//   completed    at least one Accepted submission
//   in progress  not completed, but has submitted or spent time on the problem
//   not started  neither
//   failure kind a non-Accepted verdict is a compile error, a runtime error, a time-limit hit, a wrong answer, or other
//   time         active time on the problem page (see problemTimes); it exists only from the day tracking was switched on
//   suspicious   at least FLAG_THRESHOLD flag events on THIS problem (blocked paste attempts and other proctor events;
//                the routine events in utils/proctorEvents.js do not count)
//   best         the completed student with the shortest time to solve (fewest attempts when no time was recorded)
//   weakest      the unfinished student who has tried the most (most submissions, then most time); with nobody unfinished,
//                the completed student who took longest

const { isFlagEvent } = require('./proctorEvents');

const FLAG_THRESHOLD = 3;
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

const TIME_BINS = [
  { label: 'Under 5 min', to: 5 * 60 },
  { label: '5 to 10 min', to: 10 * 60 },
  { label: '10 to 20 min', to: 20 * 60 },
  { label: '20 to 40 min', to: 40 * 60 },
  { label: '40 to 60 min', to: 60 * 60 },
  { label: 'Over 60 min', to: Infinity },
];

/** What a non-Accepted verdict means for the student. */
function failureKind(verdict) {
  const v = String(verdict || '');
  if (v === 'Accepted') return null;
  if (/compil/i.test(v)) return 'compile';
  if (/time limit/i.test(v)) return 'timeout';
  if (/runtime|nzec|sigsegv|sigfpe|sigabrt|exec/i.test(v)) return 'runtime';
  if (/wrong/i.test(v)) return 'wrong';
  return 'other';
}

const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * @param {object} a
 * @param {{id,name,rollNo,section,year}[]} a.students   students in scope (already filtered to the chosen groups)
 * @param {{userId,verdict,submittedAt}[]} a.submissions every submission to this problem
 * @param {{userId,seconds,solvedAtSeconds}[]} a.times    time records for this problem
 * @param {{userId,eventType}[]} a.events                 proctor events logged on this problem
 */
function buildProblemStatistics({ students, submissions, times, events }) {
  const ids = new Set(students.map((s) => s.id));
  const subsBy = new Map();
  for (const s of submissions) {
    if (!ids.has(s.userId)) continue;
    const list = subsBy.get(s.userId) || [];
    list.push(s);
    subsBy.set(s.userId, list);
  }
  const timeBy = new Map(times.filter((t) => ids.has(t.userId)).map((t) => [t.userId, t]));
  const flagsBy = new Map();
  for (const e of events) {
    if (!ids.has(e.userId) || !isFlagEvent(e.eventType)) continue;
    flagsBy.set(e.userId, (flagsBy.get(e.userId) || 0) + 1);
  }

  const rows = students.map((st) => {
    const subs = (subsBy.get(st.id) || []).slice().sort((a, b) => toMillis(a.submittedAt) - toMillis(b.submittedAt));
    const t = timeBy.get(st.id);
    const firstAccepted = subs.findIndex((s) => s.verdict === 'Accepted');
    const completed = firstAccepted >= 0;
    const seconds = t?.seconds || 0;
    const kinds = { compile: 0, runtime: 0, timeout: 0, wrong: 0, other: 0 };
    for (const s of subs) { const k = failureKind(s.verdict); if (k) kinds[k] += 1; }
    const flagEvents = flagsBy.get(st.id) || 0;
    return {
      id: st.id, name: st.name || 'Unknown', rollNo: st.rollNo || null, section: st.section || null, year: st.year ?? null,
      status: completed ? 'completed' : (subs.length > 0 || seconds > 0 ? 'in_progress' : 'not_started'),
      submissions: subs.length,
      // Attempts it took: submissions up to and including the first accepted one.
      attemptsToSolve: completed ? firstAccepted + 1 : null,
      compileErrors: kinds.compile, runtimeErrors: kinds.runtime, timeouts: kinds.timeout, wrongAnswers: kinds.wrong, otherFailures: kinds.other,
      timeSeconds: seconds,
      solvedAtSeconds: completed ? (t?.solvedAtSeconds ?? null) : null,
      flagEvents,
      suspicious: flagEvents >= FLAG_THRESHOLD,
    };
  });

  const completed = rows.filter((r) => r.status === 'completed');
  const inProgress = rows.filter((r) => r.status === 'in_progress');
  const notStarted = rows.filter((r) => r.status === 'not_started');

  const withTime = rows.filter((r) => r.timeSeconds > 0);
  const solveTimes = completed.map((r) => r.solvedAtSeconds).filter((x) => x != null);

  // Best and weakest, as defined in the header.
  const pick = (r, kind) => (r ? {
    id: r.id, name: r.name, rollNo: r.rollNo, kind, status: r.status,
    timeSeconds: r.timeSeconds, solvedAtSeconds: r.solvedAtSeconds, submissions: r.submissions,
  } : null);
  const byBest = completed.slice().sort((a, b) => (a.solvedAtSeconds ?? Infinity) - (b.solvedAtSeconds ?? Infinity) || (a.attemptsToSolve - b.attemptsToSolve) || a.name.localeCompare(b.name));
  const unfinished = rows.filter((r) => r.status === 'in_progress').sort((a, b) => b.submissions - a.submissions || b.timeSeconds - a.timeSeconds || a.name.localeCompare(b.name));
  const slowestDone = completed.slice().sort((a, b) => (b.solvedAtSeconds ?? -1) - (a.solvedAtSeconds ?? -1) || b.attemptsToSolve - a.attemptsToSolve || a.name.localeCompare(b.name));

  const failures = rows.reduce((o, r) => ({
    compile: o.compile + r.compileErrors, runtime: o.runtime + r.runtimeErrors, timeout: o.timeout + r.timeouts,
    wrong: o.wrong + r.wrongAnswers, other: o.other + r.otherFailures,
  }), { compile: 0, runtime: 0, timeout: 0, wrong: 0, other: 0 });

  const timeHistogram = TIME_BINS.map((b, i) => {
    const from = i === 0 ? 0 : TIME_BINS[i - 1].to;
    return { label: b.label, count: withTime.filter((r) => r.timeSeconds >= from && r.timeSeconds < b.to).length };
  });

  return {
    totals: { students: rows.length, completed: completed.length, inProgress: inProgress.length, notStarted: notStarted.length },
    avgTimeSeconds: mean(withTime.map((r) => r.timeSeconds)),
    avgSolveSeconds: mean(solveTimes),
    avgAttemptsToSolve: completed.length ? Math.round((completed.reduce((n, r) => n + r.attemptsToSolve, 0) / completed.length) * 10) / 10 : null,
    best: pick(byBest[0], 'best'),
    weakest: pick(unfinished[0] || slowestDone[0] || null, 'weakest'),
    failures,
    timeHistogram,
    hasTimeData: withTime.length > 0,
    flagged: rows.filter((r) => r.suspicious).map((r) => ({ id: r.id, name: r.name, rollNo: r.rollNo, flagEvents: r.flagEvents }))
      .sort((a, b) => b.flagEvents - a.flagEvents || a.name.localeCompare(b.name)),
    students: rows,
  };
}

module.exports = { buildProblemStatistics, failureKind, FLAG_THRESHOLD, TIME_BINS };
