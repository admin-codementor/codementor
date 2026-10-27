// Academic structure actions: terms, classes, who is in them, class teacher, sub-mentors, teaching assignments, access requests, and
// the views built on them. The rules are in utils/academic.js; storage is repositories/academicRepository.js.
//
// Who may do what: an Admin anywhere; a HOD only for their own department; a faculty member can only ask for access and look at their own
// classes. Every change that matters is written to the audit log by the controller.
const academicRepo = require('../repositories/academicRepository');
const userRepo = require('../repositories/userRepository');
const academic = require('../utils/academic');

class AcademicError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new AcademicError(status, code, message); };

const DAY = 86400000;
const MAX_GRANT_DAYS = 180;
const clean = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function assertManage(actor, department) {
  if (!actor) fail(401, 'UNAUTHORIZED', 'Sign in first.');
  if (actor.role === 'admin') return;
  if (actor.role === 'hod' && actor.department != null && actor.department === department) return;
  fail(403, 'FORBIDDEN', 'Only an Admin, or the HOD of this department, can change this.');
}
const assertAdmin = (actor) => { if (actor?.role !== 'admin') fail(403, 'FORBIDDEN', 'Only an Admin can do this.'); };

const isStaff = (u) => !!u && ['faculty', 'hod', 'admin'].includes(u.role);

async function getTermOrFail(termId) {
  const t = await academicRepo.getTerm(termId);
  if (!t) fail(404, 'NO_TERM', 'That term does not exist.');
  return t;
}
async function getClassOrFail(classId) {
  const c = await academicRepo.getClass(classId);
  if (!c) fail(404, 'NO_CLASS', 'That class does not exist.');
  return c;
}
/** Staff who may be named for a class: faculty or HOD of the class's department (an Admin may name anyone on the staff). */
async function staffForClass(actor, cls, staffId, what) {
  const u = await userRepo.getById(staffId, 'faculty');
  if (!isStaff(u)) fail(400, 'NOT_STAFF', `${what} must be a member of the staff.`);
  if (actor.role !== 'admin' && u.department !== cls.department) fail(400, 'OTHER_DEPARTMENT', `${what} must belong to the ${cls.department} department.`);
  return u;
}

const staffIdsOf = (cls) => [...new Set([cls.classTeacherId, ...(cls.subMentors || []).map((r) => r.mentorId)].filter(Boolean))];

// ── terms (Admin) ──
async function createTerm(actor, { label, academicYear, semester, startDate, endDate }) {
  assertAdmin(actor);
  const l = clean(label, 60); const y = clean(academicYear, 20);
  if (!l || !y) fail(400, 'BAD_TERM', 'Give the term a name and an academic year (for example "2026-27 odd" and "2026-27").');
  const s = Date.parse(startDate); const e = Date.parse(endDate);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) fail(400, 'BAD_DATES', 'The end date must be after the start date.');
  return academicRepo.createTerm({ label: l, academicYear: y, semester: clean(semester, 20), startDate: new Date(s).toISOString(), endDate: new Date(e).toISOString(), status: 'planned' });
}
/** Exactly one term is active: activating one closes the previous active term. */
async function activateTerm(actor, termId) {
  assertAdmin(actor);
  const term = await getTermOrFail(termId);
  if (term.status === 'closed') fail(409, 'TERM_CLOSED', 'A closed term cannot be activated again.');
  const current = await academicRepo.getActiveTerm();
  if (current && current.id !== termId) await academicRepo.updateTerm(current.id, { status: 'closed' });
  await academicRepo.updateTerm(termId, { status: 'active' });
  return academicRepo.getTerm(termId);
}

// ── classes and enrollments ──
async function loadStudents() {
  const all = await userRepo.listByRole('student');
  return new Map(all.map((s) => [s.id, s]));
}

/**
 * Put the derived fields right for one class: each student's position, and their mentorId (from the sub-mentor ranges, else the class
 * teacher). A student whose class has neither keeps whatever mentor they already had.
 */
async function syncClass(classId, studentsById) {
  const cls = await academicRepo.getClass(classId);
  if (!cls || cls.kind === 'elective') return { positions: 0, mentorsUpdated: 0 };
  const members = (await academicRepo.listEnrollmentsForClass(classId)).filter((e) => e.primary);
  const roster = academic.sortedRoster(members.map((e) => ({ id: e.studentId, rollNo: e.rollNo, name: '', enrollment: e })));
  let positions = 0; let mentorsUpdated = 0;
  for (const r of roster) {
    if (r.enrollment.position !== r.position) { await academicRepo.setEnrollmentPosition(classId, r.id, r.position); positions += 1; }
    const mentor = academic.mentorForPosition(cls, r.position);
    const student = studentsById?.get(r.id) || await userRepo.getById(r.id, 'student');
    if (mentor && student && student.mentorId !== mentor) { await userRepo.update(r.id, 'student', { mentorId: mentor }); mentorsUpdated += 1; }
  }
  return { positions, mentorsUpdated };
}

/**
 * Build the classes of one department for a term from each student's department, year and section, and enrol everyone who is not in
 * a class yet. Safe to run again: existing classes are not touched, and students already placed (by hand or by upload) stay where they are.
 */
async function generateClasses(actor, { termId, department }) {
  assertManage(actor, department);
  const term = await getTermOrFail(termId);
  if (term.status === 'closed') fail(409, 'TERM_CLOSED', 'This term is closed.');
  const studentsById = await loadStudents();
  const students = [...studentsById.values()].filter((s) => s.department === department);
  const placed = new Set((await academicRepo.listEnrollmentsForTerm(termId)).filter((e) => e.primary).map((e) => e.studentId));

  const skipped = []; const byKey = new Map();
  for (const s of students) {
    const year = Number(s.year); const section = clean(s.section, 10);
    if (!Number.isInteger(year) || year < 1 || year > 8 || !section) { skipped.push({ id: s.id, name: s.name || null, rollNo: s.rollNo || null, reason: 'no year or section on the student' }); continue; }
    const key = `${year}|${section.toUpperCase()}`;
    (byKey.get(key) || byKey.set(key, { year, section, students: [] }).get(key)).students.push(s);
  }

  let classesCreated = 0; let enrolled = 0; const touched = [];
  for (const g of byKey.values()) {
    const id = academic.sectionClassId(termId, department, g.year, g.section);
    const { created } = await academicRepo.createClassIfMissing(id, { termId, kind: 'section', department, year: g.year, section: g.section, staffIds: [] });
    if (created) classesCreated += 1;
    const fresh = g.students.filter((s) => !placed.has(s.id));
    if (fresh.length) {
      await academicRepo.enrollBulk(fresh.map((s) => ({ termId, classId: id, studentId: s.id, primary: true, source: 'auto', rollNo: s.rollNo || null })));
      enrolled += fresh.length;
    }
    touched.push(id);
  }
  for (const id of touched) await syncClass(id, studentsById);
  return { classes: byKey.size, classesCreated, enrolled, alreadyPlaced: students.length - skipped.length - enrolled, skipped };
}

/**
 * Exceptions from a list (a CSV the HOD uploaded): each row names a student by roll number and the section class they belong to this
 * term. Each row is checked on its own; the good ones are applied and the rest come back with the reason.
 * @param {{rollNo: string, year: number|string, section: string}[]} rows
 */
async function importPlacements(actor, { termId, department, rows }) {
  assertManage(actor, department);
  const term = await getTermOrFail(termId);
  if (term.status === 'closed') fail(409, 'TERM_CLOSED', 'This term is closed.');
  if (!Array.isArray(rows) || rows.length === 0) fail(400, 'NO_ROWS', 'The list is empty.');
  if (rows.length > 5000) fail(400, 'TOO_MANY', 'At most 5000 rows at a time.');
  const studentsById = await loadStudents();
  const byRoll = new Map([...studentsById.values()].filter((s) => s.rollNo).map((s) => [String(s.rollNo).trim().toUpperCase(), s]));
  const results = []; const touched = new Set(); let applied = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const roll = clean(row.rollNo, 40).toUpperCase();
    const year = Number(row.year); const section = clean(row.section, 10);
    const err = (reason) => results.push({ row: i + 1, rollNo: roll || null, ok: false, reason });
    if (!roll) { err('no roll number'); continue; }
    const student = byRoll.get(roll);
    if (!student) { err('no student with this roll number'); continue; }
    if (student.department !== department) { err(`the student is in ${student.department || 'no'} department, not ${department}`); continue; }
    if (!Number.isInteger(year) || year < 1 || year > 8 || !section) { err('needs a year (1 to 8) and a section'); continue; }
    const id = academic.sectionClassId(termId, department, year, section);
    await academicRepo.createClassIfMissing(id, { termId, kind: 'section', department, year, section, staffIds: [] });
    const before = (await academicRepo.listEnrollmentsForStudent(termId, student.id)).find((e) => e.primary);
    await academicRepo.enroll({ termId, classId: id, studentId: student.id, primary: true, source: 'csv', rollNo: student.rollNo });
    if (before && before.classId !== id) touched.add(before.classId);
    touched.add(id); applied += 1;
    results.push({ row: i + 1, rollNo: roll, ok: true });
  }
  for (const id of touched) await syncClass(id, studentsById);
  return { applied, failed: results.filter((r) => !r.ok).length, results: results.filter((r) => !r.ok).slice(0, 200) };
}

async function moveStudent(actor, { termId, studentId, classId }) {
  const cls = await getClassOrFail(classId);
  assertManage(actor, cls.department);
  if (cls.termId !== termId) fail(400, 'WRONG_TERM', 'That class belongs to a different term.');
  const student = await userRepo.getById(studentId, 'student');
  if (!student) fail(404, 'NO_STUDENT', 'That student does not exist.');
  if (student.department !== cls.department && actor.role !== 'admin') fail(400, 'OTHER_DEPARTMENT', 'The student belongs to another department.');
  const before = (await academicRepo.listEnrollmentsForStudent(termId, studentId)).find((e) => e.primary);
  const primary = cls.kind !== 'elective';
  await academicRepo.enroll({ termId, classId, studentId, primary, source: 'manual', rollNo: student.rollNo || null });
  const map = new Map([[studentId, student]]);
  if (before && before.classId !== classId) await syncClass(before.classId, map);
  await syncClass(classId, map);
  return { moved: true, from: before?.classId || null, to: classId };
}

async function createElective(actor, { termId, department, name }) {
  assertManage(actor, department);
  const term = await getTermOrFail(termId);
  if (term.status === 'closed') fail(409, 'TERM_CLOSED', 'This term is closed.');
  const n = clean(name, 60);
  if (!n) fail(400, 'NO_NAME', 'Give the group a name.');
  const id = `${termId}__${academic.slug(department)}__ELECTIVE__${academic.slug(n)}`;
  const { created, class: cls } = await academicRepo.createClassIfMissing(id, { termId, kind: 'elective', department, name: n, staffIds: [] });
  if (!created) fail(409, 'EXISTS', 'A group with that name already exists this term.');
  return cls;
}

async function setClassTeacher(actor, classId, facultyId) {
  const cls = await getClassOrFail(classId);
  assertManage(actor, cls.department);
  if (facultyId) await staffForClass(actor, cls, facultyId, 'The class teacher');
  const next = { ...cls, classTeacherId: facultyId || null };
  await academicRepo.updateClass(classId, { classTeacherId: next.classTeacherId, staffIds: staffIdsOf(next) });
  const sync = await syncClass(classId);
  return { classId, classTeacherId: next.classTeacherId, ...sync };
}

async function classPrimaryCount(classId) {
  return (await academicRepo.listEnrollmentsForClass(classId)).filter((e) => e.primary).length;
}

/** Replace the sub-mentor ranges of a class. They must cover every position from 1 to the class size exactly once. */
async function setSubMentors(actor, classId, ranges) {
  const cls = await getClassOrFail(classId);
  assertManage(actor, cls.department);
  if (cls.kind === 'elective') fail(400, 'ELECTIVE', 'A group has no sub-mentors; they are for section classes.');
  const count = await classPrimaryCount(classId);
  const cleaned = (Array.isArray(ranges) ? ranges : []).map((r) => ({ mentorId: String(r?.mentorId ?? ''), from: r?.from, to: r?.to }));
  const v = academic.validateRanges(cleaned, count);
  if (!v.ok) fail(400, 'BAD_RANGES', v.errors.map((e) => e.message).join(' '));
  for (const id of new Set(cleaned.map((r) => r.mentorId))) await staffForClass(actor, cls, id, 'A sub-mentor');
  const next = { ...cls, subMentors: cleaned.sort((a, b) => a.from - b.from) };
  await academicRepo.updateClass(classId, { subMentors: next.subMentors, staffIds: staffIdsOf(next) });
  const sync = await syncClass(classId);
  return { classId, subMentors: next.subMentors, students: count, ...sync };
}

// ── teaching assignments ──
async function assignTeacher(actor, { classId, facultyId, subject, from }) {
  const cls = await getClassOrFail(classId);
  assertManage(actor, cls.department);
  const sub = clean(subject, 60);
  if (!sub) fail(400, 'NO_SUBJECT', 'Write the subject (for example "Python").');
  const staff = await userRepo.getById(facultyId, 'faculty');
  if (!isStaff(staff) || staff.role === 'admin') fail(400, 'NOT_FACULTY', 'Choose a faculty member.');
  const start = from == null ? Date.now() : Date.parse(from);
  if (!Number.isFinite(start)) fail(400, 'BAD_DATE', 'The start date is not a date.');
  const existing = (await academicRepo.listAssignments({ classId })).filter((a) => academic.isActive(a, start) && clean(a.subject, 60).toLowerCase() === sub.toLowerCase());
  if (existing.length) fail(409, 'ALREADY_ASSIGNED', `${sub} in this class is already taught by someone from that date. Use "reallocate" to move it.`);
  return academicRepo.createAssignment({ termId: cls.termId, classId, facultyId, subject: sub, from: new Date(start).toISOString(), createdBy: actor.id });
}

/** Move a subject to another teacher from a date: the old assignment ends and the new one starts at that same moment. Earlier work stays with the earlier teacher. */
async function reallocate(actor, { assignmentId, newFacultyId, effectiveFrom }) {
  const a = await academicRepo.getAssignment(assignmentId);
  if (!a) fail(404, 'NO_ASSIGNMENT', 'That assignment does not exist.');
  const cls = await getClassOrFail(a.classId);
  assertManage(actor, cls.department);
  if (a.to != null && Date.parse(a.to) <= Date.now()) fail(409, 'ALREADY_ENDED', 'That assignment has already ended.');
  const staff = await userRepo.getById(newFacultyId, 'faculty');
  if (!isStaff(staff) || staff.role === 'admin') fail(400, 'NOT_FACULTY', 'Choose a faculty member.');
  if (newFacultyId === a.facultyId) fail(400, 'SAME', 'That is already the teacher.');
  const at = effectiveFrom == null ? Date.now() : Date.parse(effectiveFrom);
  if (!Number.isFinite(at)) fail(400, 'BAD_DATE', 'The date is not a date.');
  if (at < Date.parse(a.from)) fail(400, 'BEFORE_START', 'That date is before the assignment began.');
  return academicRepo.reallocate({
    endId: assignmentId, endAt: new Date(at).toISOString(), endedBy: actor.id,
    next: { termId: a.termId, classId: a.classId, facultyId: newFacultyId, subject: a.subject, from: new Date(at).toISOString(), createdBy: actor.id, replaces: assignmentId },
  });
}

async function endAssignment(actor, assignmentId, to) {
  const a = await academicRepo.getAssignment(assignmentId);
  if (!a) fail(404, 'NO_ASSIGNMENT', 'That assignment does not exist.');
  const cls = await getClassOrFail(a.classId);
  assertManage(actor, cls.department);
  const at = to == null ? Date.now() : Date.parse(to);
  if (!Number.isFinite(at)) fail(400, 'BAD_DATE', 'The date is not a date.');
  await academicRepo.endAssignment(assignmentId, new Date(at).toISOString(), actor.id);
  return { id: assignmentId, to: new Date(at).toISOString() };
}

// ── access requests: a faculty member asks, the HOD of the class's department (or an Admin) decides ──
async function requestAccess(actor, { classId, reason }) {
  if (!actor || !isStaff(actor) || actor.role === 'admin') fail(403, 'FORBIDDEN', 'Only faculty can ask for access to a class.');
  const cls = await getClassOrFail(classId);
  const why = clean(reason, 300);
  if (why.length < 5) fail(400, 'REASON_REQUIRED', 'Say why you need this class (at least 5 characters).');
  const term = await academicRepo.getActiveTerm();
  if (!term || cls.termId !== term.id) fail(400, 'NOT_ACTIVE_TERM', 'You can only ask for a class of the current term.');
  const assignments = await academicRepo.listAssignments({ facultyId: actor.id });
  const has = academic.visibleClasses(actor.id, { classes: [cls], assignments, grants: await academicRepo.listRequests({ facultyId: actor.id, status: 'approved' }) });
  if (has.size) fail(409, 'ALREADY_HAS_ACCESS', 'You can already see this class.');
  const pending = (await academicRepo.listRequests({ facultyId: actor.id, status: 'pending' })).find((r) => r.classId === classId);
  if (pending) fail(409, 'ALREADY_ASKED', 'You already asked for this class. It is waiting for a decision.');
  return academicRepo.createRequest({ facultyId: actor.id, facultyName: actor.name || null, classId, termId: cls.termId, department: cls.department, classLabel: academic.classLabel(cls), reason: why });
}

async function listRequests(actor, { status } = {}) {
  if (!actor) fail(401, 'UNAUTHORIZED', 'Sign in first.');
  if (actor.role === 'faculty') return academicRepo.listRequests({ facultyId: actor.id });
  if (actor.role === 'admin') return academicRepo.listRequests(status ? { status } : {});
  if (actor.role === 'hod') return academicRepo.listRequests({ department: actor.department, ...(status ? { status } : {}) });
  fail(403, 'FORBIDDEN', 'Not allowed.');
}

/** Approve or decline. An approval can carry an expiry (at most 180 days); without one it lasts until the term is closed. */
async function decideRequest(actor, requestId, { approve, expiresAt, note }) {
  const r = await academicRepo.getRequest(requestId);
  if (!r) fail(404, 'NO_REQUEST', 'That request does not exist.');
  assertManage(actor, r.department);
  if (r.status !== 'pending') fail(409, 'ALREADY_DECIDED', 'That request has already been decided.');
  let expires = null;
  if (approve) {
    if (expiresAt != null) {
      expires = Date.parse(expiresAt);
      if (!Number.isFinite(expires) || expires <= Date.now()) fail(400, 'BAD_EXPIRY', 'The expiry must be a date in the future.');
      if (expires > Date.now() + MAX_GRANT_DAYS * DAY) fail(400, 'BAD_EXPIRY', `Access can be given for at most ${MAX_GRANT_DAYS} days at a time.`);
    }
  }
  await academicRepo.decideRequest(requestId, { status: approve ? 'approved' : 'declined', decidedBy: actor.id, expiresAt: expires, note: clean(note, 200) || null });
  return academicRepo.getRequest(requestId);
}

// ── views ──
async function nameOf(id) { if (!id) return null; const u = await userRepo.getById(id, 'faculty'); return u ? { id: u.id, name: u.name || null } : { id, name: null }; }

/** A student's class this term: which class, the class teacher, and their own sub-mentor. Five reads, whatever the class size. */
async function myClass(studentId) {
  const term = await academicRepo.getActiveTerm();
  if (!term) return { term: null, class: null };
  const mine = (await academicRepo.listEnrollmentsForStudent(term.id, studentId));
  const primary = mine.find((e) => e.primary);
  if (!primary) return { term: { id: term.id, label: term.label }, class: null };
  const cls = await academicRepo.getClass(primary.classId);
  if (!cls) return { term: { id: term.id, label: term.label }, class: null };
  const position = primary.position ?? null;
  const subRange = position != null ? (cls.subMentors || []).find((r) => position >= r.from && position <= r.to) : null;
  const [classTeacher, subMentor] = await Promise.all([nameOf(cls.classTeacherId), nameOf(subRange?.mentorId)]);
  const electives = [];
  for (const e of mine.filter((x) => !x.primary)) { const c = await academicRepo.getClass(e.classId); if (c) electives.push({ id: c.id, name: c.name }); }
  return { term: { id: term.id, label: term.label }, class: { id: cls.id, label: academic.classLabel(cls), department: cls.department, year: cls.year, section: cls.section }, classTeacher, subMentor, position, electives };
}

async function listTerms(actor) { if (!actor) fail(401, 'UNAUTHORIZED', 'Sign in first.'); return academicRepo.listTerms(); }

/** The classes of a term with sizes, teacher and ranges, for the HOD's screen (a HOD sees their own department; an Admin picks one or all). */
async function listClassesView(actor, { termId, department }) {
  const dept = actor.role === 'admin' ? (department || null) : actor.department;
  if (actor.role !== 'admin' && actor.role !== 'hod') fail(403, 'FORBIDDEN', 'Only an Admin or a HOD can see this.');
  const classes = await academicRepo.listClasses(termId, dept ? { department: dept } : {});
  const enrollments = await academicRepo.listEnrollmentsForTerm(termId);
  const assignments = await academicRepo.listAssignments({ termId });
  const sizeOf = new Map();
  for (const e of enrollments) if (e.primary || classes.find((c) => c.id === e.classId)?.kind === 'elective') sizeOf.set(e.classId, (sizeOf.get(e.classId) || 0) + 1);
  const staffIds = new Set(); classes.forEach((c) => staffIdsOf(c).forEach((i) => staffIds.add(i))); assignments.forEach((a) => staffIds.add(a.facultyId));
  const names = new Map();
  for (const id of staffIds) { const u = await userRepo.getById(id, 'faculty'); names.set(id, u?.name || null); }
  return classes.map((c) => ({
    id: c.id, label: academic.classLabel(c), kind: c.kind, department: c.department, year: c.year ?? null, section: c.section ?? null,
    students: sizeOf.get(c.id) || 0, classTeacher: c.classTeacherId ? { id: c.classTeacherId, name: names.get(c.classTeacherId) } : null,
    subMentors: (c.subMentors || []).map((r) => ({ ...r, name: names.get(r.mentorId) })),
    assignments: assignments.filter((a) => a.classId === c.id).map((a) => ({ id: a.id, facultyId: a.facultyId, facultyName: names.get(a.facultyId), subject: a.subject, from: a.from, to: a.to ?? null, active: academic.isActive(a) })),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

/** The students of one class in roll order with their positions and current sub-mentor, so a HOD can see what a range covers. */
async function classRoster(actor, classId) {
  const cls = await getClassOrFail(classId);
  assertManage(actor, cls.department);
  const members = await academicRepo.listEnrollmentsForClass(classId);
  const shown = cls.kind === 'elective' ? members : members.filter((e) => e.primary);
  const students = await Promise.all(shown.map(async (e) => { const u = await userRepo.getById(e.studentId, 'student'); return { id: e.studentId, name: u?.name || null, rollNo: e.rollNo || u?.rollNo || null, source: e.source || null }; }));
  const roster = academic.sortedRoster(students).map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo, source: s.source, position: s.position, mentorId: academic.mentorForPosition(cls, s.position) }));
  return { class: { id: cls.id, label: academic.classLabel(cls), kind: cls.kind, department: cls.department }, students: roster };
}

async function consistencyReport(actor, { termId, department }) {
  const dept = actor.role === 'admin' ? (department || null) : actor.department;
  if (actor.role !== 'admin' && actor.role !== 'hod') fail(403, 'FORBIDDEN', 'Only an Admin or a HOD can see this.');
  const [classes, enrollments, assignments, studentsById, staff] = await Promise.all([
    academicRepo.listClasses(termId, dept ? { department: dept } : {}), academicRepo.listEnrollmentsForTerm(termId),
    academicRepo.listAssignments({ termId }), loadStudents(), userRepo.listByRole('admin'),
  ]);
  const classIds = new Set(classes.map((c) => c.id));
  const memberships = enrollments.filter((e) => classIds.has(e.classId)).map((e) => ({ classId: e.classId, studentId: e.studentId, primary: !!e.primary, position: e.position }));
  const students = [...studentsById.values()].filter((s) => !dept || s.department === dept);
  const issues = academic.consistencyIssues({ classes, memberships, students, assignments: assignments.filter((a) => classIds.has(a.classId)), staffIds: new Set(staff.map((u) => u.id)) });
  return { issues, counts: { classes: classes.length, students: students.length, issues: issues.length } };
}

module.exports = {
  AcademicError, createTerm, activateTerm, generateClasses, importPlacements, moveStudent, createElective, setClassTeacher, setSubMentors,
  classRoster, assignTeacher, reallocate, endAssignment, requestAccess, listRequests, decideRequest, myClass, listTerms, listClassesView, consistencyReport, syncClass,
};
