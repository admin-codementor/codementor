const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const AdmZip = require('adm-zip');
const problemRepo = require('../repositories/problemRepository');
const draftRepo = require('../repositories/problemDraftRepository');
const { logAction } = require('../middleware/audit');
const { parseUpload, parseText } = require('../services/problemImporter');

// Multer configured for in-memory storage — the ZIP is parsed from req.file.buffer.
// 20 MB cap is generous for problem packages while protecting against abuse.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const okMime = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
      'multipart/x-zip',
    ].includes(file.mimetype);
    if (name.endsWith('.zip') || okMime) return cb(null, true);
    return cb(new Error('Only .zip files are accepted'));
  },
});

// Separate uploader for the staged importer: documents and data files rather than
// problem packages. 10 MB is ample for a question paper and keeps AI extraction
// prompts bounded.
const DOC_EXTENSIONS = /\.(json|csv|docx|txt|md)$/i;
const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (DOC_EXTENSIONS.test(file.originalname || '')) return cb(null, true);
    return cb(new Error('Only .json, .csv, .docx, .txt or .md files are accepted here (use the ZIP importer for problem packages).'));
  },
});

const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const ALLOWED_SCORING_MODES = new Set(['acm', 'oi']);

// Strip any leading folder ("problem/tests/1.in" -> "tests/1.in") and normalise
// slashes so packages zipped with a wrapping directory still work.
const normaliseEntryName = (name) => name.replace(/\\/g, '/').replace(/^\.\//, '');

// @desc    Import a problem (+ test cases) from an uploaded ZIP package
// @route   POST /api/problem-import/zip
exports.importZip = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'No ZIP file uploaded.' });
    }

    let zip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid or corrupt ZIP archive.' });
    }

    const entries = zip.getEntries();
    if (!entries || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'ZIP archive is empty.' });
    }

    // Detect a single common top-level folder so we can tolerate wrapped packages.
    const topDirs = new Set();
    for (const e of entries) {
      const n = normaliseEntryName(e.entryName);
      const slash = n.indexOf('/');
      if (slash > 0) topDirs.add(n.slice(0, slash));
      else topDirs.add('');
    }
    const prefix = topDirs.size === 1 && !topDirs.has('') ? `${[...topDirs][0]}/` : '';

    // Locate problem.json (case-insensitive, prefix-tolerant).
    const findEntry = (predicate) =>
      entries.find((e) => !e.isDirectory && predicate(normaliseEntryName(e.entryName)));

    const stripPrefix = (n) => (prefix && n.startsWith(prefix) ? n.slice(prefix.length) : n);

    const problemEntry = findEntry((n) => stripPrefix(n).toLowerCase() === 'problem.json');
    if (!problemEntry) {
      return res.status(400).json({
        success: false,
        error: 'problem.json not found at the root of the ZIP.',
      });
    }

    let meta;
    try {
      meta = JSON.parse(problemEntry.getData().toString('utf8'));
    } catch (e) {
      return res.status(400).json({ success: false, error: 'problem.json is not valid JSON.' });
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return res.status(400).json({ success: false, error: 'problem.json must be a JSON object.' });
    }

    // ── Validate / normalise metadata ───────────────────────────────────────
    const title = typeof meta.title === 'string' ? meta.title.trim() : '';
    if (!title) {
      return res.status(400).json({ success: false, error: 'problem.json must include a non-empty "title".' });
    }
    if (title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title exceeds 200 characters.' });
    }

    let difficulty = typeof meta.difficulty === 'string' ? meta.difficulty.trim().toLowerCase() : 'easy';
    if (!ALLOWED_DIFFICULTIES.has(difficulty)) difficulty = 'easy';

    let tags = [];
    if (Array.isArray(meta.tags)) {
      tags = meta.tags
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim().slice(0, 50))
        .filter(Boolean)
        .slice(0, 30);
    }

    let scoringMode = typeof meta.scoring_mode === 'string' ? meta.scoring_mode.trim().toLowerCase() : 'acm';
    if (!ALLOWED_SCORING_MODES.has(scoringMode)) scoringMode = 'acm';

    let maxScore = parseInt(meta.max_score, 10);
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) maxScore = 100;

    // Description: prefer problem.json.description, else fall back to statement.md.
    let description = typeof meta.description === 'string' ? meta.description.trim() : '';
    if (!description) {
      const statementEntry = findEntry((n) => stripPrefix(n).toLowerCase() === 'statement.md');
      if (statementEntry) description = statementEntry.getData().toString('utf8').trim();
    }
    if (!description) {
      return res.status(400).json({
        success: false,
        error: 'No description found — provide "description" in problem.json or a statement.md file.',
      });
    }

    // ── Collect paired test files tests/N.in + tests/N.out ───────────────────
    // Map keyed by the numeric stem so .in / .out pair up regardless of order.
    const testMap = new Map(); // key -> { in, out, num }
    const testRe = /^tests\/([^/]+)\.(in|out)$/i;

    for (const e of entries) {
      if (e.isDirectory) continue;
      const rel = stripPrefix(normaliseEntryName(e.entryName));
      const m = rel.match(testRe);
      if (!m) continue;
      const stem = m[1];
      const kind = m[2].toLowerCase();
      if (!testMap.has(stem)) testMap.set(stem, { in: null, out: null, stem });
      testMap.get(stem)[kind] = e.getData().toString('utf8');
    }

    // Only keep pairs that have BOTH input and expected output.
    const paired = [...testMap.values()].filter((t) => t.in !== null && t.out !== null);

    if (paired.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid test cases found — expected paired files like tests/1.in and tests/1.out.',
      });
    }

    // Sort numerically when stems are numbers, else lexicographically — gives a
    // stable, human-expected order (1, 2, 10 rather than 1, 10, 2).
    paired.sort((a, b) => {
      const na = Number(a.stem);
      const nb = Number(b.stem);
      const aNum = Number.isFinite(na);
      const bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a.stem.localeCompare(b.stem);
    });

    // First 2 test cases are public (sample), the rest hidden — matches the
    // platform convention of revealing only a couple of examples to students.
    const testCases = paired.map((tc, i) => ({
      input: tc.in, output: tc.out, is_public: i < 2,
    }));

    const problem = await problemRepo.create({
      title, description, difficulty, tags,
      createdBy: req.user.id, scoringMode, maxScore,
      timeLimit: 2, memoryLimit: 256, stubs: {},
    }, testCases);

    return res.status(201).json({
      success: true,
      data: { problem_id: problem.id, test_count: paired.length },
    });
  } catch (error) {
    console.error('ZIP import failed:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Staged import: parse → review → commit.
//
// `parse` deliberately writes to problemDrafts, never to `problems`. Publishing is
// a separate, explicit act by a human. The ZIP importer above predates this and
// still writes directly — it carries its own strict schema, so a malformed package
// fails loudly rather than producing a plausible-but-wrong problem.
// ─────────────────────────────────────────────────────────────────────────────

const parseErrorStatus = (code) => ({
  PARSE_FAILED: 400,
  UNSUPPORTED_TYPE: 415,
  NOTHING_FOUND: 422,
  AI_REQUIRED: 503,
}[code] || 500);

// @route POST /api/problem-import/parse   (multipart 'file', or JSON { text })
exports.parseImport = async (req, res) => {
  try {
    let drafts;
    if (req.file?.buffer?.length) {
      drafts = await parseUpload({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      });
    } else if (typeof req.body?.text === 'string' && req.body.text.trim()) {
      drafts = await parseText(req.body.text);
    } else {
      return res.status(400).json({ success: false, error: 'Upload a file or provide pasted text.' });
    }

    if (!drafts.length) {
      return res.status(422).json({ success: false, error: 'Nothing importable was found in that input.' });
    }

    const batchId = uuidv4();
    const saved = await draftRepo.createMany(
      drafts.map((d) => ({ ...d, batchId, createdBy: req.user.id })),
    );

    logAction(req, 'problem-import.parse', `${saved.length} draft(s) from ${req.file?.originalname || 'pasted text'}`);

    res.status(201).json({
      success: true,
      data: {
        batchId,
        drafts: saved.map(shapeDraft),
        summary: {
          total: saved.length,
          ready: saved.filter((d) => d.ready).length,
          needsWork: saved.filter((d) => !d.ready).length,
        },
      },
    });
  } catch (error) {
    if (error.code) {
      return res.status(parseErrorStatus(error.code)).json({ success: false, code: error.code, error: error.message });
    }
    // Provider overload is routine (Gemini answers 503 "high demand"). Say so, so
    // the faculty member retries instead of concluding their document is broken.
    if (error.name === 'AiError') {
      const busy = error.status === 503 || error.status === 429;
      return res.status(busy ? 503 : 502).json({
        success: false,
        code: busy ? 'AI_BUSY' : 'AI_ERROR',
        error: busy
          ? 'The AI service is busy right now. Your document is fine — please try again in a moment.'
          : `AI service error: ${error.message}`,
      });
    }
    console.error('Import parse failed:', error);
    res.status(500).json({ success: false, error: 'Could not parse that import.' });
  }
};

const shapeDraft = (d) => ({
  id: d.id,
  batch_id: d.batchId,
  title: d.title,
  description: d.description,
  difficulty: d.difficulty,
  tags: d.tags || [],
  test_cases: d.testCases || [],
  source: d.source,
  warnings: d.warnings || [],
  ready: !!d.ready,
  status: d.status,
});

// Only the importer (or an admin) may see/act on a draft.
async function ownedDraft(req, id) {
  const draft = await draftRepo.getById(id);
  if (!draft) return null;
  if (draft.createdBy !== req.user.id && req.user.role !== 'admin') return null;
  return draft;
}

// @route GET /api/problem-import/drafts[?batch=<id>]
exports.listDrafts = async (req, res) => {
  try {
    const rows = req.query.batch
      ? (await draftRepo.listByBatch(String(req.query.batch))).filter(
          (d) => d.createdBy === req.user.id || req.user.role === 'admin',
        )
      : await draftRepo.listPendingByUser(req.user.id);
    res.json({ success: true, data: rows.map(shapeDraft) });
  } catch (error) {
    console.error('List drafts failed:', error);
    res.status(500).json({ success: false, error: 'Could not load drafts.' });
  }
};

// @route PATCH /api/problem-import/drafts/:id
exports.updateDraft = async (req, res) => {
  try {
    const draft = await ownedDraft(req, req.params.id);
    if (!draft) return res.status(404).json({ success: false, error: 'Draft not found' });
    if (draft.status === 'published') {
      return res.status(409).json({ success: false, error: 'That draft has already been published.' });
    }

    const { title, description, difficulty, tags, test_cases } = req.body;
    const partial = {};
    if (title !== undefined) partial.title = String(title).trim().slice(0, 200);
    if (description !== undefined) partial.description = String(description).trim().slice(0, 20000);
    if (difficulty !== undefined && ['easy', 'medium', 'hard'].includes(difficulty)) partial.difficulty = difficulty;
    if (Array.isArray(tags)) partial.tags = tags.map((t) => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 30);
    if (Array.isArray(test_cases)) {
      partial.testCases = test_cases
        .filter((tc) => tc && typeof tc.input === 'string' && typeof tc.output === 'string')
        .map((tc) => ({ input: tc.input, output: tc.output, is_public: !!tc.is_public }));
    }

    // Recompute readiness against the merged result, so editing a draft can clear
    // its warnings instead of leaving a stale "needs work" flag.
    const merged = { ...draft, ...partial };
    const usable = (merged.testCases || []).filter((t) => t.input.trim() && t.output.trim());
    partial.ready = !!merged.title && merged.title !== '(untitled)' && !!merged.description && usable.length > 0;
    partial.warnings = partial.ready ? [] : (merged.warnings || []);

    const updated = await draftRepo.update(req.params.id, partial);
    res.json({ success: true, data: shapeDraft(updated) });
  } catch (error) {
    console.error('Update draft failed:', error);
    res.status(500).json({ success: false, error: 'Could not update that draft.' });
  }
};

// @route DELETE /api/problem-import/drafts/:id
exports.deleteDraft = async (req, res) => {
  try {
    const draft = await ownedDraft(req, req.params.id);
    if (!draft) return res.status(404).json({ success: false, error: 'Draft not found' });
    await draftRepo.remove(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete draft failed:', error);
    res.status(500).json({ success: false, error: 'Could not delete that draft.' });
  }
};

// @route POST /api/problem-import/commit   { draft_ids: [...] }
// Publishes reviewed drafts into the live catalogue.
exports.commitDrafts = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.draft_ids) ? req.body.draft_ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Select at least one draft to publish.' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ success: false, error: 'Publish at most 100 drafts at a time.' });
    }

    const created = [];
    const skipped = [];

    for (const id of ids) {
      const draft = await ownedDraft(req, id);
      if (!draft) { skipped.push({ id, reason: 'not found' }); continue; }
      if (draft.status === 'published') { skipped.push({ id, reason: 'already published' }); continue; }

      const usable = (draft.testCases || []).filter((t) => t.input?.trim() && t.output?.trim());
      // The same bar the authoring form enforces — a problem with no tests cannot
      // be graded, so it must not reach students.
      if (!draft.description?.trim() || usable.length === 0 || !draft.title?.trim() || draft.title === '(untitled)') {
        skipped.push({ id, title: draft.title, reason: 'needs a title, a statement and at least one complete test case' });
        continue;
      }

      const problem = await problemRepo.create({
        title: draft.title,
        description: draft.description,
        difficulty: draft.difficulty || 'medium',
        tags: draft.tags || [],
        createdBy: req.user.id,
        stubs: {},
        scoringMode: 'acm',
        maxScore: 100,
        timeLimit: 2,
        memoryLimit: 256,
        importedFrom: draft.source || 'import',
      }, usable);

      await draftRepo.update(id, { status: 'published', publishedProblemId: problem.id });
      created.push({ draft_id: id, problem_id: problem.id, title: draft.title });
    }

    logAction(req, 'problem-import.commit', `${created.length} published, ${skipped.length} skipped`);

    res.status(created.length ? 201 : 422).json({
      success: created.length > 0,
      data: { created, skipped },
      ...(created.length === 0 ? { error: 'No draft was publishable — see skipped for why.' } : {}),
    });
  } catch (error) {
    console.error('Commit drafts failed:', error);
    res.status(500).json({ success: false, error: 'Could not publish those drafts.' });
  }
};

// Export the configured multer instances so the route file can use .single('file').
exports.upload = upload;
exports.uploadDoc = uploadDoc;
