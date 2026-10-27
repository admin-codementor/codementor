// Placement rules: drive validation, who a drive is for, application updates, and the analytics roll-up. Pure checks against a hand-computed
// fixture. The live checks of the routes moved to /api/placement and are covered by tests/pure/placementFlow.js.
const { Suite } = require('../harness');
const {
  validateDrive, isEligible, validateApplicationUpdate, MAX_ROUNDS,
} = require('../../src/utils/placement');
const { buildPlacementAnalytics } = require('../../src/utils/placementAnalytics');

function pure(s) {
  // ── Drive validation ───────────────────────────────────────────────────────
  const ok = (o) => validateDrive({ company: 'Acme', ...o });
  s.check('drive: a company alone is enough', !!ok({}).drive && ok({}).drive.status === 'open');
  s.check('drive: values are trimmed and years sorted and de-duplicated', (() => {
    const d = validateDrive({ company: '  Acme   Corp ', eligible_years: [4, 3, 4], rounds: [' Aptitude ', 'HR'] }).drive;
    return d.company === 'Acme Corp' && d.eligibleYears.join() === '3,4' && d.rounds.join() === 'Aptitude,HR';
  })());
  s.check('drive: a missing or one-character company is rejected', !!ok({ company: '' }).error && !!ok({ company: 'x' }).error);
  s.check('drive: an impossible date is rejected (31 February)', !!ok({ date: '2026-02-31' }).error);
  s.check('drive: a real date is kept, including a future one', ok({ date: '2027-01-15' }).drive.date === '2027-01-15');
  s.check('drive: eligible years must be 1 to 6', !!ok({ eligible_years: [0] }).error && !!ok({ eligible_years: [7] }).error && !!ok({ eligible_years: ['x'] }).error);
  s.check('drive: duplicate round names are rejected, ignoring case', !!ok({ rounds: ['HR', 'hr'] }).error);
  s.check(`drive: more than ${MAX_ROUNDS} rounds is rejected`, !!ok({ rounds: Array.from({ length: MAX_ROUNDS + 1 }, (_, i) => `R${i}`) }).error);
  s.check('drive: an unknown status is rejected', !!ok({ status: 'paused' }).error);
  s.check('drive: a non-object body is rejected', !!validateDrive(null).error);

  // ── Eligibility ────────────────────────────────────────────────────────────
  const drive = { department: 'CSE', eligibleYears: [4] };
  s.check('eligible: same department and an allowed year', isEligible({ department: 'CSE', year: 4 }, drive));
  s.check('eligible: wrong year', !isEligible({ department: 'CSE', year: 3 }, drive));
  s.check('eligible: wrong department', !isEligible({ department: 'ECE', year: 4 }, drive));
  s.check('eligible: no year list means every year', isEligible({ department: 'CSE', year: 2 }, { department: 'CSE', eligibleYears: [] }));
  s.check('eligible: a student with no department is never eligible', !isEligible({ department: null, year: 4 }, drive));

  // ── Application updates ────────────────────────────────────────────────────
  const d2 = { rounds: ['Aptitude', 'Technical'] };
  s.check('update: a null status clears the application', validateApplicationUpdate({ status: null }, d2).clear === true);
  s.check('update: an unknown status is rejected', !!validateApplicationUpdate({ status: 'hired' }, d2).error);
  s.check('update: a result for a round the drive does not have is rejected', !!validateApplicationUpdate({ status: 'applied', round_results: { HR: 'passed' } }, d2).error);
  s.check('update: an unknown round result is rejected', !!validateApplicationUpdate({ status: 'applied', round_results: { Aptitude: 'maybe' } }, d2).error);
  s.check('update: selected with a failed round is rejected', /failed round/.test(validateApplicationUpdate({ status: 'selected', round_results: { Aptitude: 'failed' } }, d2).error || ''));
  s.check('update: selected with every round passed is accepted', validateApplicationUpdate({ status: 'selected', round_results: { Aptitude: 'passed', Technical: 'passed' } }, d2).value?.status === 'selected');
  s.check('update: rejected with a failed round is accepted', !!validateApplicationUpdate({ status: 'rejected', round_results: { Aptitude: 'failed' } }, d2).value);

  // ── Analytics against a fixture worked out by hand ─────────────────────────
  const st = (id, section, year) => ({ id, name: id.toUpperCase(), rollNo: id, section, year, department: 'CSE' });
  const students = [st('s1', 'A', 4), st('s2', 'A', 4), st('s3', 'B', 4), st('s4', 'B', 3), st('s5', 'B', 3), st('s6', 'B', 4)];
  const drives = [
    { id: 'd1', company: 'Alpha', department: 'CSE', eligibleYears: [], rounds: ['Aptitude', 'Technical'], status: 'open' },
    { id: 'd2', company: 'Beta', department: 'CSE', eligibleYears: [4], rounds: ['Aptitude'], status: 'open' },
  ];
  const a = (driveId, studentId, status, roundResults = {}) => ({ driveId, studentId, status, roundResults });
  const applications = [
    a('d1', 's1', 'selected', { Aptitude: 'passed', Technical: 'passed' }), a('d1', 's2', 'rejected', { Aptitude: 'failed' }),
    a('d1', 's3', 'applied'), a('d1', 's4', 'rejected', { Aptitude: 'failed' }),
    a('d2', 's1', 'applied'), a('d2', 's2', 'selected', { Aptitude: 'passed' }), a('d2', 's3', 'shortlisted'), a('d2', 's6', 'applied'),
    a('dX', 's5', 'selected'),             // a drive that is not in this view
    a('d1', 'outsider', 'selected'),       // a student that is not in this view
  ];
  const r = buildPlacementAnalytics({ students, drives, applications });
  const o = r.overview;
  s.check('analytics: pool, placed, in process, not placed', o.pool === 6 && o.placed === 2 && o.in_process === 2 && o.not_placed === 2, JSON.stringify(o));
  s.check('analytics: the three states add up to the pool', o.placed + o.in_process + o.not_placed === o.pool);
  s.check('analytics: placement rate is placed over pool', o.placement_rate === 33, String(o.placement_rate));
  s.check('analytics: engagement counts students with at least one application', o.applied_students === 5 && o.engagement_pct === 83);
  s.check('analytics: average applications and conversion', o.avg_applications === 1.3 && o.conversion_pct === 25, `${o.avg_applications} / ${o.conversion_pct}`);
  const f = Object.fromEntries(r.funnel.map((x) => [x.key, x.count]));
  s.check('analytics: funnel eligible slots respect each drive\'s years', f.eligible === 10, JSON.stringify(f));
  s.check('analytics: funnel counts applied, shortlisted (incl. selected) and selected', f.applied === 8 && f.shortlisted === 3 && f.selected === 2, JSON.stringify(f));
  s.check('analytics: the funnel only ever narrows', f.eligible >= f.applied && f.applied >= f.shortlisted && f.shortlisted >= f.selected);
  s.check('analytics: ignores applications for other drives and students outside the view', r.students.length === 6 && !r.students.some((x) => x.id === 'outsider'));
  const yr = Object.fromEntries(r.by_year.map((x) => [x.key, x]));
  s.check('analytics: by year', yr['4'].students === 4 && yr['4'].placed === 2 && yr['4'].rate === 50 && yr['3'].placed === 0, JSON.stringify(r.by_year));
  const co = Object.fromEntries(r.companies.map((x) => [x.company, x]));
  s.check('analytics: per company eligible / applied / shortlisted / selected',
    co.Alpha.eligible === 6 && co.Alpha.applied === 4 && co.Alpha.shortlisted === 1 && co.Alpha.selected === 1
    && co.Beta.eligible === 4 && co.Beta.applied === 4 && co.Beta.shortlisted === 2 && co.Beta.selected === 1, JSON.stringify(r.companies));
  const rd = Object.fromEntries(r.rounds.map((x) => [x.round, x]));
  s.check('analytics: round pass rates', rd.Aptitude.attempted === 4 && rd.Aptitude.passed === 2 && rd.Aptitude.pass_rate === 50 && rd.Technical.pass_rate === 100, JSON.stringify(r.rounds));
  s.check('analytics: students are listed placed first, then in process', r.students[0].state === 'placed' && r.students[2].state === 'in_process' && r.students[r.students.length - 1].state === 'not_placed');
  s.check('analytics: a student with only a rejection is not placed and not in process', r.students.find((x) => x.id === 's4').state === 'not_placed');
  s.check('analytics: an empty view does not throw', (() => { try { return buildPlacementAnalytics({ students: [], drives: [], applications: [] }).overview.pool === 0; } catch { return false; } })());
}

module.exports = async function hodPlacementSuite() {
  const s = new Suite('HOD placement');
  pure(s);

  // The live checks of the drives, results and analytics routes moved with them to /api/placement and are covered, offline and much more
  // thoroughly, by tests/pure/placementFlow.js. Only the pure rules above run here.
  return s;
};
