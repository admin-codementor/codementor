// The Admin's rules (utils/adminRules.js): new accounts, the safety rules, settings, AI limits, people search and audit search.
const R = require('../../src/utils/adminRules');

const NOW = Date.parse('2026-10-31T20:00:00Z'); // 01:30 on 1 November in India
const admins = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `a${i + 1}`, role: 'admin', email: `a${i + 1}@c.test`, ...extra }));

module.exports = function (s) {
  // ── new account ──
  const ok = (o, st) => R.validateNewAccount({ name: 'Asha Rao', email: ' Asha@College.EDU ', role: 'faculty', department: 'CSE', ...o }, st);
  s.check('a faculty account needs a name, an email, a role and a department; the email is lower-cased', ok().value?.email === 'asha@college.edu' && ok().value.department === 'CSE' && ok().value.name === 'Asha Rao');
  s.check('a faculty or HOD without a department is refused', !!ok({ department: '' }).error && !!ok({ role: 'hod', department: null }).error);
  s.check('T&P and Admin have no department, even if one is sent', ok({ role: 'tnp', department: 'CSE' }).value.department === null && ok({ role: 'admin', department: 'CSE' }).value.department === null);
  s.check('a student role cannot be created here, nor an unknown one', !!ok({ role: 'student' }).error && !!ok({ role: 'root' }).error && !!ok({ role: undefined }).error);
  s.check('a bad email or a one-letter name is refused', !!ok({ email: 'nope' }).error && !!ok({ email: 'a b@c.d' }).error && !!ok({ name: 'A' }).error);
  s.check('when the college has a department list, the department must be on it', !!ok({ department: 'Mech' }, { departments: ['CSE', 'ECE'] }).error && !ok({ department: 'ECE' }, { departments: ['CSE', 'ECE'] }).error && !ok({ department: 'Anything' }, { departments: [] }).error);
  s.check('the error for an unlisted department tells the Admin what to do', /Settings/.test(ok({ department: 'Mech' }, { departments: ['CSE'] }).error));

  // ── typed confirmation ──
  s.check('the typed email must match in full, ignoring case and outer spaces', R.confirmed('  A1@C.TEST ', { email: 'a1@c.test' }) && !R.confirmed('a1@c', { email: 'a1@c.test' }) && !R.confirmed('', { email: 'a1@c.test' }) && !R.confirmed('x', {}) && !R.confirmed('x', null));

  // ── safety rules ──
  const people = [...admins(2), { id: 'f1', role: 'faculty', email: 'f1@c.test' }, { id: 's1', role: 'student', email: 's1@c.test' }];
  const chk = (o) => R.checkAccountChange({ actor: { id: 'a1' }, people, change: 'disable', typed: o.target?.email, ...o });
  s.check('disabling a faculty member with the email typed is allowed', chk({ target: people[2] }).ok);
  s.check('without the typed email nothing is allowed', chk({ target: people[2], typed: '' }).code === 'CONFIRM' && chk({ target: people[2], typed: 'wrong@c.test' }).code === 'CONFIRM');
  s.check('a student is not managed here', chk({ target: people[3] }).code === 'NOT_STAFF');
  s.check('a missing account is "not found"', chk({ target: undefined }).code === 'NOT_FOUND');
  s.check('an Admin cannot disable themselves', chk({ target: people[0] }).code === 'SELF');
  s.check('an Admin cannot change their own role', chk({ target: people[0], change: 'role', newRole: 'faculty' }).code === 'SELF');
  s.check('another Admin can be disabled while a second active Admin remains', chk({ target: people[1] }).ok);
  s.check('the last active Admin cannot be disabled by anyone', R.checkAccountChange({ actor: { id: 'other' }, people: [people[0], people[2]], target: people[0], change: 'disable', typed: 'a1@c.test' }).code === 'LAST_ADMIN');
  s.check('the last active Admin cannot be given another role', R.checkAccountChange({ actor: { id: 'other' }, people: [people[0], people[2]], target: people[0], change: 'role', newRole: 'hod', typed: 'a1@c.test' }).code === 'LAST_ADMIN');
  s.check('a disabled Admin does not count as an active one', R.checkAccountChange({ actor: { id: 'a1' }, people: [people[0], { ...people[1], disabled: true }], target: people[1], change: 'disable', typed: 'a2@c.test' }).ok === true && R.checkAccountChange({ actor: { id: 'a1' }, people: [{ ...people[0], disabled: true }, people[1]], target: people[1], change: 'role', newRole: 'faculty', typed: 'a2@c.test' }).code === 'LAST_ADMIN');
  s.check('making someone else an Admin is allowed', chk({ target: people[2], change: 'role', newRole: 'admin' }).ok);
  s.check('a role must be a staff role and must differ', chk({ target: people[2], change: 'role', newRole: 'student' }).code === 'BAD_ROLE' && chk({ target: people[2], change: 'role', newRole: 'faculty' }).code === 'NO_CHANGE');

  // ── department changes ──
  s.check('only faculty and HOD have a department to change', !!R.validateDepartmentChange({ target: { role: 'tnp' }, department: 'CSE' }).error && R.validateDepartmentChange({ target: { role: 'hod' }, department: ' ECE ' }).value === 'ECE');
  s.check('a department change is checked against the list', !!R.validateDepartmentChange({ target: { role: 'hod' }, department: 'Mech' }, { departments: ['CSE'] }).error && !!R.validateDepartmentChange({ target: { role: 'hod' }, department: '' }).error);
  s.check('a role change to HOD keeps the department or needs one; to T&P it is cleared', R.departmentAfterRoleChange({ department: 'CSE' }, 'hod').value === 'CSE' && !!R.departmentAfterRoleChange({ department: null }, 'hod').error && R.departmentAfterRoleChange({ department: 'CSE' }, 'tnp').value === null && R.departmentAfterRoleChange({ department: null }, 'faculty', 'ECE').value === 'ECE');

  // ── settings ──
  const cur = R.normaliseSettings(undefined);
  s.check('with nothing stored the settings are the defaults', JSON.stringify(cur) === JSON.stringify(R.DEFAULT_SETTINGS) && cur.ai.enabled === true && cur.ai.dailyLimit === null);
  s.check('unusable stored settings fall back to defaults instead of breaking', JSON.stringify(R.normaliseSettings('x')) === JSON.stringify(R.DEFAULT_SETTINGS) && R.normaliseSettings({ departments: 'no', ai: { enabled: 5, dailyLimit: -3 } }).ai.dailyLimit === null && R.normaliseSettings({ ai: { enabled: false } }).ai.enabled === false);
  const dep = R.validateSettingsChange({ departments: [' CSE ', 'ECE', '', 'ECE '.slice(0, 3)] }, cur);
  s.check('a name listed twice, ignoring case, is refused by name', /ECE/.test(dep.error) && /twice/.test(dep.error));
  s.check('departments are trimmed, empties dropped', R.validateSettingsChange({ departments: [' CSE ', '', 'ECE'] }, cur).value.departments.join() === 'CSE,ECE');
  s.check('more than 60 names is refused', !!R.validateSettingsChange({ departments: Array.from({ length: 61 }, (_, i) => `D${i}`) }, cur).error);
  s.check('only the parts sent change', (() => { const c2 = { ...cur, departments: ['CSE'], sections: ['A'] }; const r = R.validateSettingsChange({ ai: { enabled: false } }, c2).value; return r.departments.join() === 'CSE' && r.sections.join() === 'A' && r.ai.enabled === false; })());
  s.check('the AI switch must be a real boolean', !!R.validateSettingsChange({ ai: { enabled: 'no' } }, cur).error);
  s.check('the daily limit is 1 to 1000, or empty for none', R.validateSettingsChange({ ai: { dailyLimit: 20 } }, cur).value.ai.dailyLimit === 20 && R.validateSettingsChange({ ai: { dailyLimit: '' } }, { ...cur, ai: { enabled: true, dailyLimit: 5 } }).value.ai.dailyLimit === null && !!R.validateSettingsChange({ ai: { dailyLimit: 0 } }, cur).error && !!R.validateSettingsChange({ ai: { dailyLimit: 1001 } }, cur).error && !!R.validateSettingsChange({ ai: { dailyLimit: 2.5 } }, cur).error);
  s.check('the current settings are never changed by a check', (() => { const c3 = R.normaliseSettings({ departments: ['CSE'] }); R.validateSettingsChange({ departments: ['X'], ai: { enabled: false } }, c3); return c3.departments[0] === 'CSE' && c3.ai.enabled === true; })());
  s.check('nothing, or a non-object, is refused', !!R.validateSettingsChange(null, cur).error && !!R.validateSettingsChange('x', cur).error);
  s.check('the audit text says what changed, old to new', (() => { const a = R.describeSettingsChange(cur, { ...cur, ai: { enabled: false, dailyLimit: 10 } }); return /ai\.enabled: true → false/.test(a) && /ai\.dailyLimit: none → 10/.test(a); })() && R.describeSettingsChange(cur, cur) === '');

  // ── AI limits ──
  const on = { ai: { enabled: true, dailyLimit: 3 } };
  s.check('AI is allowed under the limit and refused at it, with a message that says when it returns', R.aiAllowed(on, 'student', 2).ok && R.aiAllowed(on, 'student', 3).code === 'AI_DAILY_LIMIT' && /tomorrow/.test(R.aiAllowed(on, 'student', 3).error));
  s.check('with AI switched off nobody gets it, not even an Admin', R.aiAllowed({ ai: { enabled: false, dailyLimit: null } }, 'admin', 0).code === 'AI_OFF' && R.aiAllowed({ ai: { enabled: false, dailyLimit: null } }, 'student', 0).code === 'AI_OFF');
  s.check('an Admin is not held to the daily limit; with no limit nobody is', R.aiAllowed(on, 'admin', 99).ok && R.aiAllowed({ ai: { enabled: true, dailyLimit: null } }, 'student', 999).ok);
  s.check('the AI day is the college day in India: 20:00 UTC is already the next day', R.dayKey(NOW) === '2026-11-01' && R.dayKey(Date.parse('2026-10-31T18:29:00Z')) === '2026-10-31' && R.dayKey(Date.parse('2026-10-31T18:30:00Z')) === '2026-11-01');

  // ── people ──
  const ppl = [
    { id: '1', name: 'Zed', email: 'z@c.test', role: 'faculty', department: 'CSE' },
    { id: '2', name: 'Amy', email: 'amy@c.test', role: 'hod', department: 'ECE', disabled: true },
    { id: '3', name: 'Bob', email: 'bob@c.test', role: 'student', department: 'CSE', rollNo: '22CS001' },
    ...Array.from({ length: 120 }, (_, i) => ({ id: `x${i}`, name: `P${String(i).padStart(3, '0')}`, email: `p${i}@c.test`, role: 'student', department: 'CSE' })),
  ];
  s.check('people are sorted by name and paged', R.filterPeople(ppl, { size: 50 }).rows.length === 50 && R.filterPeople(ppl, { size: 50 }).rows[0].name === 'Amy' && R.filterPeople(ppl, { size: 50 }).pages === 3 && R.filterPeople(ppl, { size: 50, page: 3 }).rows.length === 23);
  s.check('a page number out of range is pulled back, a huge page size is capped', R.filterPeople(ppl, { page: 99, size: 50 }).page === 3 && R.filterPeople(ppl, { size: 5000 }).rows.length === R.MAX_LIST && R.filterPeople(ppl, { page: -4 }).page === 1);
  s.check('search matches name, email and roll number, ignoring case', R.filterPeople(ppl, { q: 'AMY' }).total === 1 && R.filterPeople(ppl, { q: 'z@c' }).rows[0].id === '1' && R.filterPeople(ppl, { q: '22cs001' }).rows[0].id === '3');
  s.check('role, department and status filters work together', R.filterPeople(ppl, { role: 'hod', status: 'disabled' }).total === 1 && R.filterPeople(ppl, { role: 'hod', status: 'active' }).total === 0 && R.filterPeople(ppl, { department: 'ECE' }).total === 1);
  s.check('an empty result is a page 1 of 1, not an error', R.filterPeople(ppl, { q: 'nobody' }).pages === 1 && R.filterPeople([], {}).rows.length === 0);

  // ── audit ──
  const day = 86400000;
  const log = [
    { action: 'placement.export', userId: 'u1', detail: '5 students', createdAt: NOW - 1 * day },
    { action: 'placement.drive.create', userId: 'u2', detail: 'Acme', createdAt: NOW - 3 * day },
    { action: 'admin.account.disable', userId: 'u1', detail: 'asha@c.test', userName: 'Meena', createdAt: { toMillis: () => NOW - 10 * day } },
    { action: 'nudge.send', userId: 'u3', createdAt: null },
  ];
  s.check('audit entries filter by action prefix', R.filterAudit(log, { action: 'placement.' }).length === 2 && R.filterAudit(log, { action: 'placement.export' }).length === 1);
  s.check('audit entries filter by person and by text in any field', R.filterAudit(log, { userId: 'u1' }).length === 2 && R.filterAudit(log, { q: 'asha' }).length === 1 && R.filterAudit(log, { q: 'MEENA' }).length === 1);
  s.check('audit entries filter by date, and an entry with no time is left out of a dated search', R.filterAudit(log, { fromMs: NOW - 5 * day }).length === 2 && R.filterAudit(log, { toMs: NOW - 5 * day }).length === 1 && R.filterAudit(log).length === 4);
  s.check('Firestore timestamps and plain numbers are both read', R.filterAudit(log, { fromMs: NOW - 11 * day, toMs: NOW - 9 * day }).length === 1);
  s.check('the retention cutoff is one year', R.retentionCutoff(NOW) === NOW - 365 * day && R.RETENTION_DAYS === 365);
};
