const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');
const { logAction } = require('../middleware/audit');
const { canManageOwnedBy } = require('../middleware/role.middleware');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const submissionRepo = require('../repositories/submissionRepository');
const plagiarismResultRepo = require('../repositories/plagiarismResultRepository');

// Language id → { ext, jplagLang }
const LANG_MAP = {
  java:       { ext: 'java',  jplag: 'java'   },
  python:     { ext: 'py',    jplag: 'python3' },
  javascript: { ext: 'js',    jplag: 'text'    },
  typescript: { ext: 'ts',    jplag: 'text'    },
  c:          { ext: 'c',     jplag: 'c'       },
  cpp:        { ext: 'cpp',   jplag: 'cpp'     },
};

const JPLAG_JAR = process.env.JPLAG_JAR_PATH || path.join(__dirname, '../../../jplag/jplag.jar');
const SIMILARITY_THRESHOLD = parseFloat(process.env.JPLAG_THRESHOLD || '0.70');

// ── helpers ────────────────────────────────────────────────────────────────────

function langMeta(lang) {
  return LANG_MAP[(lang || '').toLowerCase()] || { ext: 'txt', jplag: 'text' };
}

// Write one student's best submission to disk.
// Returns the file path written, or null if no submission exists.
async function writeSubmission(assignmentId, userId, problemId, rollno, workdir) {
  const accepted = (await submissionRepo.listByUserAndProblem(userId, problemId))
    .filter(s => s.verdict === 'Accepted')
    .sort((a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));
  if (!accepted.length) return null;

  const { code, language } = accepted[0];
  const { ext } = langMeta(language);
  const studentDir = path.join(workdir, String(rollno));
  fs.mkdirSync(studentDir, { recursive: true });
  const file = path.join(studentDir, `solution.${ext}`);
  fs.writeFileSync(file, code, 'utf8');
  return { file, language };
}

// Run JPlag (v5 CLI). Confirmed flags: -l <language>, -m <similarity-threshold 0..1>,
// --csv-export. NOTE: -r/--result-file is a FILE base name (JPlag appends .jplag),
// NOT a directory — and the CSV export is written relative to the working dir, so we
// run with cwd=resultsDir and look for the CSV there.
function runJPlag(submissionsDir, jplagLang, resultsDir) {
  return new Promise((resolve, reject) => {
    const java = process.env.JAVA_BIN || 'java';
    const args = [
      '-jar', JPLAG_JAR,
      submissionsDir,
      '-l', jplagLang,
      '-m', String(SIMILARITY_THRESHOLD),
      '--csv-export',
      '-r', path.join(resultsDir, 'results'), // -> results.jplag (+ CSV export)
    ];
    execFile(java, args, { timeout: 120_000, cwd: resultsDir }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// Recursively collect every .csv produced anywhere under a directory.
function findCsvFiles(dir) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findCsvFiles(full));
    else if (e.name.toLowerCase().endsWith('.csv')) out.push(full);
  }
  return out;
}

// Parse a JPlag CSV robustly. JPlag's exact column layout/header isn't documented and
// has varied across versions (it may include an index column, a header row, and several
// similarity metrics). Rather than assume fixed positions, we heuristically detect, per
// row: the two submission identifiers (first two non-numeric cells) and the similarity
// (the largest numeric cell in 0..1). This survives header rows and extra columns.
function parseCSV(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const text = fs.readFileSync(csvPath, 'utf8').trim();
  if (!text) return [];
  const pairs = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''));
    const names = [];
    let sim = -1;
    for (const c of cells) {
      const num = Number(c);
      if (c !== '' && !Number.isNaN(num) && num >= 0 && num <= 1) {
        if (num > sim) sim = num;             // similarity metric (avg/max), 0..1
      } else if (c && Number.isNaN(num)) {
        if (names.length < 2) names.push(c);  // submission identifiers
      }
    }
    if (names.length === 2 && sim >= 0 && sim >= SIMILARITY_THRESHOLD) {
      pairs.push({ studentA: names[0], studentB: names[1], similarity: sim });
    }
  }
  return pairs;
}

// ── exported controllers ───────────────────────────────────────────────────────

exports.runPlagiarism = async (req, res) => {
  const { id: assignmentId } = req.params;

  // 1. Verify assignment exists and the requester may act on it (author, admin,
  //    or the HOD of the author's department — decision D1)
  const assignment = await assignmentRepo.getById(assignmentId);
  if (!assignment || !(await canManageOwnedBy(req, assignment.facultyId))) {
    return res.status(404).json({ success: false, error: 'Assignment not found' });
  }

  // 2. Check JPlag JAR exists. JPlag shells out to a local `java` binary, so
  // this only works on a host with a JVM — the backend Dockerfile installs
  // Java 17 and fetches the JAR. On a builder that skips the Dockerfile
  // (e.g. Nixpacks) the JAR is absent and this degrades to a clear 503.
  if (!fs.existsSync(JPLAG_JAR)) {
    return res.status(503).json({
      success: false,
      error: `JPlag JAR not found at ${JPLAG_JAR}. See docs/PLAGIARISM_SETUP.md.`,
    });
  }

  // 5. Fetch all problems in assignment
  const apProblemsMap = await problemRepo.getMapByIds(assignment.problemIds || []);
  const apRows = (assignment.problemIds || []).map(pid => ({ problem_id: pid, title: apProblemsMap.get(pid)?.title || 'Unknown' }));
  if (!apRows.length) {
    return res.status(400).json({ success: false, error: 'Assignment has no problems' });
  }

  // 6. Fetch all enrolled students
  const subsPerProblem = await Promise.all(apRows.map(r => submissionRepo.listByProblem(r.problem_id)));
  const submitterIds = [...new Set(subsPerProblem.flat().map(s => s.userId))];
  const plagUsersMap = await userRepo.getAllUsersMap();
  const students = submitterIds.map(uid => {
    const profile = plagUsersMap.get(uid) || {};
    return { user_id: uid, name: profile.name || 'Unknown', email: profile.email || '' };
  });

  if (students.length < 2) {
    return res.status(400).json({ success: false, error: 'Need at least 2 student submissions' });
  }

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'jplag-'));
  const submissionsDir = path.join(workdir, 'submissions');
  const resultsDir = path.join(workdir, 'results');
  fs.mkdirSync(submissionsDir, { recursive: true });
  fs.mkdirSync(resultsDir,    { recursive: true });

  let detectedLang = 'java';
  const emailToId = {};
  try {
    // 7. Write each student's first accepted submission for each problem
    for (const problem of apRows) {
      for (const student of students) {
        const rollno = student.email.split('@')[0];
        const result = await writeSubmission(
          assignmentId, student.user_id, problem.problem_id,
          `${rollno}_${problem.problem_id.slice(0, 8)}`, submissionsDir
        );
        if (result) {
          detectedLang = langMeta(result.language).jplag;
          emailToId[rollno] = student.user_id;
        }
      }
    }

    // 6. Run JPlag
    await runJPlag(submissionsDir, detectedLang, resultsDir);

    // 7. Parse the CSV export. Its exact name/location isn't guaranteed across JPlag
    // versions, so scan the whole work dir for any .csv and take the first that yields pairs.
    let pairs = [];
    const csvFiles = findCsvFiles(workdir);
    for (const f of csvFiles) {
      const parsed = parseCSV(f);
      if (parsed.length) { pairs = parsed; break; }
    }
    if (!pairs.length && csvFiles.length === 0) {
      console.warn('JPlag produced no CSV — check the JPlag version supports --csv-export and the JAR is valid.');
    }

    // 8. Persist (replace old results for this assignment)
    const toPersist = pairs
      .map(pair => {
        // student key is rollno prefix (or composite if per-problem)
        const idA = emailToId[pair.studentA.split('_')[0]] || null;
        const idB = emailToId[pair.studentB.split('_')[0]] || null;
        if (!idA || !idB) return null;
        return { studentA: idA, studentB: idB, similarity: pair.similarity * 100, language: detectedLang };
      })
      .filter(Boolean);
    await plagiarismResultRepo.replaceForAssignment(assignmentId, toPersist);

    logAction(req, 'plagiarism.run', `assignment ${assignmentId} → ${pairs.length} pairs`);
    res.json({
      success: true,
      data: { pairs_found: pairs.length, threshold: SIMILARITY_THRESHOLD },
    });
  } finally {
    // Cleanup temp dir
    fs.rmSync(workdir, { recursive: true, force: true });
  }
};

exports.getPlagiarismResults = async (req, res) => {
  const { id: assignmentId } = req.params;

  const assignment = await assignmentRepo.getById(assignmentId);
  if (!assignment || !(await canManageOwnedBy(req, assignment.facultyId))) {
    return res.status(404).json({ success: false, error: 'Assignment not found' });
  }

  const rows = await plagiarismResultRepo.listByAssignment(assignmentId);
  const pairUsersMap = await userRepo.getAllUsersMap();
  const data = rows.map(r => ({
    id: r.id, similarity: r.similarity, language: r.language, ran_at: r.ranAt?.toDate?.() ?? r.ranAt,
    student_a_name: pairUsersMap.get(r.studentA)?.name || 'Unknown',
    student_a_email: pairUsersMap.get(r.studentA)?.email || null,
    student_b_name: pairUsersMap.get(r.studentB)?.name || 'Unknown',
    student_b_email: pairUsersMap.get(r.studentB)?.email || null,
  }));

  res.json({ success: true, data });
};

// Plagiarism summary across all of this faculty's assignments — for the
// overview list and a per-assignment trend chart.
exports.getPlagiarismOverview = async (req, res) => {
  try {
    const assignments = (await assignmentRepo.listByFacultyId(req.user.id))
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    const pairsByAssignment = await Promise.all(assignments.map(a => plagiarismResultRepo.listByAssignment(a.id)));

    const data = assignments.map((a, i) => {
      const pairs = pairsByAssignment[i];
      const sims = pairs.map(r => Number(r.similarity));
      const ranTimes = pairs.map(r => r.ranAt?.toDate?.() ?? new Date(r.ranAt));
      return {
        id: a.id,
        title: a.title,
        deadline: a.deadline,
        pairs: pairs.length,
        avgSim: sims.length ? Math.round((sims.reduce((s, v) => s + v, 0) / sims.length) * 10) / 10 : 0,
        maxSim: sims.length ? Math.max(...sims) : 0,
        lastRan: ranTimes.length ? new Date(Math.max(...ranTimes.map(d => d.getTime()))) : null,
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Plagiarism Overview Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch plagiarism overview' });
  }
};

// Side-by-side code for a flagged pair: fetch each student's first accepted
// submission for every problem in the assignment so faculty can see the evidence.
exports.getPairDiff = async (req, res) => {
  try {
    const { id: assignmentId, pairId } = req.params;

    // Ownership check.
    const assignment = await assignmentRepo.getById(assignmentId);
    if (!assignment || !(await canManageOwnedBy(req, assignment.facultyId))) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }

    const pair = await plagiarismResultRepo.getById(pairId);
    if (!pair || pair.assignmentId !== assignmentId) return res.status(404).json({ success: false, error: 'Pair not found' });
    const diffUsersMap = await userRepo.getAllUsersMap();
    pair.a_name = diffUsersMap.get(pair.studentA)?.name || 'Unknown';
    pair.a_email = diffUsersMap.get(pair.studentA)?.email || null;
    pair.b_name = diffUsersMap.get(pair.studentB)?.name || 'Unknown';
    pair.b_email = diffUsersMap.get(pair.studentB)?.email || null;

    const probsMap = await problemRepo.getMapByIds(assignment.problemIds || []);
    const probs = (assignment.problemIds || []).map(pid => ({ problem_id: pid, title: probsMap.get(pid)?.title || 'Unknown' }));

    const fetchCode = async (userId, problemId) => {
      const accepted = (await submissionRepo.listByUserAndProblem(userId, problemId))
        .filter(s => s.verdict === 'Accepted')
        .sort((a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));
      return accepted[0] || null;
    };

    const problems = [];
    for (const pr of probs) {
      const a = await fetchCode(pair.studentA, pr.problem_id);
      const b = await fetchCode(pair.studentB, pr.problem_id);
      if (a || b) {
        problems.push({
          title: pr.title,
          language: a?.language || b?.language || pair.language || 'text',
          codeA: a?.code || null,
          codeB: b?.code || null,
        });
      }
    }

    res.json({
      success: true,
      data: {
        similarity: Number(pair.similarity),
        studentA: { name: pair.a_name, email: pair.a_email },
        studentB: { name: pair.b_name, email: pair.b_email },
        problems,
      },
    });
  } catch (error) {
    console.error('Pair Diff Error:', error);
    res.status(500).json({ success: false, error: 'Failed to load pair comparison' });
  }
};
