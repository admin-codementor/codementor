const jwt = require('jsonwebtoken');
const { blockedByGate } = require('../utils/passwordGate');
const { blockedByTwofaGate } = require('../utils/twofaGate');

exports.protect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized to access this route' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, permissions }
    // A first-login account must set its own password before it can use anything else.
    if (blockedByGate(decoded, req.originalUrl)) {
      return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Please set a new password before continuing.' });
    }
    // A role that must use two-factor sign-in cannot use anything but the 2FA setup until it has done so.
    if (blockedByTwofaGate(decoded, req.originalUrl)) {
      return res.status(403).json({ success: false, code: 'TWOFA_REQUIRED', error: 'Set up two-factor sign-in before continuing.' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
  }
};
