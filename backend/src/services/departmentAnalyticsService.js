// Department (HOD) dashboard data. Gathers inputs, hands them to the pure
// aggregator, and caches the result per scope + filter.
const { cached, getVersion } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { buildDepartmentAnalytics } = require('../utils/departmentAnalytics');
const { activeStudents } = require('../utils/students');

const TTL_SECONDS = 120;
// Bump when the response shape or aggregation changes (the cache outlives deploys).
const VERSION = 5;

const BASELINES = ['view', 'year', 'institution'];

async function compute({ dept, section, year, mentor, baseline }) {
  const [studentsMap, submissions, staffMap] = await Promise.all([
    userRepo.getMapByRole('student'),
    submissionRepo.listAllForAnalytics(),
    userRepo.getMapByRole('faculty'),
  ]);

  const students = activeStudents([...studentsMap.values()])
    .filter((s) => dept === null || (s.department || null) === dept)
    .filter((s) => !section || (s.section || null) === section)
    // `year` arrives as a string from the query; compare loosely rather than
    // trusting both sides to be the same type.
    .filter((s) => !year || String(s.year ?? '') === String(year))
    // `mentor` is a mentor id, or "none" for students nobody mentors yet.
    .filter((s) => !mentor || (mentor === 'none' ? !s.mentorId : s.mentorId === mentor))
    .map((s) => ({
      id: s.id, name: s.name, rollNo: s.rollNo || null,
      department: s.department || null, section: s.section || null, year: s.year ?? null,
      mentorId: s.mentorId || null,
    }));

  // Badge percentile pool: this view (default), the student's own year in the department,
  // or every active student in the institution. Institution-wide figures are only ever a
  // number per student; nothing about other departments' students is returned.
  let pool = null;
  if (baseline !== 'view') {
    const everyone = activeStudents([...studentsMap.values()]);
    const solvedBy = new Map(everyone.map((s) => [s.id, new Set()]));
    for (const sub of submissions) if (sub.verdict === 'Accepted') solvedBy.get(sub.userId)?.add(sub.problemId);
    const counts = (list) => list.map((s) => solvedBy.get(s.id).size);
    if (baseline === 'institution') {
      const all = counts(everyone);
      pool = () => all;
    } else {
      const sameDept = everyone.filter((s) => dept === null || (s.department || null) === dept);
      const byYear = new Map();
      for (const s of sameDept) { const k = String(s.year ?? ''); byYear.set(k, [...(byYear.get(k) || []), solvedBy.get(s.id).size]); }
      pool = (row) => byYear.get(String(row.year ?? '')) || [];
    }
  }
  const result = buildDepartmentAnalytics({ students, submissions, now: Date.now(), baseline: pool });
  const mentorOf = new Map(students.map((s) => [s.id, s.mentorId]));
  result.students = result.students.map((r) => {
    const mid = mentorOf.get(r.id) || null;
    return { ...r, mentor_id: mid, mentor_name: mid ? (staffMap.get(mid)?.name ?? null) : null };
  });

  // Filter options always describe the WHOLE department, not the current
  // filter, so selecting a section never empties the menu you selected from.
  const inDept = activeStudents([...studentsMap.values()]).filter((s) => dept === null || (s.department || null) === dept);
  return {
    ...result,
    scope: {
      department: dept,
      section: section || null,
      year: year || null,
      sections: [...new Set(inDept.map((s) => s.section).filter(Boolean))].sort(),
      years: [...new Set(inDept.map((s) => s.year).filter((y) => y != null))].sort((a, b) => a - b),
      mentor: mentor || null,
      percentile: baseline,
      // Everyone who currently mentors someone here, for the filter menu.
      mentors: [...new Set(inDept.map((s) => s.mentorId).filter(Boolean))]
        .map((id) => ({ id, name: staffMap.get(id)?.name ?? 'Unknown', mentees: inDept.filter((s) => s.mentorId === id).length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      unmentored: inDept.filter((s) => !s.mentorId).length,
    },
  };
}

/**
 * @param {object} req  Express request — department comes from the token, never the query,
 *                      so an HOD cannot read another department by editing the URL.
 */
exports.getDepartmentAnalytics = async (req, { section, year, mentor, percentile } = {}) => {
  const dept = scopeDept(req);
  const baseline = BASELINES.includes(percentile) ? percentile : 'view';
  // Mentor assignments change the roster, so they bump a version rather than waiting out the TTL.
  const mv = await getVersion('mentors');
  const key = `analytics:dept:v${VERSION}:m${mv}:${dept ?? 'all'}:${section || 'all'}:${year || 'all'}:${mentor || 'all'}:${baseline}`;
  return cached(key, TTL_SECONDS, () => compute({ dept, section, year, mentor, baseline }));
};
