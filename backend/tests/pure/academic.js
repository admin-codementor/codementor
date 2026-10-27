// The academic structure rules (utils/academic.js): roll order, positions, sub-mentor ranges, effective dates, visibility, consistency.
const A = require('../../src/utils/academic');

const DAY = 86400000;

module.exports = async function (s) {
  // ── roll numbers and positions ──
  s.check('roll numbers sort naturally: 2 before 10, letters without case', A.compareRoll('21CS2', '21CS10') < 0 && A.compareRoll('21cs010', '21CS9') > 0 && A.compareRoll('21CS005', '21cs5') === 0);
  s.check('series are ordered before numbers inside them', A.compareRoll('22A91A6101', '22A91A6102') < 0 && A.compareRoll('21B91A0501', '22A91A6101') < 0);
  const students = ['21CS10', '21CS2', '21CS1', '', '21CS3'].map((r, i) => ({ id: `s${i}`, rollNo: r, name: `N${i}` }));
  const roster = A.sortedRoster(students);
  s.check('the roster is in roll order, positions start at 1, and students with no roll number go last', roster.map((x) => x.rollNo).join() === '21CS1,21CS2,21CS3,21CS10,' && roster[0].position === 1 && roster[4].position === 5);

  // ── class identity ──
  s.check('a section class always has the same id (so generating twice never doubles it)', A.sectionClassId('t1', 'CSE (AIML)', 3, 'a ') === A.sectionClassId('t1', 'cse (aiml)', '3', 'A') && !A.sectionClassId('t1', 'CSE', 3, 'A').includes('/'));
  s.check('different term, year or section give different ids', new Set([A.sectionClassId('t1', 'CSE', 3, 'A'), A.sectionClassId('t2', 'CSE', 3, 'A'), A.sectionClassId('t1', 'CSE', 2, 'A'), A.sectionClassId('t1', 'CSE', 3, 'B')]).size === 4);

  // ── ranges ──
  const ok = A.validateRanges([{ mentorId: 'm1', from: 1, to: 24 }, { mentorId: 'm2', from: 25, to: 48 }, { mentorId: 'm3', from: 49, to: 60 }], 60);
  s.check('ranges 1-24, 25-48, 49-60 cover a class of 60 exactly once', ok.ok && ok.gaps.length === 0 && ok.overlaps.length === 0);
  const unordered = A.validateRanges([{ mentorId: 'm2', from: 25, to: 48 }, { mentorId: 'm1', from: 1, to: 24 }], 48);
  s.check('the order the ranges are given in does not matter', unordered.ok);
  const gap = A.validateRanges([{ mentorId: 'm1', from: 1, to: 24 }, { mentorId: 'm2', from: 26, to: 48 }], 48);
  s.check('a gap is named', !gap.ok && gap.gaps.length === 1 && gap.gaps[0][0] === 25 && gap.gaps[0][1] === 25 && /25/.test(gap.errors[0].message));
  const overlap = A.validateRanges([{ mentorId: 'm1', from: 1, to: 25 }, { mentorId: 'm2', from: 24, to: 48 }], 48);
  s.check('an overlap is named', !overlap.ok && overlap.overlaps[0][0] === 24 && overlap.overlaps[0][1] === 25);
  const short = A.validateRanges([{ mentorId: 'm1', from: 1, to: 24 }], 30);
  s.check('students beyond the last range are reported as uncovered', !short.ok && short.gaps[0][0] === 25 && short.gaps[0][1] === 30);
  const long = A.validateRanges([{ mentorId: 'm1', from: 1, to: 40 }], 30);
  s.check('a range that runs past the class is reported', !long.ok && long.errors.some((e) => e.code === 'BEYOND_CLASS'));
  s.check('bad numbers and missing mentors are reported, not crashed on', !A.validateRanges([{ mentorId: '', from: 1, to: 5 }, { mentorId: 'm', from: 5, to: 2 }, { mentorId: 'm', from: 0, to: 3 }, { mentorId: 'm', from: 1.5, to: 3 }, null], 5).ok);
  s.check('no ranges for a class with students is a gap; for an empty class it is fine', !A.validateRanges([], 10).ok && A.validateRanges([], 0).ok);
  s.check('a single range for the whole class is fine', A.validateRanges([{ mentorId: 'm', from: 1, to: 1 }], 1).ok);

  s.check('the suggested split is 24 per mentor, the last mentor taking the remainder', JSON.stringify(A.suggestRanges(60, ['a', 'b', 'c'])) === JSON.stringify([{ mentorId: 'a', from: 1, to: 24 }, { mentorId: 'b', from: 25, to: 48 }, { mentorId: 'c', from: 49, to: 60 }]));
  s.check('the suggested split never makes an empty range, and always validates', A.validateRanges(A.suggestRanges(30, ['a', 'b', 'c', 'd']), 30).ok && A.suggestRanges(30, ['a', 'b', 'c', 'd']).length === 2 && A.suggestRanges(0, ['a']).length === 0 && A.suggestRanges(10, []).length === 0);
  s.check('one mentor gets the whole class however big', JSON.stringify(A.suggestRanges(100, ['a'])) === JSON.stringify([{ mentorId: 'a', from: 1, to: 100 }]));
  const cls = { classTeacherId: 'ct', subMentors: [{ mentorId: 'm1', from: 1, to: 24 }, { mentorId: 'm2', from: 25, to: 48 }] };
  s.check('a student at position 24 has the first sub-mentor, 25 the second, 49 the class teacher', A.mentorForPosition(cls, 24) === 'm1' && A.mentorForPosition(cls, 25) === 'm2' && A.mentorForPosition(cls, 49) === 'ct' && A.mentorForPosition({}, 3) === null);

  // ── dates ──
  const t0 = 1_700_000_000_000;
  s.check('an assignment is active from its start and ends exactly at its end', !A.isActive({ from: t0, to: t0 + DAY }, t0 - 1) && A.isActive({ from: t0, to: t0 + DAY }, t0) && A.isActive({ from: t0, to: t0 + DAY }, t0 + DAY - 1) && !A.isActive({ from: t0, to: t0 + DAY }, t0 + DAY) && A.isActive({ from: t0, to: null }, t0 + 999 * DAY));
  const iso = (ms) => new Date(ms).toISOString();
  s.check('dates stored as ISO text work the same as numbers (a future start is not active yet, an end in the past is over)', !A.isActive({ from: iso(t0 + DAY), to: null }, t0) && A.isActive({ from: iso(t0 - DAY), to: null }, t0) && !A.isActive({ from: iso(t0 - 2 * DAY), to: iso(t0 - DAY) }, t0) && A.isActive({ from: iso(t0 - 2 * DAY), to: iso(t0 + DAY) }, t0));
  s.check('an unreadable date counts as not set, not as an error', A.toMs('not a date') === null && A.toMs(undefined) === null && A.toMs(new Date(5)) === 5 && A.toMs('1970-01-01T00:00:00.005Z') === 5);
  s.check('a grant is active only when approved and not expired', A.isGrantActive({ status: 'approved', expiresAt: null }, t0) && !A.isGrantActive({ status: 'pending' }, t0) && !A.isGrantActive({ status: 'declined' }, t0) && !A.isGrantActive({ status: 'approved', expiresAt: t0 + 5 }, t0 + 5) && A.isGrantActive({ status: 'approved', expiresAt: t0 + 5 }, t0 + 4));

  // ── visibility ──
  const classes = [
    { id: 'c1', department: 'CSE', year: 3, section: 'A', classTeacherId: 'ct1', subMentors: [{ mentorId: 'sm1', from: 1, to: 2 }, { mentorId: 'sm2', from: 3, to: 4 }] },
    { id: 'c2', department: 'CSE', year: 3, section: 'B', classTeacherId: 'ct2', subMentors: [] },
    { id: 'c3', department: 'CSE', kind: 'elective', name: 'Cloud', classTeacherId: null, subMentors: [] },
  ];
  const assignments = [
    { id: 'a1', facultyId: 'f1', classId: 'c1', subject: 'Python', from: t0 - DAY, to: null },
    { id: 'a2', facultyId: 'f1', classId: 'c2', subject: 'Python', from: t0 - 10 * DAY, to: t0 - DAY },   // ended
    { id: 'a3', facultyId: 'f2', classId: 'c2', subject: 'Python', from: t0 - DAY, to: null },
  ];
  const grants = [{ id: 'g1', facultyId: 'f3', classId: 'c3', status: 'approved', expiresAt: t0 + DAY }, { id: 'g2', facultyId: 'f3', classId: 'c1', status: 'pending' }];
  const vis = (id, at = t0) => A.visibleClasses(id, { classes, assignments, grants, at });
  s.check('a class teacher sees the whole class', vis('ct1').get('c1')?.mentees === false && vis('ct1').has('c1') && !vis('ct1').has('c2'));
  s.check('a faculty member sees the classes they CURRENTLY teach, and not ones whose assignment has ended', vis('f1').has('c1') && !vis('f1').has('c2') && vis('f2').has('c2'));
  s.check('a sub-mentor sees only their own range', vis('sm1').get('c1')?.mentees === true && !vis('sm1').has('c2'));
  s.check('an approved grant gives access until it expires; a pending request gives nothing', vis('f3').has('c3') && !vis('f3').has('c1') && !vis('f3', t0 + DAY).has('c3'));
  s.check('a person with two reasons gets the wider one (teaches + sub-mentor sees the whole class)', (() => { const v = A.visibleClasses('sm1', { classes, assignments: [{ facultyId: 'sm1', classId: 'c1', subject: 'DS', from: t0 - DAY, to: null }], grants: [], at: t0 }); return v.get('c1').mentees === false && v.get('c1').via.length === 2; })());
  s.check('a faculty member with no role in any class sees nothing', vis('nobody').size === 0);
  s.check('an assignment to a class that is not in this term is ignored', A.visibleClasses('f1', { classes: [classes[1]], assignments, grants, at: t0 }).size === 0);

  const memberships = [
    { classId: 'c1', studentId: 's1', position: 1 }, { classId: 'c1', studentId: 's2', position: 2 }, { classId: 'c1', studentId: 's3', position: 3 }, { classId: 'c1', studentId: 's4', position: 4 },
    { classId: 'c2', studentId: 's5', position: 1 },
  ];
  const byId = new Map(classes.map((c) => [c.id, c]));
  const ids = (who) => [...A.studentIdsFor(who, vis(who), memberships, byId)].sort().join();
  s.check('the class teacher and a teacher see all four students of their class', ids('ct1') === 's1,s2,s3,s4' && ids('f1') === 's1,s2,s3,s4');
  s.check('each sub-mentor sees only their own two', ids('sm1') === 's1,s2' && ids('sm2') === 's3,s4');
  s.check('someone with nothing sees no students', ids('nobody') === '');

  // ── consistency ──
  const staff = new Set(['ct1', 'ct2', 'sm1', 'sm2', 'f1', 'f2']);
  const allStudents = ['s1', 's2', 's3', 's4', 's5', 'sLost'].map((id) => ({ id, name: id, rollNo: id }));
  const mem = memberships.map((m) => ({ ...m, primary: m.classId !== 'c3' }));
  const issues = A.consistencyIssues({ classes, memberships: mem, students: allStudents, assignments, staffIds: staff, at: t0 });
  const codes = issues.map((i) => i.code);
  s.check('a student in no class is reported by name', codes.includes('NO_CLASS') && issues.find((i) => i.code === 'NO_CLASS').studentId === 'sLost');
  s.check('a section class without a class teacher is reported (an elective needs none)', !issues.some((i) => i.code === 'NO_TEACHER'));
  const noTeacher = A.consistencyIssues({ classes: [{ ...classes[1], classTeacherId: null }], memberships: mem, students: [], assignments: [], staffIds: staff, at: t0 });
  s.check('and one without a teacher is reported', noTeacher.some((i) => i.code === 'NO_TEACHER'));
  s.check('ranges that no longer cover the class are reported', (() => { const c = [{ ...classes[0], subMentors: [{ mentorId: 'sm1', from: 1, to: 2 }] }]; return A.consistencyIssues({ classes: c, memberships: mem, students: [], assignments: [], staffIds: staff, at: t0 }).some((i) => i.code === 'RANGES'); })());
  s.check('a class with nobody in it, and staff who are gone, are reported', codes.includes('EMPTY_CLASS') && A.consistencyIssues({ classes: [classes[0]], memberships: mem, students: [], assignments: [{ ...assignments[0], facultyId: 'left' }], staffIds: new Set(['ct1']), at: t0 }).some((i) => i.code === 'ASSIGNEE_GONE') && A.consistencyIssues({ classes: [classes[0]], memberships: mem, students: [], assignments: [], staffIds: new Set(['sm1']), at: t0 }).some((i) => i.code === 'TEACHER_GONE'));
  s.check('two active teachers for the same subject in one class are reported', A.consistencyIssues({ classes: [classes[1]], memberships: mem, students: [], assignments: [assignments[2], { id: 'a9', facultyId: 'f1', classId: 'c2', subject: 'python ', from: t0 - DAY, to: null }], staffIds: staff, at: t0 }).some((i) => i.code === 'DOUBLE_ASSIGNMENT'));
  s.check('a clean structure has no issues', A.consistencyIssues({ classes: [classes[0]], memberships: mem.filter((m) => m.classId === 'c1'), students: allStudents.slice(0, 4), assignments: [assignments[0]], staffIds: staff, at: t0 }).length === 0);
};
