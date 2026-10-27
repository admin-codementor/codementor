// DEV ONLY. The real API with an in-memory database holding staff and students (no real data, no credentials, no network), so the
// academic structure screens can be tried in a browser.
//
//   SANDBOX_OUT=<folder> PORT=3001 node scripts/academic-sandbox.js
//
// Writes sign-in snippets for: admin, hod (CSE), faculty f1 (CSE), faculty f2 (CSE), a student in CSE year 3 section A. Paste one into the
// browser console on the website. A term is created and activated; the HOD builds the classes from the screen.
if (process.env.NODE_ENV === 'production') { console.error('academic-sandbox is a development tool and refuses to run with NODE_ENV=production.'); process.exit(1); }
require('../tests/hermeticEnv');
if (process.env.REDIS_RETRIES === undefined) process.env.REDIS_RETRIES = '0';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createAcademicFakeDb } = require('../tests/fakes/academicFakeDb');

const PORT = Number(process.env.PORT) || 3003;
const fake = createAcademicFakeDb();
const { db } = fake;
fake.addUser({ id: 'adm', role: 'admin', name: 'Admin', department: null, email: 'admin@college.test' });
fake.addUser({ id: 'hodC', role: 'hod', name: 'Dr. Rao (HOD CSE)', department: 'CSE', email: 'hod@college.test' });
fake.addUser({ id: 'hodE', role: 'hod', name: 'Dr. Iyer (HOD ECE)', department: 'ECE', email: 'hode@college.test' });
for (const [id, name] of [['f1', 'Prof. Anita'], ['f2', 'Prof. Bharat'], ['f3', 'Prof. Chitra'], ['f4', 'Prof. Dev']]) fake.addUser({ id, role: 'faculty', name, department: 'CSE', email: `${id}@college.test` });
fake.addUser({ id: 'fE', role: 'faculty', name: 'Prof. Esha', department: 'ECE', email: 'fe@college.test' });
for (let i = 1; i <= 52; i += 1) fake.addUser({ id: `a${i}`, role: 'student', name: `Student A${String(i).padStart(2, '0')}`, rollNo: `21CS${String(i).padStart(3, '0')}`, department: 'CSE', year: 3, section: 'A' });
for (let i = 1; i <= 30; i += 1) fake.addUser({ id: `b${i}`, role: 'student', name: `Student B${String(i).padStart(2, '0')}`, rollNo: `21CSB${String(i).padStart(3, '0')}`, department: 'CSE', year: 3, section: 'B' });
for (let i = 1; i <= 20; i += 1) fake.addUser({ id: `e${i}`, role: 'student', name: `Student E${String(i).padStart(2, '0')}`, rollNo: `21EC${String(i).padStart(3, '0')}`, department: 'ECE', year: 2, section: 'A' });
fake.addUser({ id: 'nosec', role: 'student', name: 'Student NoSection', rollNo: '21CS900', department: 'CSE', year: null, section: '' });
fake.install();

db.terms.set('term1', { id: 'term1', label: '2026-27 odd semester', academicYear: '2026-27', semester: 'odd', startDate: '2026-06-15T00:00:00.000Z', endDate: '2026-11-30T00:00:00.000Z', status: 'active' });

const app = require('../src/app');
const snippet = (id, target) => {
  const u = db.users.get(id);
  const claims = { id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 };
  const access = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
  const refresh = jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: '12h' });
  const user = { id, name: u.name, email: u.email, role: u.role, department: u.department ?? null };
  return `localStorage.setItem("accessToken",${JSON.stringify(access)});localStorage.setItem("refreshToken",${JSON.stringify(refresh)});localStorage.setItem("user",${JSON.stringify(JSON.stringify(user))});try{sessionStorage.clear()}catch(e){};location.href=${JSON.stringify(target)};`;
};
const out = process.env.SANDBOX_OUT;
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'acad-admin.js'), snippet('adm', '/faculty/academic'));
  fs.writeFileSync(path.join(out, 'acad-hod.js'), snippet('hodC', '/faculty/academic'));
  fs.writeFileSync(path.join(out, 'acad-f1.js'), snippet('f1', '/faculty/my-classes'));
  fs.writeFileSync(path.join(out, 'acad-f2.js'), snippet('f2', '/faculty/my-classes'));
  fs.writeFileSync(path.join(out, 'acad-student.js'), snippet('a3', '/app/dashboard'));
}
app.listen(PORT, '127.0.0.1', () => {
  console.log(`academic sandbox on http://127.0.0.1:${PORT}`);
  if (out) console.log(`sign-in snippets written to ${out}`);
});
