// Cross-department comparison for the HOD dashboard. Pure: callers pass plain
// arrays, so every number can be checked against a fixture.
//
// Aggregates only. A department head may compare their department with the
// others, but never sees another department's students, so nothing here carries
// a student name, id or row.
const { flagFor, DAY_MS } = require('./studentState');

/** A department needs this many students before it is ranked (3 students is noise, not a ranking). */
const MIN_RANKED_STUDENTS = 3;
const ACTIVE_WINDOW_DAYS = 7;

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** "cse", " CSE " and "CSE" are one department; empty means unassigned. */
const normalizeDepartment = (d) => {
  const s = d == null ? '' : String(d).trim();
  return s ? s.toUpperCase() : null;
};

/**
 * @param {{students: {id, department}[], submissions: {userId, problemId, verdict, submittedAt}[], now?: number}} a
 * @returns {{ranked: object[], unranked: object[]}}
 */
function buildDepartmentLeaderboard({ students, submissions, now = Date.now() }) {
  const per = new Map(students.map((s) => [s.id, {
    dept: normalizeDepartment(s.department),
    subs: 0, accepted: 0, solved: new Set(), lastActiveMs: 0,
  }]));
  for (const sub of submissions) {
    const p = per.get(sub.userId);
    if (!p) continue;
    p.subs += 1;
    p.lastActiveMs = Math.max(p.lastActiveMs, toMillis(sub.submittedAt));
    if (sub.verdict === 'Accepted') { p.accepted += 1; p.solved.add(sub.problemId); }
  }

  const byDept = new Map();
  for (const p of per.values()) {
    const key = p.dept ?? 'UNASSIGNED';
    const g = byDept.get(key) || { department: key, students: 0, solved_total: 0, active: 0, red: 0 };
    g.students += 1;
    g.solved_total += p.solved.size;
    if (p.lastActiveMs && p.lastActiveMs >= now - ACTIVE_WINDOW_DAYS * DAY_MS) g.active += 1;
    const status = flagFor({
      subs: p.subs, solved: p.solved.size,
      acRate: p.subs ? Math.round((p.accepted / p.subs) * 100) : 0,
      lastActiveMs: p.lastActiveMs,
    }, now);
    if (status.flag === 'red') g.red += 1;
    byDept.set(key, g);
  }

  const rows = [...byDept.values()].map((g) => ({
    department: g.department,
    students: g.students,
    solved_total: g.solved_total,
    solved_per_student: Math.round((g.solved_total / g.students) * 10) / 10,
    active_pct: Math.round((g.active / g.students) * 100),
    needs_attention_pct: Math.round((g.red / g.students) * 100),
  }));

  const rankable = rows
    .filter((r) => r.department !== 'UNASSIGNED' && r.students >= MIN_RANKED_STUDENTS)
    .sort((a, b) => b.solved_per_student - a.solved_per_student || b.active_pct - a.active_pct || a.department.localeCompare(b.department));

  // Competition ranking: level on both measures shares a rank.
  let current = 0;
  const ranked = rankable.map((r, i) => {
    const prev = rankable[i - 1];
    if (!prev || prev.solved_per_student !== r.solved_per_student || prev.active_pct !== r.active_pct) current = i + 1;
    return { ...r, rank: current };
  });

  const unranked = rows
    .filter((r) => !rankable.includes(r))
    .sort((a, b) => a.department.localeCompare(b.department));

  return { ranked, unranked };
}

module.exports = { buildDepartmentLeaderboard, normalizeDepartment, MIN_RANKED_STUDENTS, ACTIVE_WINDOW_DAYS };
