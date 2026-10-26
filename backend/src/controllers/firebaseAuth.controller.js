const { v4: uuidv4 } = require('uuid');
const { firebaseAuth } = require('../config/firebaseAdmin');
const userRepo = require('../repositories/userRepository');

const { resolvePermissions } = require('../middleware/permissions');

// Token creation lives in utils/tokens.js (one place, one lifetime, tokenVersion).
const { generateTokens } = require('../utils/tokens');

// Faculty accounts are never self-service.
//
// The `role` field in the request body is deliberately IGNORED. Trusting it
// meant anyone could become faculty by toggling a button on the sign-up form —
// and faculty defaults grant every permission, including manage_problems,
// which exposes hidden test cases and therefore breaks grading integrity
// outright.
//
// Two supported ways to create a faculty account:
//
//   1. Email-domain allowlist — set FACULTY_EMAIL_DOMAINS to a comma-separated
//      list (e.g. "staff.college.edu,faculty.college.edu"). Matched against the
//      *Firebase-verified* email, never against anything the client supplied.
//      Leave it unset to disable domain-based promotion entirely.
//
//   2. Pre-created account — an admin writes the profile document into the
//      `faculty` collection with the person's email address. The getByEmail
//      branch below links it to their Firebase UID on first sign-in and
//      preserves the existing role.
//
// Anything else self-registers as a student and must be promoted by an admin.
const FACULTY_EMAIL_DOMAINS = (process.env.FACULTY_EMAIL_DOMAINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Self sign-up (a verified Firebase login with no profile creates a student) is OFF by default.
// Set ALLOW_SELF_SIGNUP=true to turn it back on.
const SELF_SIGNUP_ALLOWED = String(process.env.ALLOW_SELF_SIGNUP || '').toLowerCase() === 'true';

const isFacultyEmail = (email) => {
  if (FACULTY_EMAIL_DOMAINS.length === 0) return false;
  const domain = String(email).toLowerCase().split('@')[1] || '';
  // Exact match, or a subdomain of an allowlisted domain.
  return FACULTY_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
};

// POST /api/auth/firebase  (public)  body { id_token, name?, department?, section?, year?, roll_no? }
// NOTE: `role` may still be sent by older clients; it is ignored (see above).
// Verifies a Firebase ID token (issued by the frontend's Firebase SDK after
// email/password or Google sign-in), then upserts the user's profile document
// in Firestore (`students/{id}` or `faculty/{id}`) — looked up by firebaseUid,
// falling back to email on first sign-in — and issues the app's normal
// access/refresh tokens so every existing `protect`-gated route keeps working
// unchanged. Firestore is now the sole store for user data — no Postgres
// row is created or read anywhere in this flow.
exports.generateTokens = generateTokens;

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
      } else if (!SELF_SIGNUP_ALLOWED) {
        // Accounts come from the college roster. A valid Firebase login with no profile is not enough.
        return res.status(403).json({
          success: false, code: 'ACCOUNT_NOT_FOUND',
          error: 'No account exists for this email. Ask your department to add you, then try again.',
        });
      } else {
        const displayName = (typeof name === 'string' && name.trim()) || decoded.name || email.split('@')[0];

        const dept = typeof department === 'string' && department.trim() ? department.trim() : null;
        const sec  = typeof section === 'string' && section.trim() ? section.trim().toUpperCase() : null;
        const yrNum = parseInt(year, 10);
        const yr   = yrNum >= 1 && yrNum <= 6 ? yrNum : null;
        const roll = typeof roll_no === 'string' && roll_no.trim() ? roll_no.trim() : null;
        // Role is decided by the verified email domain, never by the client.
        const newRole = isFacultyEmail(email) ? 'faculty' : 'student';
        if (role === 'faculty' && newRole !== 'faculty') {
          console.warn(
            `[SECURITY] Self-signup requested role=faculty for ${email} — denied ` +
            `(domain not in FACULTY_EMAIL_DOMAINS). Created as student.`,
          );
        }
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
        must_change_password: user.mustChangePassword === true,
      },
      ...tokens,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};
