// What a faculty member may see through the academic structure (utils/academic.js visibleClasses), for the ACTIVE term.
//
// A faculty member sees the students of: classes they are class teacher of, classes they currently teach (an assignment with dates),
// classes where they are a sub-mentor (only their own range of students), and classes an approved, unexpired access request gave them.
// Held for a minute per person (a change by the HOD shows within a minute).
const academicRepo = require('../repositories/academicRepository');
const academic = require('../utils/academic');
const { cached } = require('../utils/cache');

const TTL_SECONDS = 60;

async function compute(facultyId, at) {
  const term = await academicRepo.getActiveTerm();
  if (!term) return { term: null, classes: [], studentIds: [] };
  const [byStaff, assignmentsAll, grantsAll] = await Promise.all([
    academicRepo.listClassesByStaff(facultyId), academicRepo.listAssignments({ facultyId }), academicRepo.listRequests({ facultyId, status: 'approved' }),
  ]);
  const assignments = assignmentsAll.filter((a) => a.termId === term.id);
  const grants = grantsAll.filter((g) => g.termId === term.id);
  const byId = new Map(byStaff.filter((c) => c.termId === term.id).map((c) => [c.id, c]));
  for (const id of new Set([...assignments.map((a) => a.classId), ...grants.map((g) => g.classId)])) {
    if (!byId.has(id)) { const c = await academicRepo.getClass(id); if (c && c.termId === term.id) byId.set(id, c); }
  }
  const classes = [...byId.values()];
  const visible = academic.visibleClasses(facultyId, { classes, assignments, grants, at });
  const memberships = [];
  for (const classId of visible.keys()) {
    for (const e of await academicRepo.listEnrollmentsForClass(classId)) memberships.push({ classId, studentId: e.studentId, position: e.position ?? null });
  }
  const studentIds = academic.studentIdsFor(facultyId, visible, memberships, byId);
  const counts = new Map();
  for (const m of memberships) counts.set(m.classId, (counts.get(m.classId) || 0) + 1);
  return {
    term: { id: term.id, label: term.label },
    classes: [...visible.entries()].map(([id, v]) => ({
      id, label: academic.classLabel(byId.get(id)), department: byId.get(id).department, via: v.via, mentees: v.mentees,
      subjects: assignments.filter((a) => a.classId === id && academic.isActive(a, at)).map((a) => a.subject), students: counts.get(id) || 0,
    })).sort((a, b) => a.label.localeCompare(b.label)),
    studentIds: [...studentIds],
  };
}

/** @returns {Promise<{term: object|null, classes: object[], studentIds: string[]}>} term is null when no term is active (callers then keep the old behaviour) */
async function facultyScope(facultyId, at = Date.now()) {
  return cached(`academic:scope:v1:${facultyId}`, TTL_SECONDS, () => compute(facultyId, at));
}

module.exports = { facultyScope, TTL_SECONDS };
