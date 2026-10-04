// Turns a roadmap's authored content into "where this student stands".
//
// The content never names a problem id or a course id. A milestone says what it
// is about ("two pointers", "hashing") and the resolver finds the matching
// course modules and tagged problems in whatever catalog this college actually
// has. Three reasons:
//   - Progress fills from work already done. A student who solved twenty array
//     problems last term opens the roadmap at 40%, not 0%.
//   - A college that imports its own problems gets working roadmaps without
//     editing them.
//   - Renaming a course cannot silently empty a milestone.
//
// The cost is fuzzy matching, which is why the matching rules below are narrow:
// tags must match a term outright (modulo plurals), and module titles must
// contain it. No stemming, no substring matching on tags — "array" must not
// pull in "Basic Math" because both contain an "a".

const SINGULAR = (s) => (s.length > 3 && s.endsWith('s') ? s.slice(0, -1) : s);

/** Lowercase, hyphens and underscores to spaces, collapse runs of whitespace. */
function normalizeTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A tag matches a term when they are the same word, ignoring a trailing "s". */
function tagMatches(tag, term) {
  const a = SINGULAR(normalizeTerm(tag));
  const b = SINGULAR(normalizeTerm(term));
  return a.length > 0 && a === b;
}

/** A module matches a term when its title contains that term as a whole word. */
function moduleMatches(title, term) {
  const haystack = ` ${normalizeTerm(title)} `;
  const needle = SINGULAR(normalizeTerm(term));
  if (!needle) return false;
  // Allow the plural the title is likely to use: "Stacks & Queues" for "stack".
  return haystack.includes(` ${needle} `) || haystack.includes(` ${needle}s `);
}

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };
const byDifficulty = (a, b) =>
  (DIFFICULTY_ORDER[normalizeTerm(a.difficulty)] ?? 1) - (DIFFICULTY_ORDER[normalizeTerm(b.difficulty)] ?? 1);

/**
 * Flattens the catalog into the shape the resolver wants, once per request
 * rather than once per milestone.
 *
 * @param {Array} problems published problems: { id, title, difficulty, tags }
 * @param {Array} modules  published modules: { id, title, courseId, courseTitle, problemIds }
 */
function buildCatalog(problems, modules) {
  return {
    problems,
    problemsById: new Map(problems.map((p) => [p.id, p])),
    modules,
  };
}

/**
 * The problems a milestone covers, in the order a student should meet them:
 * the matching course modules first (a faculty member ordered those), then any
 * remaining tagged problems easiest-first.
 */
function poolFor(practice, catalog) {
  const moduleTerms = practice.modules || [];
  const tagTerms = practice.tags || [];

  const matchedModules = moduleTerms.length
    ? catalog.modules.filter((m) => moduleTerms.some((t) => moduleMatches(m.title, t)))
    : [];

  const ordered = [];
  const seen = new Set();
  const push = (id) => {
    const problem = catalog.problemsById.get(id);
    if (problem && !seen.has(id)) {
      seen.add(id);
      ordered.push(problem);
    }
  };

  for (const m of matchedModules) for (const id of m.problemIds || []) push(id);

  if (tagTerms.length) {
    const tagged = catalog.problems
      .filter((p) => !seen.has(p.id) && (p.tags || []).some((tag) => tagTerms.some((t) => tagMatches(tag, t))))
      .sort(byDifficulty);
    for (const p of tagged) push(p.id);
  }

  return { problems: ordered, modules: matchedModules };
}

/**
 * Where a milestone stands for one student.
 *
 * A milestone with no `practice` block is a reading or test step we cannot
 * verify, and is reported as untracked rather than as 0%. Claiming to measure
 * whether somebody read the Spring documentation would make the whole number
 * meaningless.
 */
function resolveMilestone(milestone, catalog, solvedSet) {
  const base = {
    id: milestone.id,
    title: milestone.title,
    why: milestone.why || null,
    reading: milestone.reading || [],
    mcq: milestone.mcq || null,
  };

  if (!milestone.practice) {
    return { ...base, tracked: false, status: milestone.mcq ? 'test' : 'reading' };
  }

  const { problems, modules } = poolFor(milestone.practice, catalog);
  const available = problems.length;
  // Never ask for more than this catalog holds, or the milestone can never be
  // finished and the roadmap stalls at 90% forever.
  const target = Math.min(milestone.practice.count ?? available, available);
  const solvedProblems = problems.filter((p) => solvedSet.has(p.id));
  const solved = Math.min(solvedProblems.length, target);
  const unsolved = problems.filter((p) => !solvedSet.has(p.id));

  let status;
  if (target === 0) status = 'unavailable';
  else if (solved >= target) status = 'done';
  else if (solvedProblems.length > 0) status = 'in_progress';
  else status = 'not_started';

  // Where "Continue" should go: the first matching module that still has work
  // left, so the student lands beside the problems rather than on a list.
  const nextModule =
    modules.find((m) => (m.problemIds || []).some((id) => !solvedSet.has(id))) || modules[0] || null;

  return {
    ...base,
    tracked: true,
    status,
    solved,
    target,
    available,
    percent: target > 0 ? Math.round((solved / target) * 100) : 0,
    nextProblems: unsolved.slice(0, 3).map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty })),
    link: nextModule
      ? { kind: 'module', courseId: nextModule.courseId, courseTitle: nextModule.courseTitle, moduleId: nextModule.id, moduleTitle: nextModule.title }
      : (milestone.practice.tags || [])[0]
        ? { kind: 'practice', tag: (milestone.practice.tags || [])[0] }
        : null,
  };
}

/**
 * The whole roadmap for one student. `percent` counts solved problems against
 * targets across every tracked milestone, rather than averaging milestone
 * percentages, so a twenty-problem step counts for more than a two-problem one.
 *
 * `solved` and `target` are the weights behind that percentage, not a count of
 * distinct problems: a problem tagged both "arrays" and "hashing" counts towards
 * both steps, which is correct for weighting and wrong as a headline figure.
 * The UI therefore reports the percentage and the step, never these two as "X of
 * Y problems" — that would contradict the student's own solved list.
 */
function resolveRoadmap(roadmap, catalog, solvedSet, { includeMilestones = true } = {}) {
  const milestones = (roadmap.milestones || []).map((m) => resolveMilestone(m, catalog, solvedSet));
  const tracked = milestones.filter((m) => m.tracked && m.target > 0);

  const solved = tracked.reduce((n, m) => n + m.solved, 0);
  const target = tracked.reduce((n, m) => n + m.target, 0);

  // "You are here": the first step with verifiable work left. Reading steps
  // never complete, so letting one hold the marker would strand every student
  // on "read the Oracle tutorial" forever.
  const current = tracked.find((m) => m.status !== 'done') || null;

  const summary = {
    id: roadmap.id,
    role: roadmap.role,
    tagline: roadmap.tagline || null,
    summary: roadmap.summary || null,
    forWho: roadmap.forWho || null,
    milestoneCount: milestones.length,
    trackedCount: tracked.length,
    doneCount: tracked.filter((m) => m.status === 'done').length,
    solved,
    target,
    percent: target > 0 ? Math.round((solved / target) * 100) : 0,
    currentMilestone: current ? { id: current.id, title: current.title } : null,
    // 1-based position of the current step. Derived here rather than from
    // doneCount, which is wrong the moment somebody finishes steps out of order.
    currentStep: current ? tracked.indexOf(current) + 1 : null,
  };

  return includeMilestones ? { ...summary, milestones } : summary;
}

module.exports = {
  normalizeTerm,
  tagMatches,
  moduleMatches,
  buildCatalog,
  resolveMilestone,
  resolveRoadmap,
};
