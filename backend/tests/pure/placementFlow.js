// Training & Placement end to end: the real routes, services and rules, in-memory storage. Drives and their draft state, who sees what, applying
// and withdrawing, the dream-tier rule, overrides with a reason, CGPA uploads and rollback, outside offers, notices, exports and the 2FA gate.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { createPlacementFakeDb } = require('../fakes/placementFakeDb');
const { loadAppWithMounts } = require('../routeAudit');
const gate = require('../../src/utils/twofaGate');

const fake = createPlacementFakeDb();
const { db } = fake;

fake.addUser({ id: 'tp', role: 'tnp', name: 'T&P Officer', department: null });
fake.addUser({ id: 'adm', role: 'admin', name: 'Admin', department: null });
fake.addUser({ id: 'hodC', role: 'hod', name: 'HOD CSE', department: 'CSE' });
fake.addUser({ id: 'hodE', role: 'hod', name: 'HOD ECE', department: 'ECE' });
fake.addUser({ id: 'fac', role: 'faculty', name: 'Faculty', department: 'CSE' });
const stu = (id, extra) => fake.addUser({ id, role: 'student', name: `Student ${id}`, rollNo: `22${id.toUpperCase()}`, department: 'CSE', year: 4, section: 'A', email: `${id}@s.test`, ...extra });
stu('s1'); stu('s2'); stu('s3', { year: 3 }); stu('s4', { department: 'ECE' }); stu('s5');
stu('evil', { name: '=HYPERLINK("http://x")', codingScore: 55 });
db.records.set('s1', { cgpa: 8, backlogs: 0 });
db.records.set('s2', { cgpa: 6, backlogs: 2 });
db.records.set('s3', { cgpa: 9, backlogs: 0 });
db.records.set('s4', { cgpa: 9.5, backlogs: 0 });

module.exports = async function (s) {
  fake.install();
  require('../../src/services/placementService').clearMemo();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id, extra = {}) => { const u = db.users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0, ...extra }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, body, extra) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who, extra)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON (a CSV) */ }
    return { status: res.status, json, data: json?.data, code: json?.code, text, type: res.headers.get('content-type') || '' };
  };
  const mine = async (id) => (await call('GET', '/api/placement/me', id)).data;
  const driveFor = (view, did) => view.drives.find((d) => d.id === did);

  try {
    // ── making a drive ──
    const body = { company: 'Acme', role: 'Engineer', ctc: '6 LPA', departments: ['CSE'], eligible_years: [4], min_cgpa: 7, max_backlogs: 0, apply_by: '2099-01-01', rounds: ['Aptitude', 'Interview'] };
    const made = await call('POST', '/api/placement/drives', 'tp', body);
    s.check('T&P creates a drive; it starts as a draft', made.status === 201 && made.data.publish_state === 'draft' && made.data.tier === 'normal');
    const D1 = made.data.id;
    s.check('the Admin may create a drive too', (await call('POST', '/api/placement/drives', 'adm', { ...body, company: 'AdminCo' })).status === 201);
    s.check('a faculty member, an HOD and a student cannot create a drive', (await Promise.all(['fac', 'hodC', 's1'].map((u) => call('POST', '/api/placement/drives', u, body)))).every((r) => r.status === 403));
    s.check('an invalid drive is refused with the reason', (await call('POST', '/api/placement/drives', 'tp', { ...body, min_cgpa: 12 })).json.error.includes('CGPA'));
    s.check('a draft is not shown to a student', !driveFor(await mine('s1'), D1));
    s.check('a draft is not shown to an HOD', (await call('GET', '/api/placement/drives', 'hodC')).data.every((d) => d.id !== D1));
    s.check('a draft can be opened by T&P', (await call('GET', `/api/placement/drives/${D1}`, 'tp')).status === 200 && (await call('GET', `/api/placement/drives/${D1}`, 'hodC')).status === 404);
    s.check('a student cannot apply to a draft', (await call('POST', `/api/placement/me/drives/${D1}/apply`, 's1', { consent: true })).code === 'NOT_PUBLISHED');

    s.check('T&P publishes the drive', (await call('PATCH', `/api/placement/drives/${D1}`, 'tp', { publish_state: 'published' })).data.publish_state === 'published');

    // ── what each student sees ──
    const v1 = await mine('s1');
    s.check('an eligible student sees the drive and can apply', driveFor(v1, D1)?.can_apply === true && driveFor(v1, D1).reasons.length === 0);
    const v2 = await mine('s2');
    s.check('a student below the CGPA and over the backlog limit sees both reasons', driveFor(v2, D1).can_apply === false && driveFor(v2, D1).reasons.length === 2 && driveFor(v2, D1).reasons.some((r) => /CGPA/.test(r)) && driveFor(v2, D1).reasons.some((r) => /backlog/.test(r)));
    s.check('a student of another year is told why', driveFor(await mine('s3'), D1).reasons.some((r) => /year/.test(r)));
    s.check('a student of another department does not see the drive at all', !driveFor(await mine('s4'), D1));
    s.check('a student with no CGPA on record is told it is missing', driveFor(await mine('s5'), D1).reasons.some((r) => /CGPA has not been added/.test(r)));
    s.check('a student sees only their own marks', v1.record.cgpa === 8 && JSON.stringify(v1).indexOf('"cgpa":6') === -1 && JSON.stringify(v1).indexOf('"cgpa":9') === -1);

    // ── applying ──
    s.check('applying needs the consent tick', (await call('POST', `/api/placement/me/drives/${D1}/apply`, 's1', {})).code === 'CONSENT');
    const refused = await call('POST', `/api/placement/me/drives/${D1}/apply`, 's2', { consent: true });
    s.check('an ineligible student cannot apply, and gets every reason', refused.status === 409 && refused.json.reasons.length === 2);
    const ok = await call('POST', `/api/placement/me/drives/${D1}/apply`, 's1', { consent: true });
    s.check('an eligible student applies', ok.status === 201 && db.apps.get(`${D1}_s1`).status === 'applied' && db.apps.get(`${D1}_s1`).source === 'student');
    s.check('the consent time is kept', typeof db.apps.get(`${D1}_s1`).consentAtMs === 'number');
    s.check('applying twice is refused', (await call('POST', `/api/placement/me/drives/${D1}/apply`, 's1', { consent: true })).code === 'ALREADY_APPLIED');
    const afterApply = driveFor(await mine('s1'), D1);
    s.check('the student then sees the application, and can withdraw', afterApply.applied && afterApply.application_status === 'applied' && afterApply.status === 'open' && afterApply.can_withdraw === true);
    s.check('a student can withdraw', (await call('DELETE', `/api/placement/me/drives/${D1}/apply`, 's1')).status === 200 && !db.apps.has(`${D1}_s1`));
    s.check('withdrawing with nothing to withdraw is refused', (await call('DELETE', `/api/placement/me/drives/${D1}/apply`, 's1')).status === 409);
    await call('POST', `/api/placement/me/drives/${D1}/apply`, 's1', { consent: true });

    s.check('a student cannot use the office routes', (await Promise.all(['/api/placement/drives', '/api/placement/records', '/api/placement/analytics', '/api/placement/outside', '/api/placement/records/batches'].map((p) => call('GET', p, 's1')))).every((r) => r.status === 403));
    s.check('a faculty member cannot reach any placement route', (await Promise.all(['/api/placement/drives', '/api/placement/records', '/api/placement/analytics', '/api/placement/me'].map((p) => call('GET', p, 'fac')))).every((r) => r.status === 403));
    s.check('no sign-in is refused', (await call('GET', '/api/placement/drives', null)).status === 401);

    // ── the HOD reads their own department only ──
    const hodList = await call('GET', '/api/placement/drives', 'hodC');
    s.check('an HOD sees their department\'s published drive with counts', hodList.status === 200 && hodList.data.some((d) => d.id === D1 && d.applied === 1));
    s.check('an HOD of another department does not see it', (await call('GET', '/api/placement/drives', 'hodE')).data.every((d) => d.id !== D1));
    const hodDrive = await call('GET', `/api/placement/drives/${D1}`, 'hodC');
    s.check('an HOD sees the applicants with CGPA, only of their own department', hodDrive.status === 200 && hodDrive.data.students.every((r) => r.department === 'CSE') && hodDrive.data.students.find((r) => r.id === 's1').cgpa === 8);
    s.check('an HOD of another department gets "not found" for it', (await call('GET', `/api/placement/drives/${D1}`, 'hodE')).status === 404);
    s.check('an HOD cannot change anything', (await Promise.all([call('PATCH', `/api/placement/drives/${D1}`, 'hodC', { status: 'closed' }), call('DELETE', `/api/placement/drives/${D1}`, 'hodC'), call('PUT', `/api/placement/drives/${D1}/applications`, 'hodC', { updates: [] }), call('POST', '/api/placement/records/preview', 'hodC', { text: 'roll,cgpa\n22S1,8' }), call('POST', '/api/placement/export', 'hodC', { fields: ['name'] })])).every((r) => r.status === 403));
    const t1d = await call('GET', `/api/placement/drives/${D1}`, 'tp');
    s.check('T&P sees every student of the drive\'s department, with why each can or cannot apply', t1d.data.students.length === 5 && t1d.data.students.find((r) => r.id === 's2').eligible === false && t1d.data.students.find((r) => r.id === 's1').eligible === true);

    // ── marking results, and adding someone by hand ──
    s.check('T&P records a round and shortlists', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's1', status: 'shortlisted', round_results: { Aptitude: 'passed' } }] })).data.saved === 1 && db.apps.get(`${D1}_s1`).source === 'student');
    s.check('a result for a round the drive does not have is refused', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's1', status: 'shortlisted', round_results: { Nope: 'passed' } }] })).status === 400);
    const noReason = await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's2', status: 'applied' }] });
    s.check('adding a student who does not meet the rules needs a written reason', noReason.status === 400 && noReason.code === 'OVERRIDE_REASON' && !db.apps.has(`${D1}_s2`));
    s.check('a short reason is not enough', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's2', status: 'applied', override_reason: 'ok' }] })).status === 400);
    const withReason = await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's2', status: 'applied', override_reason: 'Principal approved after the backlog cleared' }] });
    s.check('with a reason the student is added and the reason is kept', withReason.status === 200 && db.apps.get(`${D1}_s2`).overrideReason === 'Principal approved after the backlog cleared' && db.apps.get(`${D1}_s2`).overriddenBy === 'tp' && db.apps.get(`${D1}_s2`).source === 'staff');
    s.check('the override is in the audit log', db.audit.some((a) => a.action === 'placement.applications.save' && /1 with an override/.test(a.detail || '')));
    s.check('a student of another department cannot be pushed into the drive without an override either', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's4', status: 'applied' }] })).code === 'OVERRIDE_REASON');
    s.check('an unknown student is refused', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 'nobody', status: 'applied' }] })).status === 400);
    s.check('nothing is written when any update in the list is bad', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's5', status: 'applied', override_reason: 'Approved by the head of placement' }, { student_id: 'nobody', status: 'applied' }] })).status === 400 && !db.apps.has(`${D1}_s5`));
    s.check('T&P can remove an application', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's2', status: null }] })).data.saved === 1 && !db.apps.has(`${D1}_s2`));

    // ── a student cannot withdraw after the company has acted ──
    s.check('a shortlisted student cannot withdraw by themselves', (await call('DELETE', `/api/placement/me/drives/${D1}/apply`, 's1')).code === 'CANNOT_WITHDRAW');

    // ── the dream-tier rule ──
    const normal2 = (await call('POST', '/api/placement/drives', 'tp', { company: 'Beta', departments: ['CSE'], eligible_years: [4], publish_state: 'published' })).data.id;
    const dream = (await call('POST', '/api/placement/drives', 'tp', { company: 'DreamCo', departments: ['CSE', 'ECE'], tier: 'dream', publish_state: 'published' })).data.id;
    const pre = await mine('s1');
    s.check('before any offer, both a normal and a dream drive are open', driveFor(pre, normal2).can_apply && driveFor(pre, dream).can_apply);
    s.check('T&P selects the student: an offer', (await call('PUT', `/api/placement/drives/${D1}/applications`, 'tp', { updates: [{ student_id: 's1', status: 'selected', round_results: { Aptitude: 'passed', Interview: 'passed' } }] })).status === 200);
    const post = await mine('s1');
    s.check('with an offer, a normal drive is closed to the student, with the reason', driveFor(post, normal2).can_apply === false && driveFor(post, normal2).reasons.some((r) => /dream/.test(r)) && post.has_offer === true);
    s.check('with an offer, a dream drive is still open', driveFor(post, dream).can_apply === true);
    s.check('the student cannot apply to the normal drive', (await call('POST', `/api/placement/me/drives/${normal2}/apply`, 's1', { consent: true })).code === 'HAS_OFFER');
    s.check('the student can apply to the dream drive', (await call('POST', `/api/placement/me/drives/${dream}/apply`, 's1', { consent: true })).status === 201);
    s.check('marking a student who already holds an offer as selected in another normal drive is refused', (await call('PUT', `/api/placement/drives/${normal2}/applications`, 'tp', { updates: [{ student_id: 's1', status: 'selected', override_reason: 'Offer letter received from this company' }] })).code === 'HAS_OFFER');
    s.check('but in a dream drive it is allowed', (await call('PUT', `/api/placement/drives/${dream}/applications`, 'tp', { updates: [{ student_id: 's1', status: 'selected' }] })).status === 200);

    // ── closing a drive ──
    s.check('T&P closes a drive; students can no longer apply', (await call('PATCH', `/api/placement/drives/${normal2}`, 'tp', { status: 'closed' })).data.status === 'closed' && (await call('POST', `/api/placement/me/drives/${normal2}/apply`, 's5', { consent: true })).code === 'CLOSED');
    s.check('a closed drive cannot be overridden into', (await call('PUT', `/api/placement/drives/${normal2}/applications`, 'tp', { updates: [{ student_id: 's5', status: 'applied', override_reason: 'Late but approved by head' }] })).code === 'CLOSED');
    s.check('a drive with applications cannot go back to a draft', (await call('PATCH', `/api/placement/drives/${D1}`, 'tp', { publish_state: 'draft' })).code === 'HAS_APPLICATIONS');
    const past = (await call('POST', '/api/placement/drives', 'tp', { company: 'PastCo', departments: ['CSE'], publish_state: 'published', apply_by: '2020-01-01' })).data.id;
    s.check('after the last date a student cannot apply', (await call('POST', `/api/placement/me/drives/${past}/apply`, 's5', { consent: true })).code === 'DEADLINE');
    s.check('after the last date T&P can still add a student with a reason', (await call('PUT', `/api/placement/drives/${past}/applications`, 'tp', { updates: [{ student_id: 's5', status: 'applied', override_reason: 'Was on leave, approved by the head' }] })).status === 200);

    // ── outside offers ──
    const out = await call('POST', '/api/placement/outside', 'tp', { student_id: 's3', company: 'OffCampus Ltd', role: 'Intern', ctc: '4 LPA', status: 'selected' });
    s.check('T&P records an offer made outside the portal', out.status === 201);
    const v3 = await mine('s3');
    s.check('the student sees it, separately, and counts as having an offer', v3.outside.length === 1 && v3.outside[0].company === 'OffCampus Ltd' && v3.has_offer === true);
    s.check('outside records are listed for T&P and for the HOD of that department only', (await call('GET', '/api/placement/outside', 'tp')).data.length === 1 && (await call('GET', '/api/placement/outside', 'hodC')).data.length === 1 && (await call('GET', '/api/placement/outside', 'hodE')).data.length === 0);
    s.check('an outside record needs a company and a real status', (await call('POST', '/api/placement/outside', 'tp', { student_id: 's3', company: 'X' })).status === 400 && (await call('POST', '/api/placement/outside', 'tp', { student_id: 's3', company: 'Okay Co', status: 'hired' })).status === 400);
    s.check('T&P can change and delete an outside record', (await call('PATCH', `/api/placement/outside/${out.data.id}`, 'tp', { status: 'rejected' })).status === 200 && db.outside.get(out.data.id).status === 'rejected' && (await call('DELETE', `/api/placement/outside/${out.data.id}`, 'tp')).status === 200 && db.outside.size === 0);
    await call('POST', '/api/placement/outside', 'tp', { student_id: 's3', company: 'OffCampus Ltd', status: 'selected' });

    // ── analytics ──
    const an = await call('GET', '/api/placement/analytics', 'tp');
    s.check('college-wide analytics count the outside offer as placed, and show it separately', an.status === 200 && an.data.students.find((r) => r.id === 's3').state === 'placed' && an.data.outside.offers === 1 && an.data.overview.pool === 6);
    s.check('an HOD\'s analytics cover only their department', (await call('GET', '/api/placement/analytics', 'hodE')).data.overview.pool === 1 && (await call('GET', '/api/placement/analytics', 'hodC')).data.overview.pool === 5);
    s.check('T&P can narrow analytics to a department', (await call('GET', '/api/placement/analytics?department=ECE', 'tp')).data.overview.pool === 1);
    s.check('analytics list the departments to choose from', an.data.departments.join() === 'CSE,ECE');

    // ── CGPA upload, dry run, rollback ──
    const csv = 'Roll No,CGPA,Backlogs\n22S1,8.5,0\n22S5,7.4,1\n22NOPE,7,0\n22S2,5.5,\n';
    const prev = await call('POST', '/api/placement/records/preview', 'tp', { text: csv });
    s.check('a dry run says what would change and writes nothing', prev.status === 200 && prev.data.counts.new === 1 && prev.data.counts.changed === 2 && prev.data.counts.error === 1 && !db.records.has('s5') && db.batches.size === 0);
    s.check('an HOD or a student cannot upload', (await call('POST', '/api/placement/records', 'hodC', { text: csv })).status === 403 && (await call('POST', '/api/placement/records', 's1', { text: csv })).status === 403);
    s.check('a bad file is refused with a clear message', /Roll number/.test((await call('POST', '/api/placement/records/preview', 'tp', { text: 'name,cgpa\nA,8' })).json.error));
    const applied = await call('POST', '/api/placement/records', 'tp', { text: csv, note: 'Sem 6 results' });
    s.check('applying writes the good rows and skips the bad ones', applied.status === 200 && applied.data.applied === 3 && applied.data.errors === 1 && db.records.get('s5').cgpa === 7.4 && db.records.get('s1').cgpa === 8.5);
    s.check('a row that leaves the backlog column empty keeps the old backlog count', db.records.get('s2').cgpa === 5.5 && db.records.get('s2').backlogs === 2);
    s.check('the upload is written to the audit log', db.audit.some((a) => a.action === 'placement.records.upload' && /3 applied/.test(a.detail)));
    s.check('the upload is listed', (await call('GET', '/api/placement/records/batches', 'tp')).data[0].applied === 3);
    const B1 = applied.data.batch_id;
    const second = await call('POST', '/api/placement/records', 'tp', { text: 'roll,cgpa\n22S1,9.1\n' });
    const rb = await call('POST', `/api/placement/records/batches/${B1}/rollback`, 'tp');
    s.check('undoing an upload restores what it replaced', rb.status === 200 && db.records.get('s2').cgpa === 6 && !db.records.has('s5'));
    s.check('a record that a LATER upload has changed is left alone', db.records.get('s1').cgpa === 9.1 && rb.data.left_alone === 1 && second.status === 200);
    s.check('an upload can only be undone once', (await call('POST', `/api/placement/records/batches/${B1}/rollback`, 'tp')).status === 409);
    s.check('the student sees the new record', (await mine('s1')).record.cgpa === 9.1);
    const rows = await call('GET', '/api/placement/records?department=CSE', 'hodC');
    s.check('an HOD lists their own students\' records', rows.data.every((r) => r.department === 'CSE') && rows.data.length === 5);
    s.check('an HOD of another department sees none of them', (await call('GET', '/api/placement/records?department=CSE', 'hodE')).data.length === 0);

    // ── notices ──
    const d4 = (await call('POST', '/api/placement/drives', 'tp', { company: 'Notify Inc', departments: ['CSE'], eligible_years: [4], min_cgpa: 7, publish_state: 'published' })).data.id;
    db.records.set('s5', { cgpa: 7.4, backlogs: 1 });
    db.records.set('evil', { cgpa: 7.2, backlogs: 0 });
    require('../../src/services/placementService').clearMemo(); // these two were written straight into the storage, not through the service
    await call('POST', `/api/placement/me/drives/${d4}/apply`, 'evil', { consent: true });
    const before = db.nudges.length;
    const note = await call('POST', `/api/placement/drives/${d4}/notify`, 'tp', { message: 'Notify Inc is hiring, apply by Friday' });
    const sentTo = db.nudges.slice(before).map((n) => n.studentId).sort();
    s.check('a notice goes only to students who are eligible and have not applied (not to one with an offer, one below the CGPA, or one who already applied)', note.status === 200 && note.data.sent === sentTo.length && sentTo.join() === 's5' && db.nudges.slice(before).every((n) => n.kind === 'placement' && n.driveId === d4));
    s.check('a notice for a draft is refused', (await call('POST', `/api/placement/drives/${(await call('POST', '/api/placement/drives', 'tp', { company: 'Draft Co', departments: ['CSE'] })).data.id}/notify`, 'tp', {})).code === 'DRAFT');
    s.check('an HOD cannot send a notice', (await call('POST', `/api/placement/drives/${d4}/notify`, 'hodC', {})).status === 403);

    // ── export ──
    const fields = await call('GET', '/api/placement/export/fields', 'tp');
    s.check('the list of exportable fields is fixed', fields.data.map((f) => f.key).join() === 'name,rollNo,department,year,section,email,cgpa,backlogs,codingScore');
    const ex = await call('POST', '/api/placement/export', 'tp', { fields: ['cgpa', 'name', 'rollNo'], department: 'CSE' });
    const lines = ex.text.replace(/^﻿/, '').trim().split('\r\n');
    s.check('an export is a CSV with only the chosen fields in a fixed order', ex.status === 200 && /text\/csv/.test(ex.type) && lines[0] === 'Name,Roll number,CGPA' && lines.length === 6);
    s.check('a name that would run as a spreadsheet formula is defused', lines.some((l) => l.includes("\"'=HYPERLINK")) && !lines.some((l) => l.startsWith('=')));
    s.check('every export is in the audit log with the fields and the count', db.audit.some((a) => a.action === 'placement.export' && /5 student/.test(a.detail) && /name,rollNo,cgpa/.test(a.detail)));
    s.check('the department filter limits the export', !ex.text.includes('Student s4'));
    s.check('an unknown field is refused and nothing is exported', (await call('POST', '/api/placement/export', 'tp', { fields: ['name', 'password'] })).status === 400 && (await call('POST', '/api/placement/export', 'tp', { fields: [] })).status === 400);
    s.check('the coding score can be exported', (await call('POST', '/api/placement/export', 'tp', { fields: ['codingScore'], department: 'CSE' })).text.includes('55'));
    const appEx = await call('POST', '/api/placement/export', 'tp', { fields: ['name'], drive_id: D1 });
    s.check('an export can be limited to the applicants of one drive', appEx.text.replace(/^﻿/, '').trim().split('\r\n').length === 2);

    // ── deleting ──
    s.check('deleting a drive removes its applications', (await call('DELETE', `/api/placement/drives/${D1}`, 'tp')).status === 200 && ![...db.apps.keys()].some((k) => k.startsWith(D1)));
    s.check('a missing drive is "not found"', (await call('GET', `/api/placement/drives/${D1}`, 'tp')).status === 404);

    // ── two-factor gate ──
    const held = await call('GET', '/api/placement/drives', 'tp', undefined, { t2: true });
    s.check('a T&P session that has not set up two-factor is refused everywhere', held.status === 403 && held.code === 'TWOFA_REQUIRED');
    s.check('the gate lets the 2FA setup and the password change through', gate.blockedByTwofaGate({ t2: true }, '/api/2fa/setup') === false && gate.blockedByTwofaGate({ t2: true }, '/api/2fa/enable') === false && gate.blockedByTwofaGate({ t2: true }, '/api/auth/set-password') === false && gate.blockedByTwofaGate({ t2: true }, '/api/placement/drives') === true);
    s.check('the gate only applies to a held session', gate.blockedByTwofaGate({}, '/api/placement/drives') === false && gate.blockedByTwofaGate({ t2: false }, '/api/placement/drives') === false);
    s.check('only T&P is held back until it has two-factor', gate.twofaClaim({ role: 'tnp', totpEnabled: false }).t2 === true && gate.twofaClaim({ role: 'tnp', totpEnabled: true }).t2 === undefined && gate.twofaClaim({ role: 'student' }).t2 === undefined && gate.twofaClaim({ role: 'admin' }).t2 === undefined);
    s.check('T&P cannot turn two-factor off, others can', gate.mayChangeTwofa('tnp', true) === false && gate.mayChangeTwofa('tnp', false) === true && gate.mayChangeTwofa('faculty', true) === true);
  } finally {
    server.close();
  }
};
