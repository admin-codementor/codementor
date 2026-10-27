// The academic structure as pure rules (no database): terms, classes, who is in a class, class teacher, sub-mentors by position,
// teaching assignments with dates, access grants, and what a faculty member may see. See docs/TNP_ADMIN_EXAMS_SECURITY_PLAN.md section 7.
//
// Words:
//   term         one semester of one academic year; one is "active" at a time
//   class        the students of one department, year and section for ONE term (kind 'section'), or a hand-made group such as an elective
//                (kind 'elective'). A student is in one section class per term (their "primary" class) and any number of electives.
//   position     a student's place, from 1, in the class list sorted by roll number
//   sub-mentor   looks after the students at positions from..to of a class (for example 1 to 24, then 25 to 48)
//   assignment   a faculty member teaches a subject to a class from one date until another; ended, never deleted
const MAX_RANGE_SIZE = 200;

// ── roll numbers ──
/** Natural order for roll numbers: "21CS2" before "21CS10", letters compared without case. */
function compareRoll(a, b) {
  const pa = String(a ?? '').toUpperCase().match(/\d+|\D+/g) || [];
  const pb = String(b ?? '').toUpperCase().match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i]; const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x); const ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d !== 0) return d; } else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Students of a class in roll-number order, each with their position (1-based). Students with no roll number go last, by name. */
function sortedRoster(students) {
  const sorted = [...students].sort((a, b) => {
    const ra = a.rollNo || ''; const rb = b.rollNo || '';
    if (!ra && !rb) return String(a.name || '').localeCompare(String(b.name || ''));
    if (!ra) return 1;
    if (!rb) return -1;
    return compareRoll(ra, rb) || String(a.id).localeCompare(String(b.id));
  });
  return sorted.map((s, i) => ({ ...s, position: i + 1 }));
}

// ── class identity ──
const slug = (v) => String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The same section class always gets the same id, so generating classes twice never makes a second one. */
function sectionClassId(termId, department, year, section) {
  return `${termId}__${slug(department)}__${Number(year)}__${slug(section)}`;
}

function classLabel(c) {
  if (c.kind === 'elective') return c.name || 'Elective';
  return `${c.department} year ${c.year} section ${c.section}`;
}

// ── sub-mentor ranges ──
/**
 * Do the ranges cover positions 1..count exactly once?
 * @param {{mentorId: string, from: number, to: number}[]} ranges
 * @returns {{ok: boolean, errors: {code: string, message: string}[], gaps: number[][], overlaps: number[][]}}
 */
function validateRanges(ranges, count) {
  const errors = []; const gaps = []; const overlaps = [];
  const list = Array.isArray(ranges) ? ranges : [];
  const clean = [];
  list.forEach((r, i) => {
    const from = r?.from; const to = r?.to;
    if (!r || !r.mentorId || typeof r.mentorId !== 'string') { errors.push({ code: 'NO_MENTOR', message: `Range ${i + 1} has no sub-mentor.` }); return; }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) { errors.push({ code: 'BAD_RANGE', message: `Range ${i + 1} must be whole numbers with 1 <= from <= to.` }); return; }
    if (to - from + 1 > MAX_RANGE_SIZE) { errors.push({ code: 'TOO_BIG', message: `Range ${i + 1} is larger than ${MAX_RANGE_SIZE} students.` }); return; }
    clean.push({ mentorId: r.mentorId, from, to });
  });
  clean.sort((a, b) => a.from - b.from || a.to - b.to);
  let next = 1;
  for (const r of clean) {
    if (r.from > next) gaps.push([next, Math.min(r.from - 1, Math.max(count, r.from - 1))]);
    if (r.from < next) overlaps.push([r.from, Math.min(r.to, next - 1)]);
    next = Math.max(next, r.to + 1);
  }
  if (count > 0 && next <= count) gaps.push([next, count]);
  if (clean.length && clean[clean.length - 1].to > count && next - 1 > count) errors.push({ code: 'BEYOND_CLASS', message: `A range goes up to ${next - 1} but the class has ${count} students.` });
  if (gaps.length) errors.push({ code: 'GAP', message: `Positions not covered: ${gaps.map(([a, b]) => (a === b ? a : `${a} to ${b}`)).join(', ')}.` });
  if (overlaps.length) errors.push({ code: 'OVERLAP', message: `Positions covered twice: ${overlaps.map(([a, b]) => (a === b ? a : `${a} to ${b}`)).join(', ')}.` });
  return { ok: errors.length === 0, errors, gaps, overlaps };
}

/** A starting split: 1 to 24, 25 to 48, ... one range per mentor given (the last takes the remainder). */
function suggestRanges(count, mentorIds, size = 24) {
  const ids = (mentorIds || []).filter(Boolean);
  if (count < 1 || ids.length === 0) return [];
  const out = [];
  for (let i = 0; i < ids.length && i * size < count; i += 1) {
    const from = i * size + 1;
    const last = i === ids.length - 1 || (i + 1) * size >= count;
    out.push({ mentorId: ids[i], from, to: last ? count : (i + 1) * size });
  }
  return out;
}

/** Who looks after the student at this position: the sub-mentor whose range holds it, else the class teacher, else nobody. */
function mentorForPosition(cls, position) {
  const r = (cls?.subMentors || []).find((x) => position >= x.from && position <= x.to);
  return r ? r.mentorId : (cls?.classTeacherId || null);
}

// ── dates ──
/** A time as milliseconds: a Firestore Timestamp, a Date, an ISO date text, or a number. Anything unreadable is "not set". */
function toMs(v) {
  if (v == null) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const n = typeof v === 'string' ? Date.parse(v) : Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Active on `at`: started, and not ended (an assignment ending at T is no longer active at T). */
function isActive(row, at = Date.now()) {
  const from = toMs(row?.from); const to = toMs(row?.to);
  if (from != null && at < from) return false;
  return to == null || at < to;
}

/** A grant is an approved request that has not expired. */
function isGrantActive(req, at = Date.now()) {
  return req?.status === 'approved' && (req.expiresAt == null || at < toMs(req.expiresAt));
}

// ── what a faculty member may see ──
/**
 * @param {string} facultyId
 * @param {{classes: object[], assignments: object[], grants: object[], at?: number}} data classes of the ACTIVE term, assignments and grants of this faculty member
 * @returns {Map<string, {via: string[], mentees: boolean}>} classId -> why it is visible; `mentees: true` means only that sub-mentor's own range, not the whole class
 */
function visibleClasses(facultyId, { classes, assignments, grants, at = Date.now() }) {
  const out = new Map();
  const add = (classId, via, mentees) => {
    const cur = out.get(classId);
    if (!cur) out.set(classId, { via: [via], mentees });
    else { cur.via.push(via); cur.mentees = cur.mentees && mentees; }   // any whole-class reason beats a mentees-only one
  };
  const ids = new Set((classes || []).map((c) => c.id));
  for (const c of classes || []) {
    if (c.classTeacherId === facultyId) add(c.id, 'class teacher', false);
    else if ((c.subMentors || []).some((r) => r.mentorId === facultyId)) add(c.id, 'sub-mentor', true);
  }
  for (const a of assignments || []) {
    if (a.facultyId === facultyId && ids.has(a.classId) && isActive(a, at)) add(a.classId, `teaches ${a.subject || 'a subject'}`, false);
  }
  for (const g of grants || []) {
    if (g.facultyId === facultyId && ids.has(g.classId) && isGrantActive(g, at)) add(g.classId, 'access granted', false);
  }
  return out;
}

/**
 * The student ids a faculty member may see through the academic structure.
 * @param {Map} visible from visibleClasses
 * @param {{classId: string, studentId: string, position?: number}[]} memberships memberships of the visible classes
 * @param {Map<string, object>} classesById
 */
function studentIdsFor(facultyId, visible, memberships, classesById) {
  const ids = new Set();
  for (const m of memberships) {
    const v = visible.get(m.classId);
    if (!v) continue;
    if (!v.mentees) { ids.add(m.studentId); continue; }
    const cls = classesById.get(m.classId);
    const r = (cls?.subMentors || []).find((x) => x.mentorId === facultyId && m.position >= x.from && m.position <= x.to);
    if (r) ids.add(m.studentId);
  }
  return ids;
}

// ── consistency ──
/**
 * Problems an Admin or HOD should fix. Pure: gets everything it needs.
 * @returns {{code: string, message: string, classId?: string, studentId?: string}[]}
 */
function consistencyIssues({ classes, memberships, students, assignments, staffIds, at = Date.now() }) {
  const issues = [];
  const byClass = new Map();
  for (const m of memberships) (byClass.get(m.classId) || byClass.set(m.classId, []).get(m.classId)).push(m);
  const sectionStudents = new Set(memberships.filter((m) => m.primary).map((m) => m.studentId));
  for (const s of students) {
    if (!sectionStudents.has(s.id)) issues.push({ code: 'NO_CLASS', studentId: s.id, message: `${s.name || s.id}${s.rollNo ? ` (${s.rollNo})` : ''} is not in any class this term.` });
  }
  for (const c of classes) {
    const n = (byClass.get(c.id) || []).length;
    const label = classLabel(c);
    if (c.kind !== 'elective' && !c.classTeacherId) issues.push({ code: 'NO_TEACHER', classId: c.id, message: `${label} has no class teacher.` });
    if (c.classTeacherId && staffIds && !staffIds.has(c.classTeacherId)) issues.push({ code: 'TEACHER_GONE', classId: c.id, message: `The class teacher of ${label} is no longer on the staff list.` });
    if (c.kind !== 'elective' && n > 0 && (c.subMentors || []).length > 0) {
      const v = validateRanges(c.subMentors, n);
      if (!v.ok) issues.push({ code: 'RANGES', classId: c.id, message: `${label}: ${v.errors.map((e) => e.message).join(' ')}` });
    }
    for (const r of c.subMentors || []) {
      if (staffIds && !staffIds.has(r.mentorId)) issues.push({ code: 'MENTOR_GONE', classId: c.id, message: `A sub-mentor of ${label} is no longer on the staff list.` });
    }
    if (n === 0) issues.push({ code: 'EMPTY_CLASS', classId: c.id, message: `${label} has no students.` });
  }
  const active = new Map();
  for (const a of assignments || []) {
    if (!isActive(a, at)) continue;
    if (staffIds && !staffIds.has(a.facultyId)) issues.push({ code: 'ASSIGNEE_GONE', classId: a.classId, message: `${a.subject || 'A subject'} is assigned to someone who is no longer on the staff list.` });
    const key = `${a.classId}|${String(a.subject || '').trim().toLowerCase()}`;
    if (active.has(key)) issues.push({ code: 'DOUBLE_ASSIGNMENT', classId: a.classId, message: `${a.subject} in one class has two active teachers.` });
    active.set(key, a.facultyId);
  }
  return issues;
}

module.exports = {
  MAX_RANGE_SIZE, compareRoll, sortedRoster, slug, sectionClassId, classLabel,
  validateRanges, suggestRanges, mentorForPosition, isActive, isGrantActive, visibleClasses, studentIdsFor, consistencyIssues, toMs,
};
