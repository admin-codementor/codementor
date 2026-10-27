// HTTP layer for the academic structure (services/academicService.js does the work and the permission checks).
const academic = require('../services/academicService');
const academicScope = require('../services/academicScope');
const { logAction } = require('../middleware/audit');

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, department: req.user.department ?? null, name: req.user.name || null });

/** Wrap a handler: a service refusal becomes its own status and message, anything else a plain 500. */
const handle = (fn) => async (req, res) => {
  try {
    const out = await fn(req, actorOf(req));
    res.json({ success: true, data: out });
  } catch (e) {
    if (e instanceof academic.AcademicError) return res.status(e.status).json({ success: false, code: e.code, error: e.message });
    console.error('academic error:', String(e?.message || e).slice(0, 200));
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
const audit = (req, what) => logAction(req, `academic.${what}`, JSON.stringify({ params: req.params, by: req.user.id }).slice(0, 300));

exports.listTerms = handle((req, actor) => academic.listTerms(actor));
exports.createTerm = handle(async (req, actor) => { const t = await academic.createTerm(actor, req.body || {}); audit(req, 'term.create'); return t; });
exports.activateTerm = handle(async (req, actor) => { const t = await academic.activateTerm(actor, req.params.termId); audit(req, 'term.activate'); return t; });

exports.listClasses = handle((req, actor) => academic.listClassesView(actor, { termId: req.params.termId, department: req.query.department }));
exports.generateClasses = handle(async (req, actor) => { const r = await academic.generateClasses(actor, { termId: req.params.termId, department: req.body?.department }); audit(req, 'classes.generate'); return r; });
exports.importPlacements = handle(async (req, actor) => { const r = await academic.importPlacements(actor, { termId: req.params.termId, department: req.body?.department, rows: req.body?.rows }); audit(req, 'placements.import'); return r; });
exports.createElective = handle(async (req, actor) => { const r = await academic.createElective(actor, { termId: req.params.termId, department: req.body?.department, name: req.body?.name }); audit(req, 'elective.create'); return r; });
exports.consistency = handle((req, actor) => academic.consistencyReport(actor, { termId: req.params.termId, department: req.query.department }));

exports.classRoster = handle((req, actor) => academic.classRoster(actor, req.params.classId));
exports.moveStudent = handle(async (req, actor) => { const r = await academic.moveStudent(actor, { termId: req.body?.term_id, studentId: req.body?.student_id, classId: req.params.classId }); audit(req, 'student.move'); return r; });
exports.setClassTeacher = handle(async (req, actor) => { const r = await academic.setClassTeacher(actor, req.params.classId, req.body?.faculty_id || null); audit(req, 'class.teacher'); return r; });
exports.setSubMentors = handle(async (req, actor) => { const r = await academic.setSubMentors(actor, req.params.classId, req.body?.ranges); audit(req, 'class.submentors'); return r; });

exports.assignTeacher = handle(async (req, actor) => { const r = await academic.assignTeacher(actor, { classId: req.params.classId, facultyId: req.body?.faculty_id, subject: req.body?.subject, from: req.body?.from }); audit(req, 'assignment.create'); return r; });
exports.reallocate = handle(async (req, actor) => { const r = await academic.reallocate(actor, { assignmentId: req.params.assignmentId, newFacultyId: req.body?.new_faculty_id, effectiveFrom: req.body?.effective_from }); audit(req, 'assignment.reallocate'); return r; });
exports.endAssignment = handle(async (req, actor) => { const r = await academic.endAssignment(actor, req.params.assignmentId, req.body?.to); audit(req, 'assignment.end'); return r; });

exports.myClass = handle((req) => academic.myClass(req.user.id));
exports.myClasses = handle(async (req) => { const s = await academicScope.facultyScope(req.user.id); return { term: s.term, classes: s.classes }; });

exports.requestAccess = handle(async (req, actor) => { const r = await academic.requestAccess(actor, { classId: req.body?.class_id, reason: req.body?.reason }); audit(req, 'request.create'); return r; });
exports.listRequests = handle((req, actor) => academic.listRequests(actor, { status: req.query.status }));
exports.decideRequest = handle(async (req, actor) => { const r = await academic.decideRequest(actor, req.params.requestId, { approve: req.body?.approve === true, expiresAt: req.body?.expires_at, note: req.body?.note }); audit(req, 'request.decide'); return r; });
