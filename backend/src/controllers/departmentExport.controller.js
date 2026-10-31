// The department export for a HOD or Admin (routes under /api/faculty). A HOD gets only their own department (from the token); the Admin the
// whole college. Every export is written to the audit log with who, which fields and how many students.
const userRepo = require('../repositories/userRepository');
const departmentAnalyticsService = require('../services/departmentAnalyticsService');
const platformScoreService = require('../services/platformScoreService');
const { scopeDept } = require('../middleware/role.middleware');
const { logAction } = require('../middleware/audit');
const { FIELDS, validateFields, buildRows, toCsv } = require('../utils/departmentExport');
const { batchOf } = require('../utils/batch');

const BOM = String.fromCharCode(0xFEFF); // so that a spreadsheet opens the CSV as UTF-8 and names keep their letters

// @route GET /api/faculty/department-export/fields
exports.fields = (req, res) => res.json({ success: true, data: FIELDS });

// @route POST /api/faculty/department-export   { fields: [...], year?, section?, batch? }
exports.exportCsv = async (req, res) => {
  try {
    const f = validateFields(req.body?.fields);
    if (f.error) return res.status(400).json({ success: false, error: f.error });
    const year = /^\d$/.test(String(req.body?.year ?? '')) ? String(req.body.year) : null;
    const section = /^[A-Za-z0-9]{1,4}$/.test(String(req.body?.section ?? '')) ? String(req.body.section) : null;
    const batch = /^\d{4}-\d{4}$/.test(String(req.body?.batch ?? '')) ? String(req.body.batch) : null;
    const now = Date.now();

    const [analytics, studentsMap] = await Promise.all([
      departmentAnalyticsService.getDepartmentAnalytics(req, { section, year }),
      userRepo.getMapByRole('student'),
    ]);
    const wantsScore = f.fields.includes('codingScore') || f.fields.includes('codingBand');
    const scores = wantsScore ? (await platformScoreService.getScores(req, { year, section })).rows : [];
    let rows = buildRows({ analytics: analytics.students, scores, students: studentsMap, now });
    if (batch) rows = rows.filter((r) => r.batch === batch);
    rows.sort((a, b) => String(a.rollNo || '').localeCompare(String(b.rollNo || '')));

    const dept = scopeDept(req);
    logAction(req, 'department.export', `${rows.length} student(s); fields ${f.fields.join(',')}; ${dept ?? 'whole college'}${year ? `; year ${year}` : ''}${section ? `; section ${section}` : ''}${batch ? `; batch ${batch}` : ''}`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="department-export.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(BOM + toCsv(f.fields, rows));
  } catch (e) {
    console.error('department export error:', String(e?.message || e).slice(0, 160));
    res.status(500).json({ success: false, error: 'The export could not be made. Please try again.' });
  }
};

// @route GET /api/faculty/batches   the batches present in the viewer's department, newest first, for the pickers
exports.batches = async (req, res) => {
  try {
    const dept = scopeDept(req);
    const students = [...(await userRepo.getMapByRole('student')).values()].filter((s) => s.graduated !== true && (dept === null || (s.department || null) === dept));
    const now = Date.now();
    const counts = new Map();
    for (const s of students) { const b = batchOf(s, now).label; if (b) counts.set(b, (counts.get(b) || 0) + 1); }
    res.json({ success: true, data: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.name.localeCompare(a.name)) });
  } catch (e) {
    console.error('batches error:', String(e?.message || e).slice(0, 160));
    res.status(500).json({ success: false, error: 'Could not load the batches.' });
  }
};
