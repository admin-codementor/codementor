// Mentor mapping for the HOD dashboard. Pure: callers pass plain arrays, so every
// figure is checkable against a fixture with a fixed clock.
//
// A mentor is a staff member (faculty or HOD) who has been assigned students; the
// link lives on the student as `mentorId`. The leaderboard ranks mentors by how
// their mentees are doing, never by the mentor's own activity.
const { flagFor, DAY_MS } = require('./studentState');

const PERIODS = ['monthly', 'overall'];
const MONTH_DAYS = 30;
const ACTIVE_WINDOW_DAYS = 7;
const MAX_ASSIGN = 500;

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/**
 * @param {object} a
 * @param {{id,name,department}[]} a.mentors      staff who may mentor (already department-scoped, admins excluded)
 * @param {{id,mentorId?}[]} a.students           students in scope
 * @param {{userId,problemId,verdict,submittedAt}[]} a.submissions
 * @param {'monthly'|'overall'} a.period          monthly counts problems FIRST solved in the last 30 days
 * @param {number} a.now
 */
function buildMentorBoard({ mentors, students, submissions, period = 'overall', now = Date.now() }) {
  const per = period === 'monthly' ? 'monthly' : 'overall';
  const since = now - MONTH_DAYS * DAY_MS;

  const stats = new Map(students.map((s) => [s.id, { subs: 0, accepted: 0, solved: new Set(), firstSolved: new Map(), lastActiveMs: 0 }]));
  for (const sub of submissions) {
    const st = stats.get(sub.userId);
    if (!st) continue;
    const ms = toMillis(sub.submittedAt);
    st.subs += 1;
    st.lastActiveMs = Math.max(st.lastActiveMs, ms);
    if (sub.verdict === 'Accepted') {
      st.accepted += 1;
      st.solved.add(sub.problemId);
      const prev = st.firstSolved.get(sub.problemId);
      if (ms && (!prev || ms < prev)) st.firstSolved.set(sub.problemId, ms);
    }
  }

  const solvedCount = (st) => (per === 'monthly'
    ? [...st.firstSolved.values()].filter((ms) => ms >= since).length
    : st.solved.size);

  const byMentor = new Map(mentors.map((m) => [m.id, []]));
  let unassigned = 0;
  for (const s of students) {
    if (s.mentorId && byMentor.has(s.mentorId)) byMentor.get(s.mentorId).push(s);
    else unassigned += 1; // no mentor, or the mentor is no longer in scope
  }

  const rows = mentors.map((m) => {
    const mentees = byMentor.get(m.id);
    let solved = 0;
    let active = 0;
    let red = 0;
    for (const s of mentees) {
      const st = stats.get(s.id);
      solved += solvedCount(st);
      if (st.lastActiveMs && st.lastActiveMs >= now - ACTIVE_WINDOW_DAYS * DAY_MS) active += 1;
      const status = flagFor({ subs: st.subs, solved: st.solved.size, acRate: st.subs ? Math.round((st.accepted / st.subs) * 100) : 0, lastActiveMs: st.lastActiveMs }, now);
      if (status.flag === 'red') red += 1;
    }
    const n = mentees.length;
    return {
      id: m.id, name: m.name || 'Unknown',
      mentees: n,
      solved_per_mentee: n ? Math.round((solved / n) * 10) / 10 : 0,
      active_pct: n ? Math.round((active / n) * 100) : 0,
      needs_attention_pct: n ? Math.round((red / n) * 100) : 0,
    };
  });

  // Mentors with mentees are ranked; those with none are listed after, unranked.
  const ranked = rows.filter((r) => r.mentees > 0)
    .sort((a, b) => b.solved_per_mentee - a.solved_per_mentee || b.active_pct - a.active_pct || a.name.localeCompare(b.name));
  let current = 0;
  const withRank = ranked.map((r, i) => {
    const prev = ranked[i - 1];
    if (!prev || prev.solved_per_mentee !== r.solved_per_mentee || prev.active_pct !== r.active_pct) current = i + 1;
    return { ...r, rank: current };
  });
  const idle = rows.filter((r) => r.mentees === 0).sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r, rank: null }));

  return { period: per, mentors: [...withRank, ...idle], unassigned_students: unassigned, total_students: students.length };
}

/**
 * Whether an assignment request is allowed. Returns an error string, or null.
 * An HOD may only pair students and a mentor from their own department; an
 * admin may pair across departments.
 */
function checkAssignment({ mentor, students, requesterRole, requesterDepartment }) {
  if (mentor) {
    if (mentor.role === 'admin') return 'An admin account cannot be a mentor.';
    if (requesterRole !== 'admin' && (mentor.department || null) !== requesterDepartment) {
      return 'That mentor is outside your department.';
    }
  }
  if (requesterRole !== 'admin') {
    const outside = students.filter((s) => (s.department || null) !== requesterDepartment).length;
    if (outside) return `${outside} selected student(s) are outside your department.`;
  }
  return null;
}

module.exports = { buildMentorBoard, checkAssignment, PERIODS, MAX_ASSIGN, MONTH_DAYS };
