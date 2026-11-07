// "Who is using the platform, and who isn't" for the HOD. Pure: callers pass
// plain arrays, so it is checkable against a fixture with a fixed clock.
//
// Activity here means a login or (for students) a submission. Real session
// tracking does not exist (FD2 in docs/FACULTY_HOD_PERSONA_PLAN.md), so this is
// a labelled proxy: "last seen" is the later of the last login and the last
// submission, and "days active" counts days with a submission.
const { DAY_MS } = require('./studentState');

const ALLOWED_DAYS = [7, 30, 90];
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * @param {object} a
 * @param {{id,name,rollNo?,section?,year?,lastLoginAt?}[]} a.people  students or staff, already department-scoped
 * @param {{userId,submittedAt}[]} a.submissions                       only read for students
 * @param {number} a.days                                              7 | 30 | 90
 * @param {number} a.now
 */
function buildActivity({ people, submissions = [], days, now = Date.now() }) {
  const window = ALLOWED_DAYS.includes(days) ? days : 7;
  const since = now - window * DAY_MS;
  const subsBy = new Map();
  for (const s of submissions) {
    const ms = toMillis(s.submittedAt);
    if (!ms) continue;
    const cur = subsBy.get(s.userId) || { last: 0, days: new Set() };
    cur.last = Math.max(cur.last, ms);
    if (ms >= since) cur.days.add(dayKey(ms));
    subsBy.set(s.userId, cur);
  }

  const rows = people.map((p) => {
    const login = toMillis(p.lastLoginAt);
    const sub = subsBy.get(p.id);
    const lastSeen = Math.max(login, sub?.last ?? 0);
    return {
      id: p.id, name: p.name || 'Unknown', roll_no: p.rollNo || null, section: p.section || null, year: p.year ?? null,
      last_seen: lastSeen ? new Date(lastSeen).toISOString() : null,
      days_since_seen: lastSeen ? Math.floor((now - lastSeen) / DAY_MS) : null,
      active_days: sub?.days.size ?? 0,
      status: lastSeen >= since ? 'active' : 'at_risk',
    };
  });

  // At-risk first, longest unseen first (never seen counts as longest).
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'at_risk' ? -1 : 1)
    || (b.days_since_seen ?? Infinity) - (a.days_since_seen ?? Infinity)
    || a.name.localeCompare(b.name));

  const active = rows.filter((r) => r.status === 'active').length;
  // Not real presence (there is none): people whose last login or submission was in the last 5 minutes.
  const seenNow = rows.filter((r) => r.last_seen && now - Date.parse(r.last_seen) <= 5 * 60 * 1000).length;
  return { days: window, totals: { people: rows.length, active, at_risk: rows.length - active, seen_last_5_min: seenNow }, rows };
}

module.exports = { buildActivity, ALLOWED_DAYS };
