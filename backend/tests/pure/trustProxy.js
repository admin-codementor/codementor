// TRUST_PROXY parsing: a wrong value would let clients forge their IP, so it is strict.
const { parseTrustProxy } = require('../../src/utils/trustProxy');

module.exports = function (s) {
  s.check('unset or blank means one hop (today\'s Render/Vercel setup)', parseTrustProxy(undefined) === 1 && parseTrustProxy('') === 1 && parseTrustProxy('  ') === 1);
  s.check('a number of hops is read as a number', parseTrustProxy('3') === 3 && parseTrustProxy(' 2 ') === 2 && parseTrustProxy('0') === 0);
  s.check('"true" and "false" are refused, because true trusts every hop', (() => { try { parseTrustProxy('true'); return false; } catch { return true; } })() && (() => { try { parseTrustProxy('FALSE'); return false; } catch { return true; } })());
  s.check('an address list is passed through', parseTrustProxy('loopback, 10.0.0.0/8') === 'loopback, 10.0.0.0/8');
};
