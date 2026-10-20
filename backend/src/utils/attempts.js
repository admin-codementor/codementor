// Attempts it took to solve a problem. Pure.
//
// "Attempts per solve" is the number of submissions UP TO AND INCLUDING the first accepted one. It used to count
// every submission ever made to the problem, so a student who solved it on the first try and then re-submitted five
// more times read as needing six attempts (and tripped the "many attempts per solve" at-risk reason).

/**
 * @param {number[]} submissionTimes  submission times in ms for one student on one problem
 * @param {number|null|undefined} firstAcceptMs  when it was first accepted, or null if never
 * @returns {number|null} null when it was never solved; otherwise at least 1
 */
function attemptsUntilFirstAccept(submissionTimes, firstAcceptMs) {
  if (!firstAcceptMs) return null;
  return Math.max(1, submissionTimes.filter((t) => t <= firstAcceptMs).length);
}

module.exports = { attemptsUntilFirstAccept };
