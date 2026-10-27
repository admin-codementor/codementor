// Terms, classes, class teacher, sub-mentors, assignments, access requests and what each person sees: the real routes, in-memory storage.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { createAcademicFakeDb } = require('../fakes/academicFakeDb');
const { loadAppWithMounts } = require('../routeAudit');
const academicScope = require('../../src/services/academicScope');
const classTargets = require('../../src/services/classTargets');
const classroomRepo = require('../../src/repositories/classroomRepository');

const fake = createAcademicFakeDb();
const { db } = fake;

// staff
fake.addUser({ id: 'adm', role: 'admin', name: 'Admin', department: null });
fake.addUser({ id: 'hodC', role: 'hod', name: 'HOD CSE', department: 'CSE' });
fake.addUser({ id: 'hodE', role: 'hod', name: 'HOD ECE', department: 'ECE' });
['f1', 'f2', 'f3', 'f4'].forEach((id) => fake.addUser({ id, role: 'faculty', name: `Faculty ${id}`, department: 'CSE' }));
fake.addUser({ id: 'fE', role: 'faculty', name: 'Faculty ECE', department: 'ECE' });
// CSE year 3 section A: 30 students whose roll numbers sort naturally (21CS2 before 21CS10)
for (let i = 1; i <= 30; i += 1) fake.addUser({ id: `a${i}`, role: 'student', name: `A student ${i}`, rollNo: `21CS${i}`, department: 'CSE', year: 3, section: 'A', mentorId: 'oldMentor' });
for (let i = 1; i <= 5; i += 1) fake.addUser({ id: `b${i}`, role: 'student', name: `B student ${i}`, rollNo: `21CSB${i}`, department: 'CSE', year: 3, section: 'B' });
for (let i = 1; i <= 3; i += 1) fake.addUser({ id: `e${i}`, role: 'student', name: `E student ${i}`, rollNo: `21EC${i}`, department: 'ECE', year: 2, section: 'A' });
fake.addUser({ id: 'nosec', role: 'student', name: 'No Section', rollNo: '21CS999', department: 'CSE', year: null, section: '' });

module.exports = async function (s) {
  fake.install();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => { const u = db.users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, body) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch { /* none */ }
    return { status: res.status, json, data: json?.data, code: json?.code };
  };
  const day = 86400000;

  try {
    // ── terms ──
    const t1 = await call('POST', '/api/academic/terms', 'adm', { label: '2026-27 odd', academicYear: '2026-27', semester: 'odd', startDate: '2026-06-15', endDate: '2026-11-30' });
    s.check('the Admin creates a term, planned', t1.status === 200 && t1.data.status === 'planned' && !!t1.data.id);
    s.check('a HOD cannot create a term', (await call('POST', '/api/academic/terms', 'hodC', { label: 'x', academicYear: 'y', startDate: '2026-01-01', endDate: '2026-02-01' })).status === 403);
    s.check('an end date before the start is refused', (await call('POST', '/api/academic/terms', 'adm', { label: 'x', academicYear: 'y', startDate: '2026-05-01', endDate: '2026-02-01' })).code === 'BAD_DATES');
    const T = t1.data.id;
    s.check('activating makes it the active term', (await call('POST', `/api/academic/terms/${T}/activate`, 'adm')).data.status === 'active');
    const t0 = await call('POST', '/api/academic/terms', 'adm', { label: 'old', academicYear: '2025-26', startDate: '2025-06-01', endDate: '2025-11-30' });
    const t2 = await call('POST', '/api/academic/terms', 'adm', { label: '2026-27 even', academicYear: '2026-27', startDate: '2026-12-01', endDate: '2027-04-30' });
    await call('POST', `/api/academic/terms/${t2.data.id}/activate`, 'adm');
    s.check('activating another term closes the previous one (one active at a time)', db.terms.get(T).status === 'closed' && db.terms.get(t2.data.id).status === 'active');
    s.check('a closed term cannot be activated again', (await call('POST', `/api/academic/terms/${T}/activate`, 'adm')).code === 'TERM_CLOSED');
    await call('POST', `/api/academic/terms/${T}/activate`, 'adm').catch(() => null);
    db.terms.get(T).status = 'planned'; db.terms.get(t2.data.id).status = 'planned';
    await call('POST', `/api/academic/terms/${T}/activate`, 'adm');
    s.check('terms are listed for staff and not for students', (await call('GET', '/api/academic/terms', 'f1')).data.length >= 3 && t0.status === 200);

    // ── generating classes ──
    const gen = await call('POST', `/api/academic/terms/${T}/generate`, 'hodC', { department: 'CSE' });
    s.check('the HOD builds the CSE classes from year and section: 2 classes, 35 students placed', gen.status === 200 && gen.data.classesCreated === 2 && gen.data.enrolled === 35);
    s.check('a student with no year or section is named and skipped, never guessed', gen.data.skipped.length === 1 && gen.data.skipped[0].rollNo === '21CS999');
    s.check('other departments are untouched', [...db.enrollments.values()].every((e) => !String(e.studentId).startsWith('e')));
    const again = await call('POST', `/api/academic/terms/${T}/generate`, 'hodC', { department: 'CSE' });
    s.check('running it again changes nothing (no double classes, nobody enrolled twice)', again.data.classesCreated === 0 && again.data.enrolled === 0 && db.classes.size === 2 && db.enrollments.size === 35);
    s.check('a HOD cannot build another department\'s classes, an Admin can', (await call('POST', `/api/academic/terms/${T}/generate`, 'hodE', { department: 'CSE' })).status === 403 && (await call('POST', `/api/academic/terms/${T}/generate`, 'adm', { department: 'ECE' })).data.enrolled === 3);
    s.check('faculty and students cannot build classes', (await call('POST', `/api/academic/terms/${T}/generate`, 'f1', { department: 'CSE' })).status === 403 && (await call('POST', `/api/academic/terms/${T}/generate`, 'a1', { department: 'CSE' })).status === 403);

    const classes = (await call('GET', `/api/academic/terms/${T}/classes?department=CSE`, 'hodC')).data;
    const A = classes.find((c) => c.section === 'A'); const B = classes.find((c) => c.section === 'B');
    s.check('the HOD sees the classes with their sizes', classes.length === 2 && A.students === 30 && B.students === 5 && A.classTeacher === null);
    s.check('a HOD sees only their own department even if they ask for another', (await call('GET', `/api/academic/terms/${T}/classes?department=ECE`, 'hodC')).data.every((c) => c.department === 'CSE'));

    // roll order and positions
    const roster = (await call('GET', `/api/academic/classes/${A.id}/roster`, 'hodC')).data.students;
    s.check('the class list is in natural roll order (21CS2 before 21CS10) with positions from 1', roster[0].rollNo === '21CS1' && roster[1].rollNo === '21CS2' && roster[9].rollNo === '21CS10' && roster[29].position === 30);

    // ── class teacher ──
    s.check('the HOD names a class teacher from the department', (await call('PUT', `/api/academic/classes/${A.id}/teacher`, 'hodC', { faculty_id: 'f1' })).status === 200 && db.classes.get(A.id).classTeacherId === 'f1');
    s.check('a class teacher from another department is refused for a HOD', (await call('PUT', `/api/academic/classes/${A.id}/teacher`, 'hodC', { faculty_id: 'fE' })).code === 'OTHER_DEPARTMENT');
    s.check('a student cannot be the class teacher', (await call('PUT', `/api/academic/classes/${A.id}/teacher`, 'hodC', { faculty_id: 'a1' })).code === 'NOT_STAFF');
    s.check('the class teacher becomes the mentor of students with no sub-mentor (the old mentorId field is kept in step)', db.users.get('a7').mentorId === 'f1');

    // ── sub-mentors ──
    const bad = await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'f2', from: 1, to: 24 }, { mentorId: 'f3', from: 26, to: 30 }] });
    s.check('ranges with a gap are refused, naming position 25', bad.status === 400 && bad.code === 'BAD_RANGES' && /25/.test(bad.json.error));
    const over = await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'f2', from: 1, to: 25 }, { mentorId: 'f3', from: 25, to: 30 }] });
    s.check('ranges that overlap are refused', over.status === 400 && /twice/.test(over.json.error));
    s.check('nothing was saved by the refused attempts', db.classes.get(A.id).subMentors.length === 0);
    const good = await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'f3', from: 25, to: 30 }, { mentorId: 'f2', from: 1, to: 24 }] });
    s.check('1 to 24 and 25 to 30 are accepted (in any order)', good.status === 200 && good.data.students === 30);
    s.check('each student\'s mentor follows their position: 1 and 24 have the first, 25 and 30 the second', ['a1', 'a24'].every((id) => db.users.get(id).mentorId === 'f2') && ['a25', 'a30'].every((id) => db.users.get(id).mentorId === 'f3'));
    s.check('position follows roll order, not the order the names were added (21CS10 is 10th, so it is in the first range)', db.users.get('a10').mentorId === 'f2' && db.enrollments.get(`${A.id}_a10`).position === 10);
    s.check('a sub-mentor from another department is refused for a HOD', (await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'fE', from: 1, to: 30 }] })).code === 'OTHER_DEPARTMENT');
    s.check('another department\'s HOD cannot change this class', (await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodE', { ranges: [{ mentorId: 'f2', from: 1, to: 30 }] })).status === 403);

    // ── what a student sees ──
    const me1 = await call('GET', '/api/academic/me', 'a3');
    const me2 = await call('GET', '/api/academic/me', 'a28');
    s.check('a student sees their class, class teacher and sub-mentor by name', me1.status === 200 && me1.data.class.label.includes('CSE') && me1.data.classTeacher.name === 'Faculty f1' && me1.data.subMentor.name === 'Faculty f2' && me1.data.position === 3);
    s.check('a student in the second range sees the second sub-mentor', me2.data.subMentor.name === 'Faculty f3' && me2.data.position === 28);
    s.check('a student with no class sees the term and an empty class, not an error', (await call('GET', '/api/academic/me', 'nosec')).data.class === null);
    s.check('staff cannot use the student endpoint and the student endpoint needs a sign-in', (await call('GET', '/api/academic/me', 'f1')).status === 403 && (await call('GET', '/api/academic/me', null)).status === 401);

    // ── moving students, and the list upload ──
    s.check('the HOD moves a student to another section; the old class and the new are put right', (await call('POST', `/api/academic/classes/${B.id}/students`, 'hodC', { term_id: T, student_id: 'a30' })).status === 200 && db.enrollments.get(`${B.id}_a30`).primary === true && !db.enrollments.has(`${A.id}_a30`));
    const stale = await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'f2', from: 1, to: 24 }, { mentorId: 'f3', from: 25, to: 30 }] });
    s.check('ranges that no longer match the class size are refused (A now has 29)', stale.status === 400 && /beyond|29/i.test(stale.json.error));
    const fixed = await call('PUT', `/api/academic/classes/${A.id}/sub-mentors`, 'hodC', { ranges: [{ mentorId: 'f2', from: 1, to: 24 }, { mentorId: 'f3', from: 25, to: 29 }] });
    s.check('and accepted once corrected', fixed.status === 200);
    const csv = await call('POST', `/api/academic/terms/${T}/placements`, 'hodC', { department: 'CSE', rows: [
      { rollNo: '21CS999', year: 3, section: 'B' }, { rollNo: '21cs1', year: 3, section: 'B' }, { rollNo: 'NOPE', year: 3, section: 'A' }, { rollNo: '21EC1', year: 2, section: 'A' }, { rollNo: '21CS2', year: 'x', section: '' }, {},
    ] });
    s.check('the upload applies the good rows and returns the bad ones with the reason', csv.status === 200 && csv.data.applied === 2 && csv.data.failed === 4 && csv.data.results.some((r) => /no student/.test(r.reason)) && csv.data.results.some((r) => /ECE/.test(r.reason)) && csv.data.results.some((r) => /year/.test(r.reason)));
    s.check('the student who had no section is now placed, and the one moved by upload left class A', !!db.enrollments.get(`${B.id}_nosec`)?.primary && !db.enrollments.has(`${A.id}_a1`));
    s.check('upload rows do not need to be in order, and the upload does not run on a closed term', (await call('POST', `/api/academic/terms/${t2.data.id}/placements`, 'hodC', { department: 'CSE', rows: [{ rollNo: '21CS1', year: 3, section: 'A' }] })).status === 200 && (await call('POST', `/api/academic/terms/${T}/placements`, 'hodC', { department: 'CSE', rows: [] })).code === 'NO_ROWS');

    // ── teaching assignments and what faculty see ──
    const ids = async (who) => { const r = await academicScope.facultyScope(who); return new Set(r.studentIds); };
    s.check('a faculty member with no role sees no students through the structure', (await ids('f4')).size === 0);
    const asg = await call('POST', `/api/academic/classes/${A.id}/assignments`, 'hodC', { faculty_id: 'f4', subject: 'Python' });
    s.check('the HOD assigns a subject to a faculty member', asg.status === 200 && asg.data.subject === 'Python' && asg.data.to === null);
    const seen = await ids('f4');
    s.check('that faculty member now sees exactly the students of the class (28 after the upload moved one)', seen.size === 28 && [...seen].every((x) => db.enrollments.has(`${A.id}_${x}`)));
    s.check('the same subject cannot be given to two teachers of one class at once', (await call('POST', `/api/academic/classes/${A.id}/assignments`, 'hodC', { faculty_id: 'f2', subject: ' python ' })).code === 'ALREADY_ASSIGNED');
    s.check('a HOD cannot assign in another department\'s class', (await call('POST', `/api/academic/classes/${A.id}/assignments`, 'hodE', { faculty_id: 'fE', subject: 'DS' })).status === 403);
    s.check('the class teacher sees all 28; a sub-mentor sees only their own range (f2 positions 1 to 24, f3 positions 25 to 28)', (await ids('f1')).size === 28 && (await ids('f3')).size === 4 && (await ids('f2')).size === 24);

    const re = await call('POST', `/api/academic/assignments/${asg.data.id}/reallocate`, 'hodC', { new_faculty_id: 'f1' });
    s.check('reallocating ends the old assignment now and starts the new one at the same moment, nothing deleted', re.status === 200 && db.assignments.size === 2 && db.assignments.get(asg.data.id).to != null && db.assignments.get(asg.data.id).to === re.data.from);
    s.check('the earlier teacher no longer sees the class; the new one does', (await ids('f4')).size === 0 && (await ids('f1')).size === 28);
    s.check('an ended assignment cannot be reallocated again, nor to the same person', (await call('POST', `/api/academic/assignments/${asg.data.id}/reallocate`, 'hodC', { new_faculty_id: 'f2' })).code === 'ALREADY_ENDED' && (await call('POST', `/api/academic/assignments/${re.data.id}/reallocate`, 'hodC', { new_faculty_id: 'f1' })).code === 'SAME');
    const future = await call('POST', `/api/academic/classes/${B.id}/assignments`, 'hodC', { faculty_id: 'f4', subject: 'DS', from: new Date(Date.now() + 5 * day).toISOString() });
    s.check('an assignment that starts in the future gives nothing yet', future.status === 200 && (await ids('f4')).size === 0);
    const my = await call('GET', '/api/academic/my-classes', 'f1');
    s.check('a faculty member lists their own classes with why and how many students', my.status === 200 && my.data.classes.some((c) => c.id === A.id && c.students === 28 && c.via.length >= 1));

    // ── access requests ──
    s.check('a faculty member can ask for a class they cannot see, with a reason', (await call('POST', '/api/academic/requests', 'f2', { class_id: B.id, reason: '' })).code === 'REASON_REQUIRED');
    const rq = await call('POST', '/api/academic/requests', 'f2', { class_id: B.id, reason: 'Covering Python for section B this month' });
    s.check('the request is stored as pending for that class\'s department', rq.status === 200 && rq.data.status === 'pending' && rq.data.department === 'CSE');
    s.check('asking twice, or for a class they can already see, is refused', (await call('POST', '/api/academic/requests', 'f2', { class_id: B.id, reason: 'again please' })).code === 'ALREADY_ASKED' && (await call('POST', '/api/academic/requests', 'f1', { class_id: A.id, reason: 'I can already see it' })).code === 'ALREADY_HAS_ACCESS');
    s.check('students and admins cannot make a request; the request is not decided by faculty', (await call('POST', '/api/academic/requests', 'a1', { class_id: B.id, reason: 'hello there' })).status === 403 && (await call('POST', `/api/academic/requests/${rq.data.id}/decide`, 'f2', { approve: true })).status === 403);
    s.check('the HOD sees the department\'s requests, the faculty member only their own, another HOD none', (await call('GET', '/api/academic/requests', 'hodC')).data.length === 1 && (await call('GET', '/api/academic/requests', 'f2')).data.length === 1 && (await call('GET', '/api/academic/requests', 'f1')).data.length === 0 && (await call('GET', '/api/academic/requests', 'hodE')).data.length === 0);
    s.check('another department\'s HOD cannot decide it', (await call('POST', `/api/academic/requests/${rq.data.id}/decide`, 'hodE', { approve: true })).status === 403);
    s.check('an expiry in the past, or more than 180 days away, is refused', (await call('POST', `/api/academic/requests/${rq.data.id}/decide`, 'hodC', { approve: true, expires_at: new Date(Date.now() - day).toISOString() })).code === 'BAD_EXPIRY' && (await call('POST', `/api/academic/requests/${rq.data.id}/decide`, 'hodC', { approve: true, expires_at: new Date(Date.now() + 400 * day).toISOString() })).code === 'BAD_EXPIRY');
    const before = (await ids('f2')).size;
    const ok = await call('POST', `/api/academic/requests/${rq.data.id}/decide`, 'hodC', { approve: true, expires_at: new Date(Date.now() + 30 * day).toISOString(), note: 'for September' });
    s.check('the HOD approves for 30 days; the faculty member now also sees section B', ok.status === 200 && ok.data.status === 'approved' && (await ids('f2')).size > before && (await ids('f2')).has('b1'));
    s.check('a decided request cannot be decided again', (await call('POST', `/api/academic/requests/${rq.data.id}/decide`, 'hodC', { approve: false })).code === 'ALREADY_DECIDED');
    db.requests.get(rq.data.id).expiresAt = new Date(Date.now() - 1000).toISOString();
    s.check('when the grant expires the access ends by itself', !(await ids('f2')).has('b1'));
    const rq2 = await call('POST', '/api/academic/requests', 'f3', { class_id: B.id, reason: 'Wanted to look at B' });
    await call('POST', `/api/academic/requests/${rq2.data.id}/decide`, 'adm', { approve: false, note: 'not needed' });
    s.check('a declined request gives nothing, and the Admin can decide any request', db.requests.get(rq2.data.id).status === 'declined' && !(await ids('f3')).has('b1'));

    // ── consistency ──
    const rep = await call('GET', `/api/academic/terms/${T}/consistency?department=CSE`, 'hodC');
    s.check('the consistency report lists problems in plain words (class B has no class teacher)', rep.status === 200 && rep.data.issues.some((i) => i.code === 'NO_TEACHER' && /section B/.test(i.message)) && rep.data.counts.classes === 2);
    s.check('class A has 28 students but its ranges still run to 29, so the report says so', rep.data.issues.some((i) => i.code === 'RANGES' && /section A/.test(i.message)));
    db.users.set('late', { id: 'late', role: 'student', name: 'Late Joiner', rollNo: '21CS500', department: 'CSE', year: 3, section: 'A' });
    s.check('a student added later and not yet placed is reported', (await call('GET', `/api/academic/terms/${T}/consistency?department=CSE`, 'hodC')).data.issues.some((i) => i.code === 'NO_CLASS' && /Late Joiner/.test(i.message)));
    s.check('and placed by running the build again, without touching anyone else', (await call('POST', `/api/academic/terms/${T}/generate`, 'hodC', { department: 'CSE' })).data.enrolled === 1 && !!db.enrollments.get(`${A.id}_late`));
    s.check('with the new student class A has 29 and the ranges cover it again, so that problem goes away', !(await call('GET', `/api/academic/terms/${T}/consistency?department=CSE`, 'hodC')).data.issues.some((i) => i.code === 'RANGES'));

    // ── electives ──
    const el = await call('POST', `/api/academic/terms/${T}/electives`, 'hodC', { department: 'CSE', name: 'Cloud Computing' });
    s.check('the HOD makes an elective group; making it twice is refused', el.status === 200 && el.data.kind === 'elective' && (await call('POST', `/api/academic/terms/${T}/electives`, 'hodC', { department: 'CSE', name: 'cloud computing' })).code === 'EXISTS');
    await call('POST', `/api/academic/classes/${el.data.id}/students`, 'hodC', { term_id: T, student_id: 'a5' });
    s.check('a student can be in an elective without leaving their section', db.enrollments.get(`${el.data.id}_a5`)?.primary === false && db.enrollments.get(`${A.id}_a5`)?.primary === true);
    const me3 = await call('GET', '/api/academic/me', 'a5');
    s.check('and sees both', me3.data.class.section === 'A' && me3.data.electives.length === 1 && me3.data.electives[0].name === 'Cloud Computing');

    // ── aiming exams and assignments at classes ──
    const rooms = new Map([['room1', { id: 'room1', name: 'Python Lab', facultyId: 'f1' }], ['room2', { id: 'room2', name: 'Other Lab', facultyId: 'f2' }]]);
    Object.assign(classroomRepo, {
      getById: async (id) => rooms.get(id) || null,
      getMemberCount: async () => 7,
      listByStudentId: async (sid) => (sid === 'a5' ? [rooms.get('room1')] : []),
    });
    const as = (id) => ({ user: { id, role: db.users.get(id).role, department: db.users.get(id).department ?? null } });
    s.check('a faculty member can aim at their own classroom, not at a colleagues', (await classTargets.validateTargets(['room1'], as('f1'))).unknown.length === 0 && (await classTargets.validateTargets(['room2'], as('f1'))).unknown.join() === 'room2');
    s.check('a faculty member can aim at an academic class they are class teacher of or teach, not one they are not given', (await classTargets.validateTargets([A.id], as('f1'))).unknown.length === 0 && (await classTargets.validateTargets([B.id], as('f1'))).unknown.join() === B.id);
    s.check('a sub-mentor sees their students but cannot aim work at the whole class', (await classTargets.validateTargets([A.id], as('f3'))).unknown.join() === A.id);
    s.check('an unknown id is refused for everyone', (await classTargets.validateTargets(['nothing'], as('adm'))).unknown.join() === 'nothing');
    s.check('a HOD can aim at any class of their department, not another departments', (await classTargets.validateTargets([A.id, B.id], as('hodC'))).unknown.length === 0 && (await classTargets.validateTargets([A.id], as('hodE'))).unknown.join() === A.id);
    s.check('an Admin can aim at any class', (await classTargets.validateTargets([A.id, B.id, 'room1'], as('adm'))).unknown.length === 0);
    s.check('a class of a term that is no longer the active one cannot be aimed at', (await classTargets.validateTargets([A.id], as('adm'))).unknown.length === 0 && (() => { db.terms.get(T).status = 'planned'; return true; })() && (await classTargets.validateTargets([A.id], as('adm'))).unknown.join() === A.id && (() => { db.terms.get(T).status = 'active'; return true; })());
    const mine = await classTargets.studentClassIds('a5');
    s.check('a student is in their section class, their elective and the classrooms they joined', mine.has(A.id) && mine.has(el.data.id) && mine.has('room1') && mine.size === 3);
    s.check('a student in no class of any kind is in none', (await classTargets.studentClassIds('nobodyHere')).size === 0);
    const d1 = await classTargets.describeTarget(A.id); const d2 = await classTargets.describeTarget('room1'); const d3 = await classTargets.describeTarget('gone');
    s.check('targets are described for the builder: an academic class by its label, a classroom by its name, a missing one as deleted', d1.kind === 'academic' && /CSE/.test(d1.name) && d1.member_count >= 28 && d2.name === 'Python Lab' && d3.name === '(deleted class)');

    // ── no active term ──
    db.terms.get(T).status = 'closed';
    s.check('with no active term the structure gives faculty nothing and the student no class (callers keep the old behaviour)', (await academicScope.facultyScope('zz')).term === null && (await call('GET', '/api/academic/me', 'a1')).data.class === null);
    s.check('a closed term accepts no class building', (await call('POST', `/api/academic/terms/${T}/generate`, 'hodC', { department: 'CSE' })).code === 'TERM_CLOSED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};
