// Output comparison, the function-problem driver, and who may see a problem's solution.
const { spawnSync } = require('child_process');
const { outputsMatch, normalizeExact, normalizeLoose } = require('../../src/utils/outputCompare');
const { buildSource, pythonFunctionHarness } = require('../../src/utils/sourceBuilder');
const { learningView } = require('../../src/utils/problemLearning');

// Python on Windows writes CRLF; CI (Linux) writes LF. Compare on LF.
const lf = (t) => String(t).replace(/\r/g, '');

module.exports = function (s) {
  // ── exact comparison: only the invisible differences are forgiven ──
  const ex = (a, b) => outputsMatch(a, b, 'exact');
  s.check('exact: identical output matches', ex('Hello\nWorld\n', 'Hello\nWorld\n'));
  s.check('exact: CRLF line endings match LF', ex('a\r\nb\r\n', 'a\nb\n'));
  s.check('exact: trailing spaces on a line are forgiven', ex('a  \nb\t\n', 'a\nb\n'));
  s.check('exact: blank lines at the end are forgiven', ex('a\nb\n\n\n', 'a\nb'));
  s.check('exact: a missing final newline is forgiven', ex('a\nb', 'a\nb\n'));
  s.check('exact: everything on one line does NOT match several lines', !ex('1 2 3', '1\n2\n3'));
  s.check('exact: a mis-centred banner does NOT match (leading spaces count)', !ex('  ***\n', '   ***\n'));
  s.check('exact: inner spacing counts', !ex('a  b', 'a b'));
  s.check('exact: a blank line in the middle counts', !ex('a\n\nb', 'a\nb'));
  s.check('exact: case counts', !ex('yes', 'Yes'));
  s.check('exact: quotes, commas and brackets count', !ex("['a', 'b']", 'a b') && !ex('1,2', '1 2'));
  s.check('exact: empty output matches empty, not text', ex('', '') && ex('\n', '') && !ex('', 'x'));
  s.check('exact: a null output is treated as empty', ex(null, ''));

  const big = Array.from({ length: 800 }, (_, i) => `line ${i} ${'x'.repeat(10)}`).join('\n'); // ~15 KB like M05-02
  s.check('exact: a 15 KB output is compared in full', ex(big, big) && big.length > 12000);
  s.check('exact: a difference after 4,096 characters is caught (the loose mode cannot see it)', !ex(big, `${big}\nextra`) && !ex(big, big.replace('line 799', 'line 798')));
  s.check('loose (the existing behaviour): the same late difference is invisible past 4,096 characters', outputsMatch(`${'a '.repeat(3000)}X`, `${'a '.repeat(3000)}Y`, 'loose'));

  // ── loose comparison is untouched for every other problem ──
  const lo = (a, b) => outputsMatch(a, b, undefined);
  s.check('loose: default mode still ignores line breaks, commas, quotes and brackets', lo('[1, 2, 3]', '1\n2\n3') && lo('"a","b"', 'a b'));
  s.check('loose: still tells different answers apart', !lo('1 2 3', '1 2 4'));
  s.check('loose normaliser still empty-safe', normalizeLoose(null) === '' && normalizeExact(undefined) === '');

  // ── building the program that Judge0 runs ──
  s.check('no harness: the student code is the program', buildSource('print(1)', 100, null) === 'print(1)' && buildSource('print(1)', 100, {}) === 'print(1)');
  s.check('a harness for another language is not applied', buildSource('print(1)', 71, { 100: 'X' }) === 'print(1)');
  const harness = pythonFunctionHarness('double');
  const src = buildSource('def double(x):\n    return x * 2\n\n\n', 100, { 100: harness });
  s.check('harness goes after the student code, so their line numbers are untouched', src.startsWith('def double(x):\n    return x * 2\n') && src.indexOf('CodeMentor test driver') > src.indexOf('return x * 2'));
  let rejected = false;
  try { pythonFunctionHarness('os.system("x")'); } catch { rejected = true; }
  s.check('a function name that is not an identifier is refused', rejected);

  // ── run the driver for real with Python, when Python is installed (skipped silently on a box without it) ──
  const py = ['python', 'python3', 'py'].map((c) => spawnSync(c, ['-c', 'print(1)'], { encoding: 'utf8' })).find((r) => r.status === 0);
  const pyCmd = py ? ['python', 'python3', 'py'].find((c) => spawnSync(c, ['-c', 'print(1)'], { encoding: 'utf8' }).status === 0) : null;
  if (pyCmd) {
    const code = [
      'def calc(a, b=2):',
      '    if b == 0:',
      '        raise ZeroDivisionError("no")',
      '    if not isinstance(a, int):',
      '        raise TypeError("int only")',
      '    return a / b',
    ].join('\n');
    const prog = buildSource(code, 100, { 100: pythonFunctionHarness('calc') });
    const run = spawnSync(pyCmd, ['-I', '-c', prog], { input: '10\n9, 3\n\n10, 0\n"x"\n', encoding: 'utf8' });
    s.check('driver: repr of each result, one line per call, blank lines skipped', lf(run.stdout) === '5.0\n3.0\nZeroDivisionError\nTypeError\n', JSON.stringify(run.stdout));
    const missing = spawnSync(pyCmd, ['-I', '-c', buildSource('x = 1', 100, { 100: pythonFunctionHarness('calc') })], { input: '1\n', encoding: 'utf8' });
    s.check('driver: a missing function reads as NameError, not a crash', lf(missing.stdout) === 'NameError\n', JSON.stringify(missing.stdout));
    const syntax = spawnSync(pyCmd, ['-I', '-c', buildSource('def calc(:', 100, { 100: pythonFunctionHarness('calc') })], { input: '1\n', encoding: 'utf8' });
    s.check('driver: a student syntax error still reports against their own line 1', /line 1/.test(syntax.stderr), syntax.stderr.slice(-120));
  }

  // ── teaching material: answers only after solving ──
  const p = { objective: 'Practise loops', hints: ['h1', ' ', 'h2', 7, 'h3'], complexity: { time: 'O(N)', space: 'O(1)' }, referenceSolution: 'print(1)' };
  const student = learningView(p, { solved: false, role: 'student' });
  s.check('student, unsolved: objective and hints yes, answer and complexity no', student.objective === 'Practise loops' && student.hints.join() === 'h1,h2,h3' && student.reference_solution === null && student.complexity === null && student.unlocked === false);
  s.check('student, unsolved: told that a solution exists without receiving it', student.has_solution === true && student.has_complexity === true);
  const solved = learningView(p, { solved: true, role: 'student' });
  s.check('student, solved: reference solution and complexity unlock', solved.reference_solution === 'print(1)' && solved.complexity.time === 'O(N)' && solved.unlocked);
  s.check('faculty, hod and admin always see them', ['faculty', 'hod', 'admin'].every((role) => learningView(p, { solved: false, role }).reference_solution === 'print(1)'));
  const bare = learningView({}, { solved: true, role: 'student' });
  s.check('a problem with no teaching material gives empty, safe values', bare.hints.length === 0 && bare.reference_solution === null && bare.complexity === null && bare.objective === null);
  s.check('an empty complexity object is treated as none', learningView({ complexity: { time: '', space: '' } }, { solved: true }).complexity === null);
};
