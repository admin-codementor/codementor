const jwt = require('jsonwebtoken');
const userRepo = require('../repositories/userRepository');

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await userRepo.getById(decoded.id, decoded.role);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    // Re-resolve permissions so the refreshed token is consistent with login
    const { resolvePermissions } = require('../middleware/permissions');
    const permissions = resolvePermissions(user);
    const newAccessToken = jwt.sign(
      { id: user.id, role: user.role, permissions, department: user.department ?? null },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ success: true, accessToken: newAccessToken });

  } catch (error) {
    console.error(error);
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};
