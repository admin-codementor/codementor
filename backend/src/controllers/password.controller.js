// First-login password change (see utils/passwordGate.js).
const { firebaseAuth } = require('../config/firebaseAdmin');
const userRepo = require('../repositories/userRepository');
const { resolvePermissions } = require('../middleware/permissions');
const { validateNewPassword } = require('../utils/passwordGate');
const { logAction } = require('../middleware/audit');
const { generateTokens } = require('../utils/tokens');

// Is `password` the account's CURRENT password? Asks Firebase to sign in with it. Needs the project's public web
// API key (FIREBASE_WEB_API_KEY, the same value the frontend uses). Without it this returns false, which means
// "reusing the temporary password is not detected"; the setting is documented in docs/ROSTER_ONBOARDING.md.
async function isCurrentPassword(email, password) {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    });
    return r.ok;
  } catch {
    return false; // Firebase unreachable: do not block the change on this extra check
  }
}

// @route POST /api/auth/set-password   body { new_password }   (protect; the only route a flagged session may call)
// Sets the new password at Firebase, clears the "must change" flag and returns fresh tokens.
// The two steps happen together here, so the flag cannot be cleared without the password changing.
exports.setPassword = async (req, res) => {
  try {
    // Only a session that is still waiting for its first password change may use this. For anyone else it
    // would be a password reset that needs no current password, so it is refused.
    if (req.user?.mcp !== true) {
      return res.status(400).json({ success: false, error: 'Your password does not need to be set. Change it from your profile instead.' });
    }
    const user = await userRepo.getById(req.user.id, req.user.role);
    if (!user || !user.firebaseUid) return res.status(404).json({ success: false, error: 'Account not found.' });
    if (user.mustChangePassword !== true) {
      return res.status(400).json({ success: false, error: 'Your password is already set. Sign in again.' });
    }

    const v = validateNewPassword(req.body?.new_password, { email: user.email, rollNo: user.rollNo });
    if (v.error) return res.status(400).json({ success: false, error: v.error });

    if (await isCurrentPassword(user.email, req.body.new_password)) {
      return res.status(400).json({ success: false, error: 'Choose a different password from the temporary one you were given.' });
    }

    await firebaseAuth.updateUser(user.firebaseUid, { password: req.body.new_password });
    await userRepo.update(user.id, user.role, { mustChangePassword: false, passwordChangedAt: new Date() });
    // Any session opened before the password changed (for example with the temporary one) stops working at its next refresh.
    await userRepo.bumpTokenVersion(user.id, user.role);
    logAction(req, 'auth.first_password_set', `user ${user.id}`);

    const fresh = { ...user, mustChangePassword: false, tokenVersion: (Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) + 1 };
    res.json({
      success: true,
      user: { id: fresh.id, name: fresh.name, email: fresh.email, role: fresh.role, permissions: resolvePermissions(fresh), must_change_password: false },
      ...generateTokens(fresh),
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ success: false, error: 'Could not set the password. Please try again.' });
  }
};
