// Marks for an assignment. Pure: no I/O, so every figure is checkable against a hand-built fixture.
//
// Rules (the faculty progress list, the marks CSV and the submissions list all read these):
//   - Only the students the assignment was SET FOR are listed: the members of its classes, or the department's current
//     students when it names no class. It used to list every student in the college.
//   - A problem's mark is the student's BEST mark from submissions made on or before the deadline. A solve after the
//     deadline is kept and shown as "late", but it does not earn the on-time mark. (Marks used to ignore the deadline.)
//   - An OI-style partial score is kept; an Accepted submission with no stored score is worth 100.
//   - A student who never submitted still gets a row, with 0.
//   - An assignment with no valid deadline has no cut-off: every submission is on time.

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/** The mark one submission is worth. */
function markFor(sub) {
  const stored = Number.isFinite(sub.score) ? sub.score : null;
  if (sub.verdict === 'Accepted') return stored != null && stored > 0 ? stored : 100;
  return stored != null && stored > 0 ? stored : 0; // partial credit on a non-accepted verdict
}

/**
 * @param {object} a
 * @param {{problemIds?: string[], deadline?: unknown}} a.assignment
 * @param {{id: string}[]} a.students     the students it was set for
 * @param {{userId, problemId, verdict, score?, submittedAt?}[]} a.submissions
 * @returns {{id: string, problems: {problemId: string, mark: number, status: 'on_time'|'late'|'not_solved'|'not_attempted', solvedAt: number|null}[], solved: number, solvedOnTime: number, solvedLate: number, marks: number}[]}
 */
function buildAssignmentMarks({ assignment, students, submissions }) {
  const problemIds = [...new Set(assignment.problemIds || [])];
  const dl = assignment.deadline ? toMillis(assignment.deadline) : 0;
  const cutoff = Number.isFinite(dl) && dl > 0 ? dl : Infinity;
  const wanted = new Set(problemIds);
  const byStudent = new Map(students.map((s) => [s.id, new Map()]));

  for (const sub of submissions) {
    const mine = byStudent.get(sub.userId);
    if (!mine || !wanted.has(sub.problemId)) continue;
    const cur = mine.get(sub.problemId) || { attempted: true, onTimeMark: 0, solvedOnTimeAt: null, solvedLateAt: null };
    const ms = toMillis(sub.submittedAt);
    const onTime = !ms || ms <= cutoff;
    if (onTime) cur.onTimeMark = Math.max(cur.onTimeMark, markFor(sub));
    if (sub.verdict === 'Accepted') {
      if (onTime) cur.solvedOnTimeAt = cur.solvedOnTimeAt == null ? ms : Math.min(cur.solvedOnTimeAt, ms || cur.solvedOnTimeAt);
      else cur.solvedLateAt = cur.solvedLateAt == null ? ms : Math.min(cur.solvedLateAt, ms);
    }
    mine.set(sub.problemId, cur);
  }

  return students.map((st) => {
    const mine = byStudent.get(st.id);
    const problems = problemIds.map((pid) => {
      const g = mine.get(pid);
      if (!g) return { problemId: pid, mark: 0, status: 'not_attempted', solvedAt: null };
      if (g.solvedOnTimeAt != null) return { problemId: pid, mark: g.onTimeMark, status: 'on_time', solvedAt: g.solvedOnTimeAt || null };
      if (g.solvedLateAt != null) return { problemId: pid, mark: g.onTimeMark, status: 'late', solvedAt: g.solvedLateAt };
      return { problemId: pid, mark: g.onTimeMark, status: 'not_solved', solvedAt: null };
    });
    return {
      id: st.id, problems,
      solved: problems.filter((p) => p.status === 'on_time' || p.status === 'late').length,
      solvedOnTime: problems.filter((p) => p.status === 'on_time').length,
      solvedLate: problems.filter((p) => p.status === 'late').length,
      marks: problems.reduce((n, p) => n + p.mark, 0),
    };
  });
}

module.exports = { buildAssignmentMarks, markFor };
