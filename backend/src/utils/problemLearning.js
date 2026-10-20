// What a problem's teaching material looks like to one viewer.
//
// Objective and hints are for working through the problem, so they are always available. The reference
// solution and the complexity analysis give the answer away, so a student gets them only once they have an
// accepted submission of their own; faculty, HOD and admin always see them.

const STAFF_ROLES = new Set(['faculty', 'hod', 'admin']);

const cleanHints = (hints) => (Array.isArray(hints) ? hints.filter((h) => typeof h === 'string' && h.trim()) : []);

function learningView(problem, { solved, role } = {}) {
  const hints = cleanHints(problem?.hints);
  const complexity = problem?.complexity && (problem.complexity.time || problem.complexity.space) ? problem.complexity : null;
  const unlocked = !!solved || STAFF_ROLES.has(role);
  const hasSolution = !!problem?.referenceSolution;
  return {
    objective: problem?.objective || null,
    hints,
    solved: !!solved,
    unlocked,
    // Present only when the viewer may see them, so the response never carries an answer a student has not earned.
    complexity: unlocked ? complexity : null,
    reference_solution: unlocked && hasSolution ? problem.referenceSolution : null,
    has_solution: hasSolution,
    has_complexity: !!complexity,
  };
}

module.exports = { learningView, STAFF_ROLES };
