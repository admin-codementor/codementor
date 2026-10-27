// The rules of one exam attempt: who may write, stale saves, violations and the lock, and reopening a cut-off attempt.
const A = require('../../src/utils/examAttempt');

module.exports = function (s) {
  const NOW = 1_800_000_000_000;
  const MIN = 60000;
  const live = (over = {}) => ({ windowExpiresAt: NOW + 30 * MIN, submittedAt: null, session: { id: 'a'.repeat(32) }, ...over });
  const SID = 'a'.repeat(32);

  // ── guardLive ──
  s.check('no attempt is a 404 NOT_STARTED', A.guardLive(null, { now: NOW }).code === 'NOT_STARTED' && A.guardLive(null).status === 404);
  s.check('a live attempt with the right session passes', A.guardLive(live(), { sessionId: SID, now: NOW }).ok === true);
  s.check('a submitted attempt refuses further writes (409)', (() => { const g = A.guardLive(live({ submittedAt: NOW - 1 }), { sessionId: SID, now: NOW }); return g.code === 'ALREADY_SUBMITTED' && g.status === 409; })());
  s.check('a locked attempt refuses writes with 423 and says staff must resume it', (() => { const g = A.guardLive(live({ locked: { at: NOW } }), { sessionId: SID, now: NOW }); return g.code === 'EXAM_LOCKED' && g.status === 423 && /faculty|invigilator/.test(g.hint); })());
  s.check('after the deadline writes are refused with TIME_UP', A.guardLive(live({ windowExpiresAt: NOW - 1 }), { sessionId: SID, now: NOW }).code === 'TIME_UP');
  s.check('the deadline itself is still inside the exam, one millisecond later is not', A.guardLive(live({ windowExpiresAt: NOW }), { sessionId: SID, now: NOW }).ok === true && A.guardLive(live({ windowExpiresAt: NOW }), { sessionId: SID, now: NOW + 1 }).ok === false);
  s.check('a write from a replaced device is refused with SESSION_REPLACED and tells it to close', (() => { const g = A.guardLive(live(), { sessionId: 'b'.repeat(32), now: NOW }); return g.code === 'SESSION_REPLACED' && g.status === 409 && /another device/.test(g.error); })());
  s.check('a write with no session, when the attempt has one, is refused so an old page reloads', A.guardLive(live(), { sessionId: null, now: NOW }).code === 'SESSION_REQUIRED');
  s.check('an older attempt with no session at all still works without one', A.guardLive({ windowExpiresAt: NOW + MIN, submittedAt: null }, { now: NOW }).ok === true);
  s.check('the order of checks: submitted beats locked beats expired beats session', A.guardLive(live({ submittedAt: 1, locked: {}, windowExpiresAt: 1 }), { sessionId: 'x', now: NOW }).code === 'ALREADY_SUBMITTED' && A.guardLive(live({ locked: {}, windowExpiresAt: 1 }), { sessionId: 'x', now: NOW }).code === 'EXAM_LOCKED' && A.guardLive(live({ windowExpiresAt: 1 }), { sessionId: 'x', now: NOW }).code === 'TIME_UP');
  s.check('an expiry stored as a Firestore timestamp or a date string is read the same', A.guardLive(live({ windowExpiresAt: { toMillis: () => NOW - 5 } }), { sessionId: SID, now: NOW }).code === 'TIME_UP' && A.guardLive(live({ windowExpiresAt: new Date(NOW - 5).toISOString() }), { sessionId: SID, now: NOW }).code === 'TIME_UP');

  // ── sessions ──
  const ids = new Set(Array.from({ length: 100 }, () => A.newSessionId()));
  s.check('session ids are 32 hex characters and unique', ids.size === 100 && [...ids].every(A.validSessionId));
  s.check('a malformed session id is not valid', !A.validSessionId('short') && !A.validSessionId(42) && !A.validSessionId('Z'.repeat(32)) && !A.validSessionId(undefined));

  // ── stale saves ──
  s.check('a first save is applied', A.decideSave(undefined, 1).apply === true && A.decideSave({}, 0).apply === true);
  s.check('a newer save wins', A.decideSave({ seq: 3 }, 4).apply === true && A.decideSave({ seq: 3 }, 4).seq === 4);
  s.check('an older or repeated save is ignored, not an error', A.decideSave({ seq: 5 }, 4).apply === false && A.decideSave({ seq: 5 }, 5).apply === false);
  s.check('a save with no sequence number (an older page) is applied', A.decideSave({ seq: 9 }, undefined).apply === true && A.decideSave({ seq: 9 }, 'x').apply === true && A.decideSave({ seq: 9 }, -2).apply === true);

  // ── violations and the lock ──
  const exam = { violationLimit: 3 };
  const v1 = A.applyViolation({}, exam, 'fullscreen_exit', NOW);
  s.check('leaving fullscreen counts once and does not lock at first', v1.counts && v1.count === 1 && v1.lock === null);
  s.check('benign and uncounted events never count (copy, fullscreen_enter, blur, exam_start)', ['copy', 'fullscreen_enter', 'blur', 'exam_start', 'auto_submit'].every((e) => A.applyViolation({}, exam, e, NOW).counts === false));
  s.check('tab switch, devtools and paste count', ['tab_switch', 'devtools', 'paste'].every((e) => A.applyViolation({}, exam, e, NOW).counts === true));
  s.check('one act that fires three events within 5 seconds counts once', (() => { const a = { violationCount: 1, lastViolationAt: NOW }; return A.applyViolation(a, exam, 'tab_switch', NOW + 2000).counts === false && A.applyViolation(a, exam, 'tab_switch', NOW + 5001).counts === true; })());
  s.check('the attempt locks when the count reaches the limit', (() => { const r = A.applyViolation({ violationCount: 2, lastViolationAt: NOW - 60000 }, exam, 'tab_switch', NOW); return r.count === 3 && r.lock && r.lock.reason === 'violations' && r.lock.limit === 3; })());
  s.check('an already locked attempt is not locked again', A.applyViolation({ violationCount: 5, locked: { at: 1 }, lastViolationAt: 0 }, exam, 'tab_switch', NOW).lock === null);
  s.check('a limit of 0 never locks, however many', A.applyViolation({ violationCount: 99, lastViolationAt: 0 }, { violationLimit: 0 }, 'tab_switch', NOW).lock === null);
  s.check('an exam with no limit set uses the default of 5', A.applyViolation({ violationCount: 4, lastViolationAt: 0 }, {}, 'tab_switch', NOW).lock !== null && A.applyViolation({ violationCount: 3, lastViolationAt: 0 }, {}, 'tab_switch', NOW).lock === null);

  // ── who may reopen ──
  const ex = { facultyId: 'owner1' };
  s.check('Admin may always reopen', A.canReopen({ actor: { id: 'x', role: 'admin' }, exam: ex }));
  s.check('the exam owner may reopen', A.canReopen({ actor: { id: 'owner1', role: 'faculty' }, exam: ex }));
  s.check('the HOD of the owner\'s department may reopen, another department\'s HOD may not', A.canReopen({ actor: { id: 'h', role: 'hod', department: 'CSE' }, exam: ex, ownerDepartment: 'CSE' }) && !A.canReopen({ actor: { id: 'h', role: 'hod', department: 'ECE' }, exam: ex, ownerDepartment: 'CSE' }));
  s.check('another faculty member, a student and nobody may not', !A.canReopen({ actor: { id: 'other', role: 'faculty' }, exam: ex }) && !A.canReopen({ actor: { id: 's', role: 'student' }, exam: ex }) && !A.canReopen({ actor: null, exam: ex }));
  s.check('an HOD with no department set may not reopen on a match of two empty departments', !A.canReopen({ actor: { id: 'h', role: 'hod', department: null }, exam: ex, ownerDepartment: null }));

  // ── planReopen ──
  const owner = { id: 'owner1', role: 'faculty' };
  const admin = { id: 'adm', role: 'admin' };
  const submitted = { submittedAt: NOW - 5 * MIN, score: 12, total: 40, autoSubmitted: true, windowExpiresAt: NOW - 5 * MIN, violationCount: 4 };
  const run = (over, input, actor = owner, examIn = { windowEnd: NOW + 60 * MIN }) => A.planReopen({ attempt: { ...submitted, ...over }, exam: examIn, actor, input, now: NOW });

  s.check('a reopen needs a reason of at least 5 characters', run({}, { reason: '  ', extraMinutes: 10 }).code === 'REASON_REQUIRED' && run({}, { reason: 'abc', extraMinutes: 10 }).code === 'REASON_REQUIRED');
  s.check('a very long reason is refused', run({}, { reason: 'x'.repeat(301), extraMinutes: 10 }).code === 'REASON_TOO_LONG');
  s.check('extra time must be a whole number of minutes within the cap (60 for the owner, 180 for Admin)', run({}, { reason: 'network drop', extraMinutes: 61 }).code === 'BAD_EXTRA_TIME' && run({}, { reason: 'network drop', extraMinutes: 61 }, admin).patch !== undefined && run({}, { reason: 'network drop', extraMinutes: 181 }, admin).code === 'BAD_EXTRA_TIME' && run({}, { reason: 'network drop', extraMinutes: 1.5 }).code === 'BAD_EXTRA_TIME' && run({}, { reason: 'network drop', extraMinutes: -1 }).code === 'BAD_EXTRA_TIME');
  s.check('an attempt with no time left needs at least one extra minute', run({}, { reason: 'network drop', extraMinutes: 0 }).code === 'BAD_EXTRA_TIME');
  s.check('a still-running attempt cannot be reopened', A.planReopen({ attempt: live({ locked: null }), exam: {}, actor: owner, input: { reason: 'just because', extraMinutes: 5 }, now: NOW }).code === 'STILL_RUNNING');
  s.check('no attempt is a 404', A.planReopen({ attempt: null, exam: {}, actor: owner, input: { reason: 'network drop', extraMinutes: 5 }, now: NOW }).status === 404);

  const ok = run({}, { reason: 'Browser crashed at 10:40', extraMinutes: 15 });
  s.check('a submitted attempt restarts the clock from now with the extra time', ok.patch && ok.newExpiry === NOW + 15 * MIN && ok.patch.windowExpiresAt.getTime() === NOW + 15 * MIN);
  s.check('reopening clears the submission, the score and the lock, and installs a session nobody holds so the cut-off page cannot write', ok.patch.submittedAt === null && ok.patch.score === null && ok.patch.locked === null && ok.patch.autoSubmitted === null && A.validSessionId(ok.patch.session.id) && ok.patch.session.id !== SID && ok.patch.session.placeholder === true);
  s.check('the violation count restarts so the student is not locked again at once', ok.patch.violationCount === 0);
  s.check('the old score and state are kept on the record, with who, why and when', (() => { const e = ok.patch.reopens[0]; return e.byId === 'owner1' && e.reason === 'Browser crashed at 10:40' && e.extraMinutes === 15 && e.previous.score === 12 && e.previous.autoSubmitted === true && e.at === NOW; })());
  s.check('the reason is tidied to one line', run({}, { reason: 'Browser\n\n crashed   again', extraMinutes: 5 }).entry.reason === 'Browser crashed again');

  const lockedRunning = { submittedAt: null, score: null, total: null, autoSubmitted: false, windowExpiresAt: NOW + 20 * MIN, locked: { at: NOW - MIN, reason: 'violations', count: 5 } };
  const unlock = run(lockedRunning, { reason: 'Wi-Fi blip, not cheating', extraMinutes: 0 });
  s.check('a locked attempt can be resumed with no extra time and keeps its deadline', unlock.patch && unlock.newExpiry === NOW + 20 * MIN && unlock.patch.locked === null);
  s.check('a locked attempt can also be given extra time on top of what is left', run(lockedRunning, { reason: 'Wi-Fi blip, not cheating', extraMinutes: 10 }).newExpiry === NOW + 30 * MIN);

  const three = { reopens: [{}, {}, {}] };
  s.check('the owner may reopen an attempt at most three times, Admin up to six', run(three, { reason: 'network drop', extraMinutes: 5 }).code === 'TOO_MANY_REOPENS' && run(three, { reason: 'network drop', extraMinutes: 5 }, admin).patch !== undefined && run({ reopens: [1, 2, 3, 4, 5, 6] }, { reason: 'network drop', extraMinutes: 5 }, admin).code === 'TOO_MANY_REOPENS');
  s.check('after the exam window has closed only an Admin may reopen', run({}, { reason: 'network drop', extraMinutes: 5 }, owner, { windowEnd: NOW - 1 }).code === 'WINDOW_CLOSED' && run({}, { reason: 'network drop', extraMinutes: 5 }, admin, { windowEnd: NOW - 1 }).patch !== undefined);
  s.check('an earlier reopen stays on the record when another is added', run({ reopens: [{ at: 1, reason: 'first' }] }, { reason: 'second time', extraMinutes: 5 }).patch.reopens.length === 2);

  // ── roster ──
  s.check('roster states', A.rosterState(null, NOW) === 'not_started' && A.rosterState({ submittedAt: 1 }, NOW) === 'submitted' && A.rosterState({ submittedAt: 1, autoSubmitted: true }, NOW) === 'auto_submitted' && A.rosterState({ locked: {} , windowExpiresAt: NOW + 5 }, NOW) === 'locked' && A.rosterState({ windowExpiresAt: NOW - 1 }, NOW) === 'expired' && A.rosterState({ windowExpiresAt: NOW + 9 }, NOW) === 'in_progress');
};
