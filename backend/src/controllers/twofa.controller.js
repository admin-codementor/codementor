const db = require('../config/db');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const { resolvePermissions } = require('../middleware/permissions');

// Mirror auth.controller.generateTokens exactly: payload { id, role, permissions, department }.
const generateTokens = (user) => {
  const permissions = resolvePermissions(user);
  const payload = { id: user.id, role: user.role, permissions, department: user.department ?? null };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const ISSUER = 'CodeMentor';

// POST /api/2fa/setup  (protect)
// Generate a fresh TOTP secret, persist the base32 (totp_enabled stays false
// until the user verifies a code via /enable). Returns the otpauth_url and a
// scannable QR data URL.
exports.setup2FA = async (req, res) => {
  try {
    const userResult = await db.query('SELECT id, email FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const user = userResult.rows[0];

    const secret = speakeasy.generateSecret({
      name: `${ISSUER} (${user.email})`,
      issuer: ISSUER,
      length: 20,
    });

    // Store the base32 secret. Keep totp_enabled false until verified.
    await db.query(
      'UPDATE users SET totp_secret = $1, totp_enabled = FALSE WHERE id = $2',
      [secret.base32, user.id]
    );

    const otpauth_url = secret.otpauth_url;
    const qr_data_url = await qrcode.toDataURL(otpauth_url);

    return res.json({
      success: true,
      data: {
        otpauth_url,
        qr_data_url,
        secret: secret.base32,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// POST /api/2fa/enable  (protect)  body { token }
// Verify the provided TOTP against the stored secret; on success flip
// totp_enabled to true.
exports.enable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Verification code is required' });
    }

    const result = await db.query('SELECT id, totp_secret FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || !result.rows[0].totp_secret) {
      return res.status(400).json({ success: false, error: 'Run 2FA setup before enabling' });
    }

    const verified = speakeasy.totp.verify({
      secret: result.rows[0].totp_secret,
      encoding: 'base32',
      token: token.replace(/\s+/g, ''),
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    await db.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.user.id]);

    return res.json({ success: true, data: { totp_enabled: true } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// POST /api/2fa/disable  (protect)  body { token }
// Verify a current TOTP, then wipe the secret and disable 2FA.
exports.disable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Verification code is required' });
    }

    const result = await db.query('SELECT id, totp_secret, totp_enabled FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || !result.rows[0].totp_secret || !result.rows[0].totp_enabled) {
      return res.status(400).json({ success: false, error: '2FA is not enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: result.rows[0].totp_secret,
      encoding: 'base32',
      token: token.replace(/\s+/g, ''),
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ success: false, error: 'Invalid verification code' });
    }

    await db.query(
      'UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1',
      [req.user.id]
    );

    return res.json({ success: true, data: { totp_enabled: false } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// POST /api/2fa/verify  (public — login step 2)  body { user_id, token }
// Verify the TOTP for a user who already passed the password step, then issue
// the regular auth tokens (mirrors the normal login response shape).
exports.verify2FA = async (req, res) => {
  try {
    const { user_id, token } = req.body;
    if (!user_id || !token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'user_id and token are required' });
    }

    const result = await db.query(
      'SELECT id, name, email, role, department, permissions, totp_secret, totp_enabled FROM users WHERE id = $1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid verification code' });
    }

    const user = result.rows[0];

    if (!user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ success: false, error: '2FA is not enabled for this account' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: token.replace(/\s+/g, ''),
      window: 1,
    });

    if (!verified) {
      return res.status(401).json({ success: false, error: 'Invalid verification code' });
    }

    const tokens = generateTokens(user);

    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        permissions: resolvePermissions(user),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};
