// Pure aggregation for the per-course faculty dashboard. No I/O: callers hand in
// plain arrays, so every number here can be checked against a hand-built fixture.

const DAY_MS = 86400000;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** Flagged at this many non-benign proctor events (the proctor report's "medium" risk). */
const PROCTOR_FLAG_THRESHOLD = 3;
const BENIGN_PROCTOR_EVENTS = new Set(['fullscreen_enter', 'exam_start', 'copy']);

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
function buildCourseAnalytics({ modules, students, groups, submissions, proctorEvents, plagiarismPairs, days, now }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const courseProblems = new Set(modules.flatMap((m) => m.problemIds || []));
  const windowStart = now - days * DAY_MS;

  // Course submissions by in-scope students only.
  const subs = submissions.filter((s) => courseProblems.has(s.problemId) && studentById.has(s.userId));

  // Per student: ever-attempted / ever-solved (unit state is lifetime, not windowed).
  const attempted = new Map(students.map((s) => [s.id, new Set()]));
  const solved = new Map(students.map((s) => [s.id, new Set()]));
  for (const s of subs) {
    attempted.get(s.userId).add(s.problemId);
    if (s.verdict === 'Accepted') solved.get(s.userId).add(s.problemId);
  }

  // Unit-wise completion: solved = every problem in the unit solved,
  // partial = something attempted, notStarted = nothing attempted.
  const units = modules.map((m) => {
    const pids = m.problemIds || [];
    let done = 0;
    let partial = 0;
    let notStarted = 0;
    for (const st of students) {
      const sv = pids.filter((p) => solved.get(st.id).has(p)).length;
      const at = pids.filter((p) => attempted.get(st.id).has(p)).length;
      if (pids.length > 0 && sv === pids.length) done += 1;
      else if (at > 0) partial += 1;
      else notStarted += 1;
    }
    return { id: m.id, title: m.title, problemCount: pids.length, solved: done, partial, notStarted };
  });

  const totalProblems = courseProblems.size;
  let completedUsers = 0;
  let notStartedUsers = 0;
  for (const st of students) {
    if (totalProblems > 0 && solved.get(st.id).size === totalProblems) completedUsers += 1;
    if (attempted.get(st.id).size === 0) notStartedUsers += 1;
  }

  // Window activity.
  const inWindow = subs.filter((s) => toMillis(s.submittedAt) >= windowStart);
  const perUser = new Map(); // id -> { subs, days:Set }
  const perDay = new Map(); // date -> { subs, solved, users:Set }
  for (const s of inWindow) {
    const ms = toMillis(s.submittedAt);
    const u = perUser.get(s.userId) || { subs: 0, days: new Set() };
    u.subs += 1;
    u.days.add(dayKey(ms));
    perUser.set(s.userId, u);
    const d = perDay.get(dayKey(ms)) || { subs: 0, solved: 0, users: new Set() };
    d.subs += 1;
    if (s.verdict === 'Accepted') d.solved += 1;
    d.users.add(s.userId);
    perDay.set(dayKey(ms), d);
  }

  // Continuous daily series (zero-filled) so a quiet day reads as 0, not a gap.
  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY_MS);
    const d = perDay.get(key);
    daily.push({ date: key, subs: d?.subs ?? 0, solved: d?.solved ?? 0, activeUsers: d?.users.size ?? 0 });
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
  return {
    totalStudents: students.length,
    kpis: {
      activeUsers: { value: perUser.size, total: students.length, series: series('activeUsers') },
      submissions: { value: inWindow.length, series: series('subs') },
      completedUsers: { value: completedUsers, total: students.length },
      notStartedUsers: { value: notStartedUsers, total: students.length },
      suspicious: { value: flagged.length, total: students.length },
    },
    units, daily, mostActiveUsers, mostActiveGroups, flagged,
  };
}

module.exports = { buildCourseAnalytics, PROCTOR_FLAG_THRESHOLD };
