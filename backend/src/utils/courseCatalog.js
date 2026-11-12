// The course catalogue every student shares: published courses, their modules, and just enough of each problem
// (title, difficulty, tags, status) to build the course list and course pages. Pure, so it is tested without a database.
//
// It has to survive Redis (JSON), so dates are turned into ISO strings here and problems into plain objects.

const toISO = (value) => {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** The few problem fields the course screens use. */
const slimProblem = (p) => ({ id: p.id, title: p.title || '', difficulty: p.difficulty ?? null, tags: Array.isArray(p.tags) ? p.tags : [], status: p.status ?? 'published' });

/**
 * @param {{id,title,description?}[]} courses            published courses, already in display order
 * @param {object[][]} modulesByCourse                    modules of each course, same order
 * @param {Map<string, object>} problemsById              existing problems (a missing id = deleted)
 * @returns {{ courses: object[], problems: Record<string, object> }}  JSON-safe
 */
function buildCatalog(courses, modulesByCourse, problemsById) {
  const wanted = new Set();
  const out = courses.map((c, i) => ({
    id: c.id,
    title: c.title,
    description: c.description ?? null,
    modules: (modulesByCourse[i] || []).map((m) => {
      for (const pid of m.problemIds || []) wanted.add(pid);
      return {
        id: m.id,
        title: m.title,
        description: m.description ?? null,
        dueAt: toISO(m.dueAt),
        opensAt: toISO(m.opensAt),
        problemIds: [...(m.problemIds || [])],
      };
    }),
  }));
  const problems = {};
  for (const pid of wanted) {
    const p = problemsById.get(pid);
    if (p) problems[pid] = slimProblem(p);
  }
  return { courses: out, problems };
}

module.exports = { buildCatalog, slimProblem, toISO };
