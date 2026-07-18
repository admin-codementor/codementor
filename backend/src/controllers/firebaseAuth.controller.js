const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { firebaseAuth } = require('../config/firebaseAdmin');

const { resolvePermissions } = require('../middleware/permissions');

// Mirror auth.controller.generateTokens exactly: payload { id, role, permissions, department }.
const generateTokens = (user) => {
  const permissions = resolvePermissions(user);
  const payload = { id: user.id, role: user.role, permissions, department: user.department ?? null };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: '1h' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// POST /api/auth/firebase  (public)  body { id_token, name?, role?, department?, section?, year?, roll_no? }
// Verifies a Firebase ID token (issued by the frontend's Firebase SDK after
// email/password or Google sign-in), then upserts the local `users` row by
// firebase_uid — linking by email on first sign-in — and issues the app's
// normal access/refresh tokens so every existing `protect`-gated route keeps
// working unchanged.
exports.firebaseLogin = async (req, res) => {
  try {
    const { id_token, name, role, department, section, year, roll_no } = req.body;

    if (!id_token || typeof id_token !== 'string') {
      return res.status(400).json({ success: false, error: 'id_token is required' });
    }

    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(id_token);
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid Firebase token' });
    }

    const { uid, email } = decoded;
    if (!email) {
      return res.status(401).json({ success: false, error: 'Firebase account has no email' });
    }

    const cols = 'id, name, email, role, department, permissions, totp_secret, totp_enabled';

    let user;
    const byUid = await db.query(`SELECT ${cols} FROM users WHERE firebase_uid = $1`, [uid]);

    if (byUid.rows.length > 0) {
      user = byUid.rows[0];
    } else {
      const byEmail = await db.query(`SELECT ${cols} FROM users WHERE email = $1`, [email]);

      if (byEmail.rows.length > 0) {
        user = byEmail.rows[0];
        await db.query('UPDATE users SET firebase_uid = $1 WHERE id = $2', [uid, user.id]);
      } else {
        const displayName = (typeof name === 'string' && name.trim()) || decoded.name || email.split('@')[0];

        const dept = typeof department === 'string' && department.trim() ? department.trim() : null;
        const sec  = typeof section === 'string' && section.trim() ? section.trim().toUpperCase() : null;
        const yrNum = parseInt(year, 10);
        const yr   = yrNum >= 1 && yrNum <= 6 ? yrNum : null;
        const roll = typeof roll_no === 'string' && roll_no.trim() ? roll_no.trim() : null;

        const inserted = await db.query(
          `INSERT INTO users (name, email, role, department, section, year, roll_no, firebase_uid)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${cols}`,
          [displayName, email, role === 'faculty' ? 'faculty' : 'student', dept, sec, yr, roll, uid]
        );
        user = inserted.rows[0];
      }
    }

    // Same fail2ban-adjacent lockout the password flow uses isn't applicable
    // here (Firebase already verified identity) — just reset it on sign-in.
    await db.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // 2FA: if enabled, do NOT issue tokens yet — require the TOTP step (same as password login).
    if (user.totp_enabled) {
      return res.json({ success: true, twofa_required: true, user_id: user.id });
    }

    const tokens = generateTokens(user);

    return res.json({
      success: true,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        permissions: resolvePermissions(user),
      },
      ...tokens,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};
