// Session tokens, in one place. Three controllers used to build their own with slightly different lifetimes.
//
//   access token  30 minutes, carries id, role, permissions, department and the user's tokenVersion `tv`
//   refresh token 7 days, same claims
//
// tokenVersion is how a session is ended on purpose: when an Admin changes someone's permissions, or a password is set or reset, the
// user's tokenVersion is raised. The refresh endpoint refuses a refresh token whose `tv` no longer matches, so a stolen or outdated
// session stops working at its next refresh, within the access token's lifetime, instead of living for the full 7 days.
// Tokens issued before this existed have no `tv` and count as version 0, so nobody is signed out when it ships.
const jwt = require('jsonwebtoken');
const { resolvePermissions } = require('../middleware/permissions');
const { gateClaim } = require('./passwordGate');
const { twofaClaim } = require('./twofaGate');

const ACCESS_TTL = '30m';
const REFRESH_TTL = '7d';

const versionOf = (x) => Number.isInteger(x) && x >= 0 ? x : 0;

/** The claims every token carries. */
const claimsFor = (user) => ({
  id: user.id, role: user.role, permissions: resolvePermissions(user), department: user.department ?? null,
  tv: versionOf(user.tokenVersion), ...gateClaim(user), ...twofaClaim(user),
});

const signAccess = (user) => jwt.sign(claimsFor(user), process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

const generateTokens = (user) => {
  const claims = claimsFor(user);
  return {
    accessToken: jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL }),
    refreshToken: jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL }),
  };
};

/**
 * May this refresh token still be exchanged for a new access token?
 * @param {{tv?: number}} decoded  the verified refresh token
 * @param {object|null} user       the account as stored now
 * @returns {{ok: true} | {ok: false, reason: 'gone'|'ended'|'disabled'}}
 */
function refreshStatus(decoded, user) {
  if (!user) return { ok: false, reason: 'gone' };
  if (user.disabled === true) return { ok: false, reason: 'disabled' };
  if (versionOf(decoded?.tv) !== versionOf(user.tokenVersion)) return { ok: false, reason: 'ended' };
  return { ok: true };
}

module.exports = { ACCESS_TTL, REFRESH_TTL, claimsFor, signAccess, generateTokens, refreshStatus };
