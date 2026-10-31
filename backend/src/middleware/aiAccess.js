// The college's AI switch and daily limit (set by the Admin in Settings), applied in front of every AI call a person can start.
// If the counter cannot be read the request goes through and the problem is logged: a database blip must not take AI away from a class.
const adminService = require('../services/adminService');
const adminRepo = require('../repositories/adminRepository');
const R = require('../utils/adminRules');

module.exports = async function aiAccess(req, res, next) {
  try {
    const settings = await adminService.getSettings();
    let used = 0;
    if (settings.ai.enabled !== false && settings.ai.dailyLimit != null && req.user?.role !== 'admin') {
      used = (await adminRepo.countAiUse(R.dayKey(Date.now()), req.user.id)) - 1; // counts this use; `used` is how many came before it
    }
    const verdict = R.aiAllowed(settings, req.user?.role, used);
    if (!verdict.ok) return res.status(verdict.code === 'AI_OFF' ? 503 : 429).json({ success: false, code: verdict.code, error: verdict.error });
  } catch (e) {
    console.error('aiAccess check failed, letting the request through:', String(e?.message || e).slice(0, 100));
  }
  return next();
};
