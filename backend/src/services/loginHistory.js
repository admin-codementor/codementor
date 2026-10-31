// Who signed in, when and from where. Written without ever slowing or failing a sign-in: a failure here is only logged.
const adminRepo = require('../repositories/adminRepository');

const cut = (v, n) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);

/** kind: 'login' | 'twofa_failed' | 'blocked_disabled' */
function record(req, user, kind) {
  adminRepo.recordLogin({
    userId: user.id, role: user.role, kind, atMs: Date.now(),
    ip: cut(req.ip || req.socket?.remoteAddress, 64), agent: cut(req.headers?.['user-agent'], 140),
  }).catch((e) => console.error('login history failed:', String(e?.message || e).slice(0, 100)));
}

module.exports = { record };
