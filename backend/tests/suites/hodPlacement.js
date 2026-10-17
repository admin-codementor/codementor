// HOD placement module: drives, applications and analytics.
// Pure checks use a hand-computed fixture; API checks use throwaway records in
// scratch departments that are deleted afterwards.
const { tokenFor, userId, get, post, put, patch, del, Suite, db, purge } = require('../harness');
const {
  validateDrive, isEligible, validateApplicationUpdate, MAX_ROUNDS, MAX_UPDATES,
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

  const DR = '/api/faculty/placement/drives';
  const AN = '/api/faculty/placement/analytics';
  s.check('placement: unauthenticated → 401', (await get(DR)).status === 401);
  s.check('placement: student → 403', (await get(DR, tokenFor('pl-student', 'student'))).status === 403);
  s.check('placement: faculty → 403', (await get(DR, tokenFor('pl-faculty', 'faculty'))).status === 403);
  s.check('placement: faculty cannot create a drive → 403', (await post(DR, tokenFor('pl-faculty', 'faculty'), { company: 'Acme' })).status === 403);
  s.check('placement: faculty cannot read analytics → 403', (await get(AN, tokenFor('pl-faculty', 'faculty'))).status === 403);

  // Throwaway records in scratch departments; everything is removed afterwards.
  const D = 'SMOKEPLACE';
  const made = [];
  const mk = async (id, data) => { await db().collection('students').doc(id).set({ ...data, isSmokeTest: true }); made.push(id); };
  s.onCleanup(async () => {
    for (const id of made) await db().collection('students').doc(id).delete().catch(() => {});
    await purge('placementApplications', 'studentId', made);
    await purge('placementDrives', 'department', [D, 'SMOKEPLACE2']);
  }, 'temporary placement records');
  await mk(userId('plst-1'), { name: 'Smoke Placement 1', role: 'student', department: D, section: 'A', year: 4 });
  await mk(userId('plst-2'), { name: 'Smoke Placement 2', role: 'student', department: D, section: 'A', year: 4 });
  await mk(userId('plst-3'), { name: 'Smoke Placement 3', role: 'student', department: D, section: 'B', year: 3 });

  const head = tokenFor('pl-hod', 'hod', { department: D });
  const other = tokenFor('pl-hod-other', 'hod', { department: 'SMOKEPLACE2' });
  const admin = tokenFor('pl-admin', 'admin');

  // ── Creating a drive ───────────────────────────────────────────────────────
  s.check('create: no company → 400', (await post(DR, head, { role: 'SDE' })).status === 400);
  s.check('create: an impossible date → 400', (await post(DR, head, { company: 'Acme', date: '2026-02-31' })).status === 400);
  s.check('create: duplicate rounds → 400', (await post(DR, head, { company: 'Acme', rounds: ['HR', 'hr'] })).status === 400);

  const made1 = await post(DR, head, { company: 'Smoke Corp', role: 'SDE', date: '2027-01-10', ctc: '6 LPA', eligible_years: [4], rounds: ['Aptitude', 'Technical'] });
  s.check('create: an HOD creates a drive', made1.status === 201, `status ${made1.status}`);
  const id = made1.body?.data?.id;
  if (!id) { s.skip('placement: the rest of the drive lifecycle', 'drive creation failed'); return s; }
  s.check('create: the drive belongs to the HOD\'s own department (from the token)', made1.body.data.department === D, String(made1.body.data.department));
  s.check('create: a department in the body is ignored for an HOD', (await post(DR, head, { company: 'Sneaky', department: 'ECE' })).body?.data?.department === D);

  const list = await get(DR, head);
  const row = (list.body?.data || []).find((x) => x.id === id);
  s.check('list: the drive appears with its eligible count', !!row && row.eligible === 2 && row.applied === 0, JSON.stringify(row));
  s.check('list: another department HOD does not see it', !(await get(DR, other)).body?.data?.some((x) => x.id === id));

  const detail = await get(`${DR}/${id}`, head);
  s.check('detail: only students in an eligible year are listed', detail.status === 200 && detail.body?.data?.students?.length === 2, String(detail.body?.data?.students?.length));
  s.check('detail: another department HOD gets 404', (await get(`${DR}/${id}`, other)).status === 404);

  // ── Recording results ──────────────────────────────────────────────────────
  const S = `${DR}/${id}/applications`;
  const s1 = userId('plst-1'); const s2 = userId('plst-2'); const s3 = userId('plst-3');
  s.check('results: nothing to save → 400', (await put(S, head, { updates: [] })).status === 400);
  s.check('results: an unknown student → 400', (await put(S, head, { updates: [{ student_id: 'nope', status: 'applied' }] })).status === 400);
  s.check('results: a student in an ineligible year → 400', (await put(S, head, { updates: [{ student_id: s3, status: 'applied' }] })).status === 400);
  s.check('results: a round the drive does not have → 400', (await put(S, head, { updates: [{ student_id: s1, status: 'applied', round_results: { HR: 'passed' } }] })).status === 400);
  s.check('results: selected with a failed round → 400', (await put(S, head, { updates: [{ student_id: s1, status: 'selected', round_results: { Aptitude: 'failed' } }] })).status === 400);
  s.check(`results: more than ${MAX_UPDATES} students → 400`, (await put(S, head, { updates: Array.from({ length: MAX_UPDATES + 1 }, () => ({ student_id: s1, status: 'applied' })) })).status === 400);
  const bad = await put(S, head, { updates: [{ student_id: s1, status: 'selected' }, { student_id: s3, status: 'applied' }] });
  s.check('results: one bad row means nothing is saved', bad.status === 400 && (await get(`${DR}/${id}`, head)).body.data.students.find((x) => x.id === s1).status === null);

  const saved = await put(S, head, { updates: [
    { student_id: s1, status: 'selected', round_results: { Aptitude: 'passed', Technical: 'passed' } },
    { student_id: s2, status: 'rejected', round_results: { Aptitude: 'failed' } },
  ] });
  s.check('results: an HOD records two students\' outcomes', saved.status === 200 && saved.body?.data?.saved === 2, `status ${saved.status}`);
  const after = await get(`${DR}/${id}`, head);
  s.check('results: the detail reflects them', after.body?.data?.students?.find((x) => x.id === s1)?.status === 'selected' && after.body.data.students.find((x) => x.id === s2).round_results.Aptitude === 'failed');
  s.check('results: another department HOD cannot record results (404)', (await put(S, other, { updates: [{ student_id: s1, status: 'applied' }] })).status === 404);

  // Clearing ONE round result must really remove it (a merge write would leave the old value behind).
  const clearOne = await put(S, head, { updates: [{ student_id: s2, status: 'rejected', round_results: {} }] });
  const afterClear = await get(`${DR}/${id}`, head);
  s.check('results: clearing a single round result removes it', clearOne.status === 200 && Object.keys(afterClear.body.data.students.find((x) => x.id === s2).round_results).length === 0);
  await put(S, head, { updates: [{ student_id: s2, status: 'rejected', round_results: { Aptitude: 'failed' } }] });

  // ── Analytics ──────────────────────────────────────────────────────────────
  const an = await get(AN, head);
  const o = an.body?.data?.overview;
  s.check('analytics: HOD → 200', an.status === 200, `status ${an.status}`);
  s.check('analytics: the pool is the whole department, placed is the one selected student', o?.pool === 3 && o?.placed === 1 && o?.not_placed === 2, JSON.stringify(o));
  // Eligible slots: "Smoke Corp" (year 4 only) = 2, plus "Sneaky" (every year, created above) = 3.
  s.check('analytics: funnel eligible 5 (2 + 3), applied 2, selected 1', (() => { const f = Object.fromEntries((an.body?.data?.funnel || []).map((x) => [x.key, x.count])); return f.eligible === 5 && f.applied === 2 && f.selected === 1; })(), JSON.stringify(an.body?.data?.funnel));
  s.check('analytics: round results flow into round analysis', an.body?.data?.rounds?.find((x) => x.round === 'Aptitude')?.attempted === 2);
  s.check('analytics: the other department sees none of it', (await get(AN, other)).body?.data?.overview?.pool === 0);
  s.check('analytics: a section filter narrows the pool', (await get(`${AN}?section=B`, head)).body?.data?.overview?.pool === 1);

  // ── Editing a drive, clearing, deleting ────────────────────────────────────
  const edit = await patch(`${DR}/${id}`, head, { company: 'Smoke Corp Renamed', rounds: ['Aptitude'] });
  s.check('edit: an HOD edits the drive', edit.status === 200 && edit.body?.data?.company === 'Smoke Corp Renamed', `status ${edit.status}`);
  s.check('edit: removing a round removes its results from applications', (await get(`${DR}/${id}`, head)).body.data.students.find((x) => x.id === s1).round_results.Technical === undefined);
  s.check('edit: another department HOD cannot edit (404)', (await patch(`${DR}/${id}`, other, { company: 'hijack' })).status === 404);
  s.check('edit: another department HOD cannot delete (404)', (await del(`${DR}/${id}`, other)).status === 404);

  const cleared = await put(S, head, { updates: [{ student_id: s1, status: null }] });
  s.check('results: a null status clears the application', cleared.status === 200);
  s.check('analytics: clearing the only selection makes nobody placed', (await get(AN, head)).body?.data?.overview?.placed === 0);

  s.check('admin: must name a department when creating', (await post(DR, admin, { company: 'Acme' })).status === 400);
  const adminDrive = await post(DR, admin, { company: 'Admin Corp', department: 'SMOKEPLACE2' });
  s.check('admin: creates a drive for a named department', adminDrive.status === 201 && adminDrive.body?.data?.department === 'SMOKEPLACE2', `status ${adminDrive.status}`);
  s.check('admin: sees drives across departments', (await get(DR, admin)).body?.data?.some((x) => x.id === id));
  if (adminDrive.body?.data?.id) await del(`${DR}/${adminDrive.body.data.id}`, admin);

  s.check('delete: the owner deletes the drive', (await del(`${DR}/${id}`, head)).status === 200);
  s.check('delete: it is gone afterwards', (await get(`${DR}/${id}`, head)).status === 404);
  const finalAn = (await get(AN, head)).body?.data;
  s.check('delete: its applications went with it (no applications remain in the department)', Object.fromEntries((finalAn?.funnel || []).map((x) => [x.key, x.count])).applied === 0, JSON.stringify(finalAn?.funnel));
  s.check('delete: only the other drive created in this run is left', finalAn?.overview?.drives === 1, String(finalAn?.overview?.drives));

  return s;
};
