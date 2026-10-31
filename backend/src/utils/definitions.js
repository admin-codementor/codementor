// What every status word on the staff screens means, in one place, generated from the same constants the code uses, so this page can never
// disagree with a screen. Each word has ONE meaning; two different measures never share a name.
//
//   Practice state    what a student does on CodeMentor (utils/studentState.js)
//   Needs attention   the traffic light built from the practice state and accuracy (the same flag everywhere a student is coloured)
//   Not active        no sign-in in the chosen window (the Activity tab; this used to be called "At risk", a second meaning of the word)
//   Coding score band the score from all platforms (utils/platformScore.js), coloured by the college thresholds
//   Placed            an offer (utils/placementPolicy.js)
const S = require('./studentState');
const P = require('./platformScore');
const { DEFAULT_THRESHOLDS } = P;

function definitions() {
  return [
    {
      id: 'practice_state', title: 'Practice state', where: 'Overview funnel, Needs attention, student pages',
      summary: 'What a student has done on CodeMentor. Every student is in exactly one state, so the four counts always add up to the number of students.',
      items: [
        { term: 'Not started', rule: 'Has never submitted anything.' },
        { term: 'Stuck', rule: `Submitting within the last ${S.QUIET_DAYS} days, but has never had a solution accepted.` },
        { term: 'Gone quiet', rule: `Has submitted before, but nothing in the last ${S.QUIET_DAYS} days.` },
        { term: 'Practising', rule: `Submitted within the last ${S.QUIET_DAYS} days and has had solutions accepted.` },
      ],
    },
    {
      id: 'needs_attention', title: 'Needs attention (red, orange, green)', where: 'Overview, class dashboards, student pages',
      summary: 'One traffic light per student, built from the practice state and accuracy. The reasons are always shown beside it.',
      items: [
        { term: 'Red', rule: `Not started, or stuck, or two or more concerns.` },
        { term: 'Orange', rule: `One concern: gone quiet, or accuracy below ${S.LOW_ACCURACY_PCT}% once there are at least ${S.MIN_SUBS_FOR_ACCURACY} submissions.` },
        { term: 'Green', rule: 'Practising, with no concern.' },
      ],
    },
    {
      id: 'not_active', title: 'Not active', where: 'Activity tab',
      summary: 'Whether a person signed in during the period you chose (today, 7, 30 or 90 days). It says nothing about marks or practice: someone can sign in and do nothing, or practise and still be listed by their practice state above.',
      items: [
        { term: 'Active', rule: 'Signed in at least once in the chosen period.' },
        { term: 'Not active', rule: 'Did not sign in during the chosen period.' },
      ],
    },
    {
      id: 'coding_band', title: 'Coding score band', where: 'Coding score tab, student coding profile',
      summary: `A separate measure from the traffic light above. The score is the average of a student's best ${P.BEST_OF} platform scores (CodeMentor, LeetCode, Codeforces, CodeChef, HackerRank, InterviewBit, GeeksforGeeks, GitHub), 0 to 100.`,
      items: [
        { term: 'Red', rule: `Score below the college's red threshold (${DEFAULT_THRESHOLDS.red} unless the Admin or HOD changed it).` },
        { term: 'Orange', rule: 'Between the red and green thresholds.' },
        { term: 'Green', rule: `At or above the green threshold (${DEFAULT_THRESHOLDS.green} unless changed).` },
        { term: 'Not verified', rule: `CodeChef, HackerRank, InterviewBit and GeeksforGeeks cannot be read by the server, so the student types the number. It counts at ${P.UNVERIFIED_WEIGHT * 100}% until a HOD or Admin verifies it.` },
      ],
    },
    {
      id: 'placement', title: 'Placed and in process', where: 'Placement tab, T&P screens',
      summary: 'Counted from drives and offers recorded on the platform.',
      items: [
        { term: 'Placed', rule: 'Selected in a published drive, or an offer made outside the portal recorded by the Training & Placement office.' },
        { term: 'In process', rule: 'Not placed, with an application still applied or shortlisted (or an outside application not yet decided).' },
        { term: 'Not placed', rule: 'Everyone else.' },
        { term: 'The pool', rule: 'Current students of the department in the view. Graduated students are left out, and their results are in the Alumni tab.' },
      ],
    },
  ];
}

module.exports = { definitions };
