// Coding score endpoints: the staff table, the college thresholds (HOD / admin edit), a bounded refresh, and a student's own.
const service = require('../services/platformScoreService');
const settingsRepo = require('../repositories/platformSettingsRepository');
const { validateThresholds } = require('../utils/platformScore');
const { bumpVersion } = require('../utils/cache');

// @route GET /api/faculty/platform-scores?year=&section=
exports.getScores = async (req, res) => {
  try {
    const year = /^\d$/.test(String(req.query.year || '')) ? String(req.query.year) : null;
    const section = /^[A-Za-z0-9]{1,4}$/.test(String(req.query.section || '')) ? String(req.query.section) : null;
    res.json({ success: true, data: await service.getScores(req, { year, section }) });
  } catch (error) {
    console.error('Platform scores error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the coding scores.' });
  }
};

// @route PUT /api/faculty/platform-thresholds   { year: 'default' | '1'..'9', red, green }   (HOD / admin)
exports.putThresholds = async (req, res) => {
  try {
    const yearKey = String(req.body?.year ?? 'default');
    if (yearKey !== 'default' && !/^\d$/.test(yearKey)) return res.status(400).json({ success: false, error: 'year must be "default" or a single digit.' });
    if (req.body?.clear === true) {
      await settingsRepo.clear(yearKey, req.user.id);
    } else {
      const v = validateThresholds(req.body);
      if (v.error) return res.status(400).json({ success: false, error: v.error });
      await settingsRepo.setThresholds(yearKey, { red: v.red, green: v.green }, req.user.id);
    }
    await bumpVersion('platform');
    res.json({ success: true, data: await settingsRepo.get() });
  } catch (error) {
    console.error('Put thresholds error:', error);
    res.status(500).json({ success: false, error: 'Failed to save the thresholds.' });
  }
};

// @route POST /api/faculty/platform-scores/refresh   (HOD / admin) re-reads up to 20 linked profiles
exports.refresh = async (req, res) => {
  try {
    res.json({ success: true, data: await service.refreshBatch(req, 20) });
  } catch (error) {
    console.error('Platform refresh error:', error);
    res.status(500).json({ success: false, error: 'Refresh failed.' });
  }
};

// @route GET /api/profiles/score   the signed-in student's own score
exports.getMine = async (req, res) => {
  try {
    res.json({ success: true, data: await service.getMine(req.user.id) });
  } catch (error) {
    console.error('My score error:', error);
    res.status(500).json({ success: false, error: 'Failed to load your score.' });
  }
};
