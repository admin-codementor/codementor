// Python course import: parsing, validation and shaping. Pure — no database, no network, no Python — so it can
// be unit-tested and dry-run on any machine.
//
// The course arrives as 18 CSV files (m1.csv .. m18.csv), one per module. One row is one problem:
//   question_id, title, module, difficulty, objective, execution_mode, time_complexity, space_complexity,
//   description, input_format, output_format, constraints, sample_input_1/2, sample_output_1/2,
//   hint_1/2/3, reference_solution, test_cases (a JSON array of {input, output, is_hidden})
//
// The CSV files themselves are NOT in this repository: the repository is public, and the files hold every
// reference solution and every hidden test. Keep them outside it and pass the folder with --dir.
const fs = require('fs');
const path = require('path');
const { v5: uuidv5 } = require('uuid');
const { outputsMatch } = require('../../src/utils/outputCompare');
const { pythonFunctionHarness } = require('../../src/utils/sourceBuilder');

const COURSE_KEY = 'python-course-v1';
// Fixed namespace: the same question id always maps to the same document id, so a re-run updates instead of
// duplicating. (Ids must be real UUIDs — the submit route rejects anything else.)
const NAMESPACE = '6f1c2a84-5b0e-4c1a-9a53-7d3e2b9c0f11';
const PYTHON_LANGUAGE_ID = 100; // Judge0: Python 3.12.5

const COLUMNS = [
  'question_id', 'title', 'module', 'difficulty', 'objective', 'execution_mode', 'time_complexity', 'space_complexity',
  'description', 'input_format', 'output_format', 'constraints', 'sample_input_1', 'sample_input_2', 'sample_output_1',
  'sample_output_2', 'hint_1', 'hint_2', 'hint_3', 'reference_solution', 'test_cases',
];
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const MAX_DESCRIPTION = 20000;

const stableId = (key) => uuidv5(`${COURSE_KEY}:${key}`, NAMESPACE);

// ── CSV (RFC 4180: quoted fields, doubled quotes, newlines inside quotes, BOM) ──
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (inQuotes) throw new Error('A quoted field is never closed (the file is cut off or has a stray quote).');
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  return rows;
}

function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r, i) => {
    const o = { _line: i + 2 };
    header.forEach((h, k) => { o[h] = r[k] ?? ''; });
    o._cells = r.length;
    return o;
  });
  return { header, records };
}

// ── ids ──
// M01-01 (modules 1-7) and PY-M8-01 / PY-M08-01 (modules 8-18) are the same scheme written two ways.
function normaliseQuestionId(raw) {
  const m = /^\s*(?:PY-)?M(\d{1,2})-(\d{1,2})\s*$/i.exec(String(raw || ''));
  if (!m) return null;
  const mod = Number(m[1]);
  const n = Number(m[2]);
  return { module: mod, n, key: `py-m${String(mod).padStart(2, '0')}-${String(n).padStart(2, '0')}` };
}

// ── text ──
const BULLET = /^\s*[•·▪‣◦]\s*/;

// The CSV uses "•" bullets and single newlines. Markdown needs "- " for lists and two trailing spaces for a
// line break inside a paragraph, otherwise the statement collapses into one block.
function toMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const out = [];
  let prevBullet = false;
  lines.forEach((l, i) => {
    const bullet = BULLET.test(l);
    if (bullet) {
      if (!prevBullet && out.length && out[out.length - 1] !== '') out.push('');
      out.push(`- ${l.replace(BULLET, '')}`);
    } else if (l === '') {
      out.push('');
    } else {
      if (prevBullet) out.push('');
      const next = lines[i + 1];
      out.push(next !== undefined && next !== '' && !BULLET.test(next) ? `${l}  ` : l);
    }
    prevBullet = bullet;
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildDescription(row) {
  const parts = [toMarkdown(row.description)];
  if (row.input_format.trim()) parts.push(`### Input\n\n${toMarkdown(row.input_format)}`);
  if (row.output_format.trim()) parts.push(`### Output\n\n${toMarkdown(row.output_format)}`);
  if (row.constraints.trim()) parts.push(`### Constraints\n\n${toMarkdown(row.constraints)}`);
  return parts.join('\n\n');
}

// ── execution mode ──
// "stdin/stdout"            a plain program
// "command-driver"          a plain program that reads a list of commands (the student writes the loop too)
// "name(a, b=1)->int"       a function; the platform calls it once per input line
function parseExecutionMode(raw) {
  const mode = String(raw || '').trim();
  if (mode === 'stdin/stdout') return { kind: 'stdin' };
  if (mode === 'command-driver') return { kind: 'commands' };
  const [sig, ...ret] = mode.split('->');
  const m = /^\s*([A-Za-z_]\w*)\s*\((.*)\)\s*$/.exec(sig);
  if (!m) return { kind: 'invalid', raw: mode };
  return { kind: 'function', name: m[1], params: m[2].trim(), returns: ret.join('->').trim() || null };
}

function starterCode(mode) {
  if (mode.kind === 'function') {
    return [
      `def ${mode.name}(${mode.params}):`,
      `    # Write your solution here${mode.returns ? ` (returns ${mode.returns})` : ''}.`,
      '    # Do not read input or print: the platform calls this function for you.',
      '    pass',
      '',
    ].join('\n');
  }
  if (mode.kind === 'commands') {
    return [
      '# Write the class first.',
      '# Then read the commands from the input and print one line for each, as the problem describes.',
      '',
    ].join('\n');
  }
  return [
    '# Write your solution here.',
    '# Read the input with input() and print the answer with print().',
    '',
  ].join('\n');
}

// ── test cases ──
const trimEnds = (s) => String(s ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
const sameInput = (a, b) => trimEnds(a) === trimEnds(b);

// Visible tests are the samples first, then the other visible tests; hidden tests follow. A sample that the
// file marks hidden is shown (the statement already prints it); a sample missing from the tests is added.
function buildTests(row, issues) {
  let raw;
  try { raw = JSON.parse(row.test_cases); } catch (e) {
    issues.error(row, `test_cases is not valid JSON (${e.message})`);
    return [];
  }
  if (!Array.isArray(raw) || !raw.length) { issues.error(row, 'test_cases is empty'); return []; }
  const tests = [];
  raw.forEach((t, i) => {
    if (!t || typeof t.input !== 'string' || typeof t.output !== 'string') { issues.error(row, `test ${i + 1}: input and output must be text`); return; }
    if (typeof t.is_hidden !== 'boolean') issues.warn(row, `test ${i + 1}: is_hidden is not true/false, treated as hidden`);
    tests.push({ input: t.input, output: t.output, hidden: t.is_hidden !== false, source: 'csv' });
  });

  const samples = [1, 2]
    .map((k) => ({ k, input: row[`sample_input_${k}`], output: row[`sample_output_${k}`] }))
    .filter((s) => s.input.trim() !== '' || s.output.trim() !== '');
  const sampleIdx = [];
  for (const s of samples) {
    let at = tests.findIndex((t) => sameInput(t.input, s.input) && outputsMatch(t.output, s.output, 'exact'));
    if (at === -1 && s.input.trim() === '' && s.output.trim() !== '') {
      // A blank sample input next to a real output is a cell lost in the CSV (PY-M17-18): the sample is the
      // test whose output it is, provided exactly one test has it.
      const byOutput = tests.map((t, i) => (outputsMatch(t.output, s.output, 'exact') ? i : -1)).filter((i) => i >= 0);
      if (byOutput.length === 1) {
        at = byOutput[0];
        issues.warn(row, `sample ${s.k} has no input in the file; matched it to the test with the same output (input ${JSON.stringify(tests[at].input.slice(0, 40))})`);
      }
    }
    if (at === -1) {
      tests.push({ input: s.input, output: s.output, hidden: false, source: 'sample' });
      at = tests.length - 1;
      issues.warn(row, `sample ${s.k} is not among the test cases; added it as a visible test`);
    } else if (tests[at].hidden) {
      tests[at].hidden = false;
      issues.warn(row, `sample ${s.k} was marked hidden; made it visible, as the statement shows it`);
    }
    if (!sampleIdx.includes(at)) sampleIdx.push(at);
  }

  let ordered = [
    ...sampleIdx.map((i) => tests[i]),
    ...tests.filter((t, i) => !t.hidden && !sampleIdx.includes(i)),
    ...tests.filter((t) => t.hidden),
  ];
  if (!ordered.some((t) => !t.hidden) && ordered.length) {
    ordered[0].hidden = false;
    issues.warn(row, 'no visible test; made the first one visible so Run has something to check');
    ordered = [ordered[0], ...ordered.slice(1)];
  }
  if (!ordered.some((t) => t.hidden)) issues.error(row, 'no hidden test (students could pass by reading the examples)');
  return ordered.map((t) => ({ input: t.input, output: t.output, isPublic: !t.hidden, score: 0 }));
}

// ── one row -> one problem ──
function buildProblem(row, ctx) {
  const { issues, moduleNumber, moduleShort } = ctx;
  const id = normaliseQuestionId(row.question_id);
  if (!id) { issues.error(row, `question_id "${row.question_id}" is not like M01-01 or PY-M08-01`); return null; }
  if (id.module !== moduleNumber) issues.warn(row, `question_id says module ${id.module} but the file is module ${moduleNumber}`);

  const title = row.title.trim();
  if (!title) issues.error(row, 'title is empty');
  if (title.length > 200) issues.error(row, 'title is longer than 200 characters');
  const difficulty = row.difficulty.trim().toLowerCase();
  if (!DIFFICULTIES.has(difficulty)) issues.error(row, `difficulty "${row.difficulty}" is not Easy, Medium or Hard`);
  if (!row.description.trim()) issues.error(row, 'description is empty');
  if (!row.reference_solution.trim()) issues.error(row, 'reference_solution is empty');

  const mode = parseExecutionMode(row.execution_mode);
  if (mode.kind === 'invalid') issues.error(row, `execution_mode "${mode.raw}" is not stdin/stdout, command-driver or a function signature`);
  if (mode.kind === 'function' && !new RegExp(`^\\s*def\\s+${mode.name}\\s*\\(`, 'm').test(row.reference_solution)) {
    issues.error(row, `the reference solution does not define ${mode.name}()`);
  }

  const hints = [row.hint_1, row.hint_2, row.hint_3].map((h) => h.trim()).filter(Boolean);
  if (hints.length < 3) issues.warn(row, `only ${hints.length} of 3 hints`);
  const complexity = { time: row.time_complexity.trim(), space: row.space_complexity.trim() };
  if (!complexity.time || !complexity.space) issues.warn(row, 'time or space complexity is empty');

  const description = buildDescription(row);
  if (description.length > MAX_DESCRIPTION) issues.error(row, `assembled description is ${description.length} characters (limit ${MAX_DESCRIPTION})`);

  const testCases = buildTests(row, issues);

  const harness = mode.kind === 'function' ? { [PYTHON_LANGUAGE_ID]: pythonFunctionHarness(mode.name) } : null;
  const data = {
    title,
    description,
    difficulty,
    tags: ['python', moduleShort],
    stubs: { [PYTHON_LANGUAGE_ID]: starterCode(mode) },
    scoringMode: 'acm',
    maxScore: 100,
    timeLimit: 2, // seconds, as the faculty editor stores it; the problem page now reads both units
    memoryLimit: 256,
    languages: [PYTHON_LANGUAGE_ID],
    comparison: 'exact',
    harness,
    objective: row.objective.trim(),
    hints,
    complexity,
    referenceSolution: row.reference_solution.replace(/\r\n?/g, '\n').replace(/\s+$/, '') + '\n',
    executionMode: mode.kind === 'function' ? row.execution_mode.trim() : mode.kind === 'commands' ? 'command-driver' : 'stdin/stdout',
    usesChecker: false,
    checkerCode: null,
    checkerLanguageId: null,
    editorial: null,
    editorialVisibleAt: null,
    importKey: COURSE_KEY,
    importId: row.question_id.trim(),
  };
  return { id: stableId(`problem:${id.key}`), key: id.key, sourceId: row.question_id.trim(), module: moduleNumber, mode, data, testCases, row };
}

// ── whole folder ──
class Issues {
  constructor() { this.errors = []; this.warnings = []; }
  error(row, msg) { this.errors.push({ id: row?.question_id || '(file)', line: row?._line, msg }); }
  warn(row, msg) { this.warnings.push({ id: row?.question_id || '(file)', line: row?._line, msg }); }
}

const shortModuleName = (title) => title.replace(/^\s*Module\s+\d+\s*:\s*/i, '').trim();

function loadCourse(dir) {
  const issues = new Issues();
  const files = fs.readdirSync(dir)
    .map((f) => ({ f, m: /^m(\d+)\.csv$/i.exec(f) }))
    .filter((x) => x.m)
    .map((x) => ({ file: x.f, number: Number(x.m[1]) }))
    .sort((a, b) => a.number - b.number);
  if (!files.length) throw new Error(`No m1.csv ... m18.csv files found in ${dir}`);

  const modules = [];
  const seen = new Map();
  const seenTitles = new Map();
  for (const { file, number } of files) {
    const { header, records } = parseCsvObjects(fs.readFileSync(path.join(dir, file), 'utf8'));
    const missing = COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) { issues.error(null, `${file}: missing column(s) ${missing.join(', ')}`); continue; }
    const titles = [...new Set(records.map((r) => r.module.trim()))];
    if (titles.length !== 1) issues.error(null, `${file}: the module column holds ${titles.length} different titles`);
    const moduleTitle = titles[0] || `Module ${number}`;
    const moduleShort = shortModuleName(moduleTitle);
    const problems = [];
    for (const row of records) {
      if (row._cells !== header.length) issues.error(row, `has ${row._cells} columns, expected ${header.length}`);
      const p = buildProblem(row, { issues, moduleNumber: number, moduleShort });
      if (!p) continue;
      if (seen.has(p.key)) issues.error(row, `duplicates ${seen.get(p.key)} (both become ${p.key})`);
      seen.set(p.key, row.question_id);
      const t = p.data.title.toLowerCase();
      if (seenTitles.has(t)) issues.warn(row, `same title as ${seenTitles.get(t)}`);
      seenTitles.set(t, row.question_id);
      problems.push(p);
    }
    modules.push({
      number, file, title: moduleTitle, short: moduleShort, problems,
      id: stableId(`module:${number}`),
    });
  }
  return { modules, issues };
}

const COURSE = {
  id: stableId('course'),
  title: 'Python Programming: From Basics to Algorithms',
  description: 'Eighteen modules, from your first print() to dynamic programming: practise every idea on graded problems with hints, then compare your answer with the reference solution.',
};

function moduleDescription(mod) {
  const c = { easy: 0, medium: 0, hard: 0 };
  mod.problems.forEach((p) => { c[p.data.difficulty] = (c[p.data.difficulty] || 0) + 1; });
  return `${mod.problems.length} problems: ${c.easy} easy, ${c.medium} medium, ${c.hard} hard.`;
}

function summarise(course) {
  const problems = course.modules.flatMap((m) => m.problems);
  const tests = problems.flatMap((p) => p.testCases);
  const by = (f) => problems.reduce((o, p) => { const k = f(p); o[k] = (o[k] || 0) + 1; return o; }, {});
  return {
    modules: course.modules.length,
    problems: problems.length,
    tests: tests.length,
    visibleTests: tests.filter((t) => t.isPublic).length,
    hiddenTests: tests.filter((t) => !t.isPublic).length,
    byDifficulty: by((p) => p.data.difficulty),
    byMode: by((p) => p.mode.kind),
  };
}

module.exports = {
  COURSE_KEY, NAMESPACE, PYTHON_LANGUAGE_ID, COLUMNS, COURSE,
  stableId, parseCsv, parseCsvObjects, normaliseQuestionId, toMarkdown, buildDescription, parseExecutionMode, starterCode,
  buildTests, buildProblem, loadCourse, moduleDescription, summarise, Issues,
};
