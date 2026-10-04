const crypto = require('crypto');
const { ALL_PLATFORMS, LIVE_PLATFORMS, fetchPlatform, fetchProfileText, VERIFY_FIELD } = require('../utils/codingPlatforms');
const userRepo = require('../repositories/userRepository');
const codingProfileRepo = require('../repositories/codingProfileRepository');

/** Platforms whose profile text we can read back, so ownership can be proved. */
const VERIFIABLE_PLATFORMS = ['codeforces', 'leetcode'];

// ── List the current user's saved profiles ──────────────────────────────────────
exports.getMine = async (req, res) => {
  try {
    const profiles = await codingProfileRepo.listByUser(req.user.id);
    const data = profiles.map(p => ({
      platform: p.platform, handle: p.handle, solved: p.solved || 0,
      rating: p.rating ?? null, max_rating: p.maxRating ?? null, extra: p.extra || {},
      sync_status: p.syncStatus || 'pending', last_synced: p.lastSynced || null,
      verified: !!p.verified, verified_at: p.verifiedAt || null,
      verifiable: VERIFIABLE_PLATFORMS.includes(p.platform),
    }));
    res.json({
      success: true, data,
      livePlatforms: LIVE_PLATFORMS, allPlatforms: ALL_PLATFORMS,
      verifiablePlatforms: VERIFIABLE_PLATFORMS,
    });
  } catch (e) {
    console.error('Profiles getMine error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Add / update / remove a handle (empty handle removes it) ─────────────────────
exports.setHandle = async (req, res) => {
  try {
    const { platform } = req.body;
    let { handle } = req.body;
    if (!ALL_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, error: 'Unsupported platform' });
    }
    handle = typeof handle === 'string' ? handle.trim().slice(0, 80) : '';

    if (!handle) {
      await codingProfileRepo.remove(req.user.id, platform);
      return res.json({ success: true, data: { platform, removed: true } });
    }

    // A verification proves one account, not the student. Pointing the entry at
    // a different handle has to clear it, or somebody could verify an account
    // they own and then swap in one they do not.
    await codingProfileRepo.upsert(req.user.id, platform, {
      handle, syncStatus: 'pending', verified: false, verifiedAt: null, verifyCode: null,
    });
    res.json({ success: true, data: { platform, handle } });
  } catch (e) {
    console.error('Profiles setHandle error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Sync the current user's live-platform stats ──────────────────────────────────
exports.syncMine = async (req, res) => {
  try {
    const profiles = await codingProfileRepo.listByUser(req.user.id);
    const results = [];
    for (const p of profiles) {
      if (!LIVE_PLATFORMS.includes(p.platform)) {
        results.push({ platform: p.platform, status: 'link-only' });
        continue;
      }
      try {
        const stats = await fetchPlatform(p.platform, p.handle);
        await codingProfileRepo.upsert(req.user.id, p.platform, {
          solved: stats.solved || 0, rating: stats.rating ?? null, maxRating: stats.max_rating ?? null,
          extra: stats.extra || {}, syncStatus: 'ok', lastSynced: new Date(),
        });
        results.push({ platform: p.platform, status: 'ok', solved: stats.solved, rating: stats.rating });
      } catch (err) {
        await codingProfileRepo.upsert(req.user.id, p.platform, { syncStatus: 'error', lastSynced: new Date() });
        results.push({ platform: p.platform, status: 'error', error: err.message });
      }
    }
    res.json({ success: true, data: results });
  } catch (e) {
    console.error('Profiles syncMine error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Unified leaderboard (aggregated across platforms), optional cohort filter ────
exports.getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);

    const studentsMap = await userRepo.getMapByRole('student');
    let students = [...studentsMap.values()];
    if (req.query.department) students = students.filter(s => s.department === req.query.department);
    if (req.query.section) students = students.filter(s => s.section === String(req.query.section).toUpperCase());
    const ids = new Set(students.map(s => s.id));
    if (ids.size === 0) return res.json({ success: true, data: [] });

    const allProfiles = (await codingProfileRepo.listAll()).filter(p => ids.has(p.userId));
    const byUser = new Map();
    for (const p of allProfiles) {
      if (!byUser.has(p.userId)) byUser.set(p.userId, { totalSolved: 0, cfRating: null, platforms: 0, byPlatform: {} });
      const agg = byUser.get(p.userId);
      agg.totalSolved += p.solved || 0;
      agg.platforms += 1;
      agg.byPlatform[p.platform] = p.solved || 0;
      if (p.platform === 'codeforces') agg.cfRating = p.rating ?? null;
    }

    const data = [...byUser.entries()]
      .map(([userId, agg]) => {
        const profile = studentsMap.get(userId) || {};
        return {
          userId, name: profile.name || 'Unknown',
          department: profile.department || null, section: profile.section || null,
          totalSolved: agg.totalSolved, cfRating: agg.cfRating, platforms: agg.platforms,
          byPlatform: agg.byPlatform,
        };
      })
      .sort((a, b) => b.totalSolved - a.totalSolved || (b.cfRating ?? -1) - (a.cfRating ?? -1))
      .slice(0, limit)
      .map((r, i) => ({ rank: i + 1, ...r }));

    res.json({ success: true, data });
  } catch (e) {
    console.error('Profiles leaderboard error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};


// ── Proving an external account belongs to the student ──────────────────────────
// The student puts a one-time code somewhere on the platform profile that only
// its owner can edit, and we read it back. Nothing else can be verified: we have
// no relationship with these sites and no way to ask them who a user is.

const CODE_TTL_MS = 60 * 60 * 1000;
const newCode = () => `CM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

// @route POST /api/profiles/me/:platform/verify-code
exports.startVerification = async (req, res) => {
  try {
    const { platform } = req.params;
    if (!VERIFIABLE_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, error: 'This platform cannot be verified automatically' });
    }
    const profiles = await codingProfileRepo.listByUser(req.user.id);
    const existing = profiles.find((p) => p.platform === platform);
    if (!existing?.handle) {
      return res.status(400).json({ success: false, error: 'Add your handle for this platform first' });
    }

    const code = newCode();
    await codingProfileRepo.upsert(req.user.id, platform, {
      verifyCode: code, verifyCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    res.json({
      success: true,
      data: { platform, handle: existing.handle, code, where: VERIFY_FIELD[platform], expiresInMinutes: CODE_TTL_MS / 60000 },
    });
  } catch (e) {
    console.error('Profiles startVerification error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// @route POST /api/profiles/me/:platform/verify
exports.confirmVerification = async (req, res) => {
  try {
    const { platform } = req.params;
    if (!VERIFIABLE_PLATFORMS.includes(platform)) {
      return res.status(400).json({ success: false, error: 'This platform cannot be verified automatically' });
    }
    const profiles = await codingProfileRepo.listByUser(req.user.id);
    const existing = profiles.find((p) => p.platform === platform);
    if (!existing?.verifyCode) {
      return res.status(400).json({ success: false, error: 'Ask for a code first' });
    }
    const expires = existing.verifyCodeExpiresAt?.toMillis?.() ?? new Date(existing.verifyCodeExpiresAt).getTime();
    if (!expires || expires < Date.now()) {
      return res.status(400).json({ success: false, error: 'That code has expired — ask for a new one' });
    }

    let text;
    try {
      text = await fetchProfileText(platform, existing.handle);
    } catch (err) {
      return res.status(502).json({ success: false, error: `Could not read your ${platform} profile: ${err.message}` });
    }

    if (!String(text || '').toUpperCase().includes(existing.verifyCode)) {
      return res.status(400).json({
        success: false,
        error: 'The code is not on your profile yet. Save it there, give the site a moment, then try again.',
      });
    }

    await codingProfileRepo.upsert(req.user.id, platform, {
      verified: true, verifiedAt: new Date(), verifyCode: null, verifyCodeExpiresAt: null,
    });
    res.json({ success: true, data: { platform, handle: existing.handle, verified: true } });
  } catch (e) {
    console.error('Profiles confirmVerification error:', e.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
