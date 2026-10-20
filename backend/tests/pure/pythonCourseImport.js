// The Python course importer's parsing and shaping, on small invented fixtures (the real files are not in the repo).
const fs = require('fs');
const os = require('os');
const path = require('path');
const lib = require('../../scripts/python-course/lib');

const HEADER = lib.COLUMNS.join(',');
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
function csvRow(o) {
  const base = {
    question_id: 'M01-01', title: 'Echo', module: 'Module 01: Basics', difficulty: 'Easy', objective: 'Print it back',
    execution_mode: 'stdin/stdout', time_complexity: 'O(1)', space_complexity: 'O(1)', description: 'Task: echo the line.\n• keep it simple\n• no tricks',
    input_format: 'One line.', output_format: 'The same line.', constraints: '1 <= N',
    sample_input_1: 'hi', sample_input_2: '', sample_output_1: 'hi', sample_output_2: '',
    hint_1: 'a', hint_2: 'b', hint_3: 'c', reference_solution: 'print(input())',
    test_cases: JSON.stringify([{ input: 'hi', output: 'hi', is_hidden: false }, { input: 'yo', output: 'yo', is_hidden: true }, { input: 'x', output: 'x', is_hidden: true }]),
    ...o,
  };
  return lib.COLUMNS.map((c) => q(base[c])).join(',');
}
const issuesOf = () => new lib.Issues();
const build = (o, ctx = {}) => {
  const issues = issuesOf();
  // An optional `lesson` column is appended after the 21 required ones.
  const withLesson = o.lesson !== undefined;
  const rows = lib.parseCsvObjects(`${HEADER}${withLesson ? ',lesson' : ''}\n${csvRow(o)}${withLesson ? `,${q(o.lesson)}` : ''}\n`).records;
  const p = lib.buildProblem(rows[0], { issues, moduleNumber: 1, moduleShort: 'Basics', ...ctx });
  return { p, issues };
};

module.exports = function (s) {
  // ── CSV ──
  const rows = lib.parseCsv('﻿a,b\r\n"x, y","line1\nline2"\r\n"he said ""hi""",\r\n\r\n');
  s.check('csv: BOM, CRLF, commas and newlines inside quotes, doubled quotes, blank trailing line', rows.length === 3 && rows[1][0] === 'x, y' && rows[1][1] === 'line1\nline2' && rows[2][0] === 'he said "hi"' && rows[2][1] === '', JSON.stringify(rows));
  let threw = false;
  try { lib.parseCsv('a,b\n"unclosed,1\n'); } catch { threw = true; }
  s.check('csv: an unclosed quote is an error, not silent data loss', threw);

  // ── ids ──
  const ids = ['M01-01', 'M06-17', 'PY-M08-01', 'PY-M8-01', 'py-m10-15'].map((x) => lib.normaliseQuestionId(x)?.key);
  s.check('ids: both schemes become one key', ids.join() === 'py-m01-01,py-m06-17,py-m08-01,py-m08-01,py-m10-15', ids.join());
  s.check('ids: nonsense is rejected', lib.normaliseQuestionId('Q-1') === null && lib.normaliseQuestionId('') === null);
  s.check('ids: the same key always gives the same uuid; different keys differ', lib.stableId('problem:py-m08-01') === lib.stableId('problem:py-m08-01') && lib.stableId('problem:py-m08-01') !== lib.stableId('problem:py-m08-02'));
  s.check('ids: they are real uuids (the submit route rejects anything else)', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(lib.stableId('x')));

  // ── text ──
  const md = lib.toMarkdown('Task: do it.\nSecond line\n• one\n• two\nAfter');
  s.check('markdown: bullets become a list, plain lines keep their breaks', md === 'Task: do it.  \nSecond line\n\n- one\n- two\n\nAfter', JSON.stringify(md));

  // ── execution modes and starter code ──
  const fn = lib.parseExecutionMode('tiles_needed(l, w, s=1)->int');
  s.check('mode: function name, parameters and return type', fn.kind === 'function' && fn.name === 'tiles_needed' && fn.params === 'l, w, s=1' && fn.returns === 'int');
  s.check('mode: plain and command styles', lib.parseExecutionMode('stdin/stdout').kind === 'stdin' && lib.parseExecutionMode('command-driver').kind === 'commands');
  s.check('mode: garbage is invalid', lib.parseExecutionMode('whatever').kind === 'invalid');
  const stub = lib.starterCode(fn);
  s.check('starter code for a function is a def with the same parameters', stub.startsWith('def tiles_needed(l, w, s=1):') && /pass/.test(stub));

  // ── test cases ──
  let r = build({});
  s.check('a plain problem: 1 visible, 2 hidden, in that order', r.p.testCases.map((t) => t.isPublic).join() === 'true,false,false' && r.issues.errors.length === 0 && r.issues.warnings.length === 0, JSON.stringify(r.issues));

  r = build({ sample_input_2: 'yo', sample_output_2: 'yo' });
  s.check('a sample the file marks hidden is made visible, with a note', r.p.testCases.filter((t) => t.isPublic).length === 2 && r.issues.warnings.some((w) => /marked hidden/.test(w.msg)));

  r = build({ sample_input_2: 'zz', sample_output_2: 'ZZ' });
  s.check('a sample that is not among the tests is added as a visible test, with a note', r.p.testCases.some((t) => t.isPublic && t.input === 'zz') && r.issues.warnings.some((w) => /not among/.test(w.msg)));

  r = build({ sample_input_2: '', sample_output_2: 'yo' });
  s.check('a blank sample input is matched to the one test with that output (the PY-M17-18 case)', r.p.testCases.filter((t) => t.isPublic).length === 2 && r.p.testCases.find((t) => t.input === 'yo').isPublic && r.issues.warnings.some((w) => /no input/.test(w.msg)), JSON.stringify(r.issues.warnings));

  r = build({ test_cases: JSON.stringify([{ input: 'a', output: 'a', is_hidden: true }, { input: 'b', output: 'b', is_hidden: true }]), sample_input_1: '', sample_output_1: '' });
  s.check('no visible test at all: the first is made visible', r.p.testCases[0].isPublic && !r.p.testCases[1].isPublic && r.issues.warnings.some((w) => /no visible test/.test(w.msg)));

  r = build({ test_cases: JSON.stringify([{ input: 'a', output: 'a', is_hidden: false }]) });
  s.check('no hidden test is an error', r.issues.errors.some((e) => /no hidden test/.test(e.msg)));

  r = build({ test_cases: '[{bad json' });
  s.check('invalid JSON in test_cases is an error', r.issues.errors.some((e) => /not valid JSON/.test(e.msg)));

  r = build({ test_cases: JSON.stringify([{ input: '', output: 'Hello', is_hidden: false }, { input: '', output: 'Hello', is_hidden: true }]), sample_input_1: '', sample_output_1: '' });
  s.check('print-only problems (empty input) are fine', r.issues.errors.length === 0 && r.p.testCases.every((t) => t.input === ''));

  // ── problem fields ──
  r = build({ difficulty: 'Medium', question_id: 'PY-M8-03' });
  const d = r.p.data;
  s.check('difficulty is lower-cased; tags carry the course and module for topic mastery', d.difficulty === 'medium' && d.tags.join() === 'python,Basics');
  s.check('exact comparison, Python 3.12 only, draft-safe flags, and the original id kept', d.comparison === 'exact' && d.languages.join() === '100' && d.importId === 'PY-M8-03' && d.importKey === lib.COURSE_KEY);
  s.check('hints, objective, complexity and the reference solution are kept for the learning panel', d.hints.length === 3 && d.objective === 'Print it back' && d.complexity.time === 'O(1)' && d.referenceSolution === 'print(input())\n');
  s.check('a plain problem has no harness; the stub is for language 100', d.harness === null && typeof d.stubs['100'] === 'string');

  r = build({ question_id: 'M06-01', execution_mode: 'double(x)->int', reference_solution: 'def double(x):\n    return x * 2' });
  s.check('a function problem carries a driver for language 100 that names its function', r.p.data.harness && /double\(/.test(r.p.data.harness['100']));
  r = build({ question_id: 'M06-01', execution_mode: 'double(x)->int', reference_solution: 'def triple(x):\n    return x * 3' });
  s.check('a function problem whose solution lacks the function is an error', r.issues.errors.some((e) => /does not define double/.test(e.msg)));
  r = build({ difficulty: 'Extreme' });
  s.check('an unknown difficulty is an error', r.issues.errors.some((e) => /difficulty/.test(e.msg)));
  r = build({ hint_3: '' });
  s.check('a missing hint is a note, not an error', r.issues.errors.length === 0 && r.issues.warnings.some((w) => /2 of 3 hints/.test(w.msg)));

  // ── lessons ──
  r = build({ lesson: 'Python is **interpreted**.' });
  s.check('a lesson column becomes the problem lesson', r.p.data.lesson === 'Python is **interpreted**.');
  r = build({});
  s.check('no lesson is null, not an empty string', r.p.data.lesson === null);
  r = build({ lesson: 'x'.repeat(8001) });
  s.check('an over-long lesson is an error', r.issues.errors.some((e) => /lesson is 8001/.test(e.msg)));

  // ── a whole folder ──
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyc-'));
  fs.writeFileSync(path.join(dir, 'm1.csv'), `${HEADER}\n${csvRow({})}\n${csvRow({ question_id: 'M01-02', title: 'Echo two' })}\n`);
  fs.writeFileSync(path.join(dir, 'm2.csv'), `${HEADER}\n${csvRow({ question_id: 'PY-M2-01', title: 'Next', module: 'Module 02: More' })}\n`);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
  const course = lib.loadCourse(dir);
  const sum = lib.summarise(course);
  s.check('folder: two modules in numeric order, three problems, no errors', course.modules.map((m) => m.number).join() === '1,2' && sum.problems === 3 && course.issues.errors.length === 0, JSON.stringify(course.issues));
  s.check('folder: module short name drops the "Module NN:" prefix', course.modules[1].short === 'More');
  s.check('folder: ids line up between runs (stable)', lib.loadCourse(dir).modules[0].problems[0].id === course.modules[0].problems[0].id);
  fs.writeFileSync(path.join(dir, 'm3.csv'), `${HEADER}\n${csvRow({ question_id: 'M03-01' })}\n${csvRow({ question_id: 'M03-01', title: 'Dup' })}\n`);
  s.check('folder: a duplicate question id is an error', lib.loadCourse(dir).issues.errors.some((e) => /duplicates/.test(e.msg)));
  fs.writeFileSync(path.join(dir, 'm4.csv'), 'question_id,title\nM04-01,x\n');
  s.check('folder: a file with missing columns is an error', lib.loadCourse(dir).issues.errors.some((e) => /missing column/.test(e.msg)));
  fs.writeFileSync(path.join(dir, 'lessons.csv'), 'question_id,lesson\nM01-02,"Teach **this**"\nPY-M2-01,"And that"\nM09-99,"orphan"\n');
  const withLessons = lib.loadCourse(dir);
  const byKey = Object.fromEntries(withLessons.modules.flatMap((m) => m.problems).map((p) => [p.key, p.data.lesson]));
  s.check('lessons.csv attaches by normalised id (M01-02 and PY-M2-01)', byKey['py-m01-02'] === 'Teach **this**' && byKey['py-m02-01'] === 'And that' && byKey['py-m01-01'] === null, JSON.stringify(byKey));
  s.check('a lesson for an unknown question is a note, not an error', withLessons.issues.warnings.some((w) => /py-m09-99/.test(w.msg)) && !withLessons.issues.errors.some((e) => /lessons\.csv/.test(e.msg)));
  fs.writeFileSync(path.join(dir, 'lessons.csv'), 'id,text\n1,2\n');
  s.check('lessons.csv without the right columns is an error', lib.loadCourse(dir).issues.errors.some((e) => /lessons\.csv needs/.test(e.msg)));
  fs.rmSync(dir, { recursive: true, force: true });
};
