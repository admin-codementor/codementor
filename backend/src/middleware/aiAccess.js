// The college's AI switch and daily limit (set by the Admin in Settings), applied in front of every AI call a person can start.
// If the counter cannot be read the request goes through and the problem is logged: a database blip must not take AI away from a class.
//
//   aiAccess        refuses the request (503 when AI is off, 429 over the daily limit)
//   aiAccess.soft   never refuses: it sets req.aiRefusal and carries on, for features that have a good answer without AI
//                   (the HOD's department summary is then written by rules instead)
const adminService = require('../services/adminService');
const adminRepo = require('../repositories/adminRepository');
const R = require('../utils/adminRules');

async function verdictFor(req) {
  try {
    const settings = await adminService.getSettings();
    let used = 0;
    if (settings.ai.enabled !== false && settings.ai.dailyLimit != null && req.user?.role !== 'admin') {
      used = (await adminRepo.countAiUse(R.dayKey(Date.now()), req.user.id)) - 1; // counts this use; `used` is how many came before it
    }
    return R.aiAllowed(settings, req.user?.role, used);
  } catch (e) {
    console.error('aiAccess check failed, letting the request through:', String(e?.message || e).slice(0, 100));
    return { ok: true };
  }
}

async function aiAccess(req, res, next) {
  const verdict = await verdictFor(req);
  if (!verdict.ok) return res.status(verdict.code === 'AI_OFF' ? 503 : 429).json({ success: false, code: verdict.code, error: verdict.error });
  return next();
}

aiAccess.soft = async (req, res, next) => {
  const verdict = await verdictFor(req);
  if (!verdict.ok) req.aiRefusal = verdict;
  return next();
};

module.exports = aiAccess;
