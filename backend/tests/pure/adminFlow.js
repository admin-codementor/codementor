// The Admin end to end: the real routes and service, in-memory storage. People (create, reset, disable, role, department), the safety rules,
// the instant lockout, settings, the AI switch and daily limit, the audit log and its export, login history and the overview.
require('../hermeticEnv');
const jwt = require('jsonwebtoken');
const { loadAppWithMounts } = require('../routeAudit');
const adminService = require('../../src/services/adminService');
const accountGate = require('../../src/middleware/accountGate');

const { users, state, install, reset } = require('../fakes/adminFakeDb');

module.exports = async function (s) {
  reset();
  install();
  accountGate.reset();
  adminService.clearPeople(); adminService.clearSettings();
  const { app } = loadAppWithMounts();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (id) => { const u = users.get(id); return jwt.sign({ id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 }, process.env.JWT_SECRET, { expiresIn: '10m' }); };
  const call = async (method, path, who, body) => {
    const res = await fetch(base + path, { method, signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${token(who)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* a CSV */ }
    return { status: res.status, json, data: json?.data, code: json?.code, text, type: res.headers.get('content-type') || '' };
  };
  const fresh = () => { adminService.clearPeople(); adminService.clearSettings(); };

  try {
    // ── who may enter ──
    s.check('nobody signed in is refused', (await call('GET', '/api/admin/people', null)).status === 401);
    s.check('faculty, HOD, T&P and students cannot open any admin route', (await Promise.all(['f1', 'h1', 'tp1', 's1'].flatMap((u) => ['/api/admin/people', '/api/admin/overview', '/api/admin/settings', '/api/admin/audit', '/api/admin/logins'].map((p) => call('GET', p, u))))).every((r) => r.status === 403));
    s.check('they cannot change anything either', (await Promise.all(['f1', 'h1'].flatMap((u) => [call('POST', '/api/admin/people', u, { name: 'X Y', email: 'x@c.test', role: 'faculty', department: 'CSE' }), call('POST', '/api/admin/people/f1/disabled', u, { disabled: true }), call('PUT', '/api/admin/settings', u, { ai: { enabled: false } })]))).every((r) => r.status === 403));

    // ── people list ──
    const all = await call('GET', '/api/admin/people', 'adm1');
    s.check('the Admin lists everyone, students included', all.status === 200 && all.data.total === 7 && all.data.rows.some((r) => r.role === 'student'));
    s.check('the list shows 2FA, disabled and last sign-in, and never a secret or hash', (() => { const r = all.data.rows.find((x) => x.id === 'tp1'); return r.twofa === false && r.disabled === false && !('totpSecret' in r) && !('password' in r) && !JSON.stringify(all.data).includes('tokenVersion'); })());
    s.check('search, role, department and status narrow it', (await call('GET', '/api/admin/people?q=22cs001', 'adm1')).data.total === 1 && (await call('GET', '/api/admin/people?role=hod', 'adm1')).data.total === 1 && (await call('GET', '/api/admin/people?department=ECE', 'adm1')).data.total === 1 && (await call('GET', '/api/admin/people?status=disabled', 'adm1')).data.total === 0);

    // ── creating an account ──
    const body = { name: 'Meena Rao', email: 'Meena@College.edu', role: 'tnp' };
    state.mailOn = false;
    const noMail = await call('POST', '/api/admin/people', 'adm1', body);
    s.check('without email set up nothing is created, and the message says why', noMail.status === 409 && noMail.code === 'MAIL_NOT_CONFIGURED' && /SMTP/.test(noMail.json.error) && state.created.length === 0);
    state.mailOn = true;
    const made = await call('POST', '/api/admin/people', 'adm1', body);
    s.check('the Admin creates a T&P account; a set-password link is emailed to the person', made.status === 201 && made.data.mail === 'sent' && state.mails.length === 1 && state.mails[0].to === 'meena@college.edu' && /example\.test\/reset/.test(state.mails[0].text));
    s.check('the response never contains a password or the link', !/example\.test|password/i.test(made.text.replace(/set-password/g, '')) && !('link' in made.data));
    s.check('the sign-in was made with a password nobody sees', state.created.length === 1 && state.created[0].password.length >= 24);
    const profile = users.get('uid_meena@college.edu');
    s.check('the profile has the right role, no department, no 2FA yet, and who made it', profile.role === 'tnp' && profile.department === null && profile.totpEnabled === false && profile.createdBy === 'adm1' && profile.email === 'meena@college.edu');
    s.check('creating it is in the audit log, without the link', state.audit.some((a) => a.action === 'admin.account.create' && /meena@college\.edu as tnp/.test(a.detail) && !/example\.test/.test(a.detail)));
    s.check('the same email again is refused', (await call('POST', '/api/admin/people', 'adm1', body)).code === 'EXISTS');
    s.check('a bad request is refused with the reason', (await call('POST', '/api/admin/people', 'adm1', { ...body, email: 'x@y.z', role: 'faculty' })).json.error.includes('department') && (await call('POST', '/api/admin/people', 'adm1', { ...body, email: 'x@y.z', role: 'student' })).status === 400);
    s.check('making an Admin needs the email typed', (await call('POST', '/api/admin/people', 'adm1', { name: 'New Admin', email: 'newadm@c.test', role: 'admin' })).code === 'CONFIRM' && (await call('POST', '/api/admin/people', 'adm1', { name: 'New Admin', email: 'newadm@c.test', role: 'admin', typed: 'newadm@c.test' })).status === 201);
    state.failProfile = true;
    const before = state.created.length;
    const broken = await call('POST', '/api/admin/people', 'adm1', { name: 'Late Joiner', email: 'late@c.test', role: 'faculty', department: 'CSE' });
    state.failProfile = false;
    s.check('if the profile cannot be saved the new sign-in is removed again, nothing is left half made', broken.status === 500 && state.created.length === before + 1 && state.deleted.includes('uid_late@c.test') && !state.authUsers.has('late@c.test'));

    // ── reset link ──
    const mailsBefore = state.mails.length;
    const reset = await call('POST', '/api/admin/people/f1/reset-link', 'adm1');
    s.check('a reset link goes to the account\'s own address and is never returned', reset.status === 200 && state.mails.length === mailsBefore + 1 && state.mails.at(-1).to === 'f1@c.test' && !reset.text.includes('example.test'));
    s.check('a missing account is "not found"', (await call('POST', '/api/admin/people/nobody/reset-link', 'adm1')).status === 404);

    // ── disabling ──
    fresh();
    const noType = await call('POST', '/api/admin/people/f1/disabled', 'adm1', { disabled: true });
    s.check('disabling needs the email typed in full', noType.code === 'CONFIRM' && users.get('f1').disabled !== true);
    s.check('a wrong email is not enough', (await call('POST', '/api/admin/people/f1/disabled', 'adm1', { disabled: true, typed: 'f2@c.test' })).code === 'CONFIRM');
    const tvBefore = users.get('f1').tokenVersion;
    const off = await call('POST', '/api/admin/people/f1/disabled', 'adm1', { disabled: true, typed: 'F1@c.test' });
    s.check('with the email typed the account is disabled and its sessions are ended', off.status === 200 && users.get('f1').disabled === true && users.get('f1').tokenVersion === tvBefore + 1);
    const locked = await call('GET', '/api/faculty/dashboard-layout', 'f1');
    s.check('the disabled person is locked out at once, even with a valid token, with a clear message', locked.status === 403 && locked.code === 'ACCOUNT_DISABLED' && /disabled/.test(locked.json.error));
    s.check('disabling is in the audit log', state.audit.some((a) => a.action === 'admin.account.disable' && a.detail === 'f1@c.test'));
    s.check('a student is not managed here', (await call('POST', '/api/admin/people/s1/disabled', 'adm1', { disabled: true, typed: 's1@c.test' })).code === 'NOT_STAFF');
    fresh();
    const on = await call('POST', '/api/admin/people/f1/disabled', 'adm1', { disabled: false });
    const back = await call('GET', '/api/faculty/dashboard-layout', 'f1');
    s.check('enabling needs no typing and lets the person in again', on.status === 200 && users.get('f1').disabled === false && back.status !== 403);
    s.check('a reset link is refused for a disabled account', (await (async () => { await call('POST', '/api/admin/people/f1/disabled', 'adm1', { disabled: true, typed: 'f1@c.test' }); return call('POST', '/api/admin/people/f1/reset-link', 'adm1'); })()).code === 'DISABLED');
    fresh(); await call('POST', '/api/admin/people/f1/disabled', 'adm1', { disabled: false });

    // ── the safety rules ──
    s.check('an Admin cannot disable themselves', (await call('POST', '/api/admin/people/adm1/disabled', 'adm1', { disabled: true, typed: 'adm1@c.test' })).code === 'SELF');
    s.check('an Admin cannot change their own role', (await call('POST', '/api/admin/people/adm1/role', 'adm1', { role: 'faculty', department: 'CSE', typed: 'adm1@c.test' })).code === 'SELF');
    fresh();
    s.check('another Admin can be disabled while a second one remains', (await call('POST', '/api/admin/people/adm2/disabled', 'adm1', { disabled: true, typed: 'adm2@c.test' })).status === 200);
    fresh();
    s.check('the Admin who is disabled is locked out at once', (await call('GET', '/api/admin/people', 'adm2')).code === 'ACCOUNT_DISABLED');
    // adm1 and the new admin (newadm) are the other Admins: disable the new one, then adm1 is the last active
    fresh();
    await call('POST', '/api/admin/people/uid_newadm@c.test/disabled', 'adm1', { disabled: true, typed: 'newadm@c.test' });
    fresh();
    // Only one active Admin is left (adm1). A request from an Admin who is not in the list (a stale session on another server) must still be refused.
    users.get('uid_newadm@c.test').disabled = true; users.get('adm2').disabled = true; fresh();
    const lastTry = await adminService.setDisabled({ id: 'ghost', role: 'admin' }, 'adm1', true, 'adm1@c.test').then(() => null, (e) => e);
    s.check('the last active Admin cannot be disabled by anyone, even by a stale session of another Admin', lastTry?.code === 'LAST_ADMIN' && users.get('adm1').disabled !== true);
    users.get('adm2').disabled = false; accountGate.reset(); fresh();

    // ── role and department ──
    fresh();
    const role = await call('POST', '/api/admin/people/f1/role', 'adm1', { role: 'hod', department: 'CSE', typed: 'f1@c.test' });
    s.check('a faculty member becomes an HOD with the email typed, and sessions end', role.status === 200 && users.get('f1').role === 'hod' && users.get('f1').department === 'CSE' && users.get('f1').tokenVersion >= 2);
    s.check('a role change needs the typed email', (await call('POST', '/api/admin/people/h1/role', 'adm1', { role: 'faculty', department: 'CSE' })).code === 'CONFIRM');
    s.check('an HOD needs a department; T&P has none', (await call('POST', '/api/admin/people/tp1/role', 'adm1', { role: 'hod', typed: 'tp1@c.test' })).code === 'DEPARTMENT' && (await (async () => { const r = await call('POST', '/api/admin/people/h1/role', 'adm1', { role: 'tnp', typed: 'h1@c.test' }); return r.status === 200 && users.get('h1').department === null; })()));
    s.check('a student cannot be given a staff role', (await call('POST', '/api/admin/people/s1/role', 'adm1', { role: 'faculty', department: 'CSE', typed: 's1@c.test' })).code === 'NOT_STAFF');
    fresh();
    s.check('the department of a faculty member can be changed, and only for faculty and HOD', (await call('POST', '/api/admin/people/f1/department', 'adm1', { department: 'ECE' })).status === 200 && users.get('f1').department === 'ECE' && (await call('POST', '/api/admin/people/tp1/department', 'adm1', { department: 'ECE' })).status === 400);
    s.check('role and department changes are in the audit log', state.audit.some((a) => a.action === 'admin.account.role' && /f1@c\.test: faculty to hod/.test(a.detail)) && state.audit.some((a) => a.action === 'admin.account.department'));

    // ── settings ──
    fresh();
    const st0 = await call('GET', '/api/admin/settings', 'adm1');
    s.check('settings start as the defaults', st0.data.ai.enabled === true && st0.data.departments.length === 0);
    const set1 = await call('PUT', '/api/admin/settings', 'adm1', { departments: ['CSE', 'ECE'], sections: ['A', 'B'] });
    s.check('the Admin saves the department and section lists', set1.status === 200 && set1.data.departments.join() === 'CSE,ECE' && (await call('GET', '/api/admin/settings', 'adm1')).data.sections.join() === 'A,B');
    s.check('the change is logged old to new', state.audit.some((a) => a.action === 'admin.settings.change' && /departments: 0 → 2/.test(a.detail)));
    s.check('a department twice is refused by name', /twice/.test((await call('PUT', '/api/admin/settings', 'adm1', { departments: ['CSE', 'cse'] })).json.error));
    const auditsBefore = state.audit.length;
    await call('PUT', '/api/admin/settings', 'adm1', { departments: ['CSE', 'ECE'] });
    s.check('saving what is already saved writes no audit entry', state.audit.length === auditsBefore);
    s.check('with a department list, an account for another department is refused', (await call('POST', '/api/admin/people', 'adm1', { name: 'Late Two', email: 'late2@c.test', role: 'faculty', department: 'Mech' })).json.error.includes('Settings'));

    // ── AI switch and limit ──
    // The gate is run on its own for the "allowed" cases (the AI feature behind it would need the real database); the refusals come back over HTTP.
    const aiAccess = require('../../src/middleware/aiAccess');
    const gate = async (id) => {
      const out = { next: false, status: null, body: null };
      const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
      await aiAccess({ user: { id, role: users.get(id).role } }, res, () => { out.next = true; });
      return out;
    };
    s.check('with AI on and no limit a student is let through', (await gate('s1')).next === true);
    await call('PUT', '/api/admin/settings', 'adm1', { ai: { dailyLimit: 2 } });
    const g1 = await gate('s1'); const g2 = await gate('s1'); const g3 = await gate('s1');
    s.check('with a limit of 2 the third AI question of the day is refused and says it returns tomorrow', g1.next && g2.next && !g3.next && g3.status === 429 && g3.body.code === 'AI_DAILY_LIMIT' && /tomorrow/.test(g3.body.error));
    s.check('over the limit it is refused over HTTP too, before any AI work is done', (await call('POST', '/api/ai/tutor', 's1', {})).status === 429);
    s.check('another student has their own count, and an Admin is not limited', (await gate('s2')).next === true && (await gate('adm1')).next === true && (await gate('adm1')).next === true && (await gate('adm1')).next === true);
    await call('PUT', '/api/admin/settings', 'adm1', { ai: { enabled: false } });
    const off1 = await call('POST', '/api/ai/tutor', 's2', {});
    const offCareer = await call('POST', '/api/career/interview/next', 's1', {});
    s.check('with AI switched off the tutor says so in plain words', off1.status === 503 && off1.code === 'AI_OFF' && /switched off/.test(off1.json.error), JSON.stringify(off1.json));
    s.check('and so does the mock interview', offCareer.code === 'AI_OFF', JSON.stringify(offCareer.json));
    // The HOD department summary does not refuse when AI is off: the soft gate records why and the summary is written by rules.
    const soft = { user: { id: 'f1', role: 'hod' } };
    let softNext = false;
    await require('../../src/middleware/aiAccess').soft(soft, {}, () => { softNext = true; });
    s.check('the soft gate never refuses: it records why AI is off and lets the request on', softNext === true && soft.aiRefusal?.code === 'AI_OFF' && /switched off/.test(soft.aiRefusal.error));
    await call('PUT', '/api/admin/settings', 'adm1', { ai: { enabled: true, dailyLimit: null } });
    s.check('switched back on, the student is let through again', (await gate('s1')).next === true);

    // ── audit log ──
    const log = await call('GET', '/api/admin/audit', 'adm1');
    s.check('the audit log lists the newest first, with who did it', log.status === 200 && log.data.rows.length > 5 && log.data.rows[0].at_ms >= log.data.rows[1].at_ms && log.data.rows.some((r) => r.user_name === 'Admin One'));
    s.check('it filters by action, person and text', (await call('GET', '/api/admin/audit?action=admin.account.disable', 'adm1')).data.rows.every((r) => r.action.startsWith('admin.account.disable')) && (await call('GET', '/api/admin/audit?q=admin%20one', 'adm1')).data.rows.length > 0 && (await call('GET', '/api/admin/audit?user_id=nobody', 'adm1')).data.rows.length === 0);
    s.check('with no filter it stops after one page; it says when the whole log was read', log.data.looked_at <= 500 && typeof log.data.whole_log === 'boolean');
    const exp = await call('GET', '/api/admin/audit/export?action=admin.', 'adm1');
    const lines = exp.text.replace(/^﻿/, '').trim().split('\r\n');
    s.check('the export is a CSV with a header and one line per entry, and is itself logged', exp.status === 200 && /text\/csv/.test(exp.type) && lines[0] === 'When,Who,Email,Action,Detail,Address' && lines.length > 3 && state.audit.some((a) => a.action === 'admin.audit.export'));
    state.audit.push({ id: 'evil', action: 'x.test', userId: 'adm1', detail: '=HYPERLINK("http://x")', createdAt: Date.now() + 99999 });
    s.check('a detail that starts like a formula is defused in the export', (await call('GET', '/api/admin/audit/export?action=x.test', 'adm1')).text.includes("\"'=HYPERLINK"));

    // ── retention ──
    const old = Date.now() - 400 * 86400000;
    state.audit.push({ id: 'o1', action: 'old.one', userId: 'adm1', createdAt: old }, { id: 'o2', action: 'old.two', userId: 'adm1', createdAt: old - 1000 });
    state.logins.push({ userId: 'f1', kind: 'login', atMs: old });
    state.prune = {};
    const removed = await (async () => { await adminService.maybePrune(); return state.prune; })();
    s.check('entries older than a year are removed, newer ones stay, and it runs at most once a day', !state.audit.some((a) => a.id === 'o1' || a.id === 'o2') && state.audit.length > 5 && !state.logins.some((l) => l.atMs === old) && removed.lastRemoved === 3);
    const once = state.prune.lastPruneMs; await adminService.maybePrune();
    s.check('a second run the same day does nothing', state.prune.lastPruneMs === once);

    // ── login history and overview ──
    state.logins.push({ userId: 'f1', role: 'faculty', kind: 'login', atMs: Date.now() - 1000, ip: '10.0.0.5', agent: 'Chrome' }, { userId: 'tp1', role: 'tnp', kind: 'twofa_failed', atMs: Date.now() - 500, ip: '10.0.0.9' }, { userId: 'f1', role: 'faculty', kind: 'blocked_disabled', atMs: Date.now() - 200 });
    const person = await call('GET', '/api/admin/people/f1', 'adm1');
    s.check('a person\'s page shows their recent sign-ins, newest first', person.status === 200 && person.data.logins.length === 2 && person.data.logins[0].kind === 'blocked_disabled' && person.data.logins[1].ip === '10.0.0.5');
    const failed = await call('GET', '/api/admin/logins?failed=1', 'adm1');
    s.check('the failed sign-ins list shows wrong two-factor codes and blocked accounts, with names', failed.data.length === 2 && failed.data.every((e) => e.kind !== 'login') && failed.data.some((e) => e.user_name === 'T&P One'));
    fresh();
    const ov = await call('GET', '/api/admin/overview', 'adm1');
    s.check('the overview counts students and staff, and who signed in recently', ov.status === 200 && ov.data.students.total === 2 && ov.data.students.active_7d === 1 && ov.data.staff.by_role.find((r) => r.role === 'admin').count >= 2);
    s.check('the overview names the T&P and Admin accounts that have no two-factor yet', ov.data.staff.without_two_factor.some((p) => p.id === 'tp1') && !ov.data.staff.without_two_factor.some((p) => p.id === 'adm1'));
    s.check('the overview shows the last day\'s security events and whether mail and AI are on', ov.data.security.failed_two_factor_24h === 1 && ov.data.security.blocked_24h === 1 && ov.data.system.mail_configured === true && ov.data.system.ai_enabled === true && ov.data.system.ai_uses_today >= 3);
  } finally {
    server.close();
  }
};
