const { logAction } = require('../middleware/audit');
const { canManageOwnedBy, canManageResource } = require('../middleware/role.middleware');
const { validateCIDR } = require('../middleware/cidrCheck');
const userRepo = require('../repositories/userRepository');
const groupRepo = require('../repositories/studentGroupRepository');
const proctorEventRepo = require('../repositories/proctorEventRepository');
const plagiarismResultRepo = require('../repositories/plagiarismResultRepository');
const examReport = require('../utils/examReport');
const examScoring = require('../utils/examScoring');
const problemRepo = require('../repositories/problemRepository');
const examRepo = require('../repositories/examRepository');
const nudgeRepo = require('../repositories/nudgeRepository');
const examAttempt = require('../utils/examAttempt');
const examLive = require('../services/examLiveService');
const classTargets = require('../services/classTargets');
const { cached } = require('../utils/cache');

const SECTION_TYPES = ['mcq', 'coding'];
const MAX_SECTION_PROBLEMS = 20;

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// Firestore Timestamp | Date | ISO-string | null -> full ISO string (or null).
// Timestamps serialize over JSON as {_seconds, _nanoseconds}, not a date
// string, so every field handed back to the client needs this — same helper
// as faculty.controller.js's toISO.
const toISO = (value) => {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return d.toISOString();
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

// How many times a student may leave fullscreen or switch tab before the attempt is paused for staff to decide. 0 means never pause.
function validateViolationLimit(input) {
  if (input === undefined || input === null || input === '') return { value: examAttempt.DEFAULT_VIOLATION_LIMIT };
  const n = Number(input);
  if (!Number.isInteger(n) || n < 0 || n > 50) return { error: 'The violation limit must be a whole number from 0 (never pause) to 50.' };
  return { value: n };
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
    const { unknown } = await classTargets.validateTargets(classroomIds, req);
    if (unknown.length) return { error: `Unknown or inaccessible class id(s): ${unknown.slice(0, 3).join(', ')}` };
  }
  return { classroomIds };
}

// Custom groups (review item 6) sit alongside classes rather than replacing them:
// an exam may target classes, groups, both, or neither (= everyone). A group can
// span branches, which is exactly what classroom targeting cannot express.
async function validateGroupIds(group_ids) {
  let groupIds = [];
  if (Array.isArray(group_ids) && group_ids.length) {
    groupIds = [...new Set(group_ids.map(String))].slice(0, 50);
    const found = await groupRepo.getMapByIds(groupIds);
    const unknown = groupIds.filter((gid) => !found.has(gid));
    if (unknown.length) return { error: `Unknown group id(s): ${unknown.slice(0, 3).join(', ')}` };
  }
  return { groupIds };
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
exports.visibleExamsFor = (userId) => visibleExamsFor(userId);

async function visibleExamsFor(userId) {
  const all = await examRepo.listPublished();
  const needsClasses = all.some((e) => (e.classroomIds || []).length > 0);
  const needsGroups = all.some((e) => (e.groupIds || []).length > 0);
  const [myClassIds, myGroupIds] = await Promise.all([
    needsClasses ? classTargets.studentClassIds(userId) : new Set(),
    needsGroups ? groupRepo.listByStudentId(userId).then((gs) => new Set(gs.map((g) => g.id))) : new Set(),
  ]);
  return all.filter((e) => {
    const classes = e.classroomIds || [];
    const groups = e.groupIds || [];
    // No targeting at all = everyone. Otherwise membership of EITHER list is enough.
    if (classes.length === 0 && groups.length === 0) return true;
    return classes.some((cid) => myClassIds.has(cid)) || groups.some((gid) => myGroupIds.has(gid));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Faculty: exams
// ═══════════════════════════════════════════════════════════════════════════

exports.createExam = async (req, res) => {
  try {
    const { title, description, window_start, window_end, duration_minutes,
      general_instructions, allowed_cidrs, classroom_ids, group_ids, negative_marking_default, violation_limit } = req.body;

    if (typeof title !== 'string' || !title.trim() || title.length > 200) {
      return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
    }
    const limitRes = validateViolationLimit(violation_limit);
    if (limitRes.error) return res.status(400).json({ success: false, error: limitRes.error });
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

    const groupRes = await validateGroupIds(group_ids);
    if (groupRes.error) return res.status(400).json({ success: false, error: groupRes.error });

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
      groupIds: groupRes.groupIds,
      negativeMarkingDefault: negDefault,
      violationLimit: limitRes.value,
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
      general_instructions, allowed_cidrs, classroom_ids, group_ids, negative_marking_default, violation_limit } = req.body;
    const partial = {};

    if (violation_limit !== undefined) {
      const limitRes = validateViolationLimit(violation_limit);
      if (limitRes.error) return res.status(400).json({ success: false, error: limitRes.error });
      partial.violationLimit = limitRes.value;
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.length > 200) {
        return res.status(400).json({ success: false, error: 'Title is required and must be ≤ 200 characters.' });
      }
      partial.title = title.trim();
    }
    // `String(null)` would silently save the literal text "null", so a
    // client-sent null (clearing the field) must short-circuit before that call.
    if (description !== undefined) partial.description = description == null ? null : String(description).slice(0, 2000) || null;
    if (general_instructions !== undefined) partial.generalInstructions = general_instructions == null ? null : String(general_instructions).slice(0, 4000) || null;

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

    if (group_ids !== undefined) {
      const groupRes = await validateGroupIds(group_ids);
      if (groupRes.error) return res.status(400).json({ success: false, error: groupRes.error });
      partial.groupIds = groupRes.groupIds;
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
    const exams = (seesAll ? await examRepo.listAll() : await examRepo.listByFaculty(req.user.id))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    const usersMap = seesAll ? await userRepo.getAllUsersMap() : new Map();
    const data = await Promise.all(exams.map(async (e) => {
      const owner = usersMap.get(e.facultyId);
      return {
        id: e.id, title: e.title, is_published: !!e.isPublished,
        window_start: toISO(e.windowStart), window_end: toISO(e.windowEnd), duration_minutes: e.durationMinutes,
        created_at: toISO(e.createdAt),
        section_count: await examRepo.getSectionCount(e.id),
        attempt_count: await examRepo.getAttemptCount(e.id),
        author: e.facultyId === req.user.id ? 'You' : (owner?.name || null),
        can_edit: e.facultyId === req.user.id
          || req.user.role === 'admin'
          || canManageResource(req, e.facultyId, owner?.department ?? null),
      };
    }));
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
          window_start: toISO(exam.windowStart), window_end: toISO(exam.windowEnd), duration_minutes: exam.durationMinutes,
          general_instructions: exam.generalInstructions || null, allowed_cidrs: exam.allowedCidrs || [],
          classroom_ids: exam.classroomIds || [], group_ids: exam.groupIds || [],
          negative_marking_default: exam.negativeMarkingDefault || 0,
          violation_limit: Number.isInteger(exam.violationLimit) ? exam.violationLimit : examAttempt.DEFAULT_VIOLATION_LIMIT,
          is_published: !!exam.isPublished, created_at: toISO(exam.createdAt),
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
    if (instructions !== undefined) partial.instructions = instructions == null ? null : String(instructions).slice(0, 2000) || null;
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
    const exam = await readableExam(req, id);
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });
    await finalizeExpiredAttempts(id, exam);

    const attempts = (await examRepo.listSubmittedAttempts(id))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));
    const [usersMap, proctorEvents, plagiarismPairs] = await Promise.all([
      userRepo.getAllUsersMap(),
      proctorEventRepo.listByExam(id),
      plagiarismResultRepo.listAllPairs(),
    ]);
    const proctorByUser = examReport.proctorSummary(proctorEvents);

    const sections = await examRepo.getSections(id);
    // Per-section marks need the question bank, which the loop below also reads;
    // collect it once here so each attempt's section score is a lookup, not a refetch.
    const questionsBySection = new Map();
    for (const s of sections) {
      if (s.type === 'mcq') questionsBySection.set(s.id, await examRepo.getSectionQuestions(id, s.id));
    }
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
        const problemsMeta = await problemRepo.getMapByIds(problemIds);
        const perP = {};
        for (const pid of problemIds) perP[pid] = { attempted: 0, accepted: 0, totalScore: 0 };
        for (const a of attempts) {
          const cs = a.codingState || {};
          for (const pid of problemIds) {
            const entry = cs[pid];
            if (entry) {
              perP[pid].attempted += 1;
              if (entry.verdict === 'Accepted') perP[pid].accepted += 1;
              perP[pid].totalScore += entry.score || 0;
            }
          }
        }
        sectionStats.push({
          id: s.id, title: s.title, type: 'coding',
          problem_stats: problemIds.map((pid) => ({
            id: pid, title: problemsMeta.get(pid)?.title || '(deleted problem)',
            attempted: perP[pid].attempted, accepted: perP[pid].accepted,
            accuracy: perP[pid].attempted ? Math.round((perP[pid].accepted / perP[pid].attempted) * 100) : 0,
            avgScore: perP[pid].attempted ? Math.round((perP[pid].totalScore / perP[pid].attempted) * 10) / 10 : 0,
          })),
        });
      }
    }

    const scores = attempts.map((a) => a.score || 0);
    const avg = scores.length ? Math.round((scores.reduce((sum, n) => sum + n, 0) / scores.length) * 10) / 10 : 0;
    const times = attempts.map(examReport.minutesTaken).filter((n) => n != null);

    // Similarity pairs are stored per assignment, not per exam, so they are
    // matched by participant rather than by exam id: a pair counts here when
    // both students sat this exam. Flagged by whoever ran the check, on
    // whichever assignment — which is why the UI labels it platform-wide.
    const attemptIds = new Set(attempts.map((a) => a.userId));
    const similarity = plagiarismPairs
      .filter((p) => attemptIds.has(p.studentA) && attemptIds.has(p.studentB))
      .map((p) => ({
        student_a: usersMap.get(p.studentA)?.name || 'Unknown',
        student_b: usersMap.get(p.studentB)?.name || 'Unknown',
        similarity: Math.round(p.similarity ?? 0),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 50);

    const rows = attempts.map((a) => {
      const profile = usersMap.get(a.userId) || {};
      const proctor = proctorByUser.get(a.userId) || null;
      return {
        userId: a.userId, name: profile.name || 'Unknown', email: profile.email || null,
        rollNo: profile.rollNo || null, department: profile.department || null, section: profile.section || null,
        score: a.score, total: a.total, submittedAt: toISO(a.submittedAt),
        percent: a.total ? Math.round(((a.score ?? 0) / a.total) * 100) : null,
        minutesTaken: examReport.minutesTaken(a),
        sectionScores: examReport.sectionScoresFor(a, sections, questionsBySection, exam),
        proctor,
      };
    });

    const totalMarks = attempts.find((a) => a.total)?.total ?? null;
    res.json({
      success: true,
      data: {
        attempts: rows,
        summary: {
          attempts: attempts.length,
          avgScore: avg,
          maxScore: scores.length ? Math.max(...scores) : 0,
          totalMarks,
          avgPercent: totalMarks ? Math.round((avg / totalMarks) * 100) : null,
          medianMinutes: examReport.median(times),
          flaggedStudents: rows.filter((r) => r.proctor && r.proctor.risk !== 'low').length,
          similarityPairs: similarity.length,
        },
        scoreBands: examReport.scoreBands(attempts),
        sections: sectionStats,
        similarity,
      },
    });
  } catch (e) {
    console.error('Exam getResults error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// One student's full attempt, from the faculty side — the aggregate results
// above intentionally don't carry every attempt's full question/coding state
// (that's O(attempts × questions) of payload for a class-wide view nobody
// reads in full), so a drill-down needs its own fetch. Reuses
// buildAttemptView() exactly as the student's own result screen does — an
// already-submitted attempt reveals correct_index/explanation there, and
// that's exactly what a faculty reviewer needs to see too.
exports.getAttemptDetail = async (req, res) => {
  try {
    const { id, userId: attemptUserId } = req.params;
    const exam = await readableExam(req, id);
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

    const attempt = await examRepo.getAttempt(id, attemptUserId);
    if (!attempt || !attempt.submittedAt) {
      return res.status(404).json({ success: false, error: 'This student has not submitted the exam yet.' });
    }

    const usersMap = await userRepo.getAllUsersMap();
    const profile = usersMap.get(attemptUserId) || {};
    const view = await buildAttemptView(id, exam, attempt);

    res.json({
      success: true,
      data: {
        student: {
          userId: attemptUserId, name: profile.name || 'Unknown', email: profile.email || null,
          rollNo: profile.rollNo || null, department: profile.department || null, section: profile.section || null,
        },
        ...view,
      },
    });
  } catch (e) {
    console.error('Exam getAttemptDetail error:', e.message);
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
        window_start: toISO(e.windowStart), window_end: toISO(e.windowEnd), duration_minutes: e.durationMinutes,
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
          window_start: toISO(exam.windowStart), window_end: toISO(exam.windowEnd), duration_minutes: exam.durationMinutes,
          violation_limit: Number.isInteger(exam.violationLimit) ? exam.violationLimit : examAttempt.DEFAULT_VIOLATION_LIMIT,
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
// Once the attempt is submitted, each MCQ question also carries its
// correct_index/explanation — safe to reveal only at that point, and this is
// the one payload shape both the live-taking screen and the post-submit
// review screen share, so the frontend doesn't need two different fetches.
async function buildAttemptView(examId, exam, attempt) {
  const submitted = !!attempt.submittedAt;
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
      ...(submitted ? { correct_index: q.correctIndex, explanation: q.explanation || null } : {}),
    }));
    return {
      id: s.id, title: s.title, type: s.type, order: s.order, instructions: s.instructions,
      marks_per_question: s.marksPerQuestion, questions,
    };
  }));

  const expiresAt = toMillis(attempt.windowExpiresAt);
  const secondsRemaining = expiresAt != null ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : null;

  return {
    exam: { id: exam.id, title: exam.title, duration_minutes: exam.durationMinutes, general_instructions: exam.generalInstructions || null },
    sections: sectionsOut,
    question_state: attempt.questionState || {},
    coding_state: attempt.codingState || {},
    seconds_remaining: secondsRemaining,
    submitted,
    submitted_at: toISO(attempt.submittedAt),
    auto_submitted: !!attempt.autoSubmitted,
    score: attempt.score ?? null,
    total: attempt.total ?? null,
    // Whether the attempt is paused for staff to decide (too many violations), and how close the student is to that.
    locked: attempt.locked ? { reason: attempt.locked.reason || 'violations', count: attempt.locked.count ?? null } : null,
    violation_count: attempt.violationCount || 0,
    violation_limit: Number.isInteger(exam.violationLimit) ? exam.violationLimit : examAttempt.DEFAULT_VIOLATION_LIMIT,
    reopen_count: Array.isArray(attempt.reopens) ? attempt.reopens.length : 0,
    // The server's clock, so the page can show a correct countdown even when the device clock is wrong.
    server_time: new Date().toISOString(),
  };
}

// The browser sends the session it was given by startAttempt with every change it makes (header X-Exam-Session).
const sessionOf = (req) => {
  const s = req.get('x-exam-session');
  return examAttempt.validSessionId(s) ? s : null;
};

const refuse = (res, g) => res.status(g.status).json({ success: false, code: g.code, error: g.error, hint: g.hint });

// Starting or resuming an exam makes THIS window the active one (a second device or tab takes over; the first is told on its next
// save). A repeated start from the same window just claims again. The attempt keeps its original clock either way.
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
    const existing = await examRepo.getAttempt(id, req.user.id);
    if (existing?.submittedAt) {
      return res.status(409).json({ success: false, code: 'ALREADY_SUBMITTED', error: 'You have already submitted this exam.', hint: 'Your answers are saved.' });
    }
    // A student who already has an attempt may come back to it (their own clock is what counts, and staff may have reopened it
    // after the window closed). A NEW attempt can only start inside the window.
    if (!existing) {
      if (windowStartMs != null && now < windowStartMs) return res.status(403).json({ success: false, error: 'This exam has not opened yet.' });
      if (windowEndMs != null && now > windowEndMs) return res.status(403).json({ success: false, error: 'This exam window has closed.' });
    }

    // Clamp to the exam's own window close, then let examRepo.startAttempt's own
    // exists-check make this idempotent — a resumed attempt keeps its original clock.
    const proposedExpiry = now + exam.durationMinutes * 60 * 1000;
    const windowExpiresAt = new Date(windowEndMs != null ? Math.min(proposedExpiry, windowEndMs) : proposedExpiry);
    await examRepo.startAttempt(id, req.user.id, windowExpiresAt);

    const sessionId = examAttempt.newSessionId();
    const claim = await examRepo.mutateAttempt(id, req.user.id, (a) => {
      if (!a) return { outcome: { missing: true } };
      if (a.submittedAt) return { outcome: { submitted: true } };
      return { outcome: { previous: a.session?.id || null }, update: { session: { id: sessionId, claimedAt: now, epoch: (Number.isInteger(a.session?.epoch) ? a.session.epoch : 0) + 1 } } };
    });
    if (claim?.submitted) return res.status(409).json({ success: false, code: 'ALREADY_SUBMITTED', error: 'You have already submitted this exam.', hint: 'Your answers are saved.' });
    if (claim?.previous) {
      // Another window held the exam: this one took over. Kept as a soft signal for the report, and in the audit trail.
      logAction(req, 'exam.takeover', `exam ${id}: a new window took over the attempt`);
      proctorEventRepo.create({ userId: req.user.id, assignmentId: null, examId: id, problemId: null, eventType: 'session_takeover', detail: 'the exam was opened in another window or device' })
        .catch((e) => console.error('takeover event failed:', e.message));
    }
    logAction(req, 'exam.start', `exam ${id}`);
    const attempt = await examRepo.getAttempt(id, req.user.id);
    res.json({ success: true, data: { ...(await buildAttemptView(id, exam, attempt)), session_id: sessionId } });
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
    // Deliberately NOT re-checking visibleExamsFor here (unlike start/instructions):
    // an attempt record existing is itself proof the student was authorized to
    // start it — startAttempt already gated that. Requiring current published/
    // classroom-visibility on every resume would lock a student out of viewing
    // their own in-progress or already-submitted attempt the moment faculty
    // unpublishes the exam, which is a real thing faculty do once a window closes.
    let attempt = await examRepo.getAttempt(id, req.user.id);
    if (!attempt) return res.status(404).json({ success: false, error: 'Start the exam first.' });
    // Time ran out and nothing was submitted: score it now, as submitted when the window closed, so the student sees
    // their result instead of a locked attempt with no score.
    if (examScoring.isExpiredUnsubmitted(attempt)) {
      const r = await scoreExamAttempt(id, attempt, exam);
      await examRepo.finishAttempt(id, req.user.id, { score: r.score, total: r.total, submittedAt: attempt.windowExpiresAt, autoSubmitted: true });
      attempt = await examRepo.getAttempt(id, req.user.id);
    }
    res.json({ success: true, data: await buildAttemptView(id, exam, attempt) });
  } catch (e) {
    console.error('Exam getAttemptState error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Saving one MCQ answer. The write goes through the attempt's rules in one transaction: right session, not submitted, not locked, not
// past the deadline, and not older than what is already stored (a delayed retry loses quietly instead of overwriting a newer answer).
exports.answerQuestion = async (req, res) => {
  try {
    const { id, qid } = req.params;
    const { section_id, selected_index, marked, seq } = req.body;

    const known = await examLive.sectionIds(id, section_id);
    if (!known || known.type !== 'mcq') return res.status(404).json({ success: false, error: 'Section not found' });
    if (!known.ids.has(qid)) return res.status(404).json({ success: false, error: 'Question not found' });

    const hasSelection = selected_index !== undefined && selected_index !== null;
    if (hasSelection && !(Number.isInteger(selected_index) && selected_index >= 0 && selected_index < 26)) {
      return res.status(400).json({ success: false, error: 'That option does not exist.' });
    }
    const isMarked = marked === true;
    const status = hasSelection
      ? (isMarked ? 'answered_marked' : 'answered')
      : (isMarked ? 'marked' : 'visited');

    const sessionId = sessionOf(req);
    const out = await examRepo.mutateAttempt(id, req.user.id, (attempt) => {
      const g = examAttempt.guardLive(attempt, { sessionId, now: Date.now() });
      if (!g.ok) return { outcome: { refused: g } };
      const epoch = Number.isInteger(attempt.session?.epoch) ? attempt.session.epoch : 0;
      const d = examAttempt.decideSave(attempt.questionState?.[qid], seq, epoch);
      if (!d.apply) return { outcome: { stale: true, status: attempt.questionState?.[qid]?.status ?? status } };
      return {
        outcome: { status, seq: d.seq },
        update: {
          [`questionState.${qid}`]: { status, selectedIndex: hasSelection ? selected_index : null, sectionId: section_id, ...(d.seq != null ? { seq: d.seq, epoch } : {}) },
          lastSaveAt: new Date(),
        },
      };
    });
    if (out.refused) return refuse(res, out.refused);
    res.json({ success: true, data: out.stale ? { status: out.status, stale: true } : { status: out.status, seq: out.seq ?? null } });
  } catch (e) {
    console.error('Exam answerQuestion error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.markVisited = async (req, res) => {
  try {
    const { id, qid: problemId } = req.params;
    const { section_id } = req.body;

    const known = await examLive.sectionIds(id, section_id);
    if (!known || known.type !== 'coding' || !known.ids.has(problemId)) {
      return res.status(404).json({ success: false, error: 'Problem not found in this section' });
    }

    const sessionId = sessionOf(req);
    const out = await examRepo.mutateAttempt(id, req.user.id, (attempt) => {
      const g = examAttempt.guardLive(attempt, { sessionId, now: Date.now() });
      if (!g.ok) return { outcome: { refused: g } };
      // Never downgrade an already-answered problem back to merely "visited".
      if (attempt.codingState?.[problemId]?.status === 'answered') return { outcome: { status: 'answered' } };
      return { outcome: { status: 'visited' }, update: { [`codingState.${problemId}`]: { status: 'visited', sectionId: section_id }, lastSaveAt: new Date() } };
    });
    if (out.refused) return refuse(res, out.refused);
    res.json({ success: true, data: { status: out.status } });
  } catch (e) {
    console.error('Exam markVisited error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Score one attempt from its stored state. The same function scores a submitted attempt, the faculty report and an
// attempt that ran out of time (utils/examScoring.js), so they cannot disagree.
async function scoreExamAttempt(examId, attempt, exam, preloaded) {
  const sections = preloaded?.sections ?? await examRepo.getSections(examId);
  let questionsBySection = preloaded?.questionsBySection;
  if (!questionsBySection) {
    questionsBySection = new Map();
    for (const s of sections) {
      if (s.type === 'mcq') questionsBySection.set(s.id, await examRepo.getSectionQuestions(examId, s.id));
    }
  }
  return examScoring.scoreAttempt({ sections, questionsBySection, attempt, exam });
}

// An attempt whose window closed without being submitted (tab closed, connection lost) used to have no score and
// vanished from results, so class averages were biased upward. Score it as submitted at the moment time ran out.
// Idempotent: a finished attempt is never touched.
async function finalizeExpiredAttempts(examId, exam) {
  const expired = (await examRepo.listAttempts(examId)).filter((a) => examScoring.isExpiredUnsubmitted(a));
  if (expired.length === 0) return 0;
  const sections = await examRepo.getSections(examId);
  const questionsBySection = new Map();
  for (const s of sections) {
    if (s.type === 'mcq') questionsBySection.set(s.id, await examRepo.getSectionQuestions(examId, s.id));
  }
  for (const a of expired) {
    const r = await scoreExamAttempt(examId, a, exam, { sections, questionsBySection });
    await examRepo.finishAttempt(examId, a.userId, { score: r.score, total: r.total, submittedAt: a.windowExpiresAt, autoSubmitted: true });
  }
  return expired.length;
}

// Submitting is idempotent: pressing Finish twice, or retrying after a lost response, returns the same result instead of an error.
// The attempt is scored inside the transaction from its CURRENT state, so an answer saved a moment before Finish is not missed.
exports.submitExam = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await examRepo.getById(id);
    if (!exam) return res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Exam not found' });

    // Static data, loaded before the transaction so the decision inside it stays synchronous.
    const sections = await examRepo.getSections(id);
    const questionsBySection = new Map();
    for (const s of sections) {
      if (s.type === 'mcq') questionsBySection.set(s.id, await examRepo.getSectionQuestions(id, s.id));
    }

    const sessionId = sessionOf(req);
    const out = await examRepo.mutateAttempt(id, req.user.id, (attempt) => {
      if (!attempt) return { outcome: { refused: examAttempt.guardLive(null) } };
      if (attempt.submittedAt) return { outcome: { already: true, attempt } };
      const g = examAttempt.guardLive(attempt, { sessionId, now: Date.now() });
      if (!g.ok) return { outcome: { refused: g } };
      const result = examScoring.scoreAttempt({ sections, questionsBySection, attempt, exam });
      return { outcome: { result }, update: { submittedAt: new Date(), score: result.score, total: result.total } };
    });
    if (out.refused) return refuse(res, out.refused);

    if (out.already) {
      const result = examScoring.scoreAttempt({ sections, questionsBySection, attempt: out.attempt, exam });
      return res.json({ success: true, data: { score: out.attempt.score ?? result.score, total: out.attempt.total ?? result.total, sections: result.sections, already_submitted: true } });
    }
    logAction(req, 'exam.submit', `exam ${id} score ${out.result.score}/${out.result.total}`);
    res.json({ success: true, data: { score: out.result.score, total: out.result.total, sections: out.result.sections } });
  } catch (e) {
    console.error('Exam submitExam error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ══════════════════════════════════════════════════════════════
// Staff: the live roster, and resuming a cut-off or paused student
// ══════════════════════════════════════════════════════════════

async function ownerDepartmentOf(exam) {
  if (!exam?.facultyId) return null;
  return (await userRepo.getById(exam.facultyId))?.department ?? null;
}

const actorOf = (req) => ({ id: req.user.id, role: req.user.role, department: req.user.department ?? null });

// @route GET /api/exams/:id/roster
// Everyone who has started: state, time left, how much they have answered, flags, and whether they were reopened. Staff use it during
// an exam to see who dropped out and to resume them. Held for 10 seconds so a screen refreshing every few seconds costs one read.
exports.getRoster = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await readableExam(req, id);
    if (!exam) return res.status(404).json({ success: false, error: 'Exam not found' });

    const now = Date.now();
    const base = await cached(`exam-roster:v1:${id}`, 10, async () => {
      const [attempts, users] = await Promise.all([examRepo.listAttempts(id), userRepo.getAllUsersMap()]);
      const rows = attempts.map((a) => {
        const u = users.get(a.userId) || {};
        const answered = Object.values(a.questionState || {}).filter((q) => Number.isInteger(q?.selectedIndex)).length
          + Object.values(a.codingState || {}).filter((c) => c?.status === 'answered').length;
        const lastSave = toMillis(a.lastSaveAt) ?? toMillis(a.startedAt);
        return {
          userId: a.userId, name: u.name || 'Unknown', rollNo: u.rollNo || null, section: u.section || null,
          startedAt: toISO(a.startedAt), lastSaveAt: lastSave ? new Date(lastSave).toISOString() : null,
          expiresAtMs: toMillis(a.windowExpiresAt), submittedAtMs: toMillis(a.submittedAt),
          submitted: !!a.submittedAt, autoSubmitted: !!a.autoSubmitted, locked: a.locked ? { reason: a.locked.reason, count: a.locked.count } : null,
          answered, violationCount: a.violationCount || 0, reopenCount: Array.isArray(a.reopens) ? a.reopens.length : 0,
          score: a.score ?? null, total: a.total ?? null,
          _a: { submittedAt: a.submittedAt, autoSubmitted: a.autoSubmitted, locked: a.locked, windowExpiresAt: a.windowExpiresAt },
        };
      });
      return rows;
    });

    const rows = base.map(({ _a, expiresAtMs, ...r }) => {
      const state = examAttempt.rosterState(_a, now);
      return { ...r, state, secondsLeft: state === 'in_progress' || state === 'locked' ? Math.max(0, Math.floor(((expiresAtMs ?? now) - now) / 1000)) : null };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const count = (st) => rows.filter((r) => r.state === st).length;
    const canResume = examAttempt.canReopen({ actor: actorOf(req), exam, ownerDepartment: await ownerDepartmentOf(exam) });

    res.json({
      success: true,
      data: {
        exam: { id: exam.id, title: exam.title, window_end: toISO(exam.windowEnd), duration_minutes: exam.durationMinutes, violation_limit: Number.isInteger(exam.violationLimit) ? exam.violationLimit : examAttempt.DEFAULT_VIOLATION_LIMIT },
        counts: { total: rows.length, in_progress: count('in_progress'), locked: count('locked'), expired: count('expired'), submitted: count('submitted'), auto_submitted: count('auto_submitted') },
        rows, can_resume: canResume, server_time: new Date(now).toISOString(),
      },
    });
  } catch (e) {
    console.error('Exam getRoster error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @route POST /api/exams/:id/attempts/:userId/reopen   body { reason, extra_minutes }
// Resume a student whose attempt was cut off (submitted early by a failure, timed out, or paused after too many violations). The
// reason is required and kept on the attempt with who did it and what the attempt looked like before; the student is told.
exports.reopenAttempt = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const exam = await examRepo.getById(id);
    if (!exam) return res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Exam not found' });
    const actor = actorOf(req);
    if (!examAttempt.canReopen({ actor, exam, ownerDepartment: await ownerDepartmentOf(exam) })) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Only an Admin, the exam\'s owner or the owner\'s HOD can resume a student.' });
    }

    const out = await examRepo.mutateAttempt(id, userId, (attempt) => {
      const plan = examAttempt.planReopen({ attempt, exam, actor, input: { reason: req.body?.reason, extraMinutes: req.body?.extra_minutes }, now: Date.now() });
      return plan.error ? { outcome: { plan } } : { outcome: { plan }, update: plan.patch };
    });
    if (out.plan.error) return res.status(out.plan.status).json({ success: false, code: out.plan.code, error: out.plan.error });

    const { entry, newExpiry } = out.plan;
    logAction(req, 'exam.reopen', `exam ${id} student ${userId} +${entry.extraMinutes} min: ${entry.reason}`);
    const sender = await userRepo.getById(actor.id);
    nudgeRepo.addMany([{
      studentId: userId, fromId: actor.id, fromName: sender?.name || 'Your faculty', createdAtMs: Date.now(), readAtMs: null,
      message: `Your exam "${String(exam.title).slice(0, 80)}" was reopened. Open it again to continue; it ends at ${new Date(newExpiry).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
    }]).catch((e) => console.error('reopen notice failed:', e.message));
    res.json({ success: true, data: { expires_at: new Date(newExpiry).toISOString(), reopen_count: (out.plan.patch.reopens || []).length } });
  } catch (e) {
    console.error('Exam reopenAttempt error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
