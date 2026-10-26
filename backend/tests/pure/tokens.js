// Session tokens: lifetime, the tokenVersion that ends old sessions, and who may refresh.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
const jwt = require('jsonwebtoken');
const { generateTokens, signAccess, refreshStatus, claimsFor, ACCESS_TTL } = require('../../src/utils/tokens');

module.exports = function (s) {
  const user = { id: 'u1', role: 'faculty', department: 'CSE', permissions: {}, tokenVersion: 2 };
  const t = generateTokens(user);
  const acc = jwt.verify(t.accessToken, process.env.JWT_SECRET);
  const ref = jwt.verify(t.refreshToken, process.env.JWT_REFRESH_SECRET);

  s.check('both tokens carry the account\'s tokenVersion', acc.tv === 2 && ref.tv === 2);
  s.check('the access token lasts 30 minutes and the refresh token 7 days', ACCESS_TTL === '30m' && acc.exp - acc.iat === 1800 && ref.exp - ref.iat === 7 * 86400);
  s.check('claims name the user, role, department and permissions', acc.id === 'u1' && acc.role === 'faculty' && acc.department === 'CSE' && typeof acc.permissions === 'object');
  s.check('an account with no tokenVersion is version 0 (nobody is signed out when this ships)', claimsFor({ id: 'x', role: 'student' }).tv === 0);
  s.check('a first-login account still carries the password-change flag', claimsFor({ id: 'x', role: 'student', mustChangePassword: true }).mcp === true);
  s.check('signAccess is signed with the access secret', jwt.verify(signAccess(user), process.env.JWT_SECRET).tv === 2);

  s.check('a refresh with a matching version is accepted', refreshStatus({ tv: 2 }, user).ok === true);
  s.check('a refresh from before a permission or password change is refused', refreshStatus({ tv: 1 }, user).ok === false && refreshStatus({ tv: 1 }, user).reason === 'ended');
  s.check('an old token with no tv works until the first bump, then stops', refreshStatus({}, { tokenVersion: 0 }).ok === true && refreshStatus({}, { tokenVersion: 1 }).ok === false);
  s.check('a deleted or disabled account cannot refresh', refreshStatus({ tv: 0 }, null).reason === 'gone' && refreshStatus({ tv: 0 }, { tokenVersion: 0, disabled: true }).reason === 'disabled');
  s.check('a garbage tokenVersion is read as 0, not as a match for a real one', refreshStatus({ tv: 'abc' }, { tokenVersion: 3 }).ok === false && refreshStatus({ tv: -4 }, { tokenVersion: 0 }).ok === true);
};
