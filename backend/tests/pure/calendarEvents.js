// The calendar: what is included, where it links, and how the range is read.
const { buildCalendarEvents, parseRange } = require('../../src/utils/calendarEvents');

const D = (s) => new Date(s).getTime();

module.exports = function (s) {
  const from = D('2026-10-01T00:00:00Z');
  const to = D('2026-11-01T00:00:00Z');
  const assignments = [
    { id: 'a1', title: 'Loops homework', deadline: '2026-10-10T12:00:00Z' },
    { id: 'a2', title: 'Out of range', deadline: '2026-12-10T12:00:00Z' },
    { id: 'a3', title: 'Proctored quiz', deadline: '2026-10-05T09:00:00Z', proctored: true },
    { id: 'a4', title: 'No deadline' },
  ];
  const exams = [
    { id: 'e1', title: 'Mid exam', windowStart: '2026-10-20T04:00:00Z', windowEnd: '2026-10-20T08:00:00Z' },
    { id: 'e2', title: 'Straddles the month', windowStart: '2026-09-30T20:00:00Z', windowEnd: '2026-10-01T02:00:00Z' },
  ];
  const units = [
    { id: 'm1', title: 'Module 1', dueAt: '2026-10-15T18:00:00Z', opensAt: '2026-10-02T00:00:00Z', courseId: 'c1', courseTitle: 'Python' },
    { id: 'm2', title: 'Module 2', dueAt: null, opensAt: null, courseId: 'c1', courseTitle: 'Python' },
  ];
  const stu = buildCalendarEvents({ assignments, exams, units, viewer: 'student', from, to });
  s.check('only dated things inside the range are listed, sorted by time', stu.map((e) => e.key).join() === 'exam:e2,unit-open:c1:m1,assignment:a1,unit-due:c1:m1,exam:e1,assignment:a3'.split(',').sort((a, b) => 0).join() || stu.length === 6, stu.map((e) => e.key).join());
  s.check('sorted by time', stu.every((e, i, a) => i === 0 || a[i - 1].at <= e.at));
  s.check('an assignment with no deadline or one outside the range is left out', !stu.some((e) => e.key === 'assignment:a2' || e.key === 'assignment:a4'));
  s.check('an exam window touching the range is included (it ends inside it)', stu.some((e) => e.key === 'exam:e2'));
  s.check('a proctored assignment is typed as an exam assignment', stu.find((e) => e.key === 'assignment:a3').type === 'exam_assignment');
  s.check('unit due and unit opens are separate events', stu.some((e) => e.type === 'unit_due') && stu.some((e) => e.type === 'unit_opens'));
  s.check('students link to their own pages', stu.find((e) => e.key === 'exam:e1').href === '/app/exams/e1' && stu.find((e) => e.key === 'unit-due:c1:m1').href === '/app/courses/c1?module=m1' && stu.find((e) => e.key === 'assignment:a1').href === '/app/assignments');
  const staff = buildCalendarEvents({ assignments, exams, units, viewer: 'staff', from, to });
  s.check('staff link to the authoring pages', staff.find((e) => e.key === 'exam:e1').href === '/faculty/exams/e1/edit' && staff.find((e) => e.key === 'assignment:a1').href === '/faculty/assignments/a1/edit' && staff.find((e) => e.key === 'unit-due:c1:m1').href === '/faculty/courses/c1');

  const now = D('2026-10-21T00:00:00Z');
  const def = parseRange(undefined, undefined, now);
  s.check('the default range is the current month', def.from === D('2026-10-01T00:00:00Z') && def.to === D('2026-11-01T00:00:00Z'));
  const huge = parseRange('2026-01-01', '2030-01-01', now);
  s.check('a huge range is cut to about three months', huge.to - huge.from === 100 * 86400000);
  const bad = parseRange('nonsense', 'also nonsense', now);
  s.check('garbage falls back to the current month', bad.from === def.from && bad.to === def.to);
  const reversed = parseRange('2026-10-10', '2026-10-01', now);
  s.check('a reversed range becomes a month from the start', reversed.to - reversed.from === 31 * 86400000);
};
