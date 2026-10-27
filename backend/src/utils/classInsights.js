// What a teacher can act on, worked out from the analytics snapshot of ONE scope (a class, or everything the person may see).
// Pure: no database. The lists are short on purpose; each carries its full count.
//
//   notStarted  students with no submission at all
//   quiet       students who did submit before, but not in the last 7 days
//   stuck       students with 4 or more attempts on a problem they have not solved
//   hardest     problems that most of the students who tried did not solve
const DAY = 86400000;
const QUIET_DAYS = 7;
const LIST_LIMIT = 25;
const HARD_MIN_ATTEMPTERS = 3;
const HARD_MAX_SOLVE_RATE = 40;

const person = (s) => ({ id: s.id, name: s.name, rollNo: s.rollNo || null, section: s.section || null });

function classInsights(snapshot, now = Date.now()) {
  const stats = snapshot?.studentStats || [];
  const problems = snapshot?.problemStats || [];

  const notStarted = stats.filter((s) => !s.subs);
  const quiet = stats
    .filter((s) => s.subs > 0 && (!s.lastActiveMs || now - s.lastActiveMs > QUIET_DAYS * DAY))
    .sort((a, b) => (a.lastActiveMs ?? 0) - (b.lastActiveMs ?? 0));
  const stuck = stats
    .filter((s) => (s.stuck || []).length > 0)
    .sort((a, b) => (b.stuck[0]?.attempts ?? 0) - (a.stuck[0]?.attempts ?? 0));
  const hardest = problems
    .filter((p) => p.attempters >= HARD_MIN_ATTEMPTERS && p.solveRate < HARD_MAX_SOLVE_RATE)
    .sort((a, b) => a.solveRate - b.solveRate || b.attempters - a.attempters);

  return {
    students: snapshot?.totalStudents ?? stats.length,
    notStarted: { total: notStarted.length, items: notStarted.slice(0, LIST_LIMIT).map(person) },
    quiet: { total: quiet.length, items: quiet.slice(0, LIST_LIMIT).map((s) => ({ ...person(s), daysQuiet: s.lastActiveMs ? Math.floor((now - s.lastActiveMs) / DAY) : null })) },
    stuck: { total: stuck.length, items: stuck.slice(0, LIST_LIMIT).map((s) => ({ ...person(s), problems: s.stuck })) },
    hardest: { total: hardest.length, items: hardest.slice(0, 5).map((p) => ({ id: p.id, title: p.title, difficulty: p.difficulty, attempters: p.attempters, solvers: p.solvers, solveRate: p.solveRate })) },
  };
}

module.exports = { classInsights, QUIET_DAYS, LIST_LIMIT, HARD_MIN_ATTEMPTERS, HARD_MAX_SOLVE_RATE };
