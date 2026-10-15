// Labs: a read-only view of a department's classes and the assignments set for them.
// Pure: callers pass plain arrays, so every figure is checkable against a fixture.
//
// A "lab" here is a class (classroom). Its students are the class members who are
// still in the department's active cohort. An assignment counts for a class when it
// targets that class; an assignment with no target is set for every student and is
// reported once, separately, rather than being counted against every class.
//
// Completion is measured by problems solved (an Accepted verdict at any time, as in
// the per-assignment progress screen), not by whether the deadline was met.

const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/**
 * @param {object} a
 * @param {{id,name,section?,department?,facultyId}[]} a.classrooms     already limited to the department
 * @param {Map<string, string[]>} a.membersByClass                      class id → member user ids
 * @param {{id,title,deadline,problemIds?,classroomIds?,facultyId,proctored?,isExam?}[]} a.assignments
 * @param {{id,name}[]} a.students                                      active students of the department
 * @param {{userId,problemId,verdict}[]} a.submissions
 * @param {Map<string, string>} a.ownerNames                            the department's own staff: id → name
 * @param {number} a.now
 */
function buildLabs({ classrooms, membersByClass, assignments, students, submissions, ownerNames, now = Date.now() }) {
  const activeIds = new Set(students.map((s) => s.id));

  // user → problem → { tried, solved }, built once from the submissions of in-scope students.
  const progress = new Map();
  for (const s of submissions) {
    if (!activeIds.has(s.userId)) continue;
    let byProblem = progress.get(s.userId);
    if (!byProblem) progress.set(s.userId, (byProblem = new Map()));
    const cur = byProblem.get(s.problemId) || { solved: false };
    if (s.verdict === 'Accepted') cur.solved = true;
    byProblem.set(s.problemId, cur);
  }

  const measure = (assignment, memberIds) => {
    const problems = assignment.problemIds || [];
    let attempted = 0;
    let completed = 0;
    let solvedSum = 0;
    for (const id of memberIds) {
      const byProblem = progress.get(id);
      let solved = 0;
      let tried = false;
      for (const pid of problems) {
        const p = byProblem?.get(pid);
        if (!p) continue;
        tried = true;
        if (p.solved) solved += 1;
      }
      if (tried) attempted += 1;
      if (problems.length && solved === problems.length) completed += 1;
      solvedSum += solved;
    }
    const denom = memberIds.length * problems.length;
    return { attempted, completed, avg_pct: pct(solvedSum, denom) };
  };

  const describe = (assignment, memberIds) => {
    const deadline = toMillis(assignment.deadline);
    return {
      id: assignment.id, title: assignment.title || 'Untitled', problems: (assignment.problemIds || []).length,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status: deadline && deadline < now ? 'closed' : 'open',
      exam: !!(assignment.proctored ?? assignment.isExam),
      students: memberIds.length,
      ...measure(assignment, memberIds),
    };
  };

  const inAnyClass = new Set();
  const classes = classrooms.map((c) => {
    const members = (membersByClass.get(c.id) || []).filter((id) => activeIds.has(id));
    members.forEach((id) => inAnyClass.add(id));
    const list = assignments
      .filter((a) => (a.classroomIds || []).includes(c.id))
      .map((a) => describe(a, members))
      .sort((x, y) => toMillis(y.deadline) - toMillis(x.deadline));
    const withWork = list.filter((a) => a.problems > 0);
    return {
      id: c.id, name: c.name || 'Untitled class', section: c.section || null,
      instructor: ownerNames.get(c.facultyId) || null,
      students: members.length,
      assignments: list,
      open_assignments: list.filter((a) => a.status === 'open').length,
      avg_completion: withWork.length && members.length ? Math.round(withWork.reduce((n, a) => n + a.avg_pct, 0) / withWork.length) : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Set for everyone (by this department's own staff): counted against the whole active cohort, not any one class.
  const everyone = assignments
    .filter((a) => !(a.classroomIds || []).length && ownerNames.has(a.facultyId))
    .map((a) => describe(a, students.map((s) => s.id)))
    .sort((x, y) => toMillis(y.deadline) - toMillis(x.deadline));

  const allTargeted = classes.flatMap((c) => c.assignments);
  const withWork = classes.filter((c) => c.avg_completion != null && c.students > 0);
  return {
    totals: {
      classes: classes.length,
      students_in_classes: inAnyClass.size,
      students_not_in_any_class: students.length - inAnyClass.size,
      assignments: new Set(allTargeted.map((a) => a.id)).size,
      open_assignments: new Set(allTargeted.filter((a) => a.status === 'open').map((a) => a.id)).size,
      avg_completion: withWork.length ? Math.round(withWork.reduce((n, c) => n + c.avg_completion, 0) / withWork.length) : null,
    },
    classes,
    everyone,
  };
}

module.exports = { buildLabs };
