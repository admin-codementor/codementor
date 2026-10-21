// Reopen requests: who may ask, what a decision means, and how an approval changes marks.
const { validateRequest, validateDecision, reopenUntil, extensionsByStudent, effectiveDeadline, DAY_MS } = require('../../src/utils/reopen');
const { buildAssignmentMarks } = require('../../src/utils/assignmentMarks');

const NOW = 1_800_000_000_000;
const PAST = NOW - 2 * DAY_MS;
const FUTURE = NOW + DAY_MS;
const ok = (r) => !r.error;

module.exports = function (s) {
  const base = { targetType: 'assignment', deadline: PAST, reason: 'I was in hospital that week.', existing: [], now: NOW };
  s.check('a passed deadline with a real reason is accepted', ok(validateRequest(base)) && validateRequest(base).reason === 'I was in hospital that week.');
  s.check('a deadline that has not passed cannot be reopened', /not passed/.test(validateRequest({ ...base, deadline: FUTURE }).error));
  s.check('something with no deadline cannot be reopened', /no deadline/.test(validateRequest({ ...base, deadline: null }).error));
  s.check('the reason must be long enough and not too long', /at least 10/.test(validateRequest({ ...base, reason: 'too short' }).error) && /under 500/.test(validateRequest({ ...base, reason: 'x'.repeat(501) }).error));
  s.check('blank space does not count towards the reason', !ok(validateRequest({ ...base, reason: '          ' })));
  s.check('the target type must be known', !ok(validateRequest({ ...base, targetType: 'exam' })));
  s.check('a second request while one is pending is refused; after a decision a new one is fine',
    /already/.test(validateRequest({ ...base, existing: [{ status: 'pending' }] }).error) && ok(validateRequest({ ...base, existing: [{ status: 'declined' }, { status: 'approved' }] })));

  s.check('approve defaults to 3 days', validateDecision({ decision: 'approve' }).days === 3);
  s.check('approve takes 1 to 14 whole days only', validateDecision({ decision: 'approve', days: 14 }).days === 14 && !ok(validateDecision({ decision: 'approve', days: 0 })) && !ok(validateDecision({ decision: 'approve', days: 15 })) && !ok(validateDecision({ decision: 'approve', days: 1.5 })));
  s.check('decline needs no days and keeps a trimmed, capped note', validateDecision({ decision: 'decline', note: '  not this time  ' }).note === 'not this time' && validateDecision({ decision: 'decline', note: 'y'.repeat(400) }).note.length === 300);
  s.check('an unknown decision is refused', !ok(validateDecision({ decision: 'maybe' })));
  s.check('an approval runs from the decision', reopenUntil(NOW, 3) === NOW + 3 * DAY_MS);

  const ext = extensionsByStudent([
    { userId: 'a', status: 'approved', reopenUntil: NOW + DAY_MS },
    { userId: 'a', status: 'approved', reopenUntil: NOW + 5 * DAY_MS },
    { userId: 'b', status: 'declined', reopenUntil: NOW + 9 * DAY_MS },
    { userId: 'c', status: 'pending' },
  ]);
  s.check('only approved requests extend, and the latest wins', ext.get('a') === NOW + 5 * DAY_MS && !ext.has('b') && !ext.has('c'));
  s.check('an extension never shortens the deadline', effectiveDeadline(NOW + 10 * DAY_MS, NOW + DAY_MS) === NOW + 10 * DAY_MS && effectiveDeadline(PAST, NOW + DAY_MS) === NOW + DAY_MS && effectiveDeadline(PAST, undefined) === PAST);

  // ── marks: an approved student's late solve counts as on time; someone else's does not ──
  const assignment = { problemIds: ['p1'], deadline: PAST };
  const students = [{ id: 'a' }, { id: 'b' }];
  const submissions = [
    { userId: 'a', problemId: 'p1', verdict: 'Accepted', submittedAt: NOW - DAY_MS },
    { userId: 'b', problemId: 'p1', verdict: 'Accepted', submittedAt: NOW - DAY_MS },
  ];
  const plain = buildAssignmentMarks({ assignment, students, submissions });
  s.check('without an extension both late solves are late (unchanged behaviour)', plain.every((m) => m.problems[0].status === 'late'));
  const extended = buildAssignmentMarks({ assignment, students, submissions, extensions: new Map([['a', NOW]]) });
  const byId = Object.fromEntries(extended.map((m) => [m.id, m]));
  s.check('the approved student is on time, the other student is still late', byId.a.problems[0].status === 'on_time' && byId.a.marks === 100 && byId.b.problems[0].status === 'late' && byId.b.marks === 0, JSON.stringify([byId.a.problems[0].status, byId.b.problems[0].status]));
  const tooLate = buildAssignmentMarks({ assignment, students, submissions: [{ userId: 'a', problemId: 'p1', verdict: 'Accepted', submittedAt: NOW + DAY_MS }], extensions: new Map([['a', NOW]]) });
  s.check('a solve after the extension is late again', tooLate[0].problems[0].status === 'late');
  const noDeadline = buildAssignmentMarks({ assignment: { problemIds: ['p1'] }, students, submissions, extensions: new Map([['a', NOW]]) });
  s.check('an assignment with no deadline stays open for everyone', noDeadline.every((m) => m.problems[0].status === 'on_time'));
};
