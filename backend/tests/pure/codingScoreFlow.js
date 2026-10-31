// The coding profile numbers end to end: a student types a number for a platform the server cannot read, it counts at half until a HOD or Admin
// verifies it, a HOD can only check their own department, the leaderboard ignores unverified numbers, and the Admin sets a student's batch.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { loadAppWithMounts } = require('../routeAudit');
const { users, add, install } = require('../fakes/adminFakeDb');
const userRepo = require('../../src/repositories/userRepository');
const codingProfileRepo = require('../../src/repositories/codingProfileRepository');
const adminService = require('../../src/services/adminService');
const accountGate = require('../../src/middleware/accountGate');

add({ id: 'hodC', role: 'hod', name: 'HOD CSE', email: 'hodc@c.test', department: 'CSE' });
add({ id: 'hodE', role: 'hod', name: 'HOD ECE', email: 'hode@c.test', department: 'ECE' });
add({ id: 'stuA', role: 'student', name: 'Asha', email: 'asha@c.test', rollNo: '22CS001', department: 'CSE', year: 4 });
add({ id: 'stuB', role: 'student', name: 'Ravi', email: 'ravi@c.test', rollNo: '22EC001', department: 'ECE', year: 3 });
add({ id: 'stuC', role: 'student', name: 'Meena', email: 'meena@c.test', rollNo: '22CS002', department: 'CSE', admissionYear: 2022, year: 4 });

const profiles = new Map();
const clone = (v) => (v == null ? v : structuredClone(v));

module.exports = async function (s) {
  install();
  Object.assign(userRepo, { getMapByRole: async (role) => new Map([...users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map((u) => [u.id, clone(u)])) });
  Object.assign(codingProfileRepo, {
    listByUser: async (uid) => [...profiles.values()].filter((p) => p.userId === uid).map(clone),
    upsert: async (uid, platform, data) => { const k = `${uid}_${platform}`; profiles.set(k, { ...(profiles.get(k) || {}), userId: uid, platform, ...clone(data) }); },
    remove: async (uid, platform) => { profiles.delete(`${uid}_${platform}`); },
    listAll: async () => [...profiles.values()].map(clone),
  });
  accountGate.reset(); adminService.clearPeople();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => { const u = users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, body) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json, data: json?.data };
  };

  try {
    // ── a student types a number ──
    const set = await call('PUT', '/api/profiles/me', 'stuA', { platform: 'codechef', handle: 'asha_cc', value: '120' });
    s.check('a student saves a handle and types a number for CodeChef', set.status === 200 && profiles.get('stuA_codechef').typedValue === 120 && profiles.get('stuA_codechef').scoreVerified === false);
    const mine = await call('GET', '/api/profiles/me', 'stuA');
    const row = mine.json.data.find((p) => p.platform === 'codechef');
    s.check('they see the number and that it is not verified; the platform lists include InterviewBit and the typed ones', row.typed_value === 120 && row.score_verified === false && mine.json.allPlatforms.includes('interviewbit') && Object.keys(mine.json.typedPlatforms).length === 4);
    s.check('a bad number is refused with the unit named', (await call('PUT', '/api/profiles/me', 'stuA', { platform: 'hackerrank', handle: 'h', value: '-3' })).json.error.includes('problems solved') && (await call('PUT', '/api/profiles/me', 'stuA', { platform: 'interviewbit', handle: 'i', value: 'x' })).json.error.includes('score'));
    s.check('a number cannot be typed for a platform the server reads itself', (await call('PUT', '/api/profiles/me', 'stuA', { platform: 'leetcode', handle: 'asha', value: '300' })).status === 200 && profiles.get('stuA_leetcode').typedValue === undefined);
    await call('PUT', '/api/profiles/me', 'stuB', { platform: 'gfg', handle: 'ravi_g', value: '40' });

    // ── the HOD's list ──
    const hodList = await call('GET', '/api/faculty/platform-unverified', 'hodC');
    s.check('the HOD sees the numbers waiting in their own department only', hodList.status === 200 && hodList.data.length === 1 && hodList.data[0].name === 'Asha' && hodList.data[0].label === 'CodeChef' && hodList.data[0].value === 120);
    s.check('the Admin sees every department', (await call('GET', '/api/faculty/platform-unverified', 'adm1')).data.length === 2);
    s.check('students and faculty cannot see the list or decide', (await call('GET', '/api/faculty/platform-unverified', 'stuA')).status === 403 && (await call('POST', '/api/faculty/platform-verify', 'stuA', { user_id: 'stuA', platform: 'codechef', action: 'verify' })).status === 403 && (await call('GET', '/api/faculty/platform-unverified', 'f1')).status === 403);

    // ── deciding ──
    s.check('a HOD cannot decide for another department; it looks like "not found"', (await call('POST', '/api/faculty/platform-verify', 'hodE', { user_id: 'stuA', platform: 'codechef', action: 'verify' })).status === 404 && profiles.get('stuA_codechef').scoreVerified === false);
    s.check('a bad action or platform is refused', (await call('POST', '/api/faculty/platform-verify', 'hodC', { user_id: 'stuA', platform: 'codechef', action: 'delete' })).status === 400 && (await call('POST', '/api/faculty/platform-verify', 'hodC', { user_id: 'stuA', platform: 'leetcode', action: 'verify' })).status === 400);
    const ok = await call('POST', '/api/faculty/platform-verify', 'hodC', { user_id: 'stuA', platform: 'codechef', action: 'verify' });
    s.check('the HOD verifies it, who did it is kept, and it leaves the list', ok.status === 200 && profiles.get('stuA_codechef').scoreVerified === true && profiles.get('stuA_codechef').scoreVerifiedBy === 'hodC' && (await call('GET', '/api/faculty/platform-unverified', 'hodC')).data.length === 0);
    s.check('the student then sees it as verified', (await call('GET', '/api/profiles/me', 'stuA')).json.data.find((p) => p.platform === 'codechef').score_verified === true);
    await call('PUT', '/api/profiles/me', 'stuA', { platform: 'codechef', handle: 'asha_cc', value: '150' });
    s.check('typing a new number clears the verification, so a checked number cannot be swapped for another', profiles.get('stuA_codechef').scoreVerified === false && profiles.get('stuA_codechef').typedValue === 150);
    await call('PUT', '/api/profiles/me', 'stuA', { platform: 'codechef', handle: 'someone_else' });
    s.check('changing only the handle also clears a verification', profiles.get('stuA_codechef').scoreVerified === false);
    await call('POST', '/api/faculty/platform-verify', 'hodC', { user_id: 'stuA', platform: 'codechef', action: 'verify' });
    await call('PUT', '/api/profiles/me', 'stuA', { platform: 'codechef', handle: 'someone_else' });
    s.check('saving the same handle again keeps the verification', profiles.get('stuA_codechef').scoreVerified === true);
    const rej = await call('POST', '/api/faculty/platform-verify', 'adm1', { user_id: 'stuB', platform: 'gfg', action: 'reject' });
    s.check('rejecting removes the number so the student must type it again', rej.status === 200 && profiles.get('stuB_gfg').typedValue === null && profiles.get('stuB_gfg').scoreVerified === false);
    s.check('a number that is not there any more is a clear "reload" answer', (await call('POST', '/api/faculty/platform-verify', 'adm1', { user_id: 'stuB', platform: 'gfg', action: 'verify' })).status === 409);

    // ── the leaderboard ──
    await call('PUT', '/api/profiles/me', 'stuA', { platform: 'hackerrank', handle: 'a', value: '500' });
    const lb = await call('GET', '/api/profiles/leaderboard', 'stuA');
    const me = lb.data.find((r) => r.userId === 'stuA');
    s.check('the leaderboard counts a verified typed number and ignores an unverified one', me.byPlatform.codechef === 150 && me.byPlatform.hackerrank === 0 && me.totalSolved >= 150 && me.totalSolved < 650);

    // ── batch, set by the Admin ──
    const listed = await call('GET', '/api/admin/people?role=student&q=asha', 'adm1');
    s.check('the people list shows a student\'s batch, worked out when none is stored', /^\d{4}-\d{4}$/.test(listed.data.rows[0].batch) && listed.data.rows[0].batch_derived === true && listed.data.rows[0].admission_year === null);
    s.check('a stored batch is shown as stored', (await call('GET', '/api/admin/people?role=student&q=meena', 'adm1')).data.rows[0].batch === '2022-2026');
    s.check('the list can be filtered by batch', (await call('GET', '/api/admin/people?role=student&batch=2022-2026', 'adm1')).data.total === 1);
    const set2 = await call('POST', '/api/admin/people/stuA/admission-year', 'adm1', { admission_year: '2021' });
    s.check('the Admin sets a student\'s admission year', set2.status === 200 && set2.data.batch === '2021-2025' && users.get('stuA').admissionYear === 2021);
    s.check('a bad year, an unknown student and a non-Admin are refused', (await call('POST', '/api/admin/people/stuA/admission-year', 'adm1', { admission_year: '1850' })).status === 400 && (await call('POST', '/api/admin/people/nobody/admission-year', 'adm1', { admission_year: '2023' })).status === 404 && (await call('POST', '/api/admin/people/stuA/admission-year', 'hodC', { admission_year: '2023' })).status === 403);
    const fill = await call('POST', '/api/admin/students/fill-batches', 'adm1');
    s.check('filling the missing batches stores the worked-out year for students who have none, and counts them', fill.status === 200 && fill.data.filled >= 1 && users.get('stuB').admissionYear >= 2000 && users.get('stuC').admissionYear === 2022);
    s.check('the batches pickers list the department\'s batches for a HOD, newest first', await (async () => { const r = await call('GET', '/api/faculty/batches', 'hodC'); return r.status === 200 && r.data.length >= 1 && r.data.every((b) => /^\d{4}-\d{4}$/.test(b.name)) && [...r.data].map((b) => b.name).sort().reverse().join() === r.data.map((b) => b.name).join(); })());
    s.check('the export field list is fixed and only for HOD and Admin', (await call('GET', '/api/faculty/department-export/fields', 'hodC')).data.length === 14 && (await call('GET', '/api/faculty/department-export/fields', 'stuA')).status === 403 && (await call('POST', '/api/faculty/department-export', 'f1', { fields: ['name'] })).status === 403 && (await call('POST', '/api/faculty/department-export', 'hodC', { fields: ['password'] })).status === 400);
  } finally {
    server.close();
  }
};
