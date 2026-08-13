// Turns an uploaded file (or pasted text) into reviewable problem DRAFTS.
//
// Nothing here writes to the live catalogue — see problemDraftRepository.js for
// why. Each parser returns plain objects plus per-item `warnings`, so the review
// screen can show a faculty member exactly what is missing before they publish.
//
// Structured formats (JSON, CSV) are parsed deterministically — no model involved,
// because guessing is only appropriate when the input genuinely has no structure.
// DOCX and pasted prose go through AI *extraction*: splitting a document into
// discrete questions and pulling out fields. That is parsing, not authoring — the
// model is never asked to invent a problem or an expected output.
const mammoth = require('mammoth');
const ai = require('./aiGateway');

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const MAX_ITEMS = 100;

const clean = (v, max = 20000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Coerce anything parser-shaped into the canonical draft shape and record what is
 * missing. Never throws — a bad row becomes a draft with warnings so the importer
 * can show it rather than silently dropping it.
 */
function normaliseDraft(raw, source) {
  const warnings = [];

  const title = clean(raw.title ?? raw.Title ?? raw.name ?? raw.Name, 200);
  if (!title) warnings.push('No title found.');

  const description = clean(
    raw.description ?? raw.Description ?? raw.statement ?? raw.Statement ?? raw.problem ?? raw.body,
  );
  if (!description) warnings.push('No problem statement found.');

  let difficulty = clean(raw.difficulty ?? raw.Difficulty ?? raw.level, 20).toLowerCase();
  if (!DIFFICULTIES.has(difficulty)) {
    if (difficulty) warnings.push(`Unrecognised difficulty "${difficulty}" — defaulted to medium.`);
    difficulty = 'medium';
  }

  // Tags may arrive as an array or a delimited string.
  let tags = [];
  const rawTags = raw.tags ?? raw.Tags ?? raw.topics ?? raw.topic;
  if (Array.isArray(rawTags)) tags = rawTags.map((t) => clean(t, 50)).filter(Boolean);
  else if (typeof rawTags === 'string') tags = rawTags.split(/[,;|]/).map((t) => t.trim().slice(0, 50)).filter(Boolean);
  tags = tags.slice(0, 30);

  // Test cases: accept several field spellings, plus flat input1/output1 columns.
  const testCases = [];
  const rawCases = raw.test_cases ?? raw.testCases ?? raw.tests ?? raw.examples;
  if (Array.isArray(rawCases)) {
    for (const tc of rawCases) {
      if (!tc || typeof tc !== 'object') continue;
      const input = clean(tc.input ?? tc.Input ?? tc.stdin, 10000);
      const output = clean(tc.output ?? tc.Output ?? tc.expected ?? tc.expected_output, 10000);
      if (input === '' && output === '') continue;
      testCases.push({ input, output, is_public: !!(tc.is_public ?? tc.isPublic ?? tc.sample) });
    }
  }
  for (let i = 1; i <= 5; i++) {
    const input = clean(raw[`input${i}`] ?? raw[`Input${i}`], 10000);
    const output = clean(raw[`output${i}`] ?? raw[`Output${i}`], 10000);
    if (input || output) testCases.push({ input, output, is_public: i === 1 });
  }

  const usable = testCases.filter((t) => t.input !== '' && t.output !== '');
  if (usable.length === 0) {
    warnings.push('No complete test cases — add them by hand, or generate verified ones before publishing.');
  } else if (usable.length < testCases.length) {
    warnings.push(`${testCases.length - usable.length} incomplete test case(s) were dropped.`);
  }
  // First case doubles as the visible sample when nothing was marked public.
  if (usable.length && !usable.some((t) => t.is_public)) usable[0].is_public = true;

  return {
    title: title || '(untitled)',
    description,
    difficulty,
    tags,
    testCases: usable,
    source,
    warnings,
    // A draft is only publishable once it has a title, a statement and one test case.
    ready: !!title && !!description && usable.length > 0,
  };
}

// ── JSON ─────────────────────────────────────────────────────────────────────
function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const err = new Error(`Not valid JSON: ${e.message}`);
    err.code = 'PARSE_FAILED';
    throw err;
  }
  // Accept a bare array, a single object, or { problems: [...] }.
  const list = Array.isArray(data) ? data : Array.isArray(data?.problems) ? data.problems : [data];
  return list.slice(0, MAX_ITEMS).map((row) => normaliseDraft(row || {}, 'json'));
}

// ── CSV ──────────────────────────────────────────────────────────────────────
// Hand-rolled on purpose: the maintained npm spreadsheet parser (`xlsx`) carries
// prototype-pollution and ReDoS advisories with no fix available, which is a poor
// trade for a format this simple. Handles quoted fields, embedded commas and
// newlines, and "" escapes (RFC 4180).
function parseCsvRows(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = String(text).replace(/^﻿/, ''); // strip BOM from Excel exports

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    const err = new Error('CSV needs a header row and at least one data row.');
    err.code = 'PARSE_FAILED';
    throw err;
  }
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1, MAX_ITEMS + 1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = cells[i] ?? ''; });
    return normaliseDraft(obj, 'csv');
  });
}

// ── DOCX / free text (AI extraction) ─────────────────────────────────────────
const EXTRACTION_PROMPT = (text, max) => `You are extracting existing coding problems from a document so they can be imported into a judge. You are TRANSCRIBING, not authoring.

Rules:
- Split the document into its separate problems. Do not merge or invent problems.
- Copy each problem's statement as faithfully as you can, preserving constraints.
- Copy any example input/output pairs EXACTLY as written in the document.
- If a field is absent from the document, leave it empty or omit it. NEVER invent
  an example, an expected output, or a constraint that is not written down.
- Extract at most ${max} problems.

Document:
"""
${text}
"""

Output strictly valid JSON, no markdown:
{
  "problems": [
    {
      "title": "string",
      "description": "full problem statement as written",
      "difficulty": "easy" | "medium" | "hard",
      "tags": ["string"],
      "test_cases": [ { "input": "string", "output": "string" } ]
    }
  ]
}`;

async function extractWithAi(text, source, max = 20) {
  if (!ai.isConfigured()) {
    const err = new Error('Extracting problems from a document needs an AI provider, and none is configured.');
    err.code = 'AI_REQUIRED';
    throw err;
  }
  // Keep the prompt bounded — a very long document would otherwise blow the
  // context window and fail after the faculty member has already waited.
  const trimmed = String(text).slice(0, 60000);
  const { data } = await ai.generateJson({ prompt: EXTRACTION_PROMPT(trimmed, max) });
  const list = Array.isArray(data?.problems) ? data.problems : [];
  if (list.length === 0) {
    const err = new Error('No problems could be identified in that document.');
    err.code = 'NOTHING_FOUND';
    throw err;
  }
  return list.slice(0, MAX_ITEMS).map((row) => normaliseDraft(row || {}, source));
}

async function parseDocx(buffer) {
  let text = '';
  try {
    ({ value: text } = await mammoth.extractRawText({ buffer }));
  } catch (e) {
    const err = new Error(`Could not read that .docx file: ${e.message}`);
    err.code = 'PARSE_FAILED';
    throw err;
  }
  if (!text.trim()) {
    const err = new Error('That .docx file appears to contain no text.');
    err.code = 'PARSE_FAILED';
    throw err;
  }
  return extractWithAi(text, 'docx');
}

const parseText = (text) => extractWithAi(text, 'text');

/** Route an upload to the right parser by filename/mimetype. */
async function parseUpload({ buffer, originalname = '', mimetype = '' }) {
  const name = originalname.toLowerCase();
  const isDocx = name.endsWith('.docx') || mimetype.includes('officedocument.wordprocessingml');
  const isJson = name.endsWith('.json') || mimetype.includes('json');
  const isCsv = name.endsWith('.csv') || mimetype.includes('csv');
  const isTxt = name.endsWith('.txt') || name.endsWith('.md');

  if (isDocx) return parseDocx(buffer);
  const asText = buffer.toString('utf8');
  if (isJson) return parseJson(asText);
  if (isCsv) return parseCsv(asText);
  if (isTxt) return parseText(asText);

  const err = new Error(`Unsupported file type "${originalname || mimetype}". Use .json, .csv, .docx, .txt, or the ZIP importer for a full problem package.`);
  err.code = 'UNSUPPORTED_TYPE';
  throw err;
}

module.exports = { parseUpload, parseJson, parseCsv, parseCsvRows, parseDocx, parseText, normaliseDraft };
