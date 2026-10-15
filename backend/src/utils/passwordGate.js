// Forced password change at first login. Pure: no I/O, so every rule is checkable.
//
// Accounts created from the college roster start with a temporary password and
// `mustChangePassword: true` on the profile. While that flag is set the app token
// carries `mcp: true`, and the auth middleware refuses every route except the one
// that sets a new password. The claim rides in the token, so there is no extra
// database read per request.

// The only API path a flagged session may call.
const ALLOWED_WHILE_PENDING = ['/api/auth/set-password'];

/** Claim to merge into the token payload for this user. */
const gateClaim = (user) => (user?.mustChangePassword === true ? { mcp: true } : {});

/** Should this request be refused because the session must change its password first? */
const blockedByGate = (decoded, url) => decoded?.mcp === true && !ALLOWED_WHILE_PENDING.includes(String(url || '').split('?')[0]);

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
const COMMON = ['password', 'passw0rd', 'qwertyui', 'qwerty123', 'iloveyou', 'sreyas123', 'welcome1', 'abcd1234', '12345678', '123456789'];

/**
 * @param {unknown} password
 * @param {{email?: string, rollNo?: string}} who
 * @returns {{error: string} | {ok: true}}
 */
function validateNewPassword(password, { email = '', rollNo = '' } = {}) {
  if (typeof password !== 'string') return { error: 'Choose a new password.' };
  if (password.length < MIN_LENGTH) return { error: `Use at least ${MIN_LENGTH} characters.` };
  if (password.length > MAX_LENGTH) return { error: `Use at most ${MAX_LENGTH} characters.` };
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return { error: 'Use both letters and numbers.' };
  if (/^(.)\1+$/.test(password)) return { error: 'Choose something less repetitive.' };
  const lower = password.toLowerCase();
  if (COMMON.includes(lower)) return { error: 'That password is too common. Choose another.' };
  const local = String(email).split('@')[0].toLowerCase();
  const roll = String(rollNo).toLowerCase();
  if ((roll && lower.includes(roll)) || (local && local.length >= 4 && lower.includes(local))) {
    return { error: 'Your password cannot contain your roll number or email.' };
  }
  return { ok: true };
}

module.exports = { ALLOWED_WHILE_PENDING, gateClaim, blockedByGate, validateNewPassword, MIN_LENGTH, MAX_LENGTH };
