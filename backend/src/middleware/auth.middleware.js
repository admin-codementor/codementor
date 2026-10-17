const jwt = require('jsonwebtoken');
const { blockedByGate } = require('../utils/passwordGate');

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
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Not authorized, token failed' });
  }
};
