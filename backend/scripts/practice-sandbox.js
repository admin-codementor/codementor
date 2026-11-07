// DEV ONLY. The real API with an in-memory database holding a department of students with submissions, courses, mentors and message threads
// (no real data, no credentials, no network, no email), so the HOD's Practice, People and Courses tabs can be tried in a browser.
//
//   SANDBOX_OUT=<folder> PORT=3001 node scripts/practice-sandbox.js
//
// Writes a sign-in snippet for the HOD (pr-hod.js). Paste it into the browser console on the website.
if (process.env.NODE_ENV === 'production') { console.error('practice-sandbox is a development tool and refuses to run with NODE_ENV=production.'); process.exit(1); }
require('../tests/hermeticEnv');
if (process.env.REDIS_RETRIES === undefined) process.env.REDIS_RETRIES = '0';
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { users, add, install } = require('../tests/fakes/adminFakeDb');
const userRepo = require('../src/repositories/userRepository');
const submissionRepo = require('../src/repositories/submissionRepository');
const problemRepo = require('../src/repositories/problemRepository');
const courseRepo = require('../src/repositories/courseRepository');
const messageRepo = require('../src/repositories/messageRepository');

const PORT = Number(process.env.PORT) || 3001;
const now = Date.now();
const HOUR = 3600000;
const clone = (v) => (v == null ? v : structuredClone(v));

add({ id: 'hodC', role: 'hod', name: 'Dr. Rao (HOD CSE)', email: 'hod@college.test', department: 'CSE', lastLoginAt: new Date(now - 120000) });
add({ id: 'f2', role: 'faculty', name: 'Prof. Bharat', email: 'f2@college.test', department: 'CSE' });
const students = [];
for (let i = 1; i <= 24; i += 1) {
  const year = i <= 12 ? 4 : 3;
  const u = { id: `a${i}`, role: 'student', name: `Student A${String(i).padStart(2, '0')}`, email: `a${i}@s.test`, rollNo: `${year === 4 ? '22' : '23'}CS${String(i).padStart(3, '0')}`, department: 'CSE', section: i % 2 ? 'A' : 'B', year, admissionYear: year === 4 ? 2022 : 2023, mentorId: i % 3 === 0 ? 'f2' : (i % 3 === 1 ? 'hodC' : null) };
  add(u); students.push(u);
}
install();
Object.assign(userRepo, { getMapByRole: async (role) => new Map([...users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map((u) => [u.id, clone(u)])) });

const catalog = [
  { id: 'p1', title: 'Sum of two numbers', difficulty: 'easy', tags: ['Loops'], status: 'published' }, { id: 'p2', title: 'Reverse a string', difficulty: 'easy', tags: ['Strings'], status: 'published' },
  { id: 'p3', title: 'Binary search', difficulty: 'medium', tags: ['Arrays'], status: 'published' }, { id: 'p4', title: 'Merge intervals', difficulty: 'medium', tags: ['Arrays'], status: 'published' },
  { id: 'p5', title: 'Knapsack', difficulty: 'hard', tags: ['DP'], status: 'published' }, { id: 'p6', title: 'Longest path', difficulty: 'hard', tags: ['Graphs', 'DP'], status: 'published' },
];
const subs = [];
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
students.forEach((st, i) => {
  if (i % 6 === 5) return; // never started
  const n = 3 + Math.floor(rnd() * 14);
  for (let k = 0; k < n; k += 1) {
    const p = catalog[Math.floor(rnd() * (i % 4 === 0 ? 6 : 3))];
    subs.push({ userId: st.id, problemId: p.id, verdict: rnd() < 0.45 ? 'Accepted' : 'Wrong Answer', submittedAt: now - Math.floor(rnd() * 40 * 24) * HOUR - Math.floor(rnd() * 12) * HOUR, language: rnd() < 0.6 ? 71 : 62 });
  }
});
Object.assign(submissionRepo, { listAllForAnalytics: async () => clone(subs) });
Object.assign(problemRepo, {
  listCatalog: async () => clone(catalog),
  getMapByIds: async (ids) => new Map(catalog.filter((p) => ids.includes(p.id)).map((p) => [p.id, clone(p)])),
});
Object.assign(courseRepo, {
  listAll: async () => [{ id: 'c1', title: 'Python Programming' }, { id: 'c2', title: 'Data Structures' }],
  getModules: async (id) => (id === 'c1' ? [{ id: 'm1', title: 'Basics', problemIds: ['p1', 'p2'] }] : [{ id: 'm2', title: 'Arrays and DP', problemIds: ['p3', 'p4', 'p5'] }]),
});
Object.assign(messageRepo, { listForUser: async (id) => (id === 'f2' ? [{ id: 't1', participants: ['f2', 'a3'], lastMessageBy: 'a3', lastMessageAtMs: now - 70 * HOUR }, { id: 't2', participants: ['f2', 'a6'], lastMessageBy: 'f2', lastMessageAtMs: now - 5 * HOUR }] : id === 'hodC' ? [{ id: 't3', participants: ['hodC', 'a1'], lastMessageBy: 'a1', lastMessageAtMs: now - 3 * HOUR }] : []) });

const app = require('../src/app');
const out = process.env.SANDBOX_OUT;
if (out) {
  const claims = { id: 'hodC', role: 'hod', permissions: {}, department: 'CSE', tv: 0 };
  const access = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
  const refresh = jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: '12h' });
  const user = { id: 'hodC', name: 'Dr. Rao (HOD CSE)', email: 'hod@college.test', role: 'hod', department: 'CSE' };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'pr-hod.js'), `localStorage.setItem("accessToken",${JSON.stringify(access)});localStorage.setItem("refreshToken",${JSON.stringify(refresh)});localStorage.setItem("user",${JSON.stringify(JSON.stringify(user))});try{sessionStorage.clear()}catch(e){};location.href="/faculty/department";`);
}
app.listen(PORT, '127.0.0.1', () => {
  console.log(`practice sandbox on http://127.0.0.1:${PORT}`);
  if (out) console.log(`sign-in snippet written to ${out}`);
});
