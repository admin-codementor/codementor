// DEV ONLY. The real API with an in-memory database holding staff, students, an audit trail and sign-in history (no real data, no credentials,
// no network, and no email is ever sent), so the Admin screens can be tried in a browser.
//
//   SANDBOX_OUT=<folder> PORT=3001 node scripts/admin-sandbox.js
//
// Writes sign-in snippets for the Admin and for a faculty member. Paste one into the browser console on the website.
if (process.env.NODE_ENV === 'production') { console.error('admin-sandbox is a development tool and refuses to run with NODE_ENV=production.'); process.exit(1); }
require('../tests/hermeticEnv');
if (process.env.REDIS_RETRIES === undefined) process.env.REDIS_RETRIES = '0';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { users, add, state, install } = require('../tests/fakes/adminFakeDb');

const PORT = Number(process.env.PORT) || 3003;
const now = Date.now();
const day = 86400000;
add({ id: 'hodC', role: 'hod', name: 'Dr. Rao (HOD CSE)', email: 'hod@college.test', department: 'CSE', lastLoginAt: new Date(now - 2 * day) });
add({ id: 'hodE', role: 'hod', name: 'Dr. Iyer (HOD ECE)', email: 'hode@college.test', department: 'ECE', lastLoginAt: new Date(now - 9 * day) });
for (const [id, name] of [['f2', 'Prof. Bharat'], ['f3', 'Prof. Chitra'], ['f4', 'Prof. Dev']]) add({ id, role: 'faculty', name, email: `${id}@college.test`, department: 'CSE', lastLoginAt: new Date(now - day) });
add({ id: 'tp2', role: 'tnp', name: 'Meena (Training & Placement)', email: 'placement@college.test', totpEnabled: true, lastLoginAt: new Date(now - 3600000) });
for (let i = 1; i <= 30; i += 1) add({ id: `a${i}`, role: 'student', name: `Student A${String(i).padStart(2, '0')}`, email: `a${i}@s.test`, rollNo: `22CS${String(i).padStart(3, '0')}`, department: 'CSE', year: 4, lastLoginAt: i % 3 ? new Date(now - (i % 9) * day) : null });
for (let i = 1; i <= 12; i += 1) add({ id: `e${i}`, role: 'student', name: `Student E${String(i).padStart(2, '0')}`, email: `e${i}@s.test`, rollNo: `22EC${String(i).padStart(3, '0')}`, department: 'ECE', year: 3, lastLoginAt: i % 2 ? new Date(now - (i % 5) * day) : null });
users.get('adm2').disabled = true;
state.mailOn = true;
state.audit.push(
  { id: 'x1', action: 'admin.account.create', userId: 'adm1', detail: 'placement@college.test as tnp; mail sent', ip: '10.0.0.2', createdAt: now - 4 * day },
  { id: 'x2', action: 'placement.drive.create', userId: 'tp2', detail: 'Infosys, normal, published', ip: '10.0.0.7', createdAt: now - 3 * day },
  { id: 'x3', action: 'placement.export', userId: 'tp2', detail: '40 student(s); fields name,rollNo,cgpa', ip: '10.0.0.7', createdAt: now - 2 * day },
  { id: 'x4', action: 'permissions.update', userId: 'adm1', detail: 'f2: run_plagiarism on', ip: '10.0.0.2', createdAt: now - day },
);
state.logins.push(
  { userId: 'tp2', role: 'tnp', kind: 'twofa_failed', atMs: now - 7200000, ip: '10.0.0.9' },
  { userId: 'f2', role: 'faculty', kind: 'login', atMs: now - 5000000, ip: '10.0.0.4', agent: 'Chrome' },
  { userId: 'adm2', role: 'admin', kind: 'blocked_disabled', atMs: now - 3000000, ip: '10.0.0.8' },
);
install();

// Health and problem reports: the judge jobs, the self-check store and the reports are held in memory as well.
const judgeJobRepo = require('../src/repositories/judgeJobRepository');
const maintenanceRepo = require('../src/repositories/maintenanceRepository');
const placementRepo = require('../src/repositories/placementRepository');
const reportRepo = require('../src/repositories/problemReportRepository');
const academic = require('../src/services/academicService');
const dead = [{ jobId: 'job-1', atMs: now - 3600000, reason: 'open too long', ageMs: 900000, userId: 'a3', examId: 'exam-1' }];
let saved = null;
const reports = new Map([['r1', { id: 'r1', userId: 'a4', role: 'student', requestId: '4F2A9C1B', page: '/app/problems/two-sum', message: 'The Run button did nothing', code: 'SERVER_ERROR', httpStatus: 500, status: 'open', atMs: now - 7200000 }]]);
Object.assign(judgeJobRepo, { listDeadLetters: async (since) => dead.filter((d) => d.atMs >= since) });
Object.assign(maintenanceRepo, { saveSelfCheck: async (r) => { saved = r; }, getSelfCheck: async () => saved, takeLease: async () => ({ take: false, reason: 'held' }), releaseLease: async () => {} });
Object.assign(placementRepo, { listAllApplications: async () => [{ driveId: 'gone', studentId: 'a1' }], listDrives: async () => [], removeApplication: async () => {} });
Object.assign(reportRepo, {
  create: async (d) => { const id = 'r' + (reports.size + 1); reports.set(id, { id, ...d, status: 'open', atMs: Date.now() }); return id; },
  list: async (status) => [...reports.values()].filter((r) => !status || r.status === status).sort((a, b) => b.atMs - a.atMs),
  get: async (id) => reports.get(id) || null, setStatus: async (id, s) => { reports.get(id).status = s; },
});
academic.syncActiveTerm = async () => ({ classes: 6, positions: 0, mentorsUpdated: 3 });

const app = require('../src/app');
const snippet = (id, target) => {
  const u = users.get(id);
  const claims = { id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 };
  const access = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
  const refresh = jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: '12h' });
  const user = { id, name: u.name, email: u.email, role: u.role, department: u.department ?? null };
  return `localStorage.setItem("accessToken",${JSON.stringify(access)});localStorage.setItem("refreshToken",${JSON.stringify(refresh)});localStorage.setItem("user",${JSON.stringify(JSON.stringify(user))});try{sessionStorage.clear()}catch(e){};location.href=${JSON.stringify(target)};`;
};
const out = process.env.SANDBOX_OUT;
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'adm-admin.js'), snippet('adm1', '/faculty/college'));
  fs.writeFileSync(path.join(out, 'adm-faculty.js'), snippet('f2', '/faculty/dashboard'));
}
app.listen(PORT, '127.0.0.1', () => {
  console.log(`admin sandbox on http://127.0.0.1:${PORT}`);
  if (out) console.log(`sign-in snippets written to ${out}`);
});
