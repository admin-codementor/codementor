// Practice analytics end to end over HTTP: who may read it, that a HOD only sees their own department, that the filters and the batch work,
// and that a bad query cannot reach the data.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { loadAppWithMounts } = require('../routeAudit');
const { users, add, install, reset } = require('../fakes/adminFakeDb');
const userRepo = require('../../src/repositories/userRepository');
const submissionRepo = require('../../src/repositories/submissionRepository');
const problemRepo = require('../../src/repositories/problemRepository');
const courseRepo = require('../../src/repositories/courseRepository');
const messageRepo = require('../../src/repositories/messageRepository');
const adminService = require('../../src/services/adminService');
const accountGate = require('../../src/middleware/accountGate');

const clone = (v) => (v == null ? v : structuredClone(v));

module.exports = async function (s) {
  reset();
  users.delete('s1'); users.delete('s2'); // the shared fake seeds two students; this test wants only its own
  add({ id: 'hodC', role: 'hod', name: 'HOD CSE', email: 'hodc@c.test', department: 'CSE' });
  add({ id: 'hodE', role: 'hod', name: 'HOD ECE', email: 'hode@c.test', department: 'ECE' });
  add({ id: 'stuA', role: 'student', name: 'Asha', email: 'asha@c.test', rollNo: '22CS001', department: 'CSE', section: 'A', year: 4, admissionYear: 2022 });
  add({ id: 'stuC', role: 'student', name: 'Meena', email: 'meena@c.test', rollNo: '23CS002', department: 'CSE', section: 'B', year: 3, admissionYear: 2023 });
  add({ id: 'stuB', role: 'student', name: 'Ravi', email: 'ravi@c.test', rollNo: '22EC001', department: 'ECE', section: 'A', year: 4, admissionYear: 2022 });
  install();
  Object.assign(userRepo, { getMapByRole: async (role) => new Map([...users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map((u) => [u.id, clone(u)])) });
  const t = Date.now() - 3600000;
  Object.assign(submissionRepo, { listAllForAnalytics: async () => [
    { userId: 'stuA', problemId: 'p1', verdict: 'Accepted', submittedAt: t, language: 100 },
    { userId: 'stuA', problemId: 'p2', verdict: 'Wrong Answer', submittedAt: t, language: 100 },
    { userId: 'stuC', problemId: 'p1', verdict: 'Accepted', submittedAt: t, language: 71 },
    { userId: 'stuB', problemId: 'p1', verdict: 'Accepted', submittedAt: t, language: 71 },
  ] });
  Object.assign(problemRepo, { listCatalog: async () => [{ id: 'p1', title: 'Sum', difficulty: 'easy', tags: ['loops'] }, { id: 'p2', title: 'Sort', difficulty: 'medium', tags: ['arrays'] }] });
  Object.assign(problemRepo, { getMapByIds: async () => new Map([['p1', { status: 'published' }], ['p2', { status: 'published' }]]) });
  Object.assign(courseRepo, { listAll: async () => [{ id: 'c1', title: 'Python' }], getModules: async () => [{ id: 'u1', title: 'Basics', problemIds: ['p1', 'p2'] }] });
  Object.assign(messageRepo, { listForUser: async (id) => (id === 'hodC' ? [{ id: 't', participants: ['hodC', 'stuA'], lastMessageBy: 'stuA', lastMessageAtMs: Date.now() - 50 * 3600000 }] : []) });
  users.get('stuA').mentorId = 'hodC';
  accountGate.reset(); adminService.clearPeople();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => { const u = users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (path, who) => {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(8000), headers: who ? { authorization: `Bearer ${token(who)}` } : {} });
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, data: json?.data };
  };

  try {
    s.check('no sign-in, a student and a faculty member are all refused', (await call('/api/faculty/practice-analytics')).status === 401 && (await call('/api/faculty/practice-analytics', 'stuA')).status === 403 && (await call('/api/faculty/practice-analytics', 'f1')).status === 403);
    const c = await call('/api/faculty/practice-analytics?days=7', 'hodC');
    s.check('a HOD gets their own department: two CSE students, both practising; the ECE student is not in it', c.status === 200 && c.data.tiles.students === 2 && c.data.tiles.practising === 2 && c.data.tiles.submissions === 3);
    s.check('the ECE HOD sees only the ECE student', (await call('/api/faculty/practice-analytics', 'hodE')).data.tiles.students === 1);
    s.check('a department cannot be asked for in the query: it comes from the token', (await call('/api/faculty/practice-analytics?department=ECE', 'hodC')).data.tiles.students === 2);
    s.check('the Admin sees every department', (await call('/api/faculty/practice-analytics', 'adm1')).data.tiles.students === 3);
    s.check('section, year and batch narrow the view', (await call('/api/faculty/practice-analytics?section=B', 'hodC')).data.tiles.students === 1 && (await call('/api/faculty/practice-analytics?year=4', 'hodC')).data.tiles.students === 1 && (await call('/api/faculty/practice-analytics?batch=2023-2027', 'hodC')).data.tiles.students === 1);
    s.check('nonsense filters are ignored rather than failing, and an unknown period is 7 days', (await call('/api/faculty/practice-analytics?section=%3Cx%3E&year=99&batch=abc&days=abc', 'hodC')).data.period_days === 7);
    s.check('the department dashboard takes the batch too', (await call('/api/faculty/department?batch=2022-2026', 'hodC')).data.totals.students === 1);
    const cb = await call('/api/faculty/courses-by-class', 'hodC');
    s.check('course progress by class: a HOD gets their own department only, with the classes', cb.status === 200 && cb.data.classes.map((c) => `${c.label}:${c.students}`).join() === 'Year 3 · B:1,Year 4 · A:1' && cb.data.courses[0].overall.students === 2);
    s.check('course progress by class is for HOD and Admin only', (await call('/api/faculty/courses-by-class', 'stuA')).status === 403 && (await call('/api/faculty/courses-by-class', 'f1')).status === 403 && (await call('/api/faculty/courses-by-class', 'adm1')).data.courses[0].overall.students === 3);
    const board = await call('/api/faculty/mentors', 'hodC');
    const me = board.data?.mentors?.find((m) => m.id === 'hodC');
    s.check('the mentor board says who is waiting for an answer and for how long, from the thread records', board.status === 200 && me.response.waiting === 1 && me.response.waiting_over_48h === 1 && me.response.longest_wait_hours >= 50);
    const people = await call('/api/faculty/department', 'hodC');
    s.check('every student row carries the batch for the People page', people.data.students.every((r) => /^\d{4}-\d{4}$/.test(r.batch)));
  } finally {
    server.close();
  }
};
