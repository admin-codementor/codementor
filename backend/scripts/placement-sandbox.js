// DEV ONLY. The real API with an in-memory database holding staff, students, drives and CGPA records (no real data, no credentials, no
// network), so the Training & Placement screens can be tried in a browser.
//
//   SANDBOX_OUT=<folder> PORT=3001 node scripts/placement-sandbox.js
//
// Writes sign-in snippets for: T&P, T&P held back until it sets up two-factor, admin, an HOD (CSE), a student who can apply to some drives, and a
// student who already has an offer. Paste one into the browser console on the website.
if (process.env.NODE_ENV === 'production') { console.error('placement-sandbox is a development tool and refuses to run with NODE_ENV=production.'); process.exit(1); }
require('../tests/hermeticEnv');
if (process.env.REDIS_RETRIES === undefined) process.env.REDIS_RETRIES = '0';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createPlacementFakeDb } = require('../tests/fakes/placementFakeDb');

const PORT = Number(process.env.PORT) || 3003;
const fake = createPlacementFakeDb();
const { db } = fake;
fake.addUser({ id: 'tp', role: 'tnp', name: 'Meena (Training & Placement)', department: null, email: 'placement@college.test' });
fake.addUser({ id: 'adm', role: 'admin', name: 'Admin', department: null, email: 'admin@college.test' });
fake.addUser({ id: 'hodC', role: 'hod', name: 'Dr. Rao (HOD CSE)', department: 'CSE', email: 'hod@college.test' });
fake.addUser({ id: 'hodE', role: 'hod', name: 'Dr. Iyer (HOD ECE)', department: 'ECE', email: 'hode@college.test' });
const names = ['Asha', 'Ravi', 'Mani', 'Divya', 'Kiran', 'Sneha', 'Arjun', 'Lakshmi', 'Vikram', 'Pooja'];
for (let i = 1; i <= 40; i += 1) {
  const id = `a${i}`;
  fake.addUser({ id, role: 'student', name: `${names[i % 10]} A${i}`, rollNo: `22CS${String(i).padStart(3, '0')}`, department: 'CSE', year: 4, section: i <= 20 ? 'A' : 'B', email: `${id}@s.test`, codingScore: 20 + (i * 7) % 70 });
  if (i % 8 !== 0) db.records.set(id, { cgpa: Math.round((5.5 + ((i * 37) % 45) / 10) * 100) / 100, backlogs: i % 6 === 0 ? 2 : i % 5 === 0 ? 1 : 0 });
}
for (let i = 1; i <= 15; i += 1) {
  const id = `e${i}`;
  fake.addUser({ id, role: 'student', name: `${names[(i + 3) % 10]} E${i}`, rollNo: `22EC${String(i).padStart(3, '0')}`, department: 'ECE', year: 4, section: 'A', email: `${id}@s.test`, codingScore: 30 });
  db.records.set(id, { cgpa: Math.round((6 + ((i * 29) % 38) / 10) * 100) / 100, backlogs: 0 });
}
db.records.set('a1', { cgpa: 8.4, backlogs: 0 });
db.records.set('a2', { cgpa: 8.9, backlogs: 0 });
fake.install();

const now = Date.now();
const day = 86400000;
const iso = (offsetDays) => new Date(now + offsetDays * day).toISOString();
const drive = (id, data) => db.drives.set(id, { id, createdBy: 'tp', description: '', link: null, role: '', ctc: '', rounds: [], eligibleYears: [], minCgpa: null, maxBacklogs: null, applyBy: null, tier: 'normal', status: 'open', publishState: 'published', ...data });
drive('d1', { company: 'Infosys', role: 'Systems Engineer', ctc: '3.6 LPA', departments: ['CSE', 'ECE'], eligibleYears: [4], minCgpa: 6, maxBacklogs: 1, applyBy: iso(5), date: '2026-12-02', rounds: ['Aptitude', 'Technical', 'HR'], description: 'Mass recruitment drive. Bring your college ID and a printed resume.' });
drive('d2', { company: 'Zoho', role: 'Member Technical Staff', ctc: '8 LPA', departments: ['CSE'], eligibleYears: [4], minCgpa: 7.5, maxBacklogs: 0, applyBy: iso(9), rounds: ['Written', 'Programming', 'Interview'], tier: 'dream', link: 'https://www.zoho.com/careers/' });
drive('d3', { company: 'Wipro', role: 'Project Engineer', ctc: '3.5 LPA', departments: ['CSE', 'ECE'], eligibleYears: [4], applyBy: iso(-2), rounds: ['Aptitude', 'Interview'] });
drive('d4', { company: 'Capgemini (draft)', role: 'Analyst', departments: ['CSE'], eligibleYears: [4], publishState: 'draft' });
drive('d5', { company: 'TCS', role: 'Ninja', ctc: '3.36 LPA', departments: ['CSE', 'ECE'], eligibleYears: [4], status: 'closed', rounds: ['Aptitude', 'Interview'], date: '2026-10-05' });
const apply = (driveId, studentId, status, roundResults = {}, extra = {}) => db.apps.set(`${driveId}_${studentId}`, { driveId, studentId, status, roundResults, source: 'student', appliedAtMs: now - 3 * day, ...extra });
apply('d5', 'a2', 'selected', { Aptitude: 'passed', Interview: 'passed' });
apply('d5', 'a3', 'rejected', { Aptitude: 'failed' });
apply('d5', 'a4', 'shortlisted', { Aptitude: 'passed' });
apply('d3', 'a5', 'applied');
apply('d1', 'a6', 'applied');
apply('d1', 'a7', 'applied', {}, { source: 'staff', overrideReason: 'Backlog cleared in the supplementary exam' });
db.outside.set('o1', { id: 'o1', studentId: 'a9', company: 'Local Startup Pvt Ltd', role: 'Intern', ctc: '2 LPA', status: 'selected', atMs: now });

const app = require('../src/app');
const snippet = (id, target, extra = {}) => {
  const u = db.users.get(id);
  const claims = { id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0, ...extra };
  const access = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
  const refresh = jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: '12h' });
  const user = { id, name: u.name, email: u.email, role: u.role, department: u.department ?? null };
  return `localStorage.setItem("accessToken",${JSON.stringify(access)});localStorage.setItem("refreshToken",${JSON.stringify(refresh)});localStorage.setItem("user",${JSON.stringify(JSON.stringify(user))});try{sessionStorage.clear()}catch(e){};location.href=${JSON.stringify(target)};`;
};
const out = process.env.SANDBOX_OUT;
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'pl-tnp.js'), snippet('tp', '/tnp/drives'));
  fs.writeFileSync(path.join(out, 'pl-tnp-2fa.js'), snippet('tp', '/tnp/drives', { t2: true }));
  fs.writeFileSync(path.join(out, 'pl-admin.js'), snippet('adm', '/tnp/drives'));
  fs.writeFileSync(path.join(out, 'pl-hod.js'), snippet('hodC', '/faculty/department'));
  fs.writeFileSync(path.join(out, 'pl-student.js'), snippet('a1', '/app/placements'));
  fs.writeFileSync(path.join(out, 'pl-student-offer.js'), snippet('a2', '/app/placements'));
}
app.listen(PORT, '127.0.0.1', () => {
  console.log(`placement sandbox on http://127.0.0.1:${PORT}`);
  if (out) console.log(`sign-in snippets written to ${out}`);
});
