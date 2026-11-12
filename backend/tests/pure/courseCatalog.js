// The shared course catalogue: JSON-safe, dates normalised, and the course/progress rules give the same answers
// from the slim catalogue as from full problem documents.
const { buildCatalog } = require('../../src/utils/courseCatalog');
const { resolveCourse } = require('../../src/utils/courseProgress');

module.exports = function (s) {
  const ts = (iso) => ({ toDate: () => new Date(iso) }); // stands in for a Firestore Timestamp
  const courses = [{ id: 'c1', title: 'Python', description: 'Learn' }, { id: 'c2', title: 'Java' }];
  const modulesByCourse = [
    [
      { id: 'm1', title: 'Basics', dueAt: ts('2026-12-01T00:00:00Z'), opensAt: null, problemIds: ['p1', 'p2', 'gone'] },
      { id: 'm2', title: 'Loops', problemIds: ['p2', 'p3'] }, // p2 shared with m1
    ],
    [{ id: 'm3', title: 'OOP', problemIds: ['p4'] }],
  ];
  const full = (id, extra = {}) => ({ id, title: `T${id}`, difficulty: 'Easy', tags: ['a'], description: 'x'.repeat(500), lesson: 'y'.repeat(500), ...extra });
  const problemsById = new Map([['p1', full('p1')], ['p2', full('p2')], ['p3', full('p3', { status: 'draft' })], ['p4', full('p4')]]);

  const catalog = buildCatalog(courses, modulesByCourse, problemsById);
  s.check('the catalogue survives JSON (Redis)', JSON.stringify(JSON.parse(JSON.stringify(catalog))) === JSON.stringify(catalog));
  s.check('a Timestamp due date becomes an ISO string', catalog.courses[0].modules[0].dueAt === '2026-12-01T00:00:00.000Z');
  s.check('a missing date stays null', catalog.courses[0].modules[0].opensAt === null && catalog.courses[0].modules[1].dueAt === null);
  s.check('only the small problem fields are kept (no statement or lesson)', Object.keys(catalog.problems.p1).sort().join() === 'difficulty,id,status,tags,title');
  s.check('a deleted problem is simply absent', catalog.problems.gone === undefined);
  s.check('a problem used by two modules is stored once (p1-p4, not the deleted one)', Object.keys(catalog.problems).length === 4);

  // The same answer as with the full documents.
  const slim = new Map(Object.entries(catalog.problems));
  const fromFull = resolveCourse(modulesByCourse[0], problemsById);
  const fromSlim = resolveCourse(catalog.courses[0].modules, slim);
  s.check('required problems per module are identical from the slim catalogue', JSON.stringify(fromFull.units.map((u) => u.problemIds)) === JSON.stringify(fromSlim.units.map((u) => u.problemIds)));
  s.check('the course total counts p2 once and skips the draft and deleted ones', fromSlim.problems.size === 2 && fromSlim.skipped.draft === 1 && fromSlim.skipped.deleted === 1);
};
