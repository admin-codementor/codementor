// HOD completion rules: the batch of a student, the department export, the definitions page, and the rules-written summary.
const B = require('../../src/utils/batch');
const X = require('../../src/utils/departmentExport');
const { definitions } = require('../../src/utils/definitions');
const { rulesSummary } = require('../../src/services/departmentInsightsService');
const S = require('../../src/utils/studentState');

const at = (iso) => Date.parse(iso);

module.exports = function (s) {
  // ── batch ──
  s.check('the academic year starts in June: November 2026 is the 2026 academic year, March 2026 is still 2025', B.academicYearStart(at('2026-11-01T00:00:00Z')) === 2026 && B.academicYearStart(at('2026-03-01T00:00:00Z')) === 2025 && B.academicYearStart(at('2026-06-01T00:00:00Z')) === 2026 && B.academicYearStart(at('2026-05-31T00:00:00Z')) === 2025);
  const nov = at('2026-11-01T00:00:00Z');
  s.check('without a stored year the batch is worked out: a 4th-year in November 2026 joined in 2023, a 1st-year in 2026', B.batchOf({ year: 4 }, nov).label === '2023-2027' && B.batchOf({ year: 1 }, nov).label === '2026-2030' && B.batchOf({ year: 4 }, nov).derived === true);
  s.check('the same student in March has the batch one year earlier than in November, as the academic year turns', B.batchOf({ year: 3 }, at('2026-03-01T00:00:00Z')).label === '2023-2027' && B.batchOf({ year: 3 }, nov).label === '2024-2028');
  s.check('a stored admission year wins over the working-out (a student who repeated a year)', B.batchOf({ year: 4, admissionYear: 2022 }, nov).label === '2022-2026' && B.batchOf({ year: 4, admissionYear: 2022 }, nov).derived === false);
  s.check('an unusable stored year is ignored, and no year of study means no batch', B.batchOf({ year: 4, admissionYear: 'abc' }, nov).label === '2023-2027' && B.batchOf({ year: 4, admissionYear: 1900 }, nov).derived === true && B.batchOf({}, nov).label === null && B.batchOf({ year: 0 }, nov).label === null && B.batchOf({ year: 9 }, nov).label === null && B.batchOf(null, nov).label === null);
  s.check('what an Admin types is a whole year from 2000 to 2100', B.validateAdmissionYear('2023').value === 2023 && B.validateAdmissionYear(2024).value === 2024 && !!B.validateAdmissionYear('').error && !!B.validateAdmissionYear('1999').error && !!B.validateAdmissionYear('2023.5').error && !!B.validateAdmissionYear('x').error && !!B.validateAdmissionYear(null).error);
  const stu = [{ year: 4 }, { year: 4 }, { year: 3 }, { year: 4, admissionYear: 2022 }, {}];
  s.check('the batches present are counted, newest first, and a student with none is left out', JSON.stringify(B.batchesOf(stu, nov)) === JSON.stringify([{ name: '2024-2028', count: 1 }, { name: '2023-2027', count: 2 }, { name: '2022-2026', count: 1 }]));
  s.check('"fill the missing batches" would change exactly the students with no stored year', B.missingBatch(stu).length === 4 && B.missingBatch([{ admissionYear: 2023 }]).length === 0);

  // ── department export ──
  s.check('only the listed fields can be exported, in a fixed order, once each', X.validateFields(['codingScore', 'name', 'name']).fields.join() === 'name,codingScore' && !!X.validateFields(['password']).error && !!X.validateFields([]).error && !!X.validateFields('name').error);
  const analytics = [
    { id: 'a', roll_no: '22CS1', section: 'A', year: 4, state: 'stuck', flag: 'red', solved: 3, ac_rate: 25, subs: 12, last_active: '2026-10-30T10:00:00.000Z' },
    { id: 'b', roll_no: '22CS2', section: 'B', year: 4, state: 'not_started', flag: 'red', solved: 0, ac_rate: 0, subs: 0, last_active: null },
  ];
  const students = new Map([['a', { name: '=cmd|calc', email: 'a@c.test', department: 'CSE' }], ['b', { name: 'Bina', email: 'b@c.test', department: 'CSE', admissionYear: 2022 }]]);
  const rows = X.buildRows({ analytics, scores: [{ id: 'a', overall: 41.5, flag: 'orange' }], students, now: nov });
  s.check('rows join practice, coding score and batch; a student with no submissions has no accuracy', rows[0].practiceState === 'Stuck' && rows[0].codingScore === 41.5 && rows[0].codingBand === 'Orange' && rows[0].batch === '2023-2027' && rows[0].accuracy === 25 && rows[1].accuracy === null && rows[1].codingScore === null && rows[1].batch === '2022-2026' && rows[1].lastActive === null && rows[0].lastActive === '2026-10-30');
  const csv = X.toCsv(['name', 'batch', 'codingScore'], rows).trim().split('\r\n');
  s.check('the CSV has a header and a line each, and a name that starts like a formula is defused', csv[0] === 'Name,Batch,Coding score' && csv.length === 3 && csv[1].startsWith("'=cmd|calc") && csv[2] === 'Bina,2022-2026,');
  s.check('an empty department exports a header only', X.toCsv(['name'], []) === 'Name\r\n');

  // ── definitions ──
  const defs = definitions();
  const text = JSON.stringify(defs);
  s.check('the definitions quote the real constants (quiet days, accuracy limit, thresholds, best four, half weight)', text.includes(`${S.QUIET_DAYS} days`) && text.includes(`${S.LOW_ACCURACY_PCT}%`) && text.includes(`best 4`) && text.includes('50%'));
  s.check('every word has one definition: no two entries share an id, and every item has a term and a rule', new Set(defs.map((d) => d.id)).size === defs.length && defs.every((d) => d.title && d.summary && d.items.length > 0 && d.items.every((i) => i.term && i.rule)));
  s.check('"At risk" is not used as a word any more (it meant two different things)', !/at risk/i.test(text) && defs.some((d) => d.id === 'not_active') && defs.some((d) => d.id === 'needs_attention'));

  // ── the rules-written summary ──
  const data = { totals: { students: 40 }, insights: [{ severity: 'high', title: '10 of 40 students have never submitted', detail: 'That is 25% of this view.' }, { severity: 'low', title: 'Submissions are down 5 on last week', detail: '20 in 7 days.' }] };
  const r = rulesSummary(data, 'AI help is switched off by your college right now.');
  s.check('the summary says it is written by rules and why, keeps the real facts, and gives a next step only where something needs doing', r.source === 'rules' && /40 students/.test(r.headline) && /fixed rules/.test(r.headline) && r.ai_note === 'AI help is switched off by your college right now.' && r.insights.length === 2 && r.insights[0].priority === 'high' && /Needs attention/.test(r.insights[0].action) && r.insights[1].action === '');
  s.check('it never invents a score or a rating', !('score' in r) && !('rating' in r) && !('risk' in r));
  s.check('it caps the list at six and tolerates missing insights', rulesSummary({ totals: { students: 3 }, insights: Array.from({ length: 9 }, (_, i) => ({ severity: 'low', title: `t${i}`, detail: 'd' })) }, 'x').insights.length === 6 && rulesSummary({ totals: { students: 3 } }, 'x').insights.length === 0);
};
