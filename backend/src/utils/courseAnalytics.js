// Pure aggregation for the per-course faculty dashboard. No I/O: callers hand in
// plain arrays, so every number here can be checked against a hand-built fixture.

const { tally, studentProgress, summarise } = require('./courseProgress');
const { classLabel, classOrder } = require('./students');
const { buildCourseInsights } = require('./courseInsights');

const DAY_MS = 86400000;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
// The college's calendar day (IST). Time records are keyed by it, so the window is cut on the same days.
const istDay = (ms) => new Date(ms + 330 * 60 * 1000).toISOString().slice(0, 10);
const weekdayOf = (dayKeyIst) => new Date(`${dayKeyIst}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** Flagged at this many non-benign proctor events (the proctor report's "medium" risk). */
const PROCTOR_FLAG_THRESHOLD = 3;
const { BENIGN_PROCTOR_EVENTS } = require('./proctorEvents');

/**
 * How far along each student is, as a share of the course's problems solved.
 * Six buckets that always sum to the number of students. 0% and 100% are
 * exact (a student at 199/200 is 76-99%, never "complete"), so "completed"
 * here means the same thing as the Completed KPI.
 * Bucket rows use { bucket, from, count } so they feed the shared histogram chart directly.
 */
const COMPLETION_BUCKETS = [
  { bucket: '0%', from: 0 },
  { bucket: '1–25%', from: 1 },
  { bucket: '26–50%', from: 26 },
  { bucket: '51–75%', from: 51 },
  { bucket: '76–99%', from: 76 },
  { bucket: '100%', from: 100 },
];

function completionBucketIndex(solved, total) {
  if (!total || solved === 0) return 0;
  if (solved >= total) return COMPLETION_BUCKETS.length - 1;
  const pct = Math.min(99, Math.max(1, Math.floor((solved / total) * 100)));
  if (pct <= 25) return 1;
  if (pct <= 50) return 2;
  if (pct <= 75) return 3;
  return 4;
}

/** @param {Map<string, Set<string>>} solvedByStudent  ids of course problems each student has solved */
function completionStats(totalProblems, students, solvedByStudent) {
  const counts = COMPLETION_BUCKETS.map(() => 0);
  let pctSum = 0;
  let completed = 0;
  for (const st of students) {
    const n = solvedByStudent.get(st.id)?.size ?? 0;
    counts[completionBucketIndex(n, totalProblems)] += 1;
    if (totalProblems > 0) {
      pctSum += (n / totalProblems) * 100;
      if (n >= totalProblems) completed += 1;
    }
  }
  return {
    totalProblems,
    completed,
    avgPercent: students.length && totalProblems ? Math.round(pctSum / students.length) : 0,
    buckets: COMPLETION_BUCKETS.map((b, i) => ({ ...b, count: counts[i] })),
  };
}

/** Course problem ids → per-student solved sets, from raw submissions. */
function solvedByStudent(courseProblems, students, submissions) {
  const ids = new Set(students.map((s) => s.id));
  const out = new Map(students.map((s) => [s.id, new Set()]));
  for (const s of submissions) {
    if (s.verdict === 'Accepted' && courseProblems.has(s.problemId) && ids.has(s.userId)) out.get(s.userId).add(s.problemId);
  }
  return out;
}

/**
 * @param {object} a
 * @param {{id,title,problemIds:string[]}[]} a.modules   course units
 * @param {{id,name,rollNo}[]} a.students                students in scope (already filtered)
 * @param {{id,name,memberIds:Set<string>}[]} a.groups   classrooms, members already limited to scope
 * @param {{userId,problemId,verdict,submittedAt}[]} a.submissions
 * @param {{userId,eventType}[]} a.proctorEvents
 * @param {{studentA,studentB,similarity}[]} a.plagiarismPairs
 * @param {number} a.days   look-back window for activity KPIs, leaderboards and trends
 * @param {number} a.now
 */
function buildCourseAnalytics({ modules, students, groups, submissions, proctorEvents, plagiarismPairs, courseTimes = [], days, now }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const courseProblems = new Set(modules.flatMap((m) => m.problemIds || []));
  const windowStart = now - days * DAY_MS;

  // Course submissions by in-scope students only.
  const subs = submissions.filter((s) => courseProblems.has(s.problemId) && studentById.has(s.userId));

  // Per student: ever-attempted / ever-solved (unit state is lifetime, not windowed).
  const { solved, attempted, lastActiveMs } = tally(courseProblems, students, subs);

  // Unit-wise completion: solved = every problem in the unit solved,
  // partial = something attempted, notStarted = nothing attempted. A unit with no required
  // problems is "empty": nothing to do, so it must not read as unstarted work.
  const units = modules.map((m) => {
    const pids = m.problemIds || [];
    let done = 0;
    let partial = 0;
    let notStarted = 0;
    let fractionSum = 0;
    for (const st of students) {
      const sv = pids.filter((p) => solved.get(st.id).has(p)).length;
      const at = pids.filter((p) => attempted.get(st.id).has(p)).length;
      fractionSum += pids.length ? sv / pids.length : 0;
      if (pids.length === 0) continue;
      if (sv === pids.length) done += 1;
      else if (at > 0) partial += 1;
      else notStarted += 1;
    }
    return {
      id: m.id, title: m.title, problemCount: pids.length, empty: pids.length === 0,
      solved: done, partial, notStarted,
      // Share of the unit's problems the average student has solved.
      avgPercent: pids.length && students.length ? Math.round((fractionSum / students.length) * 100) : 0,
    };
  });

  const totalProblems = courseProblems.size;
  const progressRows = students.map((st) => ({
    st, ...studentProgress(totalProblems, solved.get(st.id), attempted.get(st.id), modules),
  }));
  const completedUsers = progressRows.filter((r) => r.status === 'completed').length;
  const notStartedUsers = progressRows.filter((r) => r.status === 'not_started').length;

  // Window activity.
  const inWindow = subs.filter((s) => toMillis(s.submittedAt) >= windowStart);
  const perUser = new Map(); // id -> { subs, days:Set, solved:Set }
  const perDay = new Map(); // date -> { subs, solved, users:Set }
  for (const s of inWindow) {
    const ms = toMillis(s.submittedAt);
    const u = perUser.get(s.userId) || { subs: 0, days: new Set(), solved: new Set() };
    u.subs += 1;
    u.days.add(dayKey(ms));
    if (s.verdict === 'Accepted') u.solved.add(s.problemId);
    perUser.set(s.userId, u);
    const d = perDay.get(dayKey(ms)) || { subs: 0, solved: 0, users: new Set() };
    d.subs += 1;
    if (s.verdict === 'Accepted') d.solved += 1;
    d.users.add(s.userId);
    perDay.set(dayKey(ms), d);
  }

  // Time spent in the course: the per-student roll-up the timer writes (total plus a per-day map keyed by IST day).
  // Only students in scope count. Time exists from the day tracking was switched on, so older work shows none.
  const windowStartKey = istDay(windowStart);
  const timeByStudent = new Map(); // id -> { total, inWindow }
  const minutesByDay = new Map();  // IST day -> seconds across students
  const weekdaySeconds = [0, 0, 0, 0, 0, 0, 0];
  for (const t of courseTimes) {
    if (!studentById.has(t.userId)) continue;
    let inWindow = 0;
    for (const [day, secs] of Object.entries(t.byDay || {})) {
      if (day < windowStartKey) continue;
      inWindow += secs;
      minutesByDay.set(day, (minutesByDay.get(day) || 0) + secs);
      weekdaySeconds[weekdayOf(day)] += secs;
    }
    timeByStudent.set(t.userId, { total: t.seconds || 0, inWindow });
  }
  const timers = [...timeByStudent.values()].filter((t) => t.inWindow > 0);
  const avgActiveSeconds = timers.length ? Math.round(timers.reduce((n, t) => n + t.inWindow, 0) / timers.length) : 0;

  // Continuous daily series (zero-filled) so a quiet day reads as 0, not a gap.
  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY_MS);
    const d = perDay.get(key);
    daily.push({
      date: key, subs: d?.subs ?? 0, solved: d?.solved ?? 0, activeUsers: d?.users.size ?? 0,
      minutes: Math.round((minutesByDay.get(istDay(now - i * DAY_MS)) || 0) / 60),
    });
  }

  const mostActiveUsers = [...perUser.entries()]
    .map(([id, u]) => ({
      id, name: studentById.get(id).name || 'Unknown', rollNo: studentById.get(id).rollNo || null,
      activeDays: u.days.size, subs: u.subs,
    }))
    .sort((a, b) => b.activeDays - a.activeDays || b.subs - a.subs)
    .slice(0, 10);

  const mostActiveGroups = groups
    .map((g) => {
      const members = [...g.memberIds];
      return {
        id: g.id, name: g.name, students: members.length,
        activeStudents: members.filter((id) => perUser.has(id)).length,
        subs: members.reduce((n, id) => n + (perUser.get(id)?.subs ?? 0), 0),
      };
    })
    .sort((a, b) => b.subs - a.subs);

  // Suspicious activity: proctor flags and code similarity, both pre-existing signals.
  const flags = new Map(); // id -> reasons[]
  const addReason = (id, reason) => {
    if (studentById.has(id)) flags.set(id, [...(flags.get(id) || []), reason]);
  };
  const proctorCount = new Map();
  for (const e of proctorEvents) {
    if (BENIGN_PROCTOR_EVENTS.has(e.eventType)) continue;
    proctorCount.set(e.userId, (proctorCount.get(e.userId) || 0) + 1);
  }
  for (const [id, n] of proctorCount) {
    if (n >= PROCTOR_FLAG_THRESHOLD) addReason(id, `${n} proctor flags in exams`);
  }
  const bestSim = new Map();
  for (const p of plagiarismPairs) {
    for (const [self, other] of [[p.studentA, p.studentB], [p.studentB, p.studentA]]) {
      const prev = bestSim.get(self);
      if (!prev || p.similarity > prev.sim) bestSim.set(self, { sim: p.similarity, other });
    }
  }
  for (const [id, b] of bestSim) {
    const otherName = studentById.get(b.other)?.name;
    addReason(id, `${Math.round(b.sim)}% code similarity${otherName ? ` with ${otherName}` : ''}`);
  }
  const flagged = [...flags.entries()]
    .map(([id, reasons]) => ({
      id, name: studentById.get(id).name || 'Unknown', rollNo: studentById.get(id).rollNo || null, reasons,
    }))
    .sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name));

  const series = (key) => daily.map((d) => d[key]);

  // One row per student, for the course's student table and the clickable buckets.
  const table = progressRows.map((r) => ({
    id: r.st.id, name: r.st.name || 'Unknown', rollNo: r.st.rollNo || null,
    section: r.st.section || null, year: r.st.year ?? null, classLabel: classLabel(r.st.year, r.st.section),
    solved: r.solved, total: r.total, percent: r.percent, status: r.status,
    unitsDone: r.unitsDone, unitsTotal: r.unitsTotal,
    lastActiveMs: lastActiveMs.get(r.st.id) || null,
    activeInWindow: perUser.has(r.st.id),
    subsInWindow: perUser.get(r.st.id)?.subs ?? 0,
    solvedInWindow: perUser.get(r.st.id)?.solved.size ?? 0,
    timeSeconds: timeByStudent.get(r.st.id)?.total ?? 0,
    timeInWindowSeconds: timeByStudent.get(r.st.id)?.inWindow ?? 0,
    suspicious: flags.has(r.st.id),
  })).sort((a, b) => a.percent - b.percent || String(a.name).localeCompare(String(b.name)));

  // Completion per class (year + section): the HOD's view across classes.
  const byClassMap = new Map();
  for (const r of progressRows) {
    const key = classLabel(r.st.year, r.st.section);
    const list = byClassMap.get(key) || { label: key, order: classOrder(r.st.year, r.st.section), rows: [] };
    list.rows.push(r);
    byClassMap.set(key, list);
  }
  const byClass = [...byClassMap.values()]
    .sort((a, b) => a.order.localeCompare(b.order))
    .map((g) => ({ label: g.label, ...summarise(g.rows, totalProblems) }));

  const summary = summarise(progressRows, totalProblems);
  const insights = buildCourseInsights({ summary, units, students: table, flagged, daily, days, now });
  return {
    totalStudents: students.length,
    kpis: {
      activeUsers: { value: perUser.size, total: students.length, series: series('activeUsers') },
      submissions: { value: inWindow.length, series: series('subs') },
      completedUsers: { value: completedUsers, total: students.length },
      inProgressUsers: { value: summary.inProgress, total: students.length },
      notStartedUsers: { value: notStartedUsers, total: students.length },
      suspicious: { value: flagged.length, total: students.length },
      avgActiveSeconds: { value: avgActiveSeconds, series: daily.map((d) => d.minutes) },
    },
    insights,
    time: {
      hasData: timeByStudent.size > 0,
      // Minutes of learning per weekday over the window, Sunday first.
      weekdayMinutes: weekdaySeconds.map((sec) => Math.round(sec / 60)),
    },
    summary,
    units, daily, mostActiveUsers, mostActiveGroups, flagged,
    students: table,
    byClass,
    // Same shape as before (the bars still feed the shared histogram), now counting from the shared definition.
    completion: {
      totalProblems, completed: completedUsers, avgPercent: summary.avgPercent,
      buckets: COMPLETION_BUCKETS.map((b, i) => ({
        ...b, count: progressRows.filter((r) => completionBucketIndex(r.solved, totalProblems) === i).length,
      })),
    },
  };
}

module.exports = { buildCourseAnalytics, completionStats, solvedByStudent, completionBucketIndex, COMPLETION_BUCKETS, PROCTOR_FLAG_THRESHOLD };
