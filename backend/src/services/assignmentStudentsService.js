// The students an assignment was set for: the members of its classes, or the caller's department when it names no class
// (an assignment with no class goes to everyone, but a faculty member or HOD only ever sees their own students). Only
// current students; alumni are not part of it. Shared by the assignment progress screens and the late-work report.
const userRepo = require('../repositories/userRepository');
const classroomRepo = require('../repositories/classroomRepository');
const { activeStudents } = require('../utils/students');
const { scopeDept } = require('../middleware/role.middleware');

async function assignmentStudents(req, assignment) {
  const active = activeStudents([...(await userRepo.getMapByRole('student')).values()]);
  const classIds = assignment.classroomIds || [];
  if (classIds.length) {
    const memberIds = new Set((await Promise.all(classIds.map((cid) => classroomRepo.listMembers(cid)))).flat().map((m) => m.userId));
    return active.filter((s) => memberIds.has(s.id));
  }
  const dept = scopeDept(req);
  return active.filter((s) => dept === null || (s.department || null) === dept);
}

module.exports = { assignmentStudents };
