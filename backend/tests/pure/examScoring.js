// Exam scoring: one set of rules for submitting, the faculty report and timed-out attempts.
const { negativeFor, scoreMcqSection, scoreCodingSection, scoreAttempt, betterCodingAnswer, isExpiredUnsubmitted } = require('../../src/utils/examScoring');
const { sectionScoresFor } = require('../../src/utils/examReport');

module.exports = function (s) {
  const exam = { negativeMarkingDefault: 0.5 };
  // Stored (camelCase) questions, exactly as the repository returns them.
  const sectionA = { id: 'A', title: 'Aptitude', type: 'mcq', marksPerQuestion: 2, negativeMarking: null };
  const qsA = [
    { id: 'q1', correctIndex: 1 },
    { id: 'q2', correctIndex: 0 },
    { id: 'q3', correctIndex: 2, negativeMarks: 1 }, // its own penalty
    { id: 'q4', correctIndex: 3 },
  ];
  const state = {
    q1: { selectedIndex: 1 }, // correct   +2
    q2: { selectedIndex: 3 }, // wrong     −0.5 (the exam default)
    q3: { selectedIndex: 0 }, // wrong     −1   (the question's own value)
    q4: { selectedIndex: null }, // left blank: nothing
  };

  s.check('negative: a question value wins, then the section, then the exam default', negativeFor({ negativeMarks: 1 }, { negativeMarking: 0.25 }, exam) === 1 && negativeFor({}, { negativeMarking: 0.25 }, exam) === 0.25 && negativeFor({}, { negativeMarking: null }, exam) === 0.5 && negativeFor({}, null, null) === 0);
  s.check('negative: an explicit 0 on a section really means no penalty', negativeFor({}, { negativeMarking: 0 }, exam) === 0);
  s.check('negative: the API (snake_case) field names are read too', negativeFor({ negative_marks: 2 }, {}, exam) === 2);

  const a = scoreMcqSection(sectionA, qsA, state, exam);
  s.check('mcq: +2 for the right answer, −0.5 default and −1 own penalty for the wrong ones, blank costs nothing → 0.5 of 8', a.score === 0.5 && a.total === 8, JSON.stringify(a));
  s.check('mcq: the exam default is applied (it used to be saved and ignored)', scoreMcqSection(sectionA, [{ id: 'q', correctIndex: 0 }], { q: { selectedIndex: 1 } }, exam).score === -0.5 && scoreMcqSection(sectionA, [{ id: 'q', correctIndex: 0 }], { q: { selectedIndex: 1 } }, {}).score === 0);

  // The same questions in the API shape must score identically (the report used to read only this shape and never match).
  const apiShape = qsA.map((q) => ({ id: q.id, correct_index: q.correctIndex, negative_marks: q.negativeMarks }));
  s.check('mcq: stored and API field names give the same score', scoreMcqSection(sectionA, apiShape, state, exam).score === 0.5);
  s.check('mcq: a student who answers everything correctly gets full marks (the report used to give 0 or less)', scoreMcqSection(sectionA, qsA, { q1: { selectedIndex: 1 }, q2: { selectedIndex: 0 }, q3: { selectedIndex: 2 }, q4: { selectedIndex: 3 } }, exam).score === 8);
  s.check('mcq: no attempt data scores 0 of the total', scoreMcqSection(sectionA, qsA, undefined, exam).score === 0 && scoreMcqSection(sectionA, qsA, {}, exam).total === 8);
  s.check('mcq: a question can carry its own marks', scoreMcqSection(sectionA, [{ id: 'x', correctIndex: 0, marks: 5 }], { x: { selectedIndex: 0 } }, exam).score === 5);

  const sectionB = { id: 'B', title: 'Verbal', type: 'mcq', marksPerQuestion: 1, negativeMarking: 0.25 };
  s.check('mcq: a section penalty beats the exam default', scoreMcqSection(sectionB, [{ id: 'z', correctIndex: 0 }], { z: { selectedIndex: 2 } }, exam).score === -0.25);

  const sectionC = { id: 'C', title: 'Coding', type: 'coding', marksPerQuestion: 10, problemIds: ['p1', 'p2'] };
  const c = scoreCodingSection(sectionC, { p1: { score: 10 }, p2: { score: 4 } });
  s.check('coding: marks are summed over the section problems out of problems x marks', c.score === 14 && c.total === 20, JSON.stringify(c));
  s.check('coding: a problem never opened scores 0', scoreCodingSection(sectionC, {}).score === 0 && scoreCodingSection(sectionC, undefined).score === 0);

  const qBy = new Map([['A', qsA], ['B', [{ id: 'z', correctIndex: 0 }]]]);
  const attempt = { questionState: { ...state, z: { selectedIndex: 0 } }, codingState: { p1: { score: 10 }, p2: { score: 4 } } };
  const whole = scoreAttempt({ sections: [sectionA, sectionB, sectionC], questionsBySection: qBy, attempt, exam });
  s.check('attempt: the total is the sum over sections (0.5 + 1 + 14 = 15.5 of 8 + 1 + 20 = 29)', whole.score === 15.5 && whole.total === 29, `${whole.score}/${whole.total}`);
  s.check('attempt: the report and submitting score identically (the report calls the same function)', JSON.stringify(sectionScoresFor(attempt, [sectionA, sectionB, sectionC], qBy, exam)) === JSON.stringify(whole.sections));

  // ── best coding mark ─────────────────────────────────────────────────────────
  const accepted = { status: 'answered', verdict: 'Accepted', score: 10, submissionId: 's1' };
  const broken = { status: 'answered', verdict: 'Wrong Answer', score: 0, submissionId: 's2' };
  s.check('coding best: a later broken submission does not lower an accepted answer', betterCodingAnswer(accepted, broken).score === 10 && betterCodingAnswer(accepted, broken).submissionId === 's1');
  s.check('coding best: a higher mark replaces a lower one', betterCodingAnswer({ status: 'answered', score: 4 }, accepted).score === 10);
  s.check('coding best: an equal mark keeps the newer submission', betterCodingAnswer(accepted, { ...accepted, submissionId: 's3' }).submissionId === 's3');
  s.check('coding best: the first submission, or one after only "visited", is stored as is', betterCodingAnswer(undefined, broken) === broken && betterCodingAnswer({ status: 'visited' }, broken) === broken);
  s.check('coding best: after a worse submission the problem still reads as answered', betterCodingAnswer({ status: 'answered', score: 10 }, { status: 'answered', score: 2 }).status === 'answered');

  // ── attempts that ran out of time ───────────────────────────────────────────
  const now = Date.UTC(2026, 9, 20, 12);
  s.check('expired: past the window with nothing submitted', isExpiredUnsubmitted({ windowExpiresAt: new Date(now - 1000) }, now) === true);
  s.check('expired: a submitted attempt is never expired', isExpiredUnsubmitted({ windowExpiresAt: new Date(now - 1000), submittedAt: new Date(now - 5000) }, now) === false);
  s.check('expired: still inside the window', isExpiredUnsubmitted({ windowExpiresAt: new Date(now + 60000) }, now) === false);
  s.check('expired: no window, or no attempt, is not expired', isExpiredUnsubmitted({}, now) === false && isExpiredUnsubmitted(null, now) === false);
  s.check('expired: a Firestore timestamp object works', isExpiredUnsubmitted({ windowExpiresAt: { toMillis: () => now - 1 } }, now) === true);
};
