// Two-factor sign-in that cannot be skipped, for roles that handle everyone's personal records. Pure: no I/O.
//
// Like the first-login password gate (passwordGate.js): while the account has no second factor set up, its token carries `t2: true`
// and the auth middleware refuses every route except the ones needed to set one up. The claim rides in the token, so there is no extra
// database read per request. Setting it up returns fresh tokens without the claim.

// Roles that must have 2FA before they can use anything. Admin is left out on purpose: that account must stay reachable if a phone is
// lost; it is covered by the Admin settings work (S6).
const ROLES_REQUIRING_2FA = ['tnp'];

// The only API paths a flagged session may call.
const ALLOWED_WHILE_PENDING = ['/api/2fa/setup', '/api/2fa/enable', '/api/auth/set-password', '/api/auth/refresh'];

const requiresTwofa = (role) => ROLES_REQUIRING_2FA.includes(role);

/** Claim to merge into the token payload for this user. */
const twofaClaim = (user) => (requiresTwofa(user?.role) && user?.totpEnabled !== true ? { t2: true } : {});

/** Should this request be refused because the session still has to set up its second factor? */
const blockedByTwofaGate = (decoded, url) => decoded?.t2 === true && !ALLOWED_WHILE_PENDING.includes(String(url || '').split('?')[0]);

/** A role that requires 2FA may not turn it off, or start a new setup that would switch it off while it is on. */
const mayChangeTwofa = (role, totpEnabled) => !(requiresTwofa(role) && totpEnabled === true);

module.exports = { ROLES_REQUIRING_2FA, ALLOWED_WHILE_PENDING, requiresTwofa, twofaClaim, blockedByTwofaGate, mayChangeTwofa };
