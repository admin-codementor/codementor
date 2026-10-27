// Where an exam or an assignment is aimed. Two kinds of "class" can be named:
//   - a classroom: a join-code group a faculty member made (the original kind, still supported), and
//   - an academic class: a section class or an elective of the active term, from the academic structure (utils/academic.js).
// Both are plain ids in the same list, so existing exams and assignments keep working.
//
// A faculty member may aim work only at classes they are properly given: their own classrooms, and academic classes where they are the
// class teacher, currently teach, or hold an approved access request (a sub-mentor sees their own students but does not set work for the
// whole class). A HOD may aim at any class of their department, an Admin at any.
const classroomRepo = require('../repositories/classroomRepository');
const academicRepo = require('../repositories/academicRepository');
const academicScope = require('./academicScope');
const academic = require('../utils/academic');
const { canManageOwnedBy } = require('../middleware/role.middleware');

/**
 * @returns {Promise<{unknown: string[]}>} the ids the requester may NOT aim at (unknown, or not theirs); empty when all are fine
 */
async function validateTargets(ids, req) {
  const unknown = [];
  let scope = null;
  for (const id of ids) {
    const classroom = await classroomRepo.getById(id);
    if (classroom) {
      if (!(req && await canManageOwnedBy(req, classroom.facultyId))) unknown.push(id);
      continue;
    }
    const cls = await academicRepo.getClass(id);
    if (!cls || !req?.user) { unknown.push(id); continue; }
    const term = await academicRepo.getActiveTerm();
    if (!term || cls.termId !== term.id) { unknown.push(id); continue; }
    const role = req.user.role;
    if (role === 'admin') continue;
    if (role === 'hod' && req.user.department != null && req.user.department === cls.department) continue;
    if (role === 'faculty') {
      scope = scope || await academicScope.facultyScope(req.user.id);
      if (scope.classes.some((c) => c.id === id && !c.mentees)) continue;
    }
    unknown.push(id);
  }
  return { unknown };
}

/** Every class id a student belongs to: classrooms they joined, plus their section class and electives this term. */
async function studentClassIds(studentId) {
  const [classrooms, term] = await Promise.all([classroomRepo.listByStudentId(studentId), academicRepo.getActiveTerm()]);
  const ids = new Set(classrooms.map((c) => c.id));
  if (term) for (const e of await academicRepo.listEnrollmentsForStudent(term.id, studentId)) ids.add(e.classId);
  return ids;
}

/** A name and a size for a targeted class, for the builder screens ("(deleted class)" when it no longer exists). */
async function describeTarget(id) {
  const classroom = await classroomRepo.getById(id);
  if (classroom) return { id, name: classroom.name || 'Untitled class', member_count: await classroomRepo.getMemberCount(id), kind: 'classroom' };
  const cls = await academicRepo.getClass(id);
  if (cls) return { id, name: academic.classLabel(cls), member_count: (await academicRepo.listEnrollmentsForClass(id)).length, kind: 'academic' };
  return { id, name: '(deleted class)', member_count: 0, kind: null };
}

module.exports = { validateTargets, studentClassIds, describeTarget };
