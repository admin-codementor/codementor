// Pure aggregation for the department (HOD) dashboard. No I/O — callers pass
// plain arrays — so every figure here is checkable against a fixture.
//
// Shape follows the CampusTrack HOD review (docs/COMPETITOR_UX_RESEARCH.md part 2):
// a four-state funnel first, then flags, then per-section comparison, then
// written insights. The funnel is the spine: every other number hangs off it.
const { flagFor, weeklyActivity, STATE_LABELS } = require('./studentState');

const DAY_MS = 86400000;
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** Badge ladder by percentile within the comparison set. Highest band first. */
const BADGES = [
  { name: 'Trailblazer', minPercentile: 97 },
  { name: 'Champion', minPercentile: 90 },
  { name: 'Achiever', minPercentile: 80 },
  { name: 'Builder', minPercentile: 60 },
  { name: 'Explorer', minPercentile: 40 },
  { name: 'Learner', minPercentile: 20 },
  { name: 'Foundation', minPercentile: 0 },
];

/**
 * A student's badge from their percentile rank. Percentile is "share of the
 * cohort scoring strictly below you", so everyone on zero lands in Foundation
 * together rather than one of them being arbitrarily promoted.
 */
function badgeFor(percentile) {
  return BADGES.find((b) => percentile >= b.minPercentile).name;
}

/**
 * @param {object} a
 * @param {{id,name,rollNo,department,section,year}[]} a.students  already scoped
 * @param {{userId,problemId,verdict,submittedAt}[]} a.submissions
 * @param {number} a.now
 */
function buildDepartmentAnalytics({ students, submissions, now = Date.now() }) {
  const byId = new Map(students.map((s) => [s.id, s]));

  // ── Per-student rollup ────────────────────────────────────────────────────
  const per = new Map(students.map((s) => [s.id, {
    id: s.id, name: s.name || 'Unknown', rollNo: s.rollNo || null,
    section: s.section || null, year: s.year || null,
    subs: 0, accepted: 0, solvedIds: new Set(), lastActiveMs: 0, activeDays: new Set(),
    mySubs: [],
  }]));
  for (const sub of submissions) {
    const p = per.get(sub.userId);
    if (!p) continue;
    const ms = toMillis(sub.submittedAt);
    p.subs += 1;
    p.mySubs.push(sub);
    if (ms) {
      p.lastActiveMs = Math.max(p.lastActiveMs, ms);
      p.activeDays.add(new Date(ms).toISOString().slice(0, 10));
    }
    if (sub.verdict === 'Accepted') {
      p.accepted += 1;
      p.solvedIds.add(sub.problemId);
    }
  }

  const rows = [...per.values()].map((p) => {
    const acRate = p.subs ? Math.round((p.accepted / p.subs) * 100) : 0;
    const base = { subs: p.subs, solved: p.solvedIds.size, acRate, lastActiveMs: p.lastActiveMs };
    const status = flagFor(base, now);
    return {
      id: p.id, name: p.name, roll_no: p.rollNo, section: p.section, year: p.year,
      subs: p.subs, accepted: p.accepted, solved: p.solvedIds.size, ac_rate: acRate,
      active_days: p.activeDays.size,
      last_active: p.lastActiveMs ? new Date(p.lastActiveMs).toISOString() : null,
      state: status.state, flag: status.flag, reasons: status.reasons,
    };
  });

  // ── Funnel: exhaustive and mutually exclusive, so the parts sum to the whole ──
  const funnel = ['not_started', 'practising', 'stuck', 'gone_quiet'].map((key) => ({
    key,
    label: STATE_LABELS[key],
    count: rows.filter((r) => r.state === key).length,
    students: rows.filter((r) => r.state === key).map((r) => ({
      id: r.id, name: r.name, roll_no: r.roll_no, section: r.section, reasons: r.reasons,
    })),
  }));

  const flags = {
    red: rows.filter((r) => r.flag === 'red').length,
    orange: rows.filter((r) => r.flag === 'orange').length,
    green: rows.filter((r) => r.flag === 'green').length,
  };

  // ── Badges by percentile on problems solved ───────────────────────────────
  const solvedValues = rows.map((r) => r.solved);
  const withBadges = rows.map((r) => {
    const below = solvedValues.filter((v) => v < r.solved).length;
    const percentile = rows.length ? Math.round((below / rows.length) * 100) : 0;
    return { ...r, percentile, badge: badgeFor(percentile) };
  });
  const badgeCounts = BADGES.map((b) => ({
    name: b.name,
    count: withBadges.filter((r) => r.badge === b.name).length,
  }));

  // ── Section comparison ────────────────────────────────────────────────────
  const sectionNames = [...new Set(rows.map((r) => r.section || 'Unassigned'))].sort();
  const sections = sectionNames.map((name) => {
    const inSection = rows.filter((r) => (r.section || 'Unassigned') === name);
    const red = inSection.filter((r) => r.flag === 'red').length;
    const green = inSection.filter((r) => r.flag === 'green').length;
    return {
      name,
      students: inSection.length,
      avg_solved: inSection.length
        ? Math.round((inSection.reduce((n, r) => n + r.solved, 0) / inSection.length) * 10) / 10
        : 0,
      at_risk: red,
      at_risk_pct: inSection.length ? Math.round((red / inSection.length) * 100) : 0,
      on_track: green,
      on_track_pct: inSection.length ? Math.round((green / inSection.length) * 100) : 0,
    };
  });

  // ── Department-wide weekly trend ──────────────────────────────────────────
  const weekly = weeklyActivity(submissions.filter((s) => byId.has(s.userId)), 8, now);

  // ── Written insights: a chart nobody reads is worth less than one sentence ──
  const insights = [];
  const total = rows.length;
  const notStarted = funnel.find((f) => f.key === 'not_started').count;
  if (total && notStarted / total >= 0.25) {
    insights.push({
      severity: 'high',
      title: `${notStarted} of ${total} students have never submitted`,
      detail: `That is ${Math.round((notStarted / total) * 100)}% of this view. They will not appear in any accuracy or progress figure until they start.`,
    });
  }
  const quiet = funnel.find((f) => f.key === 'gone_quiet').count;
  if (quiet > 0) {
    insights.push({
      severity: 'medium',
      title: `${quiet} student${quiet === 1 ? ' has' : 's have'} gone quiet`,
      detail: 'They were active before but have submitted nothing in the last 7 days — the group most likely to be recoverable with a nudge.',
    });
  }
  const stuck = funnel.find((f) => f.key === 'stuck').count;
  if (stuck > 0) {
    insights.push({
      severity: 'high',
      title: `${stuck} student${stuck === 1 ? ' is' : 's are'} stuck`,
      detail: 'They are submitting but have never had a solution accepted. This is effort without progress, and usually means a gap in fundamentals.',
    });
  }
  const worst = [...sections].filter((s) => s.students >= 3).sort((a, b) => b.at_risk_pct - a.at_risk_pct)[0];
  if (worst && worst.at_risk_pct >= 50 && sections.length > 1) {
    insights.push({
      severity: 'medium',
      title: `Section ${worst.name} needs the most attention`,
      detail: `${worst.at_risk_pct}% of its ${worst.students} students are flagged, against ${Math.round(rows.filter((r) => r.flag === 'red').length / total * 100)}% across the department.`,
    });
  }
  const thisWeek = weekly[weekly.length - 1];
  if (thisWeek && thisWeek.subs_change != null && thisWeek.subs_change < 0 && thisWeek.subs > 0) {
    insights.push({
      severity: 'low',
      title: `Submissions are down ${Math.abs(thisWeek.subs_change)} on last week`,
      detail: `${thisWeek.subs} submissions in the last 7 days, from ${thisWeek.subs - thisWeek.subs_change} the week before.`,
    });
  }
  if (insights.length === 0 && total > 0) {
    insights.push({
      severity: 'low',
      title: 'Nothing is flagged in this view',
      detail: 'No large group of non-starters, nobody stuck, and no section is behind the rest.',
    });
  }

  const activeLast7 = rows.filter((r) => r.last_active && new Date(r.last_active).getTime() >= now - 7 * DAY_MS).length;

  return {
    totals: {
      students: total,
      active_last_7: activeLast7,
      submissions: submissions.filter((s) => byId.has(s.userId)).length,
      solved: rows.reduce((n, r) => n + r.solved, 0),
      avg_solved: total ? Math.round((rows.reduce((n, r) => n + r.solved, 0) / total) * 10) / 10 : 0,
      avg_accuracy: (() => {
        const engaged = rows.filter((r) => r.subs > 0);
        return engaged.length ? Math.round(engaged.reduce((n, r) => n + r.ac_rate, 0) / engaged.length) : 0;
      })(),
    },
    funnel,
    flags,
    sections,
    badges: badgeCounts,
    weekly,
    insights,
    students: withBadges
      .map(({ ...r }) => r)
      .sort((a, b) => b.solved - a.solved || a.name.localeCompare(b.name)),
  };
}

module.exports = { buildDepartmentAnalytics, badgeFor, BADGES };
