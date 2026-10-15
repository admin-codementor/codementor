// Alumni: students the HOD has marked as graduated. Pure: validation and the
// batch roll-up take plain objects, so they are checkable against fixtures.

const MAX_GRADUATE = 500;
const MIN_YEAR = 2000;

/**
 * @param {{graduated?: unknown, graduation_year?: unknown}} input
 * @returns {{error: string} | {graduated: boolean, graduationYear: number | null}}
 */
function validateGraduation(input, now = Date.now()) {
  if (typeof input?.graduated !== 'boolean') return { error: 'graduated must be true or false.' };
  if (!input.graduated) return { graduated: false, graduationYear: null }; // un-graduating clears the year
  const thisYear = new Date(now).getUTCFullYear();
  const year = input.graduation_year == null || input.graduation_year === '' ? thisYear : Number(input.graduation_year);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > thisYear + 1) {
    return { error: `Graduation year must be a year between ${MIN_YEAR} and ${thisYear + 1}.` };
  }
  return { graduated: true, graduationYear: year };
}

/**
 * @param {object} a
 * @param {{id,name,rollNo?,section?,graduationYear?}[]} a.alumni
 * @param {{userId,problemId,verdict}[]} a.submissions
 * @param {{driveId,studentId,status}[]} a.applications
 * @param {{id,company}[]} a.drives
 */
function buildAlumniOverview({ alumni, submissions, applications, drives }) {
  const companyOf = new Map(drives.map((d) => [d.id, d.company]));
  const ids = new Set(alumni.map((a) => a.id));
  const solved = new Map(alumni.map((a) => [a.id, new Set()]));
  for (const s of submissions) if (s.verdict === 'Accepted' && ids.has(s.userId)) solved.get(s.userId).add(s.problemId);

  const placedAt = new Map(alumni.map((a) => [a.id, []]));
  for (const ap of applications) {
    if (ap.status === 'selected' && ids.has(ap.studentId) && companyOf.has(ap.driveId)) placedAt.get(ap.studentId).push(companyOf.get(ap.driveId));
  }

  const rows = alumni.map((a) => ({
    id: a.id, name: a.name || 'Unknown', roll_no: a.rollNo || null, section: a.section || null,
    graduation_year: a.graduationYear ?? null,
    solved: solved.get(a.id).size,
    placed_at: [...new Set(placedAt.get(a.id))].sort(),
  })).sort((x, y) => (y.graduation_year ?? 0) - (x.graduation_year ?? 0) || x.name.localeCompare(y.name));

  const byYear = new Map();
  for (const r of rows) {
    const k = r.graduation_year ?? 'Unknown';
    const b = byYear.get(k) || { year: k, students: 0, placed: 0, solved_total: 0 };
    b.students += 1;
    if (r.placed_at.length) b.placed += 1;
    b.solved_total += r.solved;
    byYear.set(k, b);
  }
  const batches = [...byYear.values()].map((b) => ({
    year: b.year, students: b.students, placed: b.placed,
    placement_rate: b.students ? Math.round((b.placed / b.students) * 100) : 0,
    avg_solved: b.students ? Math.round((b.solved_total / b.students) * 10) / 10 : 0,
  })).sort((a, b) => (b.year === 'Unknown' ? -1 : a.year === 'Unknown' ? 1 : b.year - a.year));

  const years = rows.map((r) => r.graduation_year).filter((y) => y != null);
  const placed = rows.filter((r) => r.placed_at.length).length;
  return {
    totals: {
      alumni: rows.length, placed, placement_rate: rows.length ? Math.round((placed / rows.length) * 100) : 0,
      batches: batches.length, first_year: years.length ? Math.min(...years) : null, last_year: years.length ? Math.max(...years) : null,
    },
    batches, alumni: rows,
  };
}

module.exports = { validateGraduation, buildAlumniOverview, MAX_GRADUATE };
