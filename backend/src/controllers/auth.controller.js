const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { resolvePermissions } = require('../middleware/permissions');

const generateTokens = (user) => {
  const permissions = resolvePermissions(user);
  const payload = { id: user.id, role: user.role, permissions, department: user.department ?? null };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: '1h' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, role, department, section, year, roll_no } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide name, email, and password' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Email is already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Normalize academic metadata (optional)
    const dept = typeof department === 'string' && department.trim() ? department.trim() : null;
    const sec  = typeof section === 'string' && section.trim() ? section.trim().toUpperCase() : null;
    const yr   = Number.isInteger(year) && year >= 1 && year <= 6 ? year : (parseInt(year, 10) >= 1 && parseInt(year, 10) <= 6 ? parseInt(year, 10) : null);
    const roll = typeof roll_no === 'string' && roll_no.trim() ? roll_no.trim() : null;

    // Insert user
    const newUser = await db.query(
      `INSERT INTO users (name, email, password_hash, role, department, section, year, roll_no)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, email, role, department`,
      [name, email, passwordHash, role || 'student', dept, sec, yr, roll]
    );

    const user = newUser.rows[0];
    const tokens = generateTokens(user);

    res.status(201).json({ success: true, user, ...tokens });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email and password' });
    }

    const result = await db.query('SELECT id, name, email, password_hash, role, department, permissions, failed_login_attempts, locked_until, totp_enabled FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Fail2ban: Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(403).json({ 
        success: false, 
        error: `Account locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.` 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      // Increment failed attempts
      let attempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      if (attempts >= 5) {
        // Lock for 15 minutes
        lockedUntil = new Date(Date.now() + 15 * 60000);
      }

      await db.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [attempts, lockedUntil, user.id]
      );

      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Successful login: reset lockout state + record last login (for at-risk tracking)
    await db.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    // 2FA: if enabled, do NOT issue tokens yet — require the TOTP step.
    if (user.totp_enabled) {
      return res.json({ success: true, twofa_required: true, user_id: user.id });
    }

    const tokens = generateTokens(user);
    const { resolvePermissions: rp } = require('../middleware/permissions');

    res.json({
      success: true,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        permissions: rp(user),
      },
      ...tokens
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

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
