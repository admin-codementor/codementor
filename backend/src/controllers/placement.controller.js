// Placement drives and applications for HOD/admin (routes under /api/faculty/placement).
// A drive belongs to one department. An HOD only ever sees and changes drives of
// their own department (taken from the token); an admin sees all.
const placementRepo = require('../repositories/placementRepository');
const userRepo = require('../repositories/userRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { logAction } = require('../middleware/audit');
const {
  validateDrive, isEligible, validateApplicationUpdate, MAX_UPDATES,
} = require('../utils/placement');
const { buildPlacementAnalytics } = require('../utils/placementAnalytics');
const { activeStudents } = require('../utils/students');

const shapeDrive = (d) => ({
  id: d.id, company: d.company, role: d.role || '', date: d.date || null, ctc: d.ctc || '',
  eligible_years: d.eligibleYears || [], rounds: d.rounds || [], status: d.status || 'open', department: d.department || null,
});

/** The drive, if it exists and is in the caller's scope. Out of scope looks exactly like missing. */
async function scopedDrive(req, res) {
  const drive = await placementRepo.getDrive(req.params.id);
  const dept = scopeDept(req);
  if (!drive || (dept !== null && (drive.department || null) !== dept)) {
    res.status(404).json({ success: false, error: 'Drive not found.' });
    return null;
  }
  return drive;
}

const studentsInDept = async (dept) => activeStudents([...(await userRepo.getMapByRole('student')).values()])
  .filter((s) => dept === null || (s.department || null) === dept);

// @route GET /api/faculty/placement/drives
exports.listDrives = async (req, res) => {
  try {
    const dept = scopeDept(req);
    const [drives, apps, students] = await Promise.all([
      placementRepo.listDrives(), placementRepo.listAllApplications(), studentsInDept(dept),
    ]);
    const mine = drives.filter((d) => dept === null || (d.department || null) === dept);
    const data = mine.map((d) => {
      const a = apps.filter((x) => x.driveId === d.id);
      const count = (st) => a.filter((x) => x.status === st).length;
      return {
        ...shapeDrive(d),
        eligible: students.filter((s) => isEligible(s, d)).length,
        applied: a.length, shortlisted: count('shortlisted'), selected: count('selected'), rejected: count('rejected'),
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('List drives error:', error);
    res.status(500).json({ success: false, error: 'Failed to load drives.' });
  }
};

// @route POST /api/faculty/placement/drives
exports.createDrive = async (req, res) => {
  try {
    const v = validateDrive(req.body);
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    // An HOD's drive is always for their own department; only an admin chooses one.
    const dept = scopeDept(req) ?? (String(req.body?.department || '').trim() || null);
    if (!dept) return res.status(400).json({ success: false, error: 'A department is required.' });
    const drive = await placementRepo.createDrive({ ...v.drive, department: dept, createdBy: req.user.id });
    logAction(req, 'placement.drive.create', `${v.drive.company} (${dept})`);
    res.status(201).json({ success: true, data: shapeDrive(drive) });
  } catch (error) {
    console.error('Create drive error:', error);
    res.status(500).json({ success: false, error: 'Failed to create the drive.' });
  }
};

// @route GET /api/faculty/placement/drives/:id — drive, its eligible students, and each one's application
exports.getDrive = async (req, res) => {
  try {
    const drive = await scopedDrive(req, res);
    if (!drive) return;
    const [apps, students] = await Promise.all([placementRepo.listApplicationsByDrive(drive.id), studentsInDept(drive.department || null)]);
    const byStudent = new Map(apps.map((a) => [a.studentId, a]));
    const rows = students.filter((s) => isEligible(s, drive)).map((s) => {
      const a = byStudent.get(s.id);
      return {
        id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null, section: s.section || null, year: s.year ?? null,
        status: a?.status ?? null, round_results: a?.roundResults ?? {},
      };
    }).sort((x, y) => x.name.localeCompare(y.name));
    res.json({ success: true, data: { drive: shapeDrive(drive), students: rows } });
  } catch (error) {
    console.error('Get drive error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the drive.' });
  }
};

// @route PATCH /api/faculty/placement/drives/:id
exports.updateDrive = async (req, res) => {
  try {
    const drive = await scopedDrive(req, res);
    if (!drive) return;
    const v = validateDrive({ ...shapeDrive(drive), ...req.body });
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const updated = await placementRepo.updateDrive(drive.id, v.drive);
    // A removed round must not leave results behind that no longer mean anything.
    const keep = new Set(v.drive.rounds);
    for (const a of await placementRepo.listApplicationsByDrive(drive.id)) {
      const kept = Object.fromEntries(Object.entries(a.roundResults || {}).filter(([r]) => keep.has(r)));
      if (Object.keys(kept).length !== Object.keys(a.roundResults || {}).length) {
        await placementRepo.upsertApplication(drive.id, a.studentId, { status: a.status, roundResults: kept });
      }
    }
    logAction(req, 'placement.drive.update', updated.company);
    res.json({ success: true, data: shapeDrive(updated) });
  } catch (error) {
    console.error('Update drive error:', error);
    res.status(500).json({ success: false, error: 'Failed to update the drive.' });
  }
};

// @route DELETE /api/faculty/placement/drives/:id (also deletes its applications)
exports.deleteDrive = async (req, res) => {
  try {
    const drive = await scopedDrive(req, res);
    if (!drive) return;
    await placementRepo.removeDrive(drive.id);
    logAction(req, 'placement.drive.delete', drive.company);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete drive error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete the drive.' });
  }
};

// @route PUT /api/faculty/placement/drives/:id/applications
// body { updates: [{ student_id, status: 'applied'|'shortlisted'|'selected'|'rejected'|null, round_results?: {round: 'passed'|'failed'} }] }
// A null status clears the application. All updates are checked before any is written.
exports.saveApplications = async (req, res) => {
  try {
    const drive = await scopedDrive(req, res);
    if (!drive) return;
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'Nothing to save.' });
    if (updates.length > MAX_UPDATES) return res.status(400).json({ success: false, error: `You can save at most ${MAX_UPDATES} students at a time.` });

    const studentMap = await userRepo.getMapByRole('student');
    const planned = [];
    for (const u of updates) {
      const student = studentMap.get(String(u?.student_id));
      if (!student) return res.status(400).json({ success: false, error: 'One or more students were not found.' });
      if (!isEligible(student, drive)) return res.status(400).json({ success: false, error: `${student.name || 'A student'} is not eligible for this drive.` });
      const r = validateApplicationUpdate(u, drive);
      if (r.error) return res.status(400).json({ success: false, error: `${student.name || 'A student'}: ${r.error}` });
      planned.push({ studentId: student.id, ...r });
    }
    for (const p of planned) {
      if (p.clear) await placementRepo.removeApplication(drive.id, p.studentId);
      else await placementRepo.upsertApplication(drive.id, p.studentId, { status: p.value.status, roundResults: p.value.roundResults });
    }
    logAction(req, 'placement.applications.save', `${drive.company}: ${planned.length} student(s)`);
    res.json({ success: true, data: { saved: planned.length } });
  } catch (error) {
    console.error('Save applications error:', error);
    res.status(500).json({ success: false, error: 'Failed to save results.' });
  }
};

// @route GET /api/faculty/placement/analytics?section&year
exports.getAnalytics = async (req, res) => {
  try {
    const dept = scopeDept(req);
    const section = String(req.query.section || '').trim().slice(0, 40) || null;
    const year = String(req.query.year || '').trim().slice(0, 10) || null;
    const [drives, apps, students] = await Promise.all([placementRepo.listDrives(), placementRepo.listAllApplications(), studentsInDept(dept)]);
    const inView = students
      .filter((s) => !section || (s.section || null) === section)
      .filter((s) => !year || String(s.year ?? '') === String(year))
      .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo, section: s.section, year: s.year, department: s.department || null }));
    const mine = drives.filter((d) => dept === null || (d.department || null) === dept);
    res.json({ success: true, data: { ...buildPlacementAnalytics({ students: inView, drives: mine, applications: apps }), scope: { department: dept, section, year } } });
  } catch (error) {
    console.error('Placement analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to load placement analytics.' });
  }
};
