// Placement readiness for one student: three checks, one band. Pure.
//
//   resume      the latest resume check scored at least RESUME_MIN
//   interview   at least one mock interview scored at least INTERVIEW_MIN (out of 10)
//   practice    at least PRACTICE_MIN distinct problems solved on CodeMentor
//
// Band: all three = ready; two = almost; one = building; none = not started. The checks are shown so the student (and the HOD)
// can see exactly what is missing, instead of a score that cannot be acted on.

const RESUME_MIN = 60;
const INTERVIEW_MIN = 6;
const PRACTICE_MIN = 30;

const BANDS = ['ready', 'almost', 'building', 'not_started'];
const LABEL = { ready: 'Ready', almost: 'Almost ready', building: 'Building up', not_started: 'Not started' };

/**
 * @param {{resumeScore?: number|null, bestInterview?: number|null, solved?: number}} s
 */
function readinessFor({ resumeScore = null, bestInterview = null, solved = 0 } = {}) {
  const checks = {
    resume: { ok: resumeScore != null && resumeScore >= RESUME_MIN, value: resumeScore, need: RESUME_MIN },
    interview: { ok: bestInterview != null && bestInterview >= INTERVIEW_MIN, value: bestInterview, need: INTERVIEW_MIN },
    practice: { ok: solved >= PRACTICE_MIN, value: solved, need: PRACTICE_MIN },
  };
  const passed = Object.values(checks).filter((c) => c.ok).length;
  const band = passed === 3 ? 'ready' : passed === 2 ? 'almost' : passed === 1 ? 'building' : 'not_started';
  const missing = Object.entries(checks).filter(([, c]) => !c.ok).map(([k]) => k);
  return { band, passed, checks, missing };
}

/** Counts per band, always adding up to the number of rows. */
function bandCounts(rows) {
  const counts = Object.fromEntries(BANDS.map((b) => [b, 0]));
  for (const r of rows) counts[r.band] += 1;
  return counts;
}

module.exports = { readinessFor, bandCounts, BANDS, LABEL, RESUME_MIN, INTERVIEW_MIN, PRACTICE_MIN };
