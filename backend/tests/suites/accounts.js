// First-login password change: the pure password rules, the token gate that refuses every
// route but set-password while a password change is pending, and (only with
// SMOKE_ACCOUNTS_LIVE=1) the real flow against a throwaway Firebase user and profile.
//
// The default run touches NO database: the gate answers from the token alone, so it
// is safe to run when the Firestore quota is low.
const jwt = require('jsonwebtoken');
const { tokenFor, userId, get, post, Suite, db } = require('../harness');
const { gateClaim, blockedByGate, validateNewPassword, ALLOWED_WHILE_PENDING } = require('../../src/utils/passwordGate');

function pure(s) {
  s.check('claim: only an account flagged mustChangePassword gets mcp', gateClaim({ mustChangePassword: true }).mcp === true && !('mcp' in gateClaim({ mustChangePassword: false })) && !('mcp' in gateClaim({})) && !('mcp' in gateClaim(null)));
  s.check('gate: a flagged token is blocked everywhere but set-password', blockedByGate({ mcp: true }, '/api/student/dashboard') && blockedByGate({ mcp: true }, '/api/faculty/department') && blockedByGate({ mcp: true }, '/api/auth/refresh-ish'));
  s.check('gate: the set-password path is allowed, with or without a query string', !blockedByGate({ mcp: true }, '/api/auth/set-password') && !blockedByGate({ mcp: true }, '/api/auth/set-password?x=1'));
  s.check('gate: a similar path is not allowed', blockedByGate({ mcp: true }, '/api/auth/set-password/extra') && blockedByGate({ mcp: true }, '/api/auth/set-passwords'));
  s.check('gate: an unflagged token is never blocked', !blockedByGate({}, '/api/student/dashboard') && !blockedByGate({ mcp: false }, '/api/student/dashboard') && !blockedByGate(null, '/x'));
  s.check('gate: only one path is allowed', ALLOWED_WHILE_PENDING.length === 1);

  const who = { email: '25ve1a6601@sreyas.ac.in', rollNo: '25VE1A6601' };
  const bad = (pw) => !!validateNewPassword(pw, who).error;
  s.check('password: too short, too long and non-strings are refused', bad('Ab1') && bad('a1'.repeat(70)) && bad(undefined) && bad(12345678) && bad(null));
  s.check('password: needs both letters and numbers', bad('onlyletters') && bad('12345678'));
  s.check('password: repetitive and common choices are refused', bad('aaaaaaaa') && bad('Password') && bad('qwerty123') && bad('12345678'));
  s.check('password: containing the roll number or the email name is refused', bad('x25ve1a6601y9') && bad('My25VE1A6601pw') && bad('25ve1a6601!A'));
  s.check('password: a reasonable password passes', !validateNewPassword('River-Stone-42', who).error && !validateNewPassword('tr0ub4dor&3', who).error);
  s.check('password: exactly the minimum length passes', !validateNewPassword('abcdef12', who).error && bad('abcde12'));
  s.check('password: works without a roll number or email on file', !validateNewPassword('River-Stone-42').error);
}

module.exports = async function accountsSuite() {
  const s = new Suite('Accounts & first-login password change');
  pure(s);

  // ── The gate over HTTP: answered from the token, no database read ───────────
  const flagged = tokenFor('acct-flagged', 'student', { mcp: true });
  const plain = tokenFor('acct-plain', 'student');
  for (const p of ['/api/student/dashboard', '/api/classrooms', '/api/courses', '/api/messages/threads']) {
    const r = await get(p, flagged);
    s.check(`gate: a flagged student is refused at ${p}`, r.status === 403 && r.body?.code === 'PASSWORD_CHANGE_REQUIRED', `status ${r.status} ${JSON.stringify(r.body)}`);
  }
  s.check('gate: a flagged staff token is refused too', (await get('/api/faculty/dashboard', tokenFor('acct-flagged-fac', 'faculty', { mcp: true }))).body?.code === 'PASSWORD_CHANGE_REQUIRED');
  s.check('gate: the response tells the client what to do', (await get('/api/student/dashboard', flagged)).body?.error?.includes('new password'));
  s.check('set-password: no token → 401', (await post('/api/auth/set-password', null, { new_password: 'River-Stone-42' })).status === 401);
  s.check('set-password: an account that is not waiting for it is refused', (await post('/api/auth/set-password', plain, { new_password: 'River-Stone-42' })).status === 400);

  if (process.env.SMOKE_ACCOUNTS_LIVE !== '1') {
    s.skip('set-password: the live flow (Firebase user + profile)', 'set SMOKE_ACCOUNTS_LIVE=1 to run; it writes a throwaway user and uses a little Firestore quota');
    return s;
  }

  // ── Live flow: a throwaway Firebase user and profile ───────────────────────
  const { firebaseAuth } = require('../../src/config/firebaseAdmin');
  const id = userId(`acct-${Date.now().toString(36)}`);
  const email = `${id}@codementor.test`;
  const created = await firebaseAuth.createUser({ email, password: 'Temp-Pass-1x', displayName: 'Smoke Account' });
  s.onCleanup(async () => {
    await firebaseAuth.deleteUser(created.uid).catch(() => {});
    await db().collection('students').doc(id).delete().catch(() => {});
  }, 'throwaway account');
  await db().collection('students').doc(id).set({
    name: 'Smoke Account', email, role: 'student', department: 'SMOKEACCT', rollNo: '99ZZ9Z9999', firebaseUid: created.uid,
    mustChangePassword: true, isSmokeTest: true,
  });
  const tok = jwt.sign({ id, role: 'student', permissions: {}, department: 'SMOKEACCT', mcp: true }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const path = '/api/auth/set-password';

  s.check('live: a weak password is refused and nothing changes', (await post(path, tok, { new_password: 'short1' })).status === 400);
  s.check('live: a password containing the roll number is refused', (await post(path, tok, { new_password: 'my99zz9z9999pw' })).status === 400);
  const still = await db().collection('students').doc(id).get();
  s.check('live: still flagged after the refusals', still.data().mustChangePassword === true);

  if (process.env.FIREBASE_WEB_API_KEY) {
    s.check('live: reusing the temporary password is refused', (await post(path, tok, { new_password: 'Temp-Pass-1x' })).status === 400);
  } else {
    s.skip('live: reusing the temporary password is refused', 'FIREBASE_WEB_API_KEY is not set for the backend');
  }
  const ok = await post(path, tok, { new_password: 'Fresh-Start-77' });
  s.check('live: a good password is accepted', ok.status === 200 && ok.body?.success === true, `status ${ok.status} ${JSON.stringify(ok.body).slice(0, 120)}`);
  const claims = jwt.decode(ok.body?.accessToken || '') || {};
  s.check('live: the new token carries no mcp claim and the response says so', !('mcp' in claims) && ok.body?.user?.must_change_password === false);
  const after = await db().collection('students').doc(id).get();
  s.check('live: the flag is cleared and the time recorded', after.data().mustChangePassword === false && !!after.data().passwordChangedAt);
  s.check('live: the new token reaches an ordinary route', (await get('/api/classrooms', ok.body?.accessToken)).status !== 403);
  s.check('live: the old pending token is refused a second time', (await post(path, tok, { new_password: 'Another-One-88' })).status === 400);

  // Refresh keeps the claim while the flag is set, drops it after.
  const refresh = (uid) => post('/api/auth/refresh', null, { refreshToken: jwt.sign({ id: uid, role: 'student' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '10m' }) });
  await db().collection('students').doc(id).set({ mustChangePassword: true }, { merge: true });
  s.check('live: refresh keeps the claim while a change is pending', jwt.decode((await refresh(id)).body?.accessToken || '')?.mcp === true);
  await db().collection('students').doc(id).set({ mustChangePassword: false }, { merge: true });
  s.check('live: refresh drops the claim once the password is changed', !('mcp' in (jwt.decode((await refresh(id)).body?.accessToken || '') || {})));

  return s;
};
