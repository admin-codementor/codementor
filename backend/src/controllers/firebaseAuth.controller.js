const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { firebaseAuth } = require('../config/firebaseAdmin');
const userRepo = require('../repositories/userRepository');

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
// email/password or Google sign-in), then upserts the user's profile document
// in Firestore (`students/{id}` or `faculty/{id}`) — looked up by firebaseUid,
// falling back to email on first sign-in — and issues the app's normal
// access/refresh tokens so every existing `protect`-gated route keeps working
// unchanged. Firestore is now the sole store for user data — no Postgres
// row is created or read anywhere in this flow.
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

    let user = await userRepo.getByFirebaseUid(uid);

    if (!user) {
      user = await userRepo.getByEmail(email);

      if (user) {
        await userRepo.update(user.id, user.role, { firebaseUid: uid });
        user.firebaseUid = uid;
      } else {
        const displayName = (typeof name === 'string' && name.trim()) || decoded.name || email.split('@')[0];

        const dept = typeof department === 'string' && department.trim() ? department.trim() : null;
        const sec  = typeof section === 'string' && section.trim() ? section.trim().toUpperCase() : null;
        const yrNum = parseInt(year, 10);
        const yr   = yrNum >= 1 && yrNum <= 6 ? yrNum : null;
        const roll = typeof roll_no === 'string' && roll_no.trim() ? roll_no.trim() : null;
        const newRole = role === 'faculty' ? 'faculty' : 'student';
        const id = uuidv4();

        const profileData = {
          name: displayName, email, role: newRole,
          department: dept, section: sec, year: yr, rollNo: roll,
          firebaseUid: uid, rating: 1200, totpSecret: null, totpEnabled: false,
          ...(newRole === 'faculty' ? { permissions: {} } : {}),
        };
        user = await userRepo.create(id, profileData);
      }
    }

    // Firebase already verified identity — 2FA gate and last-login bookkeeping
    // live entirely in Firestore now.
    const totpEnabled = user.totpEnabled === true;

    await userRepo.update(user.id, user.role, { lastLoginAt: new Date() });

    if (totpEnabled) {
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
