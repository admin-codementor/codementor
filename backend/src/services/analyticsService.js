// One computation behind every analytics view.
//
// The old pages each called `submissionRepo.listAll()` — several full-collection
// reads per page load, every load, each pulling every student's source code. This
// builds a single snapshot in one field-masked pass and caches it, so a dashboard
// with a dozen panels costs one aggregation rather than a dozen.
//
// Everything here is derived, never stored: the snapshot is a cache, so a wrong
// number can be fixed by changing this file rather than by migrating data. When
// submission volume outgrows a full scan (roughly six figures), the same shape can
// be produced from incrementally-maintained daily rollups without any caller
// noticing — that is why callers get a snapshot object rather than raw rows.
const { cached } = require('../utils/cache');
const submissionRepo = require('../repositories/submissionRepository');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const classroomRepo = require('../repositories/classroomRepository');

const DAY_MS = 86400000;
const SNAPSHOT_TTL = 120; // seconds

// Bump whenever the snapshot's SHAPE or its aggregation logic changes.
//
// The cache lives in Upstash, so it survives a restart or a deploy: without a
// version in the key, a release that fixes an aggregation bug keeps serving the
// old numbers until the TTL happens to lapse. (Caught exactly that way — a
// language-name fix appeared not to work.)
const SNAPSHOT_VERSION = 3;

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// Judge0 language ids → readable names, for the language mix panel.
const LANGUAGE_NAMES = {
  71: 'Python', 70: 'Python 2', 63: 'JavaScript', 62: 'Java',
  54: 'C++', 53: 'C++', 52: 'C++', 76: 'C++', 50: 'C', 51: 'C#',
  60: 'Go', 72: 'Ruby', 73: 'Rust', 74: 'TypeScript', 68: 'PHP', 78: 'Kotlin', 83: 'Swift',
};
// `submission.language` is not consistently typed: the judge path stores the
// Judge0 numeric id as a string ("71"), while older/other rows hold a plain name
// ("python"). Handle both, otherwise the language mix reads "Lang python".
const TITLE_CASE = { cpp: 'C++', csharp: 'C#', javascript: 'JavaScript', typescript: 'TypeScript', php: 'PHP' };
const languageName = (raw) => {
  if (raw == null || raw === '') return 'Unknown';
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && String(raw).trim() !== '') {
    return LANGUAGE_NAMES[asNum] || `Language ${asNum}`;
  }
  const key = String(raw).trim().toLowerCase();
  return TITLE_CASE[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

/**
 * Build the full analytics snapshot for a scope. Two mutually exclusive scope
 * shapes:
 *  - `{ dept }` — department-scoped. `dept === null` means everything (admin),
 *    otherwise only students in that department are counted (HOD).
 *  - `{ studentIds }` — an explicit set of student ids, used for faculty, who
 *    see only students enrolled in classrooms *they* created rather than a
 *    whole department (a department can span several faculty's classes).
 */
async function buildSnapshot(scope) {
  const { dept = null, memberIds = null } = scope;
  const [studentsMap, submissions, problems] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
    problemRepo.getAll(),
  ]);

  const students = [...studentsMap.values()].filter((s) => (
    memberIds ? memberIds.has(s.id) : (dept === null || (s.department || null) === dept)
  ));
  const studentIds = new Set(students.map((s) => s.id));
  const problemsById = new Map(problems.map((p) => [p.id, p]));

  // ── Per-student accumulator ─────────────────────────────────────────────────
  const perStudent = new Map(students.map((s) => [s.id, {
    id: s.id,
    name: s.name || 'Unknown',
    email: s.email || null,
    rollNo: s.rollNo || null,
    department: s.department || null,
    section: s.section || null,
    year: s.year || null,
    subs: 0,
    ac: 0,
    solved: new Set(),
    attempted: new Set(),
    attemptsByProblem: new Map(),
    firstAcByProblem: new Map(),
    firstSubByProblem: new Map(),
    lastActiveMs: 0,
    activeDays: new Set(),
  }]));

  const perDay = new Map();                       // 'YYYY-MM-DD' -> { subs, ac, users:Set }
  const dayHour = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const perProblem = new Map();                   // pid -> { subs, ac, solvers:Set, attempters:Set }
  const perLanguage = new Map();                  // name -> { subs, ac }
  const verdicts = new Map();                     // verdict -> count

  let earliestMs = Infinity;
  let latestMs = 0;

  for (const s of submissions) {
    if (!studentIds.has(s.userId)) continue;      // out of scope (other dept, or faculty)
    const st = perStudent.get(s.userId);
    const ms = toMillis(s.submittedAt);
    const accepted = s.verdict === 'Accepted';

    st.subs += 1;
    if (accepted) st.ac += 1;
    st.attempted.add(s.problemId);
    st.attemptsByProblem.set(s.problemId, (st.attemptsByProblem.get(s.problemId) || 0) + 1);
    if (ms) {
      st.lastActiveMs = Math.max(st.lastActiveMs, ms);
      st.activeDays.add(dayKey(ms));
      const cur = st.firstSubByProblem.get(s.problemId);
      if (!cur || ms < cur) st.firstSubByProblem.set(s.problemId, ms);
      if (accepted) {
        const prev = st.firstAcByProblem.get(s.problemId);
        if (!prev || ms < prev) st.firstAcByProblem.set(s.problemId, ms);
      }
      earliestMs = Math.min(earliestMs, ms);
      latestMs = Math.max(latestMs, ms);

      const d = new Date(ms);
      dayHour[d.getDay()][d.getHours()] += 1;
      const key = dayKey(ms);
      if (!perDay.has(key)) perDay.set(key, { subs: 0, ac: 0, users: new Set() });
      const day = perDay.get(key);
      day.subs += 1;
      if (accepted) day.ac += 1;
      day.users.add(s.userId);
    }
    if (accepted) st.solved.add(s.problemId);

    if (!perProblem.has(s.problemId)) {
      perProblem.set(s.problemId, { subs: 0, ac: 0, solvers: new Set(), attempters: new Set() });
    }
    const pp = perProblem.get(s.problemId);
    pp.subs += 1;
    pp.attempters.add(s.userId);
    if (accepted) { pp.ac += 1; pp.solvers.add(s.userId); }

    const lang = languageName(s.language);
    if (!perLanguage.has(lang)) perLanguage.set(lang, { subs: 0, ac: 0 });
    const pl = perLanguage.get(lang);
    pl.subs += 1;
    if (accepted) pl.ac += 1;

    const v = s.verdict || 'Unknown';
    verdicts.set(v, (verdicts.get(v) || 0) + 1);
  }

  // ── Derive per-student metrics ──────────────────────────────────────────────
  const studentStats = [...perStudent.values()].map((st) => {
    // Attempts taken on problems the student actually solved — the honest measure
    // of efficiency (counting unsolved problems would punish anyone still trying).
    const solvedAttempts = [...st.solved].map((pid) => st.attemptsByProblem.get(pid) || 1);
    const avgAttemptsToSolve = solvedAttempts.length
      ? solvedAttempts.reduce((a, b) => a + b, 0) / solvedAttempts.length
      : null;

    const timesToAc = [...st.firstAcByProblem.entries()]
      .map(([pid, acMs]) => acMs - (st.firstSubByProblem.get(pid) ?? acMs))
      .filter((ms) => ms >= 0);
    const medianTimeToAcMs = timesToAc.length ? median(timesToAc) : null;

    return {
      id: st.id, name: st.name, email: st.email, rollNo: st.rollNo,
      department: st.department, section: st.section, year: st.year,
      subs: st.subs,
      ac: st.ac,
      acRate: st.subs ? Math.round((st.ac / st.subs) * 100) : 0,
      solved: st.solved.size,
      attempted: st.attempted.size,
      avgAttemptsToSolve: avgAttemptsToSolve == null ? null : Math.round(avgAttemptsToSolve * 10) / 10,
      medianTimeToAcMs,
      activeDays: st.activeDays.size,
      lastActiveMs: st.lastActiveMs || null,
    };
  });

  return {
    dept,
    generatedAt: Date.now(),
    windowStartMs: Number.isFinite(earliestMs) ? earliestMs : null,
    windowEndMs: latestMs || null,
    totalStudents: students.length,
    studentStats,
    perDay: [...perDay.entries()]
      .map(([date, v]) => ({ date, subs: v.subs, ac: v.ac, activeUsers: v.users.size }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    dayHour,
    verdicts: [...verdicts.entries()].map(([verdict, count]) => ({ verdict, count })).sort((a, b) => b.count - a.count),
    languages: [...perLanguage.entries()]
      .map(([name, v]) => ({ name, subs: v.subs, acRate: v.subs ? Math.round((v.ac / v.subs) * 100) : 0 }))
      .sort((a, b) => b.subs - a.subs),
    problemStats: [...perProblem.entries()].map(([id, v]) => {
      const p = problemsById.get(id);
      return {
        id,
        title: p?.title || 'Unknown problem',
        difficulty: (p?.difficulty || 'unknown').toLowerCase(),
        tags: p?.tags || [],
        subs: v.subs,
        ac: v.ac,
        acRate: v.subs ? Math.round((v.ac / v.subs) * 100) : 0,
        attempters: v.attempters.size,
        solvers: v.solvers.size,
        // Of the students who tried it, how many got there.
        solveRate: v.attempters.size ? Math.round((v.solvers.size / v.attempters.size) * 100) : 0,
      };
    }).sort((a, b) => b.subs - a.subs),
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Five-number summary — what a box plot needs, and what a mean alone hides. */
function boxStats(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => {
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  return {
    min: s[0],
    q1: Math.round(q(0.25) * 10) / 10,
    median: Math.round(q(0.5) * 10) / 10,
    q3: Math.round(q(0.75) * 10) / 10,
    max: s[s.length - 1],
    mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10,
    n: s.length,
  };
}

/** Bucket values into a histogram with fixed-width bins. */
function histogram(values, binSize) {
  if (!values.length) return [];
  const max = Math.max(...values);
  const bins = Math.max(1, Math.ceil((max + 1) / binSize));
  const out = Array.from({ length: bins }, (_, i) => ({
    bucket: `${i * binSize}${binSize === 1 ? '' : `-${i * binSize + binSize - 1}`}`,
    from: i * binSize,
    count: 0,
  }));
  for (const v of values) {
    const i = Math.min(bins - 1, Math.floor(v / binSize));
    out[i].count += 1;
  }
  return out;
}

const COHORT_DIMS = { department: 'department', year: 'year', section: 'section' };

/** Group the snapshot's students into cohorts along one dimension. */
function cohortsFrom(snapshot, dimension) {
  const dim = COHORT_DIMS[dimension] || 'department';
  const groups = new Map();
  for (const s of snapshot.studentStats) {
    const key = s[dim] || 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.entries()].map(([cohort, members]) => {
    const solvedValues = members.map((m) => m.solved);
    const attemptValues = members.map((m) => m.avgAttemptsToSolve).filter((v) => v != null);
    const totalSubs = members.reduce((a, m) => a + m.subs, 0);
    const totalAc = members.reduce((a, m) => a + m.ac, 0);
    return {
      cohort,
      students: members.length,
      // Kept for the existing bar chart, but the distribution below is the point:
      // an average hides a class split between confident and stuck students.
      avgSolved: members.length ? Math.round(solvedValues.reduce((a, b) => a + b, 0) / members.length) : 0,
      acRate: totalSubs ? Math.round((totalAc / totalSubs) * 100) : 0,
      totalSubs,
      activeStudents: members.filter((m) => m.subs > 0).length,
      solvedDistribution: boxStats(solvedValues),
      avgAttemptsToSolve: attemptValues.length
        ? Math.round((attemptValues.reduce((a, b) => a + b, 0) / attemptValues.length) * 10) / 10
        : null,
    };
  }).sort((a, b) => String(a.cohort).localeCompare(String(b.cohort)));
}

// A scope resolves to `{ dept }` (department/institution scope, dept === null
// meaning everyone) or `{ memberIds, cacheKey }` (a faculty member's own
// classroom rosters — the member-id set isn't a stable cache key by itself, so
// the caller supplies one, typically the faculty member's own id). Shared by
// every cache key that is scope-shaped, so the snapshot cache and the at-risk
// cache (below) key off the same population consistently.
function scopeKey(scope) {
  return scope.memberIds ? `faculty:${scope.cacheKey}` : (scope.dept ?? 'all');
}

/** Cached snapshot accessor — see `scopeKey` for the scope shapes accepted. */
async function getSnapshot(scope) {
  return cached(`analytics:snapshot:v${SNAPSHOT_VERSION}:${scopeKey(scope)}`, SNAPSHOT_TTL, () => buildSnapshot(scope));
}

// ── Risk model ─────────────────────────────────────────────────────────────
// One definition of "at risk", shared by the Dashboard card and the Analytics
// Pulse tab. These used to disagree — the Dashboard card required 5+
// submissions before flagging low accuracy (<30%) and only looked at
// inactivity, while the Analytics cohort view flagged any accuracy under 25%
// and also weighed attempts-per-solve. This is the single source of truth for
// both, now also aware of assignment deadlines.
const RISK_IDLE_DAYS = 14;
const RISK_LOW_ACCURACY_PCT = 25;
const RISK_HIGH_ATTEMPTS_PER_SOLVE = 5;

/**
 * `deadlineInfo` is this student's entry from `computeDeadlineRisk` (or
 * undefined) — `{ missed: string[], unsolved: string[] }`, assignment titles
 * the student never submitted to vs. submitted to but never got Accepted on,
 * before the deadline. Collapsed to a count once there is more than one, so
 * the reason list stays short regardless of how many assignments a class runs.
 */
function riskReasonsForStudent(s, deadlineInfo, now = Date.now()) {
  const idleMs = now - RISK_IDLE_DAYS * DAY_MS;
  const reasons = [
    s.subs === 0 ? 'never submitted' : null,
    s.subs > 0 && s.acRate < RISK_LOW_ACCURACY_PCT ? `low accuracy (${s.acRate}%)` : null,
    s.lastActiveMs && s.lastActiveMs < idleMs ? `inactive ${RISK_IDLE_DAYS}+ days` : null,
    s.avgAttemptsToSolve != null && s.avgAttemptsToSolve >= RISK_HIGH_ATTEMPTS_PER_SOLVE
      ? `${s.avgAttemptsToSolve} attempts per solve` : null,
  ].filter(Boolean);
  if (deadlineInfo?.missed.length) {
    reasons.push(deadlineInfo.missed.length === 1
      ? `missed deadline: "${deadlineInfo.missed[0]}"`
      : `missed ${deadlineInfo.missed.length} assignment deadlines`);
  }
  if (deadlineInfo?.unsolved.length) {
    reasons.push(deadlineInfo.unsolved.length === 1
      ? `attempted but unsolved: "${deadlineInfo.unsolved[0]}"`
      : `attempted but unsolved on ${deadlineInfo.unsolved.length} assignments`);
  }
  return reasons;
}

/**
 * Cross-references past-deadline, non-exam assignments against submissions to
 * flag two distinct failure modes per student: total non-engagement (never
 * submitted anything for the assignment's problems before the deadline) vs.
 * trying and not getting there (submitted, nothing Accepted in time). Exams
 * are excluded — they have their own lockout/window semantics (examLock.js)
 * that don't map onto "at risk". An assignment with no classroomIds targets
 * every student in scope, same as the assignment builder treats it.
 */
async function computeDeadlineRisk(scope, studentIds) {
  const result = new Map();
  const now = Date.now();
  const assignments = (await assignmentRepo.getAll()).filter((a) => (
    !a.isExam && a.deadline && Array.isArray(a.problemIds) && a.problemIds.length && toMillis(a.deadline) <= now
  ));
  if (!assignments.length) return result;

  const neededClassrooms = new Set();
  for (const a of assignments) for (const cid of (a.classroomIds || [])) neededClassrooms.add(cid);
  const membersByClassroom = new Map(await Promise.all(
    [...neededClassrooms].map(async (cid) => [cid, new Set((await classroomRepo.listMembers(cid)).map((m) => m.userId))])
  ));

  const submissions = await submissionRepo.listAllForAnalytics();
  const byStudent = new Map(); // userId -> problemId -> [{ ms, accepted }]
  for (const s of submissions) {
    if (!studentIds.has(s.userId)) continue;
    const ms = toMillis(s.submittedAt);
    if (!ms) continue;
    if (!byStudent.has(s.userId)) byStudent.set(s.userId, new Map());
    const perProblem = byStudent.get(s.userId);
    if (!perProblem.has(s.problemId)) perProblem.set(s.problemId, []);
    perProblem.get(s.problemId).push({ ms, accepted: s.verdict === 'Accepted' });
  }

  for (const a of assignments) {
    const deadlineMs = toMillis(a.deadline);
    const targets = (a.classroomIds && a.classroomIds.length)
      ? new Set(a.classroomIds.flatMap((cid) => [...(membersByClassroom.get(cid) || [])]).filter((id) => studentIds.has(id)))
      : studentIds;

    for (const studentId of targets) {
      const perProblem = byStudent.get(studentId);
      let allSolved = true;
      let anyAttempted = false;
      for (const pid of a.problemIds) {
        const entries = (perProblem?.get(pid) || []).filter((e) => e.ms <= deadlineMs);
        if (entries.length) anyAttempted = true;
        if (!entries.some((e) => e.accepted)) allSolved = false;
      }
      if (allSolved) continue;
      if (!result.has(studentId)) result.set(studentId, { missed: [], unsolved: [] });
      result.get(studentId)[anyAttempted ? 'unsolved' : 'missed'].push(a.title || 'Untitled assignment');
    }
  }
  return result;
}

async function computeAtRiskList(scope) {
  const snap = await getSnapshot(scope);
  const studentIds = new Set(snap.studentStats.map((s) => s.id));
  const deadlineRisk = await computeDeadlineRisk(scope, studentIds);
  return snap.studentStats
    .map((s) => ({ ...s, riskReasons: riskReasonsForStudent(s, deadlineRisk.get(s.id)) }))
    .filter((s) => s.riskReasons.length > 0)
    .sort((a, b) => b.riskReasons.length - a.riskReasons.length || a.solved - b.solved);
}

// Cached like the snapshot itself, and under the same scope-derived key
// convention — every caller (Dashboard card, Analytics Pulse tab, Cohort
// detail's per-student chips) shares one cache entry instead of each
// recomputing the assignment/classroom/submission cross-reference.
async function getAtRiskList(scope) {
  return cached(`analytics:at-risk:v1:${scopeKey(scope)}`, SNAPSHOT_TTL, () => computeAtRiskList(scope));
}

module.exports = {
  buildSnapshot, getSnapshot, cohortsFrom, boxStats, histogram, median,
  languageName, DAY_MS, dayKey, toMillis, COHORT_DIMS,
  scopeKey, riskReasonsForStudent, getAtRiskList,
};
