// Ranking, "same class", and the one at-risk rule.
const { rankRows, sameClass } = require('../../src/utils/ranking');
const { riskReasonsForStudent } = require('../../src/utils/risk');
const { classLabel, cohortValue } = require('../../src/utils/students');
const { flagFor } = require('../../src/utils/studentState');

module.exports = function (s) {
  // ── ranking ─────────────────────────────────────────────────────────────────
  const rows = [
    { name: 'Dev', solved: 5 }, { name: 'Asha', solved: 9 }, { name: 'Bala', solved: 5 },
    { name: 'Chitra', solved: 2 }, { name: 'Eshan', solved: 0 }, { name: 'Farah', solved: 0 },
  ];
  const r = rankRows(rows, (x) => x.solved);
  const by = Object.fromEntries(r.map((x) => [x.name, x.rank]));
  s.check('rank: the top score is rank 1', by.Asha === 1);
  s.check('rank: tied students share a rank and the next rank skips (1, 2, 2, 4)', by.Bala === 2 && by.Dev === 2 && by.Chitra === 4, JSON.stringify(by));
  s.check('rank: students who solved nothing are unranked (rank 0), not last place', by.Eshan === 0 && by.Farah === 0);
  s.check('rank: the order is by score, then by name, so it is stable', r.map((x) => x.name).join() === 'Asha,Bala,Dev,Chitra,Eshan,Farah');
  s.check('rank: on day one, when nobody has solved anything, nobody is ranked', rankRows([{ name: 'A', solved: 0 }, { name: 'B', solved: 0 }], (x) => x.solved).every((x) => x.rank === 0));
  s.check('rank: an empty list gives an empty list, and the input is not changed', rankRows([], (x) => x).length === 0 && rows[0].name === 'Dev' && rows[0].rank === undefined);

  // ── same class = department + year + section ────────────────────────────────
  const me = { department: 'CSE(AIML)', year: 2, section: 'A' };
  s.check('class: same department, year and section', sameClass(me, { department: 'CSE(AIML)', year: 2, section: 'A' }));
  s.check('class: section A of another year is a different class', !sameClass(me, { department: 'CSE(AIML)', year: 4, section: 'A' }));
  s.check('class: a number and a string year compare equal', sameClass(me, { department: 'CSE(AIML)', year: '2', section: 'A' }));
  s.check('class: another department or section is not the class', !sameClass(me, { department: 'ECE', year: 2, section: 'A' }) && !sameClass(me, { department: 'CSE(AIML)', year: 2, section: 'B' }));
  s.check('class: a profile with no year falls back to department + section', sameClass({ department: 'CSE', section: 'A' }, { department: 'CSE', year: 3, section: 'A' }));
  s.check('class: no section means no class', !sameClass({ department: 'CSE' }, { department: 'CSE', section: 'A' }));
  s.check('class label: year and section, with fallbacks', classLabel(2, 'A') === 'Year 2 · A' && classLabel(null, 'B') === 'Section B' && classLabel(3, null) === 'No section');

  // ── cohort grouping ─────────────────────────────────────────────────────────
  s.check('cohort: a numeric year groups as the string the browser sends back', cohortValue({ year: 2 }, 'year') === '2' && cohortValue({ year: '2' }, 'year') === '2');
  s.check('cohort: a section is grouped with its year, so section A of two years are two cohorts', cohortValue({ section: 'A', year: 2 }, 'section') === 'Year 2 · A' && cohortValue({ section: 'A', year: 4 }, 'section') === 'Year 4 · A');
  s.check('cohort: a missing value is Unassigned, and department is passed through', cohortValue({}, 'year') === 'Unassigned' && cohortValue({ section: '' }, 'section') === 'Unassigned' && cohortValue({ department: 'CSE(AIML)' }, 'department') === 'CSE(AIML)');

  // ── at-risk: the HOD rule, everywhere ───────────────────────────────────────
  const now = Date.UTC(2026, 9, 20, 12);
  const DAY = 86400000;
  const stud = (o) => ({ subs: 20, solved: 10, acRate: 60, lastActiveMs: now - DAY, ...o });
  s.check('risk: an active, accurate student has no reasons', riskReasonsForStudent(stud({}), undefined, now).length === 0);
  s.check('risk: never submitted is a reason', riskReasonsForStudent(stud({ subs: 0, solved: 0, acRate: 0, lastActiveMs: null }), undefined, now).length === 1);
  s.check('risk: quiet for 10 days IS at risk now (the HOD rule is 7; the faculty rule used to be 14)', riskReasonsForStudent(stud({ lastActiveMs: now - 10 * DAY }), undefined, now).some((x) => /no activity for 10 days/.test(x)));
  s.check('risk: quiet for 5 days is not', riskReasonsForStudent(stud({ lastActiveMs: now - 5 * DAY }), undefined, now).length === 0);
  s.check('risk: 28% accuracy over 20 submissions is at risk (the HOD rule is under 30% after 5)', riskReasonsForStudent(stud({ acRate: 28 }), undefined, now).some((x) => /low accuracy \(28%\)/.test(x)));
  s.check('risk: 28% accuracy over only 3 submissions is not enough evidence', riskReasonsForStudent(stud({ subs: 3, solved: 1, acRate: 28 }), undefined, now).length === 0);
  s.check('risk: a student submitting recently with nothing solved is stuck', riskReasonsForStudent(stud({ solved: 0, acRate: 0, subs: 8 }), undefined, now).length >= 1);
  s.check('risk: many attempts per solve is no longer a reason by itself', riskReasonsForStudent({ ...stud({}), avgAttemptsToSolve: 9 }, undefined, now).length === 0);
  s.check('risk: faculty and HOD agree — non-green by the shared flag rule exactly when there are reasons', [stud({}), stud({ lastActiveMs: now - 10 * DAY }), stud({ acRate: 28 }), stud({ subs: 0, solved: 0, lastActiveMs: null })].every((x) => (flagFor(x, now).flag !== 'green') === (riskReasonsForStudent(x, undefined, now).length > 0)));
  const withDeadlines = riskReasonsForStudent(stud({}), { missed: ['Loops lab'], unsolved: ['A', 'B'] }, now);
  s.check('risk: missed and unsolved assignments are added to the reasons, collapsed to counts when there are several', withDeadlines.length === 2 && withDeadlines[0] === 'missed deadline: "Loops lab"' && withDeadlines[1] === 'attempted but unsolved on 2 assignments', JSON.stringify(withDeadlines));
};
