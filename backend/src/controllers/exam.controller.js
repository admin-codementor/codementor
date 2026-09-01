const { logAction } = require('../middleware/audit');
const { canManageOwnedBy, canManageResource } = require('../middleware/role.middleware');
const { validateCIDR } = require('../middleware/cidrCheck');
const userRepo = require('../repositories/userRepository');
const classroomRepo = require('../repositories/classroomRepository');
const problemRepo = require('../repositories/problemRepository');
const examRepo = require('../repositories/examRepository');

const SECTION_TYPES = ['mcq', 'coding'];
const MAX_SECTION_PROBLEMS = 20;

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// ── Ownership guards (Decision D1 split, same as mcq.controller.js) ────────────
async function writableExam(req, examId) {
  const exam = await examRepo.getById(examId);
  if (!exam) return null;
  return (await canManageOwnedBy(req, exam.facultyId)) ? exam : null;
}

async function readableExam(req, examId) {
  const exam = await examRepo.getById(examId);
  if (!exam) return null;
  if (req.user.role === 'admin' || req.user.role === 'hod') return exam;
  return (await canManageOwnedBy(req, exam.facultyId)) ? exam : null;
}

// ── Shared field validation ─────────────────────────────────────────────────
function validateWindow(window_start, window_end) {
  const start = new Date(window_start);
  const end = new Date(window_end);
  if (Number.isNaN(start.getTime())) return { error: 'A valid window_start is required.' };
  if (Number.isNaN(end.getTime())) return { error: 'A valid window_end is required.' };
  if (end.getTime() <= start.getTime()) return { error: 'window_end must be after window_start.' };
  return { windowStart: start, windowEnd: end };
}

function validateCidrList(allowed_cidrs) {
  const cidrs = Array.isArray(allowed_cidrs) ? allowed_cidrs.map((c) => String(c).trim()).filter(Boolean) : [];
  for (const cidr of cidrs) {
    if (!validateCIDR(cidr)) return { error: `Invalid CIDR: "${cidr}"` };
  }
  return { cidrs };
}

// Empty list = every student, same convention as assignments.
async function validateClassroomIds(classroom_ids, req) {
  let classroomIds = [];
  if (Array.isArray(classroom_ids) && classroom_ids.length) {
    classroomIds = [...new Set(classroom_ids.map(String))].slice(0, 50);
    const unknown = [];
    for (const cid of classroomIds) {
      const c = await classroomRepo.getById(cid);
      if (!c || !(await canManageOwnedBy(req, c.facultyId))) unknown.push(cid);
    }
    if (unknown.length) return { error: `Unknown or inaccessible class id(s): ${unknown.slice(0, 3).join(', ')}` };
  }
  return { classroomIds };
}

// Same "no drafts" rule as assignments — a draft problem 404s for students.
async function validateProblemIds(problem_ids) {
  const ids = Array.isArray(problem_ids) ? [...new Set(problem_ids.map(String))] : [];
  if (ids.length > MAX_SECTION_PROBLEMS) {
    return { error: `A coding section can hold at most ${MAX_SECTION_PROBLEMS} problems.` };
  }
  if (ids.length === 0) return { problemIds: [] };
  const found = await problemRepo.getMapByIds(ids);
  const missing = ids.filter((pid) => !found.has(pid));
  if (missing.length) return { error: `Unknown problem id(s): ${missing.slice(0, 3).join(', ')}` };
  const drafts = ids.filter((pid) => (found.get(pid)?.status ?? 'published') === 'draft');
  if (drafts.length) {
    const titles = drafts.slice(0, 3).map((pid) => found.get(pid)?.title || pid);
    return { error: `These problems are still drafts and aren't visible to students: ${titles.join(', ')}. Publish them first.` };
  }
  return { problemIds: ids };
}

// Students only ever see an exam whose classroomIds is empty (targets everyone)
// or includes a class they're a member of — same shape as
// student.controller.js's visibleAssignmentsFor.
async function visibleExamsFor(userId) {
  const all = await examRepo.listPublished();
  const needsMembership = all.some((e) => (e.classroomIds || []).length > 0);
  const myClassIds = needsMembership
    ? new Set((await classroomRepo.listByStudentId(userId)).map((c) => c.id))
    : new Set();
  return all.filter((e) => {
    const target = e.classroomIds || [];
    return target.length === 0 || target.some((cid) => myClassIds.has(cid));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Faculty: exams
// ═══════════════════════════════════════════════════════════════════════════

exports.createExam = async (req, res) => {
  try {
    const { title, description, window_start, window_end, duration_minutes,
      general_instructions, allowed_cidrs, classroom_ids, negative_marking_default } = req.body;

    if (typeof title !== 'string' || !title.trim() || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
    }
    const win = validateWindow(window_start, window_end);
    if (win.error) return res.status(400).json({ success: false, error: win.error });

    const dur = parseInt(duration_minutes, 10);
    if (!Number.isFinite(dur) || dur < 1 || dur > 600) {
      return res.status(400).json({ success: false, error: 'Duration must be between 1 and 600 minutes.' });
    }

    const cidrRes = validateCidrList(allowed_cidrs);
    if (cidrRes.error) return res.status(400).json({ success: false, error: cidrRes.error });

    const classRes = await validateClassroomIds(classroom_ids, req);
    if (classRes.error) return res.status(400).json({ success: false, error: classRes.error });

    const negDefault = Math.max(parseFloat(negative_marking_default) || 0, 0);

    const exam = await examRepo.create({
      facultyId: req.user.id,
      title: title.trim(),
      description: (description || '').slice(0, 2000) || null,
      windowStart: win.windowStart,
      windowEnd: win.windowEnd,
      durationMinutes: dur,
      generalInstructions: (general_instructions || '').slice(0, 4000) || null,
      allowedCidrs: cidrRes.cidrs,
      classroomIds: classRes.classroomIds,
      negativeMarkingDefault: negDefault,
      isPublished: false,
    });
    logAction(req, 'exam.create', `exam "${title.trim()}"`);
    res.status(201).json({ success: true, data: { id: exam.id } });
  } catch (e) {
    console.error('Exam createExam error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });

    const { title, description, window_start, window_end, duration_minutes,
      general_instructions, allowed_cidrs, classroom_ids, negative_marking_default } = req.body;
    const partial = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.length > 200) {
        return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
      }
      partial.title = title.trim();
    }
    if (description !== undefined) partial.description = String(description).slice(0, 2000) || null;
    if (general_instructions !== undefined) partial.generalInstructions = String(general_instructions).slice(0, 4000) || null;

    if (window_start !== undefined || window_end !== undefined) {
      const current = await examRepo.getById(id);
      const win = validateWindow(
        window_start !== undefined ? window_start : current.windowStart,
        window_end !== undefined ? window_end : current.windowEnd
      );
      if (win.error) return res.status(400).json({ success: false, error: win.error });
      partial.windowStart = win.windowStart;
      partial.windowEnd = win.windowEnd;
    }

    if (duration_minutes !== undefined) {
      const dur = parseInt(duration_minutes, 10);
      if (!Number.isFinite(dur) || dur < 1 || dur > 600) {
        return res.status(400).json({ success: false, error: 'Duration must be between 1 and 600 minutes.' });
      }
      partial.durationMinutes = dur;
    }

    if (allowed_cidrs !== undefined) {
      const cidrRes = validateCidrList(allowed_cidrs);
      if (cidrRes.error) return res.status(400).json({ success: false, error: cidrRes.error });
      partial.allowedCidrs = cidrRes.cidrs;
    }

    if (classroom_ids !== undefined) {
      const classRes = await validateClassroomIds(classroom_ids, req);
      if (classRes.error) return res.status(400).json({ success: false, error: classRes.error });
      partial.classroomIds = classRes.classroomIds;
    }

    if (negative_marking_default !== undefined) {
      partial.negativeMarkingDefault = Math.max(parseFloat(negative_marking_default) || 0, 0);
    }

    if (Object.keys(partial).length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update.' });
    }

    await examRepo.update(id, partial);
    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error('Exam updateExam error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.listExams = async (req, res) => {
  try {
    const seesAll = req.user.role === 'admin' || req.user.role === 'hod';
    const exams = seesAll ? await examRepo.listAll() : await examRepo.listByFaculty(req.user.id);
    const usersMap = seesAll ? await userRepo.getAllUsersMap() : new Map();
    const data = await Promise.all(exams.map(async (e) => {
      const owner = usersMap.get(e.facultyId);
      return {
        id: e.id, title: e.title, is_published: !!e.isPublished,
        window_start: e.windowStart, window_end: e.windowEnd, duration_minutes: e.durationMinutes,
        created_at: e.createdAt,
        section_count: await examRepo.getSectionCount(e.id),
        attempt_count: await examRepo.getAttemptCount(e.id),
        author: e.facultyId === req.user.id ? 'You' : (owner?.name || null),
        can_edit: e.facultyId === req.user.id
          || req.user.role === 'admin'
          || canManageResource(req, e.facultyId, owner?.department ?? null),
      };
    }));
    data.sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Exam listExams error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getExamFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await readableExam(req, id);
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

    const sections = await examRepo.getSections(id);
    const sectionsOut = await Promise.all(sections.map(async (s) => {
      if (s.type === 'coding') {
        const problems = await problemRepo.getMapByIds(s.problemIds || []);
        return {
          id: s.id, title: s.title, type: s.type, order: s.order, instructions: s.instructions,
          marks_per_question: s.marksPerQuestion, negative_marking: s.negativeMarking,
          duration_minutes: s.durationMinutes,
          problems: (s.problemIds || []).map((pid) => ({
            id: pid, title: problems.get(pid)?.title || '(deleted problem)', difficulty: problems.get(pid)?.difficulty || null,
          })),
        };
      }
      const questions = (await examRepo.getSectionQuestions(id, s.id)).map((q) => ({
        id: q.id, question_text: q.questionText, options: q.options || [], correct_index: q.correctIndex ?? 0,
        marks: q.marks ?? 1, topic: q.topic || null, explanation: q.explanation || null,
        negative_marks: q.negativeMarks ?? null, position: q.position ?? 0,
      }));
      return {
        id: s.id, title: s.title, type: s.type, order: s.order, instructions: s.instructions,
        marks_per_question: s.marksPerQuestion, negative_marking: s.negativeMarking,
        duration_minutes: s.durationMinutes, questions,
      };
    }));

    res.json({
      success: true,
      data: {
        exam: {
          id: exam.id, title: exam.title, description: exam.description || null,
          window_start: exam.windowStart, window_end: exam.windowEnd, duration_minutes: exam.durationMinutes,
          general_instructions: exam.generalInstructions || null, allowed_cidrs: exam.allowedCidrs || [],
          classroom_ids: exam.classroomIds || [], negative_marking_default: exam.negativeMarkingDefault || 0,
          is_published: !!exam.isPublished, created_at: exam.createdAt,
        },
        sections: sectionsOut,
      },
    });
  } catch (e) {
    console.error('Exam getExamFaculty error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.publishExam = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    const publish = req.body.is_published === true;

    if (publish) {
      const sections = await examRepo.getSections(id);
      if (sections.length === 0) {
        return res.status(400).json({ success: false, error: 'Add at least one section before publishing.' });
      }
      for (const s of sections) {
        if (s.type === 'mcq') {
          const count = await examRepo.getSectionQuestionCount(id, s.id);
          if (count === 0) {
            return res.status(400).json({ success: false, error: `Section "${s.title}" has no questions.` });
          }
        } else if (s.type === 'coding') {
          if (!(s.problemIds || []).length) {
            return res.status(400).json({ success: false, error: `Section "${s.title}" has no problems attached.` });
          }
        }
      }
    }

    await examRepo.update(id, { isPublished: publish });
    res.json({ success: true, data: { is_published: publish } });
  } catch (e) {
    console.error('Exam publishExam error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    await examRepo.remove(id);
    logAction(req, 'exam.delete', `exam ${id}`);
    res.json({ success: true });
  } catch (e) {
    console.error('Exam deleteExam error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: sections ────────────────────────────────────────────────────────

exports.createSection = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });

    const { title, type, instructions, marks_per_question, negative_marking, duration_minutes, problem_ids } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Section title is required and must be ≤ 200 characters.' });
    }
    if (!SECTION_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${SECTION_TYPES.join(', ')}` });
    }
    const marksPerQuestion = Math.max(parseInt(marks_per_question, 10) || 1, 1);
    const negativeMarking = negative_marking !== undefined ? Math.max(parseFloat(negative_marking) || 0, 0) : null;
    const durationMinutes = duration_minutes !== undefined && duration_minutes !== null
      ? Math.max(parseInt(duration_minutes, 10) || 0, 0) || null : null;

    let problemIds = [];
    if (type === 'coding') {
      const probRes = await validateProblemIds(problem_ids);
      if (probRes.error) return res.status(400).json({ success: false, error: probRes.error });
      problemIds = probRes.problemIds;
    }

    const order = await examRepo.getSectionCount(id);
    const section = await examRepo.createSection(id, {
      title: title.trim(), type, order,
      instructions: (instructions || '').slice(0, 2000) || null,
      marksPerQuestion, negativeMarking, durationMinutes,
      problemIds,
    });
    res.status(201).json({ success: true, data: { id: section.id } });
  } catch (e) {
    console.error('Exam createSection error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const { id, sid } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    const section = await examRepo.getSection(id, sid);
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const { title, instructions, marks_per_question, negative_marking, duration_minutes } = req.body;
    const partial = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.length > 200) {
        return res.status(400).json({ success: false, error: 'Section title must be non-empty and ≤ 200 characters.' });
      }
      partial.title = title.trim();
    }
    if (instructions !== undefined) partial.instructions = String(instructions).slice(0, 2000) || null;
    if (marks_per_question !== undefined) partial.marksPerQuestion = Math.max(parseInt(marks_per_question, 10) || 1, 1);
    if (negative_marking !== undefined) partial.negativeMarking = negative_marking === null ? null : Math.max(parseFloat(negative_marking) || 0, 0);
    if (duration_minutes !== undefined) partial.durationMinutes = duration_minutes === null ? null : Math.max(parseInt(duration_minutes, 10) || 0, 0);

    if (Object.keys(partial).length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update.' });
    }
    await examRepo.updateSection(id, sid, partial);
    res.json({ success: true });
  } catch (e) {
    console.error('Exam updateSection error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    const { id, sid } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    const section = await examRepo.getSection(id, sid);
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });
    await examRepo.deleteSection(id, sid);
    res.json({ success: true });
  } catch (e) {
    console.error('Exam deleteSection error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.reorderSections = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    const { section_ids } = req.body;
    if (!Array.isArray(section_ids) || section_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'section_ids array is required.' });
    }
    const existing = await examRepo.getSections(id);
    const existingIds = new Set(existing.map((s) => s.id));
    const providedIds = new Set(section_ids);
    if (existingIds.size !== providedIds.size || [...existingIds].some((sid) => !providedIds.has(sid))) {
      return res.status(400).json({ success: false, error: 'section_ids must include every section exactly once.' });
    }
    await examRepo.reorderSections(id, section_ids);
    res.json({ success: true });
  } catch (e) {
    console.error('Exam reorderSections error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.setSectionQuestions = async (req, res) => {
  try {
    const { id, sid } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    const section = await examRepo.getSection(id, sid);
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });
    if (section.type !== 'mcq') return res.status(400).json({ success: false, error: 'Only mcq sections have questions.' });

    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one question is required.' });
    }
    if (questions.length > 200) {
      return res.status(400).json({ success: false, error: 'A section can have at most 200 questions.' });
    }

    for (const [i, q] of questions.entries()) {
      const opts = q.options;
      if (!q.question_text || typeof q.question_text !== 'string') {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: text is required.` });
      }
      if (!Array.isArray(opts) || opts.length < 2 || opts.length > 6 || !opts.every((o) => typeof o === 'string' && o.trim())) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: provide 2–6 non-empty options.` });
      }
      if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index >= opts.length) {
        return res.status(400).json({ success: false, error: `Question ${i + 1}: correct_index is out of range.` });
      }
    }

    const normalized = questions.map((q) => ({
      question_text: q.question_text.trim(),
      options: q.options.map((o) => String(o)),
      correct_index: q.correct_index,
      marks: Math.max(parseInt(q.marks, 10) || section.marksPerQuestion || 1, 1),
      topic: (q.topic || '').slice(0, 60) || null,
      explanation: (q.explanation || '').slice(0, 1000) || null,
      negative_marks: q.negative_marks !== undefined && q.negative_marks !== null ? Math.max(parseFloat(q.negative_marks) || 0, 0) : null,
    }));
    await examRepo.replaceSectionQuestions(id, sid, normalized);
    res.json({ success: true, data: { count: normalized.length } });
  } catch (e) {
    console.error('Exam setSectionQuestions error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.attachProblems = async (req, res) => {
  try {
    const { id, sid } = req.params;
    if (!(await writableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });
    const section = await examRepo.getSection(id, sid);
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });
    if (section.type !== 'coding') return res.status(400).json({ success: false, error: 'Only coding sections take problems.' });

    const probRes = await validateProblemIds(req.body.problem_ids);
    if (probRes.error) return res.status(400).json({ success: false, error: probRes.error });

    await examRepo.updateSection(id, sid, { problemIds: probRes.problemIds });
    res.json({ success: true, data: { count: probRes.problemIds.length } });
  } catch (e) {
    console.error('Exam attachProblems error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: results ─────────────────────────────────────────────────────────

exports.getResults = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await readableExam(req, id))) return res.status(404).json({ success: false, error: 'Exam not found' });

    const attempts = (await examRepo.listSubmittedAttempts(id))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));
    const usersMap = await userRepo.getAllUsersMap();

    const sections = await examRepo.getSections(id);
    const sectionStats = [];
    for (const s of sections) {
      if (s.type === 'mcq') {
        const questions = await examRepo.getSectionQuestions(id, s.id);
        const perQ = {};
        for (const q of questions) perQ[q.id] = { correct: 0, answered: 0 };
        for (const a of attempts) {
          const qs = a.questionState || {};
          for (const q of questions) {
            const entry = qs[q.id];
            if (entry && entry.selectedIndex != null) {
              perQ[q.id].answered += 1;
              if (entry.selectedIndex === q.correctIndex) perQ[q.id].correct += 1;
            }
          }
        }
        sectionStats.push({
          id: s.id, title: s.title, type: 'mcq',
          question_stats: questions.map((q) => ({
            id: q.id, question_text: q.questionText, topic: q.topic,
            answered: perQ[q.id].answered, correct: perQ[q.id].correct,
            accuracy: perQ[q.id].answered ? Math.round((perQ[q.id].correct / perQ[q.id].answered) * 100) : 0,
          })),
        });
      } else {
        const problemIds = s.problemIds || [];
        let attempted = 0, passed = 0;
        for (const a of attempts) {
          const cs = a.codingState || {};
          for (const pid of problemIds) {
            if (cs[pid]) {
              attempted += 1;
              if (cs[pid].verdict === 'Accepted') passed += 1;
            }
          }
        }
        sectionStats.push({ id: s.id, title: s.title, type: 'coding', problem_count: problemIds.length, attempted, passed });
      }
    }

    const scores = attempts.map((a) => a.score || 0);
    const avg = scores.length ? Math.round((scores.reduce((sum, n) => sum + n, 0) / scores.length) * 10) / 10 : 0;

    res.json({
      success: true,
      data: {
        attempts: attempts.map((a) => {
          const profile = usersMap.get(a.userId) || {};
          return {
            userId: a.userId, name: profile.name || 'Unknown', email: profile.email || null,
            rollNo: profile.rollNo || null, department: profile.department || null, section: profile.section || null,
            score: a.score, total: a.total, submittedAt: a.submittedAt,
          };
        }),
        summary: { attempts: attempts.length, avgScore: avg, maxScore: scores.length ? Math.max(...scores) : 0 },
        sections: sectionStats,
      },
    });
  } catch (e) {
    console.error('Exam getResults error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Student
// ═══════════════════════════════════════════════════════════════════════════

exports.listAvailable = async (req, res) => {
  try {
    const exams = (await visibleExamsFor(req.user.id))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    const data = await Promise.all(exams.map(async (e) => {
      const [attempt, sectionCount] = await Promise.all([
        examRepo.getAttempt(e.id, req.user.id), examRepo.getSectionCount(e.id),
      ]);
      return {
        id: e.id, title: e.title, description: e.description,
        window_start: e.windowStart, window_end: e.windowEnd, duration_minutes: e.durationMinutes,
        section_count: sectionCount,
        started: !!attempt, attempted: !!attempt?.submittedAt, score: attempt?.score ?? null, total: attempt?.total ?? null,
      };
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('Exam listAvailable error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getInstructions = async (req, res) => {
  try {
    const { id } = req.params;
    const visible = await visibleExamsFor(req.user.id);
    const exam = visible.find((e) => e.id === id);
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not available' });

    const sections = await examRepo.getSections(id);
    const sectionsOut = await Promise.all(sections.map(async (s) => {
      const count = s.type === 'mcq'
        ? await examRepo.getSectionQuestionCount(id, s.id)
        : (s.problemIds || []).length;
      return {
        id: s.id, title: s.title, type: s.type, order: s.order, instructions: s.instructions,
        question_count: count, marks_per_question: s.marksPerQuestion, negative_marking: s.negativeMarking,
        total_marks: count * (s.marksPerQuestion || 1), duration_minutes: s.durationMinutes,
      };
    }));

    res.json({
      success: true,
      data: {
        exam: {
          id: exam.id, title: exam.title, description: exam.description,
          general_instructions: exam.generalInstructions,
          window_start: exam.windowStart, window_end: exam.windowEnd, duration_minutes: exam.durationMinutes,
        },
        sections: sectionsOut,
      },
    });
  } catch (e) {
    console.error('Exam getInstructions error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Builds the payload the taking screen needs: sections with question stems
// (no answers) or coding-problem summaries, plus the student's own live state.
async function buildAttemptView(examId, exam, attempt) {
  const sections = await examRepo.getSections(examId);
  const sectionsOut = await Promise.all(sections.map(async (s) => {
    if (s.type === 'coding') {
      const problems = await problemRepo.getMapByIds(s.problemIds || []);
      return {
        id: s.id, title: s.title, type: s.type, order: s.order, instructions: s.instructions,
        marks_per_question: s.marksPerQuestion,
        problems: (s.problemIds || []).map((pid) => ({
          id: pid, title: problems.get(pid)?.title || '(deleted problem)', difficulty: problems.get(pid)?.difficulty || null,
        })),
      };
    }
    const questions = (await examRepo.getSectionQuestions(examId, s.id)).map((q) => ({
      id: q.id, question_text: q.questionText, options: q.options || [], marks: q.marks ?? 1,
      topic: q.topic || null, position: q.position ?? 0,
    }));
    return {
      id: s.id, title: s.title, type: s.type, order: s.order, instructions: s.instructions,
      marks_per_question: s.marksPerQuestion, questions,
    };
  }));

  const expiresAt = toMillis(attempt.windowExpiresAt);
  const secondsRemaining = expiresAt != null ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : null;

  return {
    exam: { id: exam.id, title: exam.title, duration_minutes: exam.durationMinutes },
    sections: sectionsOut,
    question_state: attempt.questionState || {},
    coding_state: attempt.codingState || {},
    seconds_remaining: secondsRemaining,
    submitted: !!attempt.submittedAt,
  };
}

exports.startAttempt = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await examRepo.getById(id);
    if (!exam || !exam.isPublished) return res.status(404).json({ success: false, error: 'Exam not available' });

    const visible = await visibleExamsFor(req.user.id);
    if (!visible.some((e) => e.id === id)) return res.status(403).json({ success: false, error: 'This exam is not assigned to you.' });

    const now = Date.now();
    const windowStartMs = toMillis(exam.windowStart);
    const windowEndMs = toMillis(exam.windowEnd);
    if (windowStartMs != null && now < windowStartMs) {
      return res.status(403).json({ success: false, error: 'This exam has not opened yet.' });
    }
    if (windowEndMs != null && now > windowEndMs) {
      return res.status(403).json({ success: false, error: 'This exam window has closed.' });
    }

    const existing = await examRepo.getAttempt(id, req.user.id);
    if (existing?.submittedAt) {
      return res.status(409).json({ success: false, error: 'You have already submitted this exam.' });
    }

    // Clamp to the exam's own window close, then let examRepo.startAttempt's own
    // exists-check make this idempotent — a resumed attempt keeps its original clock.
    const proposedExpiry = now + exam.durationMinutes * 60 * 1000;
    const windowExpiresAt = new Date(windowEndMs != null ? Math.min(proposedExpiry, windowEndMs) : proposedExpiry);

    const attempt = await examRepo.startAttempt(id, req.user.id, windowExpiresAt);
    logAction(req, 'exam.start', `exam ${id}`);
    res.json({ success: true, data: await buildAttemptView(id, exam, attempt) });
  } catch (e) {
    console.error('Exam startAttempt error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getAttemptState = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await examRepo.getById(id);
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
    const attempt = await examRepo.getAttempt(id, req.user.id);
    if (!attempt) return res.status(404).json({ success: false, error: 'Start the exam first.' });
    res.json({ success: true, data: await buildAttemptView(id, exam, attempt) });
  } catch (e) {
    console.error('Exam getAttemptState error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Shared guard for every attempt-mutating student endpoint: must have started,
// not already submitted, and still be inside the per-attempt time window.
async function requireLiveAttempt(req, res, examId) {
  const attempt = await examRepo.getAttempt(examId, req.user.id);
  if (!attempt) { res.status(404).json({ success: false, error: 'Start the exam first.' }); return null; }
  if (attempt.submittedAt) { res.status(409).json({ success: false, error: 'This exam is already submitted.' }); return null; }
  const expiresAt = toMillis(attempt.windowExpiresAt);
  if (expiresAt != null && Date.now() > expiresAt) {
    res.status(409).json({ success: false, error: 'Time is up for this exam.' });
    return null;
  }
  return attempt;
}

exports.answerQuestion = async (req, res) => {
  try {
    const { id, qid } = req.params;
    const { section_id, selected_index, marked } = req.body;
    if (!(await requireLiveAttempt(req, res, id))) return;

    const section = await examRepo.getSection(id, section_id);
    if (!section || section.type !== 'mcq') return res.status(404).json({ success: false, error: 'Section not found' });

    const question = await examRepo.getSectionQuestions(id, section_id).then((qs) => qs.find((q) => q.id === qid));
    if (!question) return res.status(404).json({ success: false, error: 'Question not found' });

    const hasSelection = Number.isInteger(selected_index);
    const isMarked = marked === true;
    const status = hasSelection
      ? (isMarked ? 'answered_marked' : 'answered')
      : (isMarked ? 'marked' : 'visited');

    await examRepo.patchQuestionState(id, req.user.id, qid, {
      status, selectedIndex: hasSelection ? selected_index : null, sectionId: section_id,
    });
    res.json({ success: true, data: { status } });
  } catch (e) {
    console.error('Exam answerQuestion error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.markVisited = async (req, res) => {
  try {
    const { id, qid: problemId } = req.params;
    const { section_id } = req.body;
    const attempt = await requireLiveAttempt(req, res, id);
    if (!attempt) return;

    const section = await examRepo.getSection(id, section_id);
    if (!section || section.type !== 'coding' || !(section.problemIds || []).includes(problemId)) {
      return res.status(404).json({ success: false, error: 'Problem not found in this section' });
    }

    // Never downgrade an already-answered problem back to merely "visited".
    const current = attempt.codingState?.[problemId];
    if (current?.status === 'answered') return res.json({ success: true, data: { status: 'answered' } });

    await examRepo.recordCodingAnswer(id, req.user.id, problemId, { status: 'visited', sectionId: section_id });
    res.json({ success: true, data: { status: 'visited' } });
  } catch (e) {
    console.error('Exam markVisited error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.submitExam = async (req, res) => {
  try {
    const { id } = req.params;
    const attempt = await requireLiveAttempt(req, res, id);
    if (!attempt) return;

    const sections = await examRepo.getSections(id);
    let score = 0, total = 0;
    const sectionResults = [];

    for (const s of sections) {
      if (s.type === 'mcq') {
        const questions = await examRepo.getSectionQuestions(id, s.id);
        let sectionScore = 0, sectionTotal = 0;
        for (const q of questions) {
          sectionTotal += q.marks;
          const entry = attempt.questionState?.[q.id];
          const selected = entry && Number.isInteger(entry.selectedIndex) ? entry.selectedIndex : null;
          if (selected === q.correctIndex) {
            sectionScore += q.marks;
          } else if (selected != null) {
            const negative = q.negativeMarks ?? s.negativeMarking ?? 0;
            sectionScore -= negative;
          }
        }
        score += sectionScore;
        total += sectionTotal;
        sectionResults.push({ id: s.id, title: s.title, type: 'mcq', score: sectionScore, total: sectionTotal });
      } else {
        const problemIds = s.problemIds || [];
        let sectionScore = 0;
        const sectionTotal = problemIds.length * (s.marksPerQuestion || 1);
        for (const pid of problemIds) {
          sectionScore += attempt.codingState?.[pid]?.score || 0;
        }
        score += sectionScore;
        total += sectionTotal;
        sectionResults.push({ id: s.id, title: s.title, type: 'coding', score: sectionScore, total: sectionTotal });
      }
    }

    await examRepo.finishAttempt(id, req.user.id, { score, total });
    logAction(req, 'exam.submit', `exam ${id} score ${score}/${total}`);
    res.json({ success: true, data: { score, total, sections: sectionResults } });
  } catch (e) {
    console.error('Exam submitExam error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
