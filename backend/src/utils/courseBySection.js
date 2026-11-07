// Course progress rolled up by class (year and section) for a HOD or Admin. Pure: the courses arrive already resolved to the problems that
// are really required, so the figures use the same rule as every other course number (utils/courseProgress.js).
const { tally, studentProgress, summarise } = require('./courseProgress');
const { classLabel, classOrder } = require('./students');

/**
 * @param {object} a
 * @param {{id: string, title: string, problems: Set<string>, units: object[]}[]} a.courses
 * @param {{id: string, year?: number|null, section?: string|null}[]} a.students  already scoped to the viewer
 * @param {{userId, problemId, verdict, submittedAt?}[]} a.submissions
 */
function buildCourseBySection({ courses, students, submissions }) {
  const classes = new Map();
  for (const s of students) {
    const label = classLabel(s.year ?? null, s.section || null);
    if (!classes.has(label)) classes.set(label, { label, order: classOrder(s.year ?? null, s.section || null), students: [] });
    classes.get(label).students.push(s);
  }
  const ordered = [...classes.values()].sort((a, b) => a.order.localeCompare(b.order));

  return {
    classes: ordered.map((c) => ({ label: c.label, students: c.students.length })),
    courses: courses.map((course) => {
      const total = course.problems.size;
      const { solved, attempted } = tally(course.problems, students, submissions);
      const rowsOf = (list) => list.map((st) => studentProgress(total, solved.get(st.id), attempted.get(st.id), course.units));
      const present = ordered.map((c) => ({ label: c.label, ...summarise(rowsOf(c.students), total) }));
      return {
        id: course.id, title: course.title, total_problems: total,
        overall: summarise(rowsOf(students), total),
        classes: present.map((p) => ({ label: p.label, students: p.students, avg_percent: p.avgPercent, completed: p.completed, in_progress: p.inProgress, not_started: p.notStarted })),
      };
    }),
  };
}

module.exports = { buildCourseBySection };
