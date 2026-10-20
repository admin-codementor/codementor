// "At risk" for the faculty dashboard and analytics: ONE rule, the same one the HOD pages use (utils/studentState.js).
//
// It used to be a second, different rule: idle 14 days (the HOD rule is 7), accuracy under 25% with no minimum number of
// submissions (the HOD rule is under 30% after at least 5), plus "attempts per solve". So the same student was
// "gone quiet" on the HOD page and fine on the faculty page. Attempts per solve is still shown as a statistic; it is no
// longer a reason on its own.
const { flagFor } = require('./studentState');

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Reasons this student needs a look, empty when they are fine.
 * @param {{subs: number, solved: number, acRate: number, lastActiveMs: number|null}} s  one entry of the analytics snapshot
 * @param {{missed: string[], unsolved: string[]}|undefined} deadlineInfo  from computeDeadlineRisk: assignment titles the
 *   student never submitted to / submitted to but never got Accepted on, before the deadline. Collapsed to a count once
 *   there is more than one, so the list stays short however many assignments a class runs.
 */
function riskReasonsForStudent(s, deadlineInfo, now = Date.now()) {
  const f = flagFor({ subs: s.subs, solved: s.solved, acRate: s.acRate, lastActiveMs: s.lastActiveMs }, now);
  const reasons = f.flag === 'green' ? [] : f.reasons.map(lowerFirst);
  if (deadlineInfo?.missed.length) {
    reasons.push(deadlineInfo.missed.length === 1
      ? `missed deadline: "${deadlineInfo.missed[0]}"`
      : `missed ${deadlineInfo.missed.length} assignment deadlines`);
  }
  if (deadlineInfo?.unsolved.length) {
    reasons.push(deadlineInfo.unsolved.length === 1
      ? `attempted but unsolved: "${deadlineInfo.unsolved[0]}"`
      : `attempted but unsolved on ${deadlineInfo.unsolved.length} assignments`);
  }
  return reasons;
}

module.exports = { riskReasonsForStudent };
