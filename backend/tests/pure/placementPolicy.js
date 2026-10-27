// Training & Placement rules (utils/placementPolicy.js): drive validation, eligibility with every reason, the dream-tier rule,
// withdrawal, override reasons, who may see a CGPA, the CGPA list dry run, and the spreadsheet-safe export.
const P = require('../../src/utils/placementPolicy');

const NOW = Date.parse('2026-11-10T10:00:00+05:30');
const base = { company: 'Acme', role: 'Engineer', departments: ['CSE(AIML)'], eligible_years: [4], publish_state: 'published' };
const okDrive = (extra = {}) => P.validateDrive({ ...base, ...extra });
const drive = (extra = {}) => ({ id: 'd1', ...okDrive(extra).drive });
const stu = { id: 's1', department: 'CSE(AIML)', year: 4 };
const codes = (r) => r.reasons.map((x) => x.code);

module.exports = function (s) {
  // ── validating a drive ──
  const v = okDrive({ min_cgpa: '7.5', max_backlogs: 0, apply_by: '2026-11-15', link: 'https://acme.example/jobs', tier: 'dream', rounds: ['Aptitude', 'Interview'] });
  s.check('a complete drive is accepted', !v.error && v.drive.minCgpa === 7.5 && v.drive.maxBacklogs === 0 && v.drive.tier === 'dream' && v.drive.rounds.length === 2);
  s.check('a date with no time means the end of that day in India', v.drive.applyBy === '2026-11-15T18:29:59.000Z');
  s.check('a date and time is kept', P.validateDrive({ ...base, apply_by: '2026-11-15T17:00:00+05:30' }).drive.applyBy === '2026-11-15T11:30:00.000Z');
  s.check('a drive starts as a draft unless it is published', P.validateDrive({ company: 'Acme', departments: ['CSE'] }).drive.publishState === 'draft');
  s.check('several departments and years are kept, sorted, without repeats', (() => { const r = okDrive({ departments: ['ECE', 'CSE', 'ECE'], eligible_years: [4, 3, 4] }); return r.drive.departments.length === 2 && r.drive.eligibleYears.join() === '3,4'; })());
  s.check('no department is refused', !!okDrive({ departments: [] }).error && !!P.validateDrive({ company: 'Acme' }).error);
  s.check('a short company name is refused', !!okDrive({ company: 'A' }).error);
  s.check('an impossible date is refused', !!okDrive({ date: '2026-02-31' }).error && !!okDrive({ apply_by: '2026-02-31' }).error && !!okDrive({ apply_by: 'tomorrow' }).error);
  s.check('CGPA and backlog limits are range checked', !!okDrive({ min_cgpa: 11 }).error && !!okDrive({ min_cgpa: -1 }).error && !!okDrive({ min_cgpa: 'x' }).error && !!okDrive({ max_backlogs: 1.5 }).error && !!okDrive({ max_backlogs: -1 }).error);
  s.check('years outside 1 to 6 are refused', !!okDrive({ eligible_years: [7] }).error && !!okDrive({ eligible_years: ['x'] }).error);
  s.check('only an https link is accepted', !okDrive({ link: 'https://a.example' }).error && !!okDrive({ link: 'http://a.example' }).error && !!okDrive({ link: 'javascript:alert(1)' }).error && !!okDrive({ link: 'nope' }).error);
  s.check('round names must differ and are limited', !!okDrive({ rounds: ['A', 'a'] }).error && !!okDrive({ rounds: Array.from({ length: 9 }, (_, i) => `R${i}`) }).error);
  s.check('tier, status and publish state are checked', !!okDrive({ tier: 'gold' }).error && !!okDrive({ status: 'x' }).error && !!okDrive({ publish_state: 'x' }).error);
  s.check('non-object input is refused', !!P.validateDrive(null).error && !!P.validateDrive('x').error);

  // ── a drive made before T&P existed ──
  const legacy = { id: 'old', company: 'Old', department: 'ECE', eligibleYears: [3], status: 'open' };
  s.check('an old one-department drive is read as a published drive for that department', P.driveDepartments(legacy).join() === 'ECE' && P.shapeDrive(legacy).publish_state === 'published' && P.shapeDrive(legacy).tier === 'normal');

  // ── eligibility ──
  const ok = P.evaluate({ student: stu, record: { cgpa: 8, backlogs: 0 }, drive: drive(), hasOffer: false, now: NOW });
  s.check('a student who meets every rule is eligible', ok.eligible && ok.reasons.length === 0);
  s.check('wrong department is named', codes(P.evaluate({ student: { ...stu, department: 'ECE' }, record: null, drive: drive(), hasOffer: false, now: NOW })).includes('DEPARTMENT'));
  s.check('wrong year is named', codes(P.evaluate({ student: { ...stu, year: 3 }, record: null, drive: drive(), hasOffer: false, now: NOW })).includes('YEAR'));
  s.check('no year list means every year', P.evaluate({ student: { ...stu, year: 2 }, record: null, drive: drive({ eligible_years: [] }), hasOffer: false, now: NOW }).eligible);
  s.check('a multi-department drive admits each listed department', ['CSE', 'ECE'].every((d) => P.evaluate({ student: { ...stu, department: d }, record: null, drive: drive({ departments: ['CSE', 'ECE'] }), hasOffer: false, now: NOW }).eligible));
  s.check('a CGPA below the minimum is refused with both numbers', (() => { const r = P.evaluate({ student: stu, record: { cgpa: 6.4 }, drive: drive({ min_cgpa: 7 }), hasOffer: false, now: NOW }); return codes(r).join() === 'CGPA_LOW' && /7/.test(r.reasons[0].message) && /6\.4/.test(r.reasons[0].message); })());
  s.check('a CGPA exactly at the minimum is eligible', P.evaluate({ student: stu, record: { cgpa: 7 }, drive: drive({ min_cgpa: 7 }), hasOffer: false, now: NOW }).eligible);
  s.check('an unknown CGPA is not silently treated as passing', codes(P.evaluate({ student: stu, record: null, drive: drive({ min_cgpa: 7 }), hasOffer: false, now: NOW })).join() === 'CGPA_UNKNOWN');
  s.check('a drive with no CGPA rule does not need a CGPA record', P.evaluate({ student: stu, record: null, drive: drive(), hasOffer: false, now: NOW }).eligible);
  s.check('backlogs over the limit are refused, at the limit are fine, unknown is refused', codes(P.evaluate({ student: stu, record: { backlogs: 2 }, drive: drive({ max_backlogs: 1 }), hasOffer: false, now: NOW })).join() === 'BACKLOGS' && P.evaluate({ student: stu, record: { backlogs: 1 }, drive: drive({ max_backlogs: 1 }), hasOffer: false, now: NOW }).eligible && codes(P.evaluate({ student: stu, record: {}, drive: drive({ max_backlogs: 0 }), hasOffer: false, now: NOW })).join() === 'BACKLOGS_UNKNOWN');
  s.check('zero backlogs allowed means one backlog is refused', codes(P.evaluate({ student: stu, record: { backlogs: 1 }, drive: drive({ max_backlogs: 0 }), hasOffer: false, now: NOW })).join() === 'BACKLOGS');
  s.check('after the deadline nobody can apply, before it they can', codes(P.evaluate({ student: stu, record: null, drive: drive({ apply_by: '2026-11-09' }), hasOffer: false, now: NOW })).includes('DEADLINE') && P.evaluate({ student: stu, record: null, drive: drive({ apply_by: '2026-11-10' }), hasOffer: false, now: NOW }).eligible);
  s.check('a draft is not open to apply', codes(P.evaluate({ student: stu, record: null, drive: drive({ publish_state: 'draft' }), hasOffer: false, now: NOW })).includes('NOT_PUBLISHED'));
  s.check('a closed drive is not open to apply', codes(P.evaluate({ student: stu, record: null, drive: drive({ status: 'closed' }), hasOffer: false, now: NOW })).includes('CLOSED'));
  s.check('every reason is listed, not only the first', codes(P.evaluate({ student: { ...stu, year: 2 }, record: { cgpa: 5, backlogs: 4 }, drive: drive({ min_cgpa: 7, max_backlogs: 0 }), hasOffer: false, now: NOW })).length === 3);

  s.check('for staff the reasons are about the student, for the student they are addressed to them', (() => {
    const args = { student: { ...stu, year: 2 }, record: { cgpa: 5, backlogs: 3 }, drive: drive({ min_cgpa: 7, max_backlogs: 0 }), hasOffer: true, now: NOW };
    const mine = P.evaluate(args).reasons.map((r) => r.message).join(' ');
    const staff = P.evaluate({ ...args, audience: 'staff' }).reasons.map((r) => r.message).join(' ');
    return /Yours is 5/.test(mine) && /You have 3/.test(mine) && /You already have an offer/.test(mine) && !/\b(Your|Yours|You)\b/.test(staff) && /Theirs is 5/.test(staff) && /They have 3/.test(staff);
  })());

  // ── dream tier ──
  s.check('a student with an offer cannot apply to a normal drive', codes(P.evaluate({ student: stu, record: null, drive: drive(), hasOffer: true, now: NOW })).join() === 'HAS_OFFER');
  s.check('a student with an offer can apply to a dream drive', P.evaluate({ student: stu, record: null, drive: drive({ tier: 'dream' }), hasOffer: true, now: NOW }).eligible);
  s.check('a dream drive does not lock out a student without an offer', P.evaluate({ student: stu, record: null, drive: drive({ tier: 'dream' }), hasOffer: false, now: NOW }).eligible);

  // ── who holds an offer ──
  const pub = new Set(['d1']);
  s.check('selected in a published drive is an offer', P.hasOffer({ applications: [{ driveId: 'd1', status: 'selected' }], outside: [], publishedDriveIds: pub }));
  s.check('applied, shortlisted or rejected is not an offer', !P.hasOffer({ applications: [{ driveId: 'd1', status: 'applied' }, { driveId: 'd1', status: 'shortlisted' }, { driveId: 'd1', status: 'rejected' }], outside: [], publishedDriveIds: pub }));
  s.check('an outside offer counts', P.hasOffer({ applications: [], outside: [{ status: 'selected' }] }));
  s.check('an outside application that is not selected does not', !P.hasOffer({ applications: [], outside: [{ status: 'applied' }, { status: 'rejected' }] }));
  s.check('nothing at all is no offer', !P.hasOffer({}) && !P.hasOffer({ applications: [], outside: [] }));

  // ── applying ──
  s.check('apply is allowed for an eligible student', P.checkApply({ student: stu, record: null, drive: drive(), hasOffer: false, now: NOW, existing: null }).ok);
  s.check('a second application to the same drive is refused', P.checkApply({ student: stu, record: null, drive: drive(), hasOffer: false, now: NOW, existing: { status: 'applied' } }).code === 'ALREADY_APPLIED');
  s.check('a refusal carries every reason and a readable message', (() => { const r = P.checkApply({ student: { ...stu, year: 2 }, record: { cgpa: 5 }, drive: drive({ min_cgpa: 7 }), hasOffer: false, now: NOW, existing: null }); return !r.ok && r.reasons.length === 2 && /year/.test(r.error) && /CGPA/.test(r.error); })());
  s.check('a draft or closed drive cannot be overridden, other rules can', (() => {
    const a = P.checkApply({ student: stu, record: null, drive: drive({ publish_state: 'draft' }), hasOffer: false, now: NOW, existing: null });
    const b = P.checkApply({ student: stu, record: { cgpa: 5 }, drive: drive({ min_cgpa: 7 }), hasOffer: false, now: NOW, existing: null });
    return a.overridable === false && b.overridable === true;
  })());

  // ── withdrawing ──
  s.check('a student can withdraw an "applied" application before the deadline', P.canWithdraw({ application: { status: 'applied' }, drive: drive({ apply_by: '2026-11-15' }), now: NOW }).ok);
  s.check('after the company has acted, or after the deadline, a student cannot withdraw', !P.canWithdraw({ application: { status: 'shortlisted' }, drive: drive(), now: NOW }).ok && !P.canWithdraw({ application: { status: 'applied' }, drive: drive({ apply_by: '2026-11-09' }), now: NOW }).ok && !P.canWithdraw({ application: { status: 'applied' }, drive: drive({ status: 'closed' }), now: NOW }).ok);
  s.check('withdrawing with no application is refused', !P.canWithdraw({ application: null, drive: drive(), now: NOW }).ok);

  // ── override reason ──
  s.check('an override needs a real reason', !!P.validateOverride({ reason: 'ok' }).error && !!P.validateOverride({}).error && !!P.validateOverride({ reason: 'x'.repeat(301) }).error && P.validateOverride({ reason: '  Approved by the principal  ' }).reason === 'Approved by the principal');

  // ── who may see a CGPA ──
  const target = { id: 's1', department: 'CSE(AIML)' };
  s.check('the student, T&P and the Admin may see it', P.canSeeAcademicRecord({ role: 'student', id: 's1' }, target) && P.canSeeAcademicRecord({ role: 'tnp', id: 't' }, target) && P.canSeeAcademicRecord({ role: 'admin', id: 'a' }, target));
  s.check('the HOD of the same department may, another department may not', P.canSeeAcademicRecord({ role: 'hod', id: 'h', department: 'CSE(AIML)' }, target) && !P.canSeeAcademicRecord({ role: 'hod', id: 'h', department: 'ECE' }, target) && !P.canSeeAcademicRecord({ role: 'hod', id: 'h', department: null }, target));
  s.check('another student and faculty may not', !P.canSeeAcademicRecord({ role: 'student', id: 's2' }, target) && !P.canSeeAcademicRecord({ role: 'faculty', id: 'f', department: 'CSE(AIML)' }, target) && !P.canSeeAcademicRecord(null, target) && !P.canSeeAcademicRecord({ role: 'admin' }, null));

  // ── CGPA list ──
  const byRoll = new Map([['23A01', { id: 's1', name: 'Asha' }], ['23A02', { id: 's2', name: 'Ravi' }], ['23A03', { id: 's3', name: 'Mani' }]]);
  const cur = new Map([['s2', { cgpa: 7.1, backlogs: 1 }], ['s3', { cgpa: 8, backlogs: 0 }]]);
  const csv = '﻿Roll No,Name,CGPA,Backlogs\r\n23a01,Asha,8.456,0\r\n23A02,Ravi,7.1,1\r\n23A03,Mani,8.5,\r\n23A09,Ghost,7,0\r\n23A01,Dup,7,0\r\n,,,\r\n23A02x,Bad,7,0\r\n';
  const plan = P.planRecordUpload(csv, byRoll, cur);
  const row = (n) => plan.rows.find((r) => r.rowNo === n);
  s.check('a plan is made and nothing in the inputs is changed', !plan.error && cur.get('s2').cgpa === 7.1);
  s.check('a new record, with the CGPA rounded to two places and the roll number upper-cased', row(2).status === 'new' && row(2).cgpa === 8.46 && row(2).rollNo === '23A01' && row(2).backlogs === 0);
  s.check('an unchanged record is "same"', row(3).status === 'same');
  s.check('a changed CGPA shows the old values', row(4).status === 'changed' && row(4).cgpa === 8.5 && row(4).backlogs === undefined && row(4).before.cgpa === 8);
  s.check('an unknown roll number is an error naming the problem', row(5).status === 'error' && /No student/.test(row(5).error));
  s.check('a roll number listed twice is an error on the second row', row(6).status === 'error' && /row 2/.test(row(6).error));
  s.check('a blank line is skipped but still counted, so a row number is the line in the file', plan.rows.every((r) => r.rowNo !== 7) && row(8).rollNo === '23A02X');
  s.check('counts add up', plan.counts.new === 1 && plan.counts.same === 1 && plan.counts.changed === 1 && plan.counts.error === 3 && plan.rows.length === 6);
  s.check('a CGPA of 11 or text is an error', P.planRecordUpload('roll,cgpa\n23A01,11\n23A02,abc\n', byRoll, cur).rows.every((r) => r.status === 'error'));
  s.check('a fractional backlog count is an error', P.planRecordUpload('roll,backlogs\n23A01,1.5\n', byRoll, cur).rows[0].status === 'error');
  s.check('a file with only backlogs is fine, and only a CGPA is fine', P.planRecordUpload('roll,backlogs\n23A01,2\n', byRoll, cur).rows[0].status === 'new' && P.planRecordUpload('Roll Number,CGPA\n23A01,8\n', byRoll, cur).rows[0].status === 'new');
  s.check('a file without a roll number column is refused with a clear message', /Roll number/.test(P.planRecordUpload('name,cgpa\nA,8\n', byRoll, cur).error));
  s.check('a file without CGPA or backlogs is refused', /CGPA/.test(P.planRecordUpload('roll,name\n23A01,A\n', byRoll, cur).error));
  s.check('a header-only or empty file is refused', !!P.planRecordUpload('roll,cgpa\n', byRoll, cur).error && !!P.planRecordUpload('', byRoll, cur).error && !!P.planRecordUpload(null, byRoll, cur).error);
  s.check('too many rows are refused', /at most/.test(P.planRecordUpload(`roll,cgpa\n${Array.from({ length: 5001 }, () => '23A01,8').join('\n')}`, byRoll, cur).error));
  s.check('quoted cells and doubled quotes are read', P.parseCsvRows('a,"b,c","d ""e"""\n1,2,3')[0].join('|') === 'a|b,c|d "e"');

  // ── export ──
  s.check('only the listed fields can be exported, in a fixed column order', P.validateExportFields(['cgpa', 'name']).fields.join() === 'name,cgpa' && !!P.validateExportFields(['password']).error && !!P.validateExportFields([]).error && !!P.validateExportFields('name').error);
  s.check('a field cannot be asked for twice', P.validateExportFields(['name', 'name']).fields.length === 1);
  s.check('a cell that starts like a formula is neutralised', ['=1+1', '+1', '-1+2', '@SUM(A1)', '\tx', '\rx'].every((x) => P.csvCell(x).replace(/^"/, '').startsWith("'")));
  s.check('numbers are not changed, including negative ones', P.csvCell(8.5) === '8.5' && P.csvCell(-1) === '-1' && P.csvCell(0) === '0');
  s.check('commas, quotes and line breaks are quoted', P.csvCell('a,b') === '"a,b"' && P.csvCell('say "hi"') === '"say ""hi"""' && P.csvCell('a\nb') === '"a\nb"');
  s.check('missing values are empty', P.csvCell(null) === '' && P.csvCell(undefined) === '');
  s.check('the CSV has a header, one line per student, and a malicious name is defused', (() => {
    const out = P.toCsv(['name', 'cgpa'], [{ name: '=HYPERLINK("x")', cgpa: 8 }, { name: 'Asha', cgpa: null }]);
    const lines = out.trim().split('\r\n');
    return lines[0] === 'Name,CGPA' && lines.length === 3 && lines[1].startsWith('"\'=HYPERLINK') && lines[2] === 'Asha,';
  })());
};
