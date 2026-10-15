// Alumni for HOD/admin (routes under /api/faculty/alumni). An HOD only ever sees
// and changes their own department's students (taken from the token).
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const placementRepo = require('../repositories/placementRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { logAction } = require('../middleware/audit');
const { bumpVersion } = require('../utils/cache');
const { validateGraduation, buildAlumniOverview, MAX_GRADUATE } = require('../utils/alumni');

// @route GET /api/faculty/alumni
exports.getAlumni = async (req, res) => {
  try {
    const dept = scopeDept(req);
    const studentsMap = await userRepo.getMapByRole('student');
    const alumni = [...studentsMap.values()]
      .filter((s) => s.graduated === true && (dept === null || (s.department || null) === dept))
      .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo, section: s.section, graduationYear: s.graduationYear ?? null }));
    const ids = new Set(alumni.map((a) => a.id));
    const [submissions, applications, drives] = await Promise.all([
      alumni.length ? submissionRepo.listAllForAnalytics() : [], placementRepo.listAllApplications(), placementRepo.listDrives(),
    ]);
    const data = buildAlumniOverview({
      alumni,
      submissions: submissions.filter((s) => ids.has(s.userId)),
      applications: applications.filter((a) => ids.has(a.studentId)),
      drives: drives.filter((d) => dept === null || (d.department || null) === dept),
    });
    res.json({ success: true, data: { ...data, scope: { department: dept } } });
  } catch (error) {
    console.error('Alumni error:', error);
    res.status(500).json({ success: false, error: 'Failed to load alumni.' });
  }
};

// @route PUT /api/faculty/alumni/graduation  body { student_ids: string[], graduated: boolean, graduation_year?: number }
// Marks students as graduated (they leave the active dashboards) or brings them back.
exports.setGraduation = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.student_ids) ? [...new Set(req.body.student_ids.map(String))] : [];
    if (ids.length === 0) return res.status(400).json({ success: false, error: 'Choose at least one student.' });
    if (ids.length > MAX_GRADUATE) return res.status(400).json({ success: false, error: `You can change at most ${MAX_GRADUATE} students at a time.` });
    const v = validateGraduation(req.body);
    if (v.error) return res.status(400).json({ success: false, error: v.error });

    const dept = scopeDept(req);
    const studentsMap = await userRepo.getMapByRole('student');
    const students = ids.map((id) => studentsMap.get(id));
    if (students.some((s) => !s)) return res.status(400).json({ success: false, error: 'One or more selected students were not found.' });
    const outside = students.filter((s) => dept !== null && (s.department || null) !== dept).length;
    if (outside) return res.status(400).json({ success: false, error: `${outside} selected student(s) are outside your department.` });

    await Promise.all(students.map((s) => userRepo.update(s.id, 'student', { graduated: v.graduated, graduationYear: v.graduationYear })));
    // Rosters change: cached dashboards (which key on this shared roster version) must refresh now.
    await bumpVersion('mentors');
    logAction(req, v.graduated ? 'alumni.graduate' : 'alumni.restore', `${students.length} student(s)${v.graduated ? ` · ${v.graduationYear}` : ''}`);
    res.json({ success: true, data: { updated: students.length } });
  } catch (error) {
    console.error('Set graduation error:', error);
    res.status(500).json({ success: false, error: 'Failed to update graduation.' });
  }
};
