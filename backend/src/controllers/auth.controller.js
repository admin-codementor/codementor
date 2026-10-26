const jwt = require('jsonwebtoken');
const userRepo = require('../repositories/userRepository');
const { refreshStatus, signAccess } = require('../utils/tokens');

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await userRepo.getById(decoded.id, decoded.role);
    if (!user) {
      return res.status(401).json({ success: false, code: 'SESSION_ENDED', error: 'User no longer exists' });
    }

    // A refresh token is only good while the account's tokenVersion still matches (utils/tokens.js): a permission change, a
    // password change or a deactivation ends the old session here, not after 7 days.
    const status = refreshStatus(decoded, user);
    if (!status.ok) {
      return res.status(401).json({ success: false, code: 'SESSION_ENDED', error: 'Your session has ended. Please sign in again.' });
    }
    // Permissions are re-resolved from the stored account so the new token matches what the account may do now.
    const newAccessToken = signAccess(user);

    res.json({ success: true, accessToken: newAccessToken });

  } catch (error) {
    console.error(error);
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};
