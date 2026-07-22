const multer = require('multer');
const AdmZip = require('adm-zip');
const problemRepo = require('../repositories/problemRepository');

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

// Export the configured multer instance so the route file can use upload.single('file').
exports.upload = upload;
