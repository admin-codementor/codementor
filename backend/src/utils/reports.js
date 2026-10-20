// Faculty report figures. Pure: plain arrays in, plain objects out, so each report can be checked against a fixture.
//
// Days are the college's calendar day (IST), the same as the time records, so "today" means the same thing everywhere.

const DAY_MS = 86400000;
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const istDay = (ms) => new Date(ms + 330 * 60 * 1000).toISOString().slice(0, 10);
const istClock = (ms) => new Date(ms + 330 * 60 * 1000).toISOString().slice(11, 16);

/**
 * One day of activity: who submitted, how much, and what they solved for the first time that day.
 * @param {{id,name,rollNo,section,year}[]} students   students in scope
 * @param {{userId,problemId,verdict,submittedAt}[]} submissions  every submission (any problem)
 * @param {string} day  YYYY-MM-DD (IST)
 */
function buildDailyReport({ students, submissions, day }) {
  const byId = new Map(students.map((s) => [s.id, s]));
  const firstSolve = new Map(); // "user|problem" -> earliest accepted ms
  for (const s of submissions) {
    if (s.verdict !== 'Accepted' || !byId.has(s.userId)) continue;
    const key = `${s.userId}|${s.problemId}`;
    const ms = toMillis(s.submittedAt);
    if (ms && (!firstSolve.has(key) || ms < firstSolve.get(key))) firstSolve.set(key, ms);
  }
  const per = new Map();
  for (const s of submissions) {
    const ms = toMillis(s.submittedAt);
    if (!ms || !byId.has(s.userId) || istDay(ms) !== day) continue;
    const r = per.get(s.userId) || { submissions: 0, accepted: 0, problems: new Set(), firstMs: ms, lastMs: ms };
    r.submissions += 1;
    if (s.verdict === 'Accepted') r.accepted += 1;
    r.problems.add(s.problemId);
    r.firstMs = Math.min(r.firstMs, ms);
    r.lastMs = Math.max(r.lastMs, ms);
    per.set(s.userId, r);
  }
  const solvedFirstToday = (uid) => [...firstSolve.entries()].filter(([k, ms]) => k.startsWith(`${uid}|`) && istDay(ms) === day).length;
  const rows = [...per.entries()].map(([id, r]) => {
    const st = byId.get(id);
    return {
      id, name: st.name || 'Unknown', rollNo: st.rollNo || null, section: st.section || null, year: st.year ?? null,
      submissions: r.submissions, accepted: r.accepted, problemsTried: r.problems.size,
      solvedForFirstTime: solvedFirstToday(id), firstAt: istClock(r.firstMs), lastAt: istClock(r.lastMs),
    };
  }).sort((a, b) => b.submissions - a.submissions || a.name.localeCompare(b.name));
  return {
    day,
    totals: {
      students: students.length,
      active: rows.length,
      submissions: rows.reduce((n, r) => n + r.submissions, 0),
      solvedForFirstTime: rows.reduce((n, r) => n + r.solvedForFirstTime, 0),
    },
    rows,
  };
}

/**
 * Late work on one assignment, from its marks. One row per student who solved something after the cut-off, plus a count of
 * students who never solved anything.
 * @param {{id,name,rollNo}[]} students
 * @param {{id, problems:{status, solvedAt}[]}[]} marks   buildAssignmentMarks output
 * @param {unknown} deadline
 */
function buildLateRows({ students, marks, deadline }) {
  const byId = new Map(students.map((s) => [s.id, s]));
  const dl = toMillis(deadline);
  const rows = [];
  let neverSolved = 0;
  for (const m of marks) {
    const st = byId.get(m.id);
    if (!st) continue;
    const late = m.problems.filter((p) => p.status === 'late');
    const solved = m.problems.filter((p) => p.status === 'on_time' || p.status === 'late');
    if (solved.length === 0) neverSolved += 1;
    if (late.length === 0) continue;
    const firstLateMs = Math.min(...late.map((p) => p.solvedAt || Infinity));
    rows.push({
      id: m.id, name: st.name || 'Unknown', rollNo: st.rollNo || null,
      lateProblems: late.length, onTimeProblems: m.problems.length - late.length - m.problems.filter((p) => p.status === 'not_solved' || p.status === 'not_attempted').length,
      totalProblems: m.problems.length,
      hoursLate: dl && Number.isFinite(firstLateMs) ? Math.max(0, Math.round((firstLateMs - dl) / 3600000)) : null,
    });
  }
  rows.sort((a, b) => (b.hoursLate ?? 0) - (a.hoursLate ?? 0) || a.name.localeCompare(b.name));
  return { rows, neverSolved, students: students.length };
}

/** The one-screen summary: headline counts for the viewer's students. */
function buildSummary({ students, submissions, now, overdueAssignments = 0, pendingReopen = 0 }) {
  const ids = new Set(students.map((s) => s.id));
  const since = (days) => now - days * DAY_MS;
  const mine = submissions.filter((s) => ids.has(s.userId));
  const within = (days) => mine.filter((s) => toMillis(s.submittedAt) >= since(days));
  const active = (days) => new Set(within(days).map((s) => s.userId)).size;
  const w7 = within(7);
  return {
    students: students.length,
    active7: active(7), active30: active(30),
    submissions7: w7.length,
    accepted7: w7.filter((s) => s.verdict === 'Accepted').length,
    solvedDistinct7: new Set(w7.filter((s) => s.verdict === 'Accepted').map((s) => `${s.userId}|${s.problemId}`)).size,
    neverSubmitted: students.filter((s) => !mine.some((x) => x.userId === s.id)).length,
    overdueAssignments, pendingReopen,
  };
}

module.exports = { buildDailyReport, buildLateRows, buildSummary, istDay, istClock };
