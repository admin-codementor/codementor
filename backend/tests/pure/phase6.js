// In-app reminders, cohort standing and the unread rule for messages.
const N = require('../../src/utils/nudges');
const { standingFrom, MIN_COHORT } = require('../../src/utils/cohortStanding');
const { isUnread, threadRow } = require('../../src/utils/messages');

module.exports = function (s) {
  // ── reminders ──
  s.check('a reminder needs a message and recipients', !!N.readNudge({ studentIds: ['a'], message: ' ' }).error && !!N.readNudge({ message: 'hello there' }).error && !!N.readNudge({ studentIds: [], message: 'hello there' }).error);
  const ok = N.readNudge({ studentIds: ['a', 'a', 'b', 7, ''], message: '  Please\n\n attempt   Q4 ' });
  s.check('recipients are de-duplicated and junk dropped; the text is tidied to one line', ok.ids.join() === 'a,b' && ok.message === 'Please attempt Q4');
  s.check('too long a message, or too many recipients, is refused', !!N.readNudge({ studentIds: ['a'], message: 'x'.repeat(N.MAX_MESSAGE + 1) }).error && !!N.readNudge({ studentIds: Array.from({ length: N.MAX_RECIPIENTS + 1 }, (_, i) => `s${i}`), message: 'hello' }).error);

  const now = 1_000_000_000_000;
  const last = N.lastSentBy([{ studentId: 'a', createdAtMs: now - 3600000 }, { studentId: 'a', createdAtMs: now - 5 * 3600000 }, { studentId: 'c', createdAtMs: now - 48 * 3600000 }]);
  s.check('the newest earlier reminder per student is used', last.get('a') === now - 3600000 && last.get('c') === now - 48 * 3600000);
  const plan = N.planSend(['a', 'b', 'c', 'z'], new Set(['a', 'b', 'c']), last, now);
  s.check('students reminded within a day are skipped, outsiders dropped, others sent', plan.send.join() === 'b,c' && plan.tooSoon === 1 && plan.notYours === 1);
  s.check('every requested student lands in exactly one bucket', plan.send.length + plan.tooSoon + plan.notYours === 4);

  const mine = N.visibleTo([{ createdAtMs: now - 20 * 86400000 }, { createdAtMs: now - 86400000, id: 'new' }, { createdAtMs: now - 3 * 86400000, id: 'mid' }], now);
  s.check('a student sees the last 14 days, newest first', mine.length === 2 && mine[0].id === 'new');

  // ── cohort standing ──
  const cohort = [0, 0, 5, 10, 20, 30, 40, 50, 60, 100];
  s.check('a cohort smaller than the minimum shows no standing', standingFrom(10, [1, 2, 3]) === null && MIN_COHORT === 10);
  const top = standingFrom(100, cohort);
  s.check('the top student is above 90 percent of the cohort and gets a high badge', top.percentile === 90 && top.badge === 'Champion' && top.cohortSize === 10);
  const zero = standingFrom(0, cohort);
  s.check('a student on zero is at the bottom: nobody solved fewer', zero.percentile === 0 && zero.badge === 'Foundation');
  s.check('equal scores share a percentile (strictly-below rule)', standingFrom(0, cohort).percentile === standingFrom(0, cohort).percentile && standingFrom(5, cohort).percentile === 20);

  // ── unread messages ──
  const t = { lastMessageBy: 'staff', lastMessageAtMs: 100, reads: { stu: 50 } };
  s.check('a message from the other person newer than my last read is unread', isUnread(t, 'stu') === true);
  s.check('it is read once opened after that message', isUnread({ ...t, reads: { stu: 100 } }, 'stu') === false);
  s.check('my own last message is never unread for me', isUnread({ ...t, lastMessageBy: 'stu' }, 'stu') === false);
  s.check('a thread with no messages is not unread', isUnread({ participants: ['a', 'b'] }, 'a') === false);
  s.check('the list row and the badge agree', threadRow({ id: 'x', participants: ['stu', 'staff'], status: 'active', ...t }, 'stu', new Map()).unread === isUnread(t, 'stu'));
};
