// One calendar for everyone: students see what is set for them, staff see what they run. GET /api/calendar?from=&to=
const assignmentRepo = require('../repositories/assignmentRepository');
const examRepo = require('../repositories/examRepository');
const courseRepo = require('../repositories/courseRepository');
const { buildCalendarEvents, parseRange } = require('../utils/calendarEvents');
const { canManageOwnedBy } = require('../middleware/role.middleware');
const student = require('./student.controller');
const exam = require('./exam.controller');

const isStaff = (req) => ['faculty', 'hod', 'admin'].includes(req.user.role);

async function unitsOf(courses) {
  const out = [];
  for (const c of courses) {
    for (const m of await courseRepo.getModules(c.id)) {
      if (m.dueAt || m.opensAt) out.push({ id: m.id, title: m.title, dueAt: m.dueAt, opensAt: m.opensAt, courseId: c.id, courseTitle: c.title });
    }
  }
  return out;
}

exports.getCalendar = async (req, res) => {
  try {
    const { from, to } = parseRange(req.query.from, req.query.to);
    let assignments; let exams; let courses;
    if (isStaff(req)) {
      const own = (list, key) => Promise.all(list.map(async (x) => ((await canManageOwnedBy(req, x[key])) ? x : null))).then((r) => r.filter(Boolean));
      assignments = await own(req.user.role === 'faculty' ? await assignmentRepo.listByFacultyId(req.user.id) : await assignmentRepo.getAll(), 'facultyId');
      exams = req.user.role === 'faculty' ? await examRepo.listByFaculty(req.user.id) : await examRepo.listAll();
      courses = await own(await courseRepo.listAll(), 'createdBy');
    } else {
      assignments = await student.visibleAssignmentsFor(req.user.id);
      exams = await exam.visibleExamsFor(req.user.id);
      courses = await courseRepo.listPublished();
    }
    const events = buildCalendarEvents({ assignments, exams, units: await unitsOf(courses), viewer: isStaff(req) ? 'staff' : 'student', from, to });
    res.json({ success: true, data: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), events } });
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the calendar.' });
  }
};
