const PDFDocument = require('pdfkit');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const submissionRepo = require('../repositories/submissionRepository');

// ── Colours / typography to match the dark-themed brand on a printable light page ──
const COLORS = {
  text: '#1F2328',
  muted: '#57606A',
  border: '#D0D7DE',
  primary: '#2563EB',
  accent: '#161B22',
  easy: '#1A7F37',
  medium: '#9A6700',
  hard: '#CF222E',
};

const difficultyColor = (d) => {
  switch (String(d || '').toLowerCase()) {
    case 'easy': return COLORS.easy;
    case 'medium': return COLORS.medium;
    case 'hard': return COLORS.hard;
    default: return COLORS.muted;
  }
};

// Build a filesystem-safe filename from a title.
const safeFilename = (title) =>
  String(title || 'problem')
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'problem';

// ── Reusable rendering helpers ──────────────────────────────────────────────

const drawDivider = (doc) => {
  const y = doc.y + 4;
  doc
    .save()
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .stroke()
    .restore();
  doc.moveDown(0.8);
};

const sectionHeading = (doc, label) => {
  doc.moveDown(0.6);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(COLORS.accent)
    .text(label);
  doc.moveDown(0.3);
};

const bodyText = (doc, text) => {
  doc
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor(COLORS.text)
    .text(text || '—', { align: 'left', lineGap: 2 });
};

const monoBlock = (doc, text) => {
  const content = (text === undefined || text === null || text === '') ? '(empty)' : String(text);
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const padding = 8;

  doc.font('Courier').fontSize(9.5);
  const textHeight = doc.heightOfString(content, { width: width - padding * 2, lineGap: 1 });
  const boxHeight = textHeight + padding * 2;

  // Page-break guard so the box isn't split awkwardly.
  if (doc.y + boxHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }

  const top = doc.y;
  doc
    .save()
    .rect(left, top, width, boxHeight)
    .fillColor('#F6F8FA')
    .fill()
    .lineWidth(0.5)
    .strokeColor(COLORS.border)
    .rect(left, top, width, boxHeight)
    .stroke()
    .restore();

  doc
    .font('Courier')
    .fontSize(9.5)
    .fillColor(COLORS.text)
    .text(content, left + padding, top + padding, { width: width - padding * 2, lineGap: 1 });

  doc.y = top + boxHeight;
  doc.moveDown(0.5);
};

const renderMeta = (doc, problem) => {
  const left = doc.page.margins.left;
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);

  const parts = [];
  parts.push({ label: 'Difficulty', value: problem.difficulty || 'N/A', color: difficultyColor(problem.difficulty) });
  parts.push({ label: 'Time Limit', value: `${problem.time_limit ?? '—'} s`, color: COLORS.text });
  parts.push({ label: 'Memory Limit', value: `${problem.memory_limit ?? '—'} MB`, color: COLORS.text });

  const y = doc.y;
  let x = left;
  parts.forEach((p) => {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(`${p.label}: `, x, y, { continued: true });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(p.color).text(p.value, { continued: false });
    x += 150;
    doc.y = y; // keep them on one row
  });
  doc.y = y;
  doc.x = left;
  doc.moveDown(1.2);

  if (Array.isArray(problem.tags) && problem.tags.length > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text(`Tags: ${problem.tags.join(', ')}`, left);
    doc.moveDown(0.4);
  }
};

// Render one problem's full body (assumes doc.x reset). Optional index for question papers.
const renderProblemBody = async (doc, problem, index) => {
  const left = doc.page.margins.left;
  doc.x = left;

  const heading = index ? `${index}. ${problem.title}` : problem.title;
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(COLORS.accent)
    .text(heading, { lineGap: 2 });
  doc.moveDown(0.4);

  renderMeta(doc, problem);
  drawDivider(doc);

  sectionHeading(doc, 'Problem Statement');
  bodyText(doc, problem.description);

  // Fetch public sample test cases.
  const samples = (await problemRepo.getPublicTestCases(problem.id))
    .map(t => ({ input_data: t.inputData, expected_output: t.expectedOutput }));

  if (samples.length > 0) {
    sectionHeading(doc, 'Sample Input / Output');
    samples.forEach((tc, i) => {
      doc.x = left;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text(`Example ${i + 1}`);
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('Input', left);
      monoBlock(doc, tc.input_data);
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('Output', left);
      monoBlock(doc, tc.expected_output);
      doc.moveDown(0.3);
    });
  }

  doc.x = left;
};

// @desc    Stream a single problem as a formatted PDF
// @route   GET /api/pdf/problems/:id/pdf
exports.exportProblemPdf = async (req, res) => {
  try {
    const { id } = req.params;

    const p = await problemRepo.getById(id);

    if (!p) {
      return res.status(404).json({ success: false, error: 'Problem not found' });
    }

    const problem = {
      id: p.id, title: p.title, description: p.description, difficulty: p.difficulty,
      tags: p.tags || [], time_limit: p.timeLimit, memory_limit: p.memoryLimit,
    };

    const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(problem.title)}.pdf"`);

    doc.on('error', (err) => {
      console.error('PDF stream error:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Server Error' });
    });

    doc.pipe(res);

    await renderProblemBody(doc, problem);

    // Footer with generation timestamp on every page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(
          `Generated by CodeSphere · ${new Date().toLocaleString()}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 12,
          { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right, lineBreak: false }
        );
    }

    doc.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// Render a simple bordered table. `cols` = [{ header, width, align }]; rows = array of string[].
const simpleTable = (doc, cols, rows) => {
  const left = doc.page.margins.left;
  const rowH = 18;
  const headerH = 20;

  const drawRow = (cells, y, isHeader) => {
    let x = left;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      .fillColor(isHeader ? COLORS.accent : COLORS.text);
    cols.forEach((c, i) => {
      doc.text(String(cells[i] ?? ''), x + 4, y + 5, { width: c.width - 8, align: c.align || 'left', lineBreak: false, ellipsis: true });
      x += c.width;
    });
  };

  // header
  if (doc.y + headerH > doc.page.height - doc.page.margins.bottom) doc.addPage();
  let y = doc.y;
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  doc.save().rect(left, y, totalW, headerH).fillColor('#F6F8FA').fill().restore();
  drawRow(cols.map(c => c.header), y, true);
  y += headerH;

  for (const row of rows) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = doc.y; }
    drawRow(row, y, false);
    doc.save().moveTo(left, y + rowH).lineTo(left + totalW, y + rowH).lineWidth(0.3).strokeColor(COLORS.border).stroke().restore();
    y += rowH;
  }
  doc.y = y;
  doc.x = left;
  doc.moveDown(0.8);
};

// @desc    Stream a printable class analytics report (for management review)
// @route   GET /api/pdf/class-report
exports.exportClassReport = async (req, res) => {
  try {
    // ── Gather data ──────────────────────────────────────────────────────────
    // Roster + department/section from Firestore; submissions from Firestore too.
    const studentsMap = await userRepo.getMapByRole('student');
    const studentIds = [...studentsMap.keys()];
    const idSet = new Set(studentIds);

    const allSubs = await submissionRepo.listAll();
    const subMillis = (s) => s.submittedAt?.toMillis?.() ?? new Date(s.submittedAt).getTime();

    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const active7d = new Set(allSubs.filter(s => subMillis(s) >= sevenDaysAgo).map(s => s.userId)).size;
    const totalSubs = allSubs.length;
    const totalAc = allSubs.filter(s => s.verdict === 'Accepted').length;
    const problemsSolved = new Set(allSubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId)).size;
    const stats = { total_students: studentIds.length, active_7d: active7d, problems_solved: problemsSolved };
    const acRate = totalSubs ? Math.round((totalAc / totalSubs) * 100) : 0;

    const perStudent = new Map(studentIds.map(id => [id, { solved: new Set(), total: 0, accepted: 0, lastSub: 0 }]));
    for (const s of allSubs) {
      const stat = perStudent.get(s.userId);
      if (!stat) continue;
      stat.total += 1;
      if (s.verdict === 'Accepted') { stat.accepted += 1; stat.solved.add(s.problemId); }
      const t = subMillis(s);
      if (t > stat.lastSub) stat.lastSub = t;
    }

    const topStudents = studentIds
      .map(id => {
        const profile = studentsMap.get(id) || {};
        const stat = perStudent.get(id);
        return {
          name: profile.name || 'Unknown',
          department: profile.department || '—', section: profile.section || '—',
          solved: stat.solved.size,
        };
      })
      .filter(s => s.solved > 0)
      .sort((a, b) => b.solved - a.solved)
      .slice(0, 10);

    const pdfTopicsProblemsMap = await problemRepo.getMapByIds([...new Set(allSubs.map(s => s.problemId))]);
    const pdfTopicCounts = {};
    for (const s of allSubs) {
      const tags = pdfTopicsProblemsMap.get(s.problemId)?.tags || [];
      for (const tag of tags) {
        if (!pdfTopicCounts[tag]) pdfTopicCounts[tag] = { topic: tag, solved_count: 0, failed_count: 0 };
        if (s.verdict === 'Accepted') pdfTopicCounts[tag].solved_count += 1;
        else pdfTopicCounts[tag].failed_count += 1;
      }
    }
    const topics = Object.values(pdfTopicCounts)
      .filter(t => t.failed_count > 0)
      .sort((a, b) => b.failed_count - a.failed_count)
      .slice(0, 8);

    const cohortGroups = new Map();
    for (const id of studentIds) {
      const label = studentsMap.get(id)?.department || 'Unassigned';
      if (!cohortGroups.has(label)) cohortGroups.set(label, { label, students: 0, solved: 0, total_subs: 0, accepted: 0 });
      const g = cohortGroups.get(label);
      const stat = perStudent.get(id);
      g.students += 1;
      g.solved += stat.solved.size;
      g.total_subs += stat.total;
      g.accepted += stat.accepted;
    }
    const cohorts = [...cohortGroups.values()].sort((a, b) => b.solved - a.solved);

    const fourteenDaysAgo = Date.now() - 14 * 86400000;
    const atRiskCount = studentIds.filter(id => perStudent.get(id).lastSub < fourteenDaysAgo).length;
    const atRisk = { count: atRiskCount };

    // ── Render ─────────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="class_report.pdf"`);
    doc.on('error', (err) => { console.error('PDF stream error:', err); if (!res.headersSent) res.status(500).json({ success: false, error: 'Server Error' }); });
    doc.pipe(res);

    const left = doc.page.margins.left;
    doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.accent).text('Class Performance Report');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
      .text(`Generated by CodeSphere · ${new Date().toLocaleString()}`);
    doc.moveDown(0.6);
    drawDivider(doc);

    sectionHeading(doc, 'Overview');
    const kpis = [
      ['Total students', stats.total_students],
      ['Active (last 7 days)', stats.active_7d],
      ['Total submissions', totalSubs],
      ['Class acceptance rate', `${acRate}%`],
      ['Distinct problems solved', stats.problems_solved],
      ['Students at risk', atRisk.count],
    ];
    doc.x = left;
    kpis.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(`${label}: `, left, doc.y, { continued: true });
      doc.font('Helvetica-Bold').fillColor(COLORS.text).text(String(value));
    });
    doc.moveDown(0.6);

    sectionHeading(doc, 'Top Students');
    if (topStudents.length) {
      simpleTable(doc,
        [{ header: '#', width: 26 }, { header: 'Name', width: 200 }, { header: 'Dept', width: 110 }, { header: 'Section', width: 80 }, { header: 'Solved', width: 66, align: 'right' }],
        topStudents.map((s, i) => [i + 1, s.name, s.department, s.section, s.solved]));
    } else { bodyText(doc, 'No accepted submissions yet.'); }

    sectionHeading(doc, 'Most-Failed Topics');
    if (topics.length) {
      simpleTable(doc,
        [{ header: 'Topic', width: 240 }, { header: 'Solved', width: 120, align: 'right' }, { header: 'Failed', width: 120, align: 'right' }],
        topics.map(t => [t.topic, t.solved_count, t.failed_count]));
    } else { bodyText(doc, 'No data yet.'); }

    sectionHeading(doc, 'Department Comparison');
    if (cohorts.length) {
      simpleTable(doc,
        [{ header: 'Department', width: 180 }, { header: 'Students', width: 90, align: 'right' }, { header: 'Solved', width: 80, align: 'right' }, { header: 'AC rate', width: 90, align: 'right' }],
        cohorts.map(c => {
          const subs = parseInt(c.total_subs) || 0;
          const ac = subs ? Math.round((parseInt(c.accepted) / subs) * 100) : 0;
          return [c.label, c.students, c.solved, `${ac}%`];
        }));
    } else { bodyText(doc, 'No department data yet.'); }

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(`CodeSphere Class Report · Page ${i + 1} of ${range.count}`,
          doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 12,
          { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right, lineBreak: false });
    }
    doc.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Build a question paper PDF (cover page + multiple problems)
// @route   POST /api/pdf/question-paper
exports.exportQuestionPaper = async (req, res) => {
  try {
    const { problem_ids, title } = req.body || {};

    if (!Array.isArray(problem_ids) || problem_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'problem_ids must be a non-empty array' });
    }

    const paperTitle = (typeof title === 'string' && title.trim()) ? title.trim() : 'Question Paper';

    // Fetch all requested problems, then re-order to match the requested order.
    const byId = await problemRepo.getMapByIds(problem_ids);

    if (byId.size === 0) {
      return res.status(404).json({ success: false, error: 'No matching problems found' });
    }

    const problems = problem_ids
      .map((pid) => byId.get(pid))
      .filter(Boolean)
      .map(p => ({
        id: p.id, title: p.title, description: p.description, difficulty: p.difficulty,
        tags: p.tags || [], time_limit: p.timeLimit, memory_limit: p.memoryLimit,
      }));

    const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(paperTitle)}.pdf"`);

    doc.on('error', (err) => {
      console.error('PDF stream error:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Server Error' });
    });

    doc.pipe(res);

    // ── Cover page ──────────────────────────────────────────────────────────
    const centerY = doc.page.height / 2 - 80;
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(COLORS.accent)
      .text(paperTitle, doc.page.margins.left, centerY, {
        align: 'center',
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(COLORS.muted)
      .text(`${problems.length} problem${problems.length === 1 ? '' : 's'}`, { align: 'center' });
    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(`Generated by CodeSphere · ${new Date().toLocaleString()}`, { align: 'center' });

    // Table of contents
    doc.moveDown(2);
    doc.x = doc.page.margins.left;
    sectionHeading(doc, 'Contents');
    problems.forEach((p, i) => {
      doc.x = doc.page.margins.left;
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(COLORS.text)
        .text(`${i + 1}. ${p.title}`, { continued: true })
        .font('Helvetica-Bold')
        .fillColor(difficultyColor(p.difficulty))
        .text(`   (${p.difficulty || 'N/A'})`);
    });

    // ── One page (or more) per problem ────────────────────────────────────────
    for (let i = 0; i < problems.length; i++) {
      doc.addPage();
      await renderProblemBody(doc, problems[i], i + 1);
    }

    // Page-number footer across the whole paper.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(
          `${paperTitle} · Page ${i + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 12,
          { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right, lineBreak: false }
        );
    }

    doc.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Server Error' });
  }
};
