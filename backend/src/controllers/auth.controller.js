const db = require('../config/db');
const jwt = require('jsonwebtoken');

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await db.query('SELECT id, role, department FROM users WHERE id = $1', [decoded.id]);
    if (user.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    // Re-resolve permissions so the refreshed token is consistent with login
    const { resolvePermissions } = require('../middleware/permissions');
    const permissions = resolvePermissions(user.rows[0]);
    const newAccessToken = jwt.sign(
      { id: user.rows[0].id, role: user.rows[0].role, permissions, department: user.rows[0].department ?? null },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ success: true, accessToken: newAccessToken });

  } catch (error) {
    console.error(error);
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
};
