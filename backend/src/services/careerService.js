// Placement readiness for the viewer's students: resume check, best mock interview and distinct problems solved, folded into the
// pure bands in utils/placementReadiness.js. Students with no career-prep document simply have nothing done.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const careerRepo = require('../repositories/careerPrepRepository');
const analytics = require('./analyticsService');
const { scopedStudents } = require('./courseAnalyticsService');
const { classLabel } = require('../utils/students');
const { readinessFor, bandCounts, BANDS, LABEL, RESUME_MIN, INTERVIEW_MIN, PRACTICE_MIN } = require('../utils/placementReadiness');

const TTL = 120;
const VERSION = 1;

const best = (interviews) => (interviews.length ? Math.max(...interviews.map((i) => i.overall ?? 0)) : null);
const solvedFor = (subs) => new Set(subs.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId)).size;

async function compute({ scope, year, section }) {
  const [studentsMap, prep, submissions] = await Promise.all([userRepo.getMapByRole('student'), careerRepo.listAll(), submissionRepo.listAllForAnalytics()]);
  const students = [...scopedStudents(scope, studentsMap).values()]
    .filter((s) => (!year || String(s.year) === String(year)) && (!section || s.section === section));
  const prepBy = new Map(prep.map((p) => [p.userId, p]));
  const solved = new Map();
  for (const s of submissions) {
    if (s.verdict !== 'Accepted' || !s.userId) continue;
    const set = solved.get(s.userId) || new Set();
    set.add(s.problemId);
    solved.set(s.userId, set);
  }
  const rows = students.map((st) => {
    const p = prepBy.get(st.id);
    const r = readinessFor({ resumeScore: p?.resume?.score ?? null, bestInterview: best(p?.interviews || []), solved: solved.get(st.id)?.size ?? 0 });
    return {
      id: st.id, name: st.name || 'Unknown', rollNo: st.rollNo || null, year: st.year ?? null, section: st.section || null, classLabel: classLabel(st.year, st.section),
      band: r.band, passed: r.passed, checks: r.checks, missing: r.missing, interviews: (p?.interviews || []).length,
    };
  }).sort((a, b) => b.passed - a.passed || a.name.localeCompare(b.name));
  return {
    rows, counts: bandCounts(rows), total: rows.length,
    bands: BANDS.map((b) => ({ key: b, label: LABEL[b] })),
    rule: { resume: RESUME_MIN, interview: INTERVIEW_MIN, practice: PRACTICE_MIN },
  };
}

exports.getReadiness = async (req, { year, section } = {}) => {
  const scope = await analytics.resolveAnalyticsScope(req);
  scope.facultyId = req.user.id;
  return cached(`career-readiness:v${VERSION}:${analytics.scopeKey(scope)}:${year || 'all'}:${section || 'all'}`, TTL, () => compute({ scope, year, section }));
};

/** One student's own readiness, for their career page. */
exports.getMine = async (userId) => {
  const [prep, subs] = await Promise.all([careerRepo.get(userId), submissionRepo.listByUser(userId)]);
  const readiness = readinessFor({ resumeScore: prep.resume?.score ?? null, bestInterview: best(prep.interviews), solved: solvedFor(subs) });
  return { prep, readiness, rule: { resume: RESUME_MIN, interview: INTERVIEW_MIN, practice: PRACTICE_MIN }, labels: LABEL };
};
