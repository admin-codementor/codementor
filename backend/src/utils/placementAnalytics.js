// Placement roll-up for the HOD: the pool, who is placed, the funnel, by year and
// section, per company, per round. Pure: plain arrays in, one object out.
//
// Definitions (kept explicit because every figure hangs off them):
//   placed        a student with at least one application marked "selected", or an outside offer recorded by the T&P office
//   in process    not placed, with at least one application still applied/shortlisted (or an outside application not yet decided)
//   not placed    everyone else (no applications, or only rejections)
//   funnel        nested by construction: applied >= shortlisted >= selected, where
//                 "shortlisted" includes the selected (they were shortlisted first)
const { isEligible } = require('./placement');
const { classLabel } = require('./students');

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/**
 * @param {object} a
 * @param {{id,name,rollNo?,section?,year?,department?}[]} a.students  the view (already department/section/year scoped)
 * @param {{id,company,role?,date?,ctc?,status?,department?,eligibleYears?,rounds?}[]} a.drives
 * @param {{driveId,studentId,status,roundResults?}[]} a.applications
 * @param {{studentId,status}[]} [a.outside]  applications made outside the portal, recorded by T&P. They count towards placed and in process,
 *   but not towards the funnel, the companies or the rounds, which describe drives on the portal.
 */
function buildPlacementAnalytics({ students, drives, applications, outside = [] }) {
  const inView = new Map(students.map((s) => [s.id, s]));
  const driveIds = new Set(drives.map((d) => d.id));
  // Only applications for these drives by students in this view.
  const apps = applications.filter((a) => driveIds.has(a.driveId) && inView.has(a.studentId));

  const byStudent = new Map(students.map((s) => [s.id, []]));
  for (const a of apps) byStudent.get(a.studentId).push(a);
  const out = outside.filter((o) => inView.has(o.studentId));
  const outOffer = new Set(out.filter((o) => o.status === 'selected').map((o) => o.studentId));
  const outOpen = new Set(out.filter((o) => o.status === 'applied').map((o) => o.studentId));

  const students_ = students.map((s) => {
    const mine = byStudent.get(s.id);
    const count = (st) => mine.filter((a) => a.status === st).length;
    const placed = count('selected') > 0 || outOffer.has(s.id);
    const inProcess = !placed && (mine.some((a) => a.status === 'applied' || a.status === 'shortlisted') || outOpen.has(s.id));
    return {
      id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null, section: s.section || null, year: s.year ?? null,
      applied: mine.length, outside: out.filter((o) => o.studentId === s.id).length, shortlisted: count('shortlisted'), selected: count('selected'), rejected: count('rejected'),
      placed, state: placed ? 'placed' : inProcess ? 'in_process' : 'not_placed',
    };
  }).sort((a, b) => ({ placed: 0, in_process: 1, not_placed: 2 }[a.state] - { placed: 0, in_process: 1, not_placed: 2 }[b.state]) || a.name.localeCompare(b.name));

  const pool = students_.length;
  const placed = students_.filter((s) => s.state === 'placed').length;
  const inProcess = students_.filter((s) => s.state === 'in_process').length;

  const eligibleSlots = drives.reduce((n, d) => n + students.filter((s) => isEligible(s, d)).length, 0);
  const selectedApps = apps.filter((a) => a.status === 'selected').length;
  const funnel = [
    { key: 'eligible', label: 'Eligible', count: eligibleSlots },
    { key: 'applied', label: 'Applied', count: apps.length },
    { key: 'shortlisted', label: 'Shortlisted', count: apps.filter((a) => a.status === 'shortlisted' || a.status === 'selected').length },
    { key: 'selected', label: 'Selected', count: selectedApps },
  ];

  const group = (keyOf, labelOf) => {
    const map = new Map();
    for (const s of students_) {
      const k = keyOf(s);
      const g = map.get(k) || { key: k, label: labelOf(k), students: 0, placed: 0, applied_students: 0 };
      g.students += 1;
      if (s.placed) g.placed += 1;
      if (s.applied > 0) g.applied_students += 1;
      map.set(k, g);
    }
    return [...map.values()].map((g) => ({ ...g, rate: pct(g.placed, g.students) }))
      .sort((a, b) => (a.key.startsWith('No ') ? 1 : 0) - (b.key.startsWith('No ') ? 1 : 0) || String(a.key).localeCompare(String(b.key), undefined, { numeric: true }));
  };

  const companies = drives.map((d) => {
    const a = apps.filter((x) => x.driveId === d.id);
    return {
      id: d.id, company: d.company, role: d.role || '', date: d.date || null, ctc: d.ctc || '', status: d.status || 'open',
      eligible: students.filter((s) => isEligible(s, d)).length,
      applied: a.length,
      shortlisted: a.filter((x) => x.status === 'shortlisted' || x.status === 'selected').length,
      selected: a.filter((x) => x.status === 'selected').length,
    };
  }).sort((x, y) => y.selected - x.selected || y.applied - x.applied || x.company.localeCompare(y.company));

  const roundMap = new Map();
  for (const a of apps) {
    for (const [round, result] of Object.entries(a.roundResults || {})) {
      const k = round.toLowerCase();
      const r = roundMap.get(k) || { round, attempted: 0, passed: 0, failed: 0 };
      r.attempted += 1;
      if (result === 'passed') r.passed += 1; else r.failed += 1;
      roundMap.set(k, r);
    }
  }
  const rounds = [...roundMap.values()].map((r) => ({ ...r, pass_rate: pct(r.passed, r.attempted) }))
    .sort((a, b) => b.attempted - a.attempted || a.round.localeCompare(b.round));

  return {
    overview: {
      pool, placed, in_process: inProcess, not_placed: pool - placed - inProcess,
      placement_rate: pct(placed, pool),
      applied_students: students_.filter((s) => s.applied > 0).length,
      engagement_pct: pct(students_.filter((s) => s.applied > 0).length, pool),
      avg_applications: pool ? Math.round((apps.length / pool) * 10) / 10 : 0,
      conversion_pct: pct(selectedApps, apps.length),
      drives: drives.length,
    },
    outside: { applications: out.length, offers: out.filter((o) => o.status === 'selected').length },
    funnel,
    by_year: group((s) => (s.year == null ? 'Unassigned' : String(s.year)), (k) => (k === 'Unassigned' ? 'No year' : `Year ${k}`)),
    by_section: group((s) => classLabel(s.year, s.section), (k) => k), // year + section: see utils/students.js
    companies, rounds, students: students_,
  };
}

module.exports = { buildPlacementAnalytics };
