// Course progress by class (utils/courseBySection.js) and mentor response from thread records (utils/mentorResponse.js), by hand-worked fixtures.
const { buildCourseBySection } = require('../../src/utils/courseBySection');
const { buildMentorResponse } = require('../../src/utils/mentorResponse');

const HOUR = 3600000;
const NOW = Date.parse('2026-11-01T12:00:00Z');

module.exports = function (s) {
  const students = [
    { id: 'a1', year: 3, section: 'A' }, { id: 'a2', year: 3, section: 'A' },
    { id: 'b1', year: 3, section: 'B' }, { id: 'c1', year: 2, section: null },
  ];
  const courses = [
    { id: 'c1', title: 'Python', problems: new Set(['p1', 'p2']), units: [{ id: 'u', problemIds: ['p1', 'p2'] }] },
    { id: 'c2', title: 'Java', problems: new Set(['j1']), units: [{ id: 'u', problemIds: ['j1'] }] },
  ];
  const sub = (userId, problemId, ok) => ({ userId, problemId, verdict: ok ? 'Accepted' : 'Wrong Answer', submittedAt: NOW });
  const submissions = [sub('a1', 'p1', true), sub('a1', 'p2', true), sub('a2', 'p1', true), sub('b1', 'p1', false), sub('a1', 'j1', true)];
  const r = buildCourseBySection({ courses, students, submissions });
  const py = r.courses.find((c) => c.id === 'c1');

  s.check('classes are year and section, in year then section order, with "No section" last', r.classes.map((c) => c.label).join('|') === 'Year 3 · A|Year 3 · B|No section');
  const a = py.classes.find((c) => c.label === 'Year 3 · A');
  const b = py.classes.find((c) => c.label === 'Year 3 · B');
  s.check('section A: two students, one finished, one halfway, average 75', a.students === 2 && a.completed === 1 && a.in_progress === 1 && a.not_started === 0 && a.avg_percent === 75);
  s.check('section B: tried and failed is in progress at 0%, not "not started"', b.students === 1 && b.in_progress === 1 && b.not_started === 0 && b.avg_percent === 0);
  s.check('the student with no section is still counted, and has not started', py.classes.reduce((n, c) => n + c.not_started, 0) === 1 && py.overall.students === 4);
  s.check('the classes add up to the whole department for every course', r.courses.every((c) => c.classes.reduce((n, x) => n + x.students, 0) === c.overall.students));
  s.check('another course has its own figures', r.courses.find((c) => c.id === 'c2').classes.find((c) => c.label === 'Year 3 · A').completed === 1 && r.courses.find((c) => c.id === 'c2').total_problems === 1);
  s.check('no students gives empty classes, not an error', buildCourseBySection({ courses, students: [], submissions }).classes.length === 0);

  // mentor response
  const mentors = [{ id: 'm1' }, { id: 'm2' }];
  const mentees = [{ id: 's1', mentorId: 'm1' }, { id: 's2', mentorId: 'm1' }, { id: 's3', mentorId: 'm2' }];
  const threads = [
    { id: 't1', participants: ['m1', 's1'], lastMessageBy: 's1', lastMessageAtMs: NOW - 5 * HOUR },
    { id: 't2', participants: ['m1', 's2'], lastMessageBy: 'm1', lastMessageAtMs: NOW - 100 * HOUR },
    { id: 't3', participants: ['m1', 'x9'], lastMessageBy: 'x9', lastMessageAtMs: NOW - 200 * HOUR },
    { id: 't4', participants: ['m2', 's3'], lastMessageBy: 's3', lastMessageAtMs: NOW - 72 * HOUR },
  ];
  const resp = buildMentorResponse({ mentors, students: mentees, threads, now: NOW });
  s.check('a thread is waiting when the mentee spoke last; one the mentor answered is not', resp.get('m1').threads === 2 && resp.get('m1').waiting === 1 && resp.get('m1').longest_wait_hours === 5);
  s.check('a conversation with someone who is not their mentee is not counted', resp.get('m1').threads === 2);
  s.check('a wait of 48 hours or more is called slow, with the hours', resp.get('m2').waiting === 1 && resp.get('m2').waiting_over_48h === 1 && resp.get('m2').longest_wait_hours === 72);
  s.check('a mentor with no threads gets zeros and no longest wait', buildMentorResponse({ mentors: [{ id: 'm3' }], students: [], threads, now: NOW }).get('m3').longest_wait_hours === null);
  s.check('the same thread listed twice (it appears under both people) is counted once', buildMentorResponse({ mentors, students: mentees, threads: [...threads, threads[0]], now: NOW }).get('m1').threads === 2);
};
