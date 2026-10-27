// What each kind of staff member sees on the dashboard and in the student lists, the class switcher (?classId=), the insights and the saved
// layout: the real routes, in-memory storage.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { createAcademicFakeDb } = require('../fakes/academicFakeDb');
const { loadAppWithMounts } = require('../routeAudit');
const userRepo = require('../../src/repositories/userRepository');
const submissionRepo = require('../../src/repositories/submissionRepository');
const problemRepo = require('../../src/repositories/problemRepository');
const assignmentRepo = require('../../src/repositories/assignmentRepository');
const classroomRepo = require('../../src/repositories/classroomRepository');
const analyticsService = require('../../src/services/analyticsService');

const fake = createAcademicFakeDb();
const { db } = fake;
const DAY = 86400000;

fake.addUser({ id: 'adm', role: 'admin', name: 'Admin', department: null });
fake.addUser({ id: 'hodC', role: 'hod', name: 'HOD CSE', department: 'CSE' });
fake.addUser({ id: 'hodE', role: 'hod', name: 'HOD ECE', department: 'ECE' });
for (const id of ['f1', 'f2', 'f3', 'f4']) fake.addUser({ id, role: 'faculty', name: `Faculty ${id}`, department: 'CSE' });
for (let i = 1; i <= 6; i += 1) fake.addUser({ id: `a${i}`, role: 'student', name: `A student ${i}`, rollNo: `21CS${i}`, department: 'CSE', year: 3, section: 'A', email: `a${i}@x.test` });
for (let i = 1; i <= 4; i += 1) fake.addUser({ id: `b${i}`, role: 'student', name: `B student ${i}`, rollNo: `21CSB${i}`, department: 'CSE', year: 3, section: 'B', email: `b${i}@x.test` });
for (let i = 1; i <= 3; i += 1) fake.addUser({ id: `e${i}`, role: 'student', name: `E student ${i}`, rollNo: `21EC${i}`, department: 'ECE', year: 2, section: 'A', email: `e${i}@x.test` });

module.exports = async function (s) {
  fake.install();
  const now = Date.now();
  const sub = (userId, problemId, verdict, ageDays) => ({ userId, problemId, verdict, submittedAt: now - ageDays * DAY, language: 71 });
  const subs = [
    // a2: was active, quiet for 20 days. a3: 5 failed attempts on p1 yesterday (stuck). a4, a5, a6: some work. a1: nothing at all.
    sub('a2', 'p2', 'Accepted', 20),
    ...Array.from({ length: 5 }, () => sub('a3', 'p1', 'Wrong Answer', 1)),
    sub('a4', 'p2', 'Accepted', 1), sub('a4', 'p1', 'Wrong Answer', 2),
    sub('a5', 'p2', 'Accepted', 2), ...Array.from({ length: 4 }, () => sub('a5', 'p1', 'Wrong Answer', 2)),
    sub('a6', 'p2', 'Accepted', 3), sub('a6', 'p1', 'Wrong Answer', 3),
    sub('b1', 'p2', 'Accepted', 1), sub('b2', 'p1', 'Wrong Answer', 1), sub('e1', 'p2', 'Accepted', 1),
  ];
  Object.assign(userRepo, { getMapByRole: async (role) => new Map([...db.users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map((u) => [u.id, structuredClone(u)])) });
  Object.assign(submissionRepo, { listAllForAnalytics: async () => subs.map((x) => ({ ...x })) });
  Object.assign(problemRepo, {
    getAll: async () => [{ id: 'p1', title: 'Two Sum', difficulty: 'easy', tags: [] }, { id: 'p2', title: 'Easy one', difficulty: 'easy', tags: [] }],
    getMapByIds: async (ids) => new Map((ids || []).map((id) => [id, { id, title: id }])),
  });
  Object.assign(assignmentRepo, { getAll: async () => [], listByFacultyId: async () => [] });
  const rooms = new Map([['roomOfF4', { id: 'roomOfF4', name: 'F4 lab', facultyId: 'f4' }]]);
  const roomMembers = { roomOfF4: ['a1', 'b1'] };
  Object.assign(classroomRepo, {
    listByFacultyId: async (fid) => [...rooms.values()].filter((r) => r.facultyId === fid),
    listAll: async () => [...rooms.values()],
    getById: async (id) => rooms.get(id) || null,
    listMembers: async (id) => (roomMembers[id] || []).map((userId) => ({ userId })),
    listByStudentId: async () => [],
    getMemberCount: async (id) => (roomMembers[id] || []).length,
  });

  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => { const u = db.users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, body, timeoutMs = 10000) => {
    let res;
    try {
      res = await fetch(base + path, { method, signal: AbortSignal.timeout(timeoutMs), headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      if (timeoutMs >= 10000) console.error('REQUEST DID NOT FINISH:', method, path, who);   // short timeouts are on purpose: the guard let it through
      return { status: 0, json: null, data: null, code: null };
    }
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json, data: json?.data, code: json?.code };
  };
  const ids = (r) => (r.data || []).map((x) => x.id).sort().join(',');

  try {
    // ── set up the structure through the real routes ──
    const t = await call('POST', '/api/academic/terms', 'adm', { label: 'T', academicYear: '2026-27', startDate: '2026-06-01', endDate: '2026-12-01' });
    const T = t.data.id;
    await call('POST', `/api/academic/terms/${T}/activate`, 'adm');
    await call('POST', `/api/academic/terms/${T}/generate`, 'hodC', { department: 'CSE' });
    await call('POST', `/api/academic/terms/${T}/generate`, 'adm', { department: 'ECE' });
    const classes = (await call('GET', `/api/academic/terms/${T}/classes?department=CSE`, 'hodC')).data;
    const A = classes.find((c) => c.section === 'A').id; const B = classes.find((c) => c.section === 'B').id;
    await call('PUT', `/api/academic/classes/${A}/teacher`, 'hodC', { faculty_id: 'f1' });
    await call('PUT', `/api/academic/classes/${B}/teacher`, 'hodC', { faculty_id: 'f2' });
    await call('PUT', `/api/academic/classes/${A}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'f3', from: 1, to: 3 }, { mentorId: 'f1', from: 4, to: 6 }] });

    // ── the Students list ──
    s.check('a faculty member (class teacher) sees exactly their class in the Students list, not the rest of the department', ids(await call('GET', '/api/faculty/students', 'f1')) === 'a1,a2,a3,a4,a5,a6');
    s.check('a faculty member of the same department with a different class sees only that class', ids(await call('GET', '/api/faculty/students', 'f2')) === 'b1,b2,b3,b4');
    s.check('a sub-mentor sees only their own range (positions 1 to 3)', ids(await call('GET', '/api/faculty/students', 'f3')) === 'a1,a2,a3');
    s.check('a classroom of their own adds those students (join-code classes still work)', ids(await call('GET', '/api/faculty/students', 'f4')) === 'a1,b1');
    s.check('a HOD sees their whole department, an Admin everyone', ids(await call('GET', '/api/faculty/students', 'hodC')) === 'a1,a2,a3,a4,a5,a6,b1,b2,b3,b4' && (await call('GET', '/api/faculty/students', 'adm')).data.length === 13);
    s.check('another department\'s HOD sees only theirs', ids(await call('GET', '/api/faculty/students', 'hodE')) === 'e1,e2,e3');

    // ── the class switcher ──
    s.check('choosing one of your classes narrows the list to it', ids(await call('GET', `/api/faculty/students?classId=${A}`, 'f1')) === 'a1,a2,a3,a4,a5,a6');
    s.check('a faculty member with a classroom AND a class can switch between them', ids(await call('GET', '/api/faculty/students?classId=roomOfF4', 'f4')) === 'a1,b1');
    s.check('"all" and no choice are the same thing', ids(await call('GET', '/api/faculty/students?classId=all', 'f1')) === ids(await call('GET', '/api/faculty/students', 'f1')));
    const other = await call('GET', `/api/faculty/students?classId=${B}`, 'f1');
    s.check('a class that is not yours is refused (never quietly widened to everything)', other.status === 403 && other.code === 'CLASS_NOT_YOURS');
    s.check('a classroom of someone else is refused too', (await call('GET', '/api/faculty/students?classId=roomOfF4', 'f1')).status === 403);
    s.check('a class that does not exist is a 404', (await call('GET', '/api/faculty/students?classId=nothing', 'f1')).status === 404);
    s.check('a sub-mentor choosing their class sees only their own range', ids(await call('GET', `/api/faculty/students?classId=${A}`, 'f3')) === 'a1,a2,a3');
    s.check('a HOD can look at any class of their department, not another department\'s', ids(await call('GET', `/api/faculty/students?classId=${B}`, 'hodC')) === 'b1,b2,b3,b4' && (await call('GET', `/api/faculty/students?classId=${B}`, 'hodE')).status === 403);
    s.check('an Admin can look at any class', ids(await call('GET', `/api/faculty/students?classId=${B}`, 'adm')) === 'b1,b2,b3,b4');
    s.check('two class choices at once are refused', (await call('GET', `/api/faculty/students?classId=${A}&classId=${B}`, 'f1')).status === 400);
    s.check('the switcher needs a sign-in', (await call('GET', `/api/faculty/students?classId=${A}`, null)).status === 401);

    // ── the dashboard numbers ──
    const d1 = await call('GET', '/api/faculty/dashboard', 'f1');
    const d2 = await call('GET', `/api/faculty/dashboard?classId=${A}`, 'f4').catch(() => null);
    s.check('the dashboard counts only the faculty member\'s own students', d1.status === 200 && d1.data.stats.totalStudents === 6 && d1.data.stats.totalSubs === 15);
    s.check('and only the selected class when one is chosen (HOD: class B)', (await call('GET', `/api/faculty/dashboard?classId=${B}`, 'hodC')).data.stats.totalStudents === 4 && (await call('GET', '/api/faculty/dashboard', 'hodC')).data.stats.totalStudents === 10);
    s.check('a class that is not yours cannot be counted either', d2 !== null && d2.status === 403);

    // ── the at-risk list ──
    const risk = await call('GET', `/api/faculty/at-risk?classId=${A}`, 'f1');
    s.check('the at-risk list is limited to the class too', risk.status === 200 && (risk.data || []).every((x) => /^a\d$/.test(x.id)));

    // ── a single student ──
    s.check('a faculty member cannot open a student who is not in one of their classes (another section, same department)', (await call('GET', '/api/faculty/students/b1/detail', 'f1')).code === 'STUDENT_NOT_YOURS');
    s.check('nor a student of another department', (await call('GET', '/api/faculty/students/e1/detail', 'f1')).status === 403);
    s.check('a student of their own class passes the guard', (await call('GET', '/api/faculty/students/a2/detail', 'f1', undefined, 1500)).status !== 403);
    s.check('the guard uses everything they may see, not the class last chosen', (await call('GET', `/api/faculty/students/a2/detail?classId=${A}`, 'f4', undefined, 1500)).status !== 200);
    s.check('a HOD can open any student of their department', (await call('GET', '/api/faculty/students/b1/detail', 'hodC', undefined, 1500)).status !== 403 && (await call('GET', '/api/faculty/students/e1/detail', 'hodC')).status === 403);

    // ── department-wide comparisons are not for faculty ──
    s.check('the department-wide cohort lists are refused to faculty and open to HOD and Admin', (await call('GET', '/api/faculty/analytics/cohorts', 'f1')).status === 403 && (await call('GET', '/api/faculty/analytics/cohort-students?dimension=section&value=A', 'f1')).status === 403 && (await call('GET', '/api/faculty/cohort-topics', 'f1')).status === 403 && (await call('GET', '/api/faculty/analytics/cohorts', 'hodC', undefined, 1500)).status !== 403 && (await call('GET', '/api/faculty/analytics/cohorts', 'adm', undefined, 1500)).status !== 403);

    // ── insights ──
    const ins = await call('GET', `/api/faculty/class-insights?classId=${A}`, 'f1');
    s.check('the insights name the student who never started', ins.status === 200 && ins.data.notStarted.items.map((x) => x.id).join() === 'a1' && ins.data.students === 6);
    s.check('and the one who went quiet, with how long', ins.data.quiet.items.some((x) => x.id === 'a2' && x.daysQuiet >= 19));
    s.check('and who is stuck, on which problem, after how many tries (most first)', ins.data.stuck.items[0].id === 'a3' && ins.data.stuck.items[0].problems[0].title === 'Two Sum' && ins.data.stuck.items[0].problems[0].attempts === 5 && ins.data.stuck.items.some((x) => x.id === 'a5'));
    s.check('and the hardest problem of the class', ins.data.hardest.items[0].id === 'p1' && ins.data.hardest.items[0].solveRate === 0 && ins.data.class.id === A);
    s.check('a faculty member\'s insights never include another class\'s students', JSON.stringify(ins.data).includes('"b1"') === false && JSON.stringify(ins.data).includes('"e1"') === false);
    const insB = await call('GET', `/api/faculty/class-insights?classId=${B}`, 'hodC');
    s.check('a HOD gets the insights of a class of their department', insB.status === 200 && insB.data.students === 4 && insB.data.stuck.total === 0 && insB.data.notStarted.items.map((x) => x.id).sort().join() === 'b3,b4');
    s.check('students cannot read insights, and another class is refused', (await call('GET', '/api/faculty/class-insights', 'a1')).status === 403 && (await call('GET', `/api/faculty/class-insights?classId=${B}`, 'f1')).status === 403);

    // ── one class never leaks into another through the cache ──
    const reqOf = (id, filter) => ({ user: { id, role: db.users.get(id).role, department: db.users.get(id).department ?? null }, query: {}, ...(filter ? { classFilter: filter } : {}) });
    const full = await analyticsService.resolveAnalyticsScope(reqOf('f4'));
    const narrowed = await analyticsService.resolveAnalyticsScope(reqOf('f4', { classId: 'roomOfF4', memberIds: new Set(['a1']) }));
    s.check('each class choice has its own cache key, so a narrowed view is never served for the full one', full.cacheKey !== narrowed.cacheKey && analyticsService.scopeKey(full) !== analyticsService.scopeKey(narrowed));
    s.check('a class filter can only narrow a faculty member\'s scope, never add a student they cannot see', [...narrowed.memberIds].join() === 'a1' && (await analyticsService.resolveAnalyticsScope(reqOf('f4', { classId: 'x', memberIds: new Set(['a1', 'e1', 'b4']) }))).memberIds.has('e1') === false);

    // ── the saved layout ──
    const lay = await call('GET', '/api/faculty/dashboard-layout', 'f1');
    s.check('everyone starts with the default layout, and the list of widgets and presets', lay.status === 200 && lay.data.layout.preset === 'default' && lay.data.layout.widgets.length === 6 && lay.data.registry.length === 6 && lay.data.presets.length === 3);
    const put = await call('PUT', '/api/faculty/dashboard-layout', 'f1', { widgets: [{ id: 'at-risk', visible: true }, { id: 'stats', visible: true }, { id: 'summary', visible: false }] });
    s.check('a saved layout comes back as saved, with the widgets it did not mention added at the end', put.status === 200 && (await call('GET', '/api/faculty/dashboard-layout', 'f1')).data.layout.widgets.map((w) => w.id).slice(0, 3).join() === 'at-risk,stats,summary' && (await call('GET', '/api/faculty/dashboard-layout', 'f1')).data.layout.widgets.length === 6);
    s.check('it is each person\'s own', (await call('GET', '/api/faculty/dashboard-layout', 'f2')).data.layout.preset === 'default');
    s.check('an unknown widget is refused by name', (await call('PUT', '/api/faculty/dashboard-layout', 'f1', { widgets: [{ id: 'nope', visible: true }] })).code === 'BAD_LAYOUT');
    s.check('a preset can be chosen', (await call('PUT', '/api/faculty/dashboard-layout', 'f2', { preset: 'minimal' })).data.layout.widgets.filter((w) => w.visible).length === 2);
    db.users.get('f1').dashboardLayout = { widgets: [{ id: 'removed-in-a-later-release', visible: true }, { id: 'stats', visible: false }] };
    const healed = (await call('GET', '/api/faculty/dashboard-layout', 'f1')).data.layout;
    s.check('a layout saved before a widget was removed heals itself instead of breaking the page', !healed.widgets.some((w) => w.id === 'removed-in-a-later-release') && healed.widgets[0].id === 'stats' && healed.widgets[0].visible === false && healed.widgets.length === 6);
    s.check('students cannot read or save a staff layout', (await call('GET', '/api/faculty/dashboard-layout', 'a1')).status === 403 && (await call('PUT', '/api/faculty/dashboard-layout', 'a1', { preset: 'minimal' })).status === 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};
