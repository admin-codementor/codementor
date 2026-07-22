const { computeStrengthsWeaknesses } = require('../utils/topicScores');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const assignmentRepo = require('../repositories/assignmentRepository');
const topicMasteryRepo = require('../repositories/topicMasteryRepository');
const submissionRepo = require('../repositories/submissionRepository');

// Calculate consecutive-day submission streak from heatmap rows
const calculateStreak = (heatmapRows) => {
  if (!heatmapRows.length) return 0;

  const dates = heatmapRows.map(r => r.date).sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Streak is only active if there was a submission today or yesterday
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    const curr = new Date(dates[i]);
    const prev = new Date(dates[i + 1]);
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};

const subMillis = (s) => s.submittedAt?.toMillis?.() ?? new Date(s.submittedAt).getTime();
const subDate = (s) => s.submittedAt?.toDate?.() ?? new Date(s.submittedAt);

exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;
    const mySubs = await submissionRepo.listByUser(userId);

    // 1. Total Submissions & AC Rate
    const totalSubs = mySubs.length;
    const totalAccepted = mySubs.filter(s => s.verdict === 'Accepted').length;
    const acRate = totalSubs > 0 ? Math.round((totalAccepted / totalSubs) * 100) : 0;

    // 2. Problems Solved (Unique)
    const problemsSolved = new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId)).size;

    // 3. Languages Used
    const langCounts = {};
    for (const s of mySubs) { if (s.language) langCounts[s.language] = (langCounts[s.language] || 0) + 1; }
    const languages = Object.entries(langCounts).map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count);

    // 4. Heatmap Data (last 12 months)
    const twelveMonthsAgo = Date.now() - 365 * 86400000;
    const heatmapCounts = {};
    for (const s of mySubs) {
      const ms = subMillis(s);
      if (ms < twelveMonthsAgo) continue;
      const date = subDate(s).toISOString().split('T')[0];
      heatmapCounts[date] = (heatmapCounts[date] || 0) + 1;
    }
    const heatmap = Object.entries(heatmapCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));

    // 5. Real streak calculation
    const streak = calculateStreak(heatmap);

    // 6. Real rank from leaderboard — student roster comes from Firestore.
    const studentIds = (await userRepo.listByRole('student')).map(u => u.id);
    const allSubs = await submissionRepo.listAll();
    const solvedCountByUser = {};
    for (const s of allSubs) {
      if (s.verdict !== 'Accepted') continue;
      if (!solvedCountByUser[s.userId]) solvedCountByUser[s.userId] = new Set();
      solvedCountByUser[s.userId].add(s.problemId);
    }
    const ranked = studentIds
      .map(id => ({ id, solved: solvedCountByUser[id]?.size || 0 }))
      .sort((a, b) => b.solved - a.solved);
    const rank = ranked.findIndex(r => r.id === userId) + 1;

    // 6b. Contest rating (Elo)
    const myProfile = await userRepo.getById(userId, req.user.role);
    const rating = myProfile?.rating != null ? parseInt(myProfile.rating, 10) : 1200;

    // 7. Topics Analytics from mastery table (with fallback to submissions)
    const masteryRows = await topicMasteryRepo.listByUser(userId);

    let masteredTopics = masteryRows.map(r => ({
      topic: r.topic,
      mastery: Math.min(100, (r.solvedCount || 0) * 20)
    }));

    // Fallback: derive from submissions if mastery table is empty
    if (masteredTopics.length === 0) {
      const acceptedProblemIds = [...new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId))];
      const problemsMap = await problemRepo.getMapByIds(acceptedProblemIds);
      const solvedCountByTopic = {};
      for (const pid of acceptedProblemIds) {
        const tags = problemsMap.get(pid)?.tags || [];
        for (const tag of tags) solvedCountByTopic[tag] = (solvedCountByTopic[tag] || 0) + 1;
      }
      masteredTopics = Object.entries(solvedCountByTopic).map(([topic, solved_count]) => ({
        topic, mastery: Math.min(100, solved_count * 20),
      }));
    }

    // Recent submissions for the dashboard widget
    const recentRows = [...mySubs].sort((a, b) => subMillis(b) - subMillis(a)).slice(0, 5);
    const recentProblemsMap = await problemRepo.getMapByIds(recentRows.map(r => r.problemId));
    const recentSubmissions = recentRows.map(r => ({
      verdict: r.verdict, language: r.language, created_at: subDate(r),
      problem_id: r.problemId, problem_title: recentProblemsMap.get(r.problemId)?.title || 'Unknown',
    }));

    res.json({
      success: true,
      data: {
        stats: { totalSubs, acRate, problemsSolved, streak, rank, rating },
        languages,
        heatmap,
        topics: masteredTopics,
        recentSubmissions
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getAssignments = async (req, res) => {
  try {
    const userId = req.user.id;

    const assignments = await assignmentRepo.getAll();
    const allProblemIds = [...new Set(assignments.flatMap(a => a.problemIds || []))];
    const problemsMap = await problemRepo.getMapByIds(allProblemIds);

    const solvedSet = new Set(
      (await submissionRepo.listByUser(userId)).filter(s => s.verdict === 'Accepted').map(s => s.problemId)
    );

    const data = assignments
      .sort((a, b) => (a.deadline?.toMillis?.() ?? new Date(a.deadline).getTime()) - (b.deadline?.toMillis?.() ?? new Date(b.deadline).getTime()))
      .map(a => {
        const problems = (a.problemIds || []).map(pid => {
          const p = problemsMap.get(pid);
          return { id: pid, title: p?.title || 'Unknown', difficulty: p?.difficulty || null, is_solved: solvedSet.has(pid) };
        });
        return {
          id: a.id, title: a.title, deadline: a.deadline, isExam: a.isExam === true,
          problems, total: problems.length, solved: problems.filter(p => p.is_solved).length,
        };
      });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get Assignments Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assignments' });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    // Return assignments due within 48 hours as notifications
    const now = Date.now();
    const in48h = now + 48 * 3600000;
    const toMs = (d) => d?.toMillis?.() ?? new Date(d).getTime();
    const dueSoon = (await assignmentRepo.getAll())
      .filter(a => { const t = toMs(a.deadline); return t >= now && t <= in48h; })
      .sort((a, b) => toMs(a.deadline) - toMs(b.deadline))
      .slice(0, 10);

    const notifications = dueSoon.map(a => ({
      id: a.id,
      type: 'deadline',
      message: `Assignment "${a.title}" is due soon`,
      deadline: a.deadline
    }));

    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Notifications Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

exports.getRecommendations = async (req, res) => {
  const userId = req.user.id;
  try {
    const mySubs = await submissionRepo.listByUser(userId);

    // ── Adaptive difficulty: pick a target band from recent performance ──────────
    // Recent acceptance rate (last 20 submissions) gauges whether to push or ease.
    const recentSubs = [...mySubs].sort((a, b) => subMillis(b) - subMillis(a)).slice(0, 20);
    const recentTotal = recentSubs.length;
    const recentAcc = recentSubs.filter(s => s.verdict === 'Accepted').length;
    const recentAcRate = recentTotal > 0 ? recentAcc / recentTotal : 0;

    // Distinct solved problems per difficulty → current demonstrated level.
    const solvedProblemIds = new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId));
    const solvedProblemsMap = await problemRepo.getMapByIds([...solvedProblemIds]);
    const solved = { easy: 0, medium: 0, hard: 0 };
    for (const p of solvedProblemsMap.values()) {
      const d = (p.difficulty || '').toLowerCase();
      if (solved[d] !== undefined) solved[d] += 1;
    }

    // Decide the ordered target difficulty band.
    let band;
    if (solved.hard >= 3 && recentAcRate >= 0.6)            band = ['hard', 'medium'];
    else if ((solved.medium >= 3 || solved.hard >= 1) && recentAcRate >= 0.5) band = ['medium', 'hard'];
    else if (solved.easy >= 3 && recentAcRate >= 0.5)       band = ['medium', 'easy'];
    else                                                    band = ['easy', 'medium'];
    // If recently struggling, ease down one notch.
    if (recentTotal >= 4 && recentAcRate < 0.4) band = ['easy', 'medium'];

    const level = band[0];

    // Weak topics to bias toward (fall back to a sentinel so the array is never empty).
    const weakTopics = (await topicMasteryRepo.listByUser(userId))
      .filter(r => (r.solvedCount || 0) < 3)
      .sort((a, b) => (b.failedCount || 0) - (a.failedCount || 0))
      .slice(0, 5)
      .map(r => r.topic);

    // Unsolved problems in the target band, weak topics first, then band preference.
    const allProblems = (await problemRepo.getAll()).filter(p => !solvedProblemIds.has(p.id));
    const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

    const inBand = shuffle(allProblems.filter(p => band.includes((p.difficulty || '').toLowerCase())));
    let problems = inBand
      .map(p => ({ p, hasWeakTag: weakTopics.length && (p.tags || []).some(t => weakTopics.includes(t)) }))
      .sort((a, b) => {
        if (a.hasWeakTag !== b.hasWeakTag) return a.hasWeakTag ? -1 : 1;
        const ai = band.indexOf((a.p.difficulty || '').toLowerCase());
        const bi = band.indexOf((b.p.difficulty || '').toLowerCase());
        return ai - bi;
      })
      .slice(0, 6)
      .map(({ p }) => ({ id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [] }));

    // Fallback: any unsolved, easiest first.
    if (problems.length === 0) {
      const order = { easy: 1, medium: 2, hard: 3 };
      problems = shuffle(allProblems)
        .sort((a, b) => (order[(a.difficulty || '').toLowerCase()] || 4) - (order[(b.difficulty || '').toLowerCase()] || 4))
        .slice(0, 6)
        .map(p => ({ id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [] }));
    }

    res.json({ success: true, data: problems, level, recentAcRate: Math.round(recentAcRate * 100) });
  } catch (error) {
    console.error('Recommendation Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recommendations' });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const studentsMap = await userRepo.getMapByRole('student');
    const studentIds = [...studentsMap.keys()];
    if (studentIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const allSubs = await submissionRepo.listAll();
    const statsByUser = new Map(studentIds.map(id => [id, { solved: new Set(), total: 0 }]));
    for (const s of allSubs) {
      const stat = statsByUser.get(s.userId);
      if (!stat) continue;
      stat.total += 1;
      if (s.verdict === 'Accepted') stat.solved.add(s.problemId);
    }

    const leaderboard = studentIds
      .map(id => {
        const profile = studentsMap.get(id) || {};
        const stat = statsByUser.get(id);
        return {
          id,
          name: profile.name || 'Unknown',
          rating: profile.rating != null ? parseInt(profile.rating, 10) : 1200,
          department: profile.department || null,
          section: profile.section || null,
          solvedCount: stat.solved.size,
          totalSubmissions: stat.total,
        };
      })
      .sort((a, b) => b.solvedCount - a.solvedCount || a.name.localeCompare(b.name))
      .slice(0, 100)
      .map((r, index) => ({ ...r, rank: index + 1, score: r.solvedCount * 10 }));

    res.json({ success: true, data: leaderboard });
  } catch (error) {
    console.error('Leaderboard Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
};

exports.getDailyChallenge = async (req, res) => {
  try {
    // Deterministic daily pick: hash today's date to a stable problem index
    const today = new Date().toISOString().split('T')[0];
    const dateHash = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);

    const problems = (await problemRepo.getAll())
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

    if (problems.length === 0) {
      return res.json({ success: true, data: null });
    }

    const p = problems[dateHash % problems.length];
    res.json({ success: true, data: { id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [] } });
  } catch (error) {
    console.error('Daily Challenge Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch daily challenge' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;

    if (name) {
      await userRepo.update(userId, req.user.role, { name: name.trim() });
    }

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

// @desc    Submission-quality stats for the profile dashboard (verdict + language
//          breakdown), optionally filtered by time period.
// @route   GET /api/student/stats?period=7d|30d|6mo|all
exports.getStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const INTERVAL_DAYS = { '7d': 7, '30d': 30, '6mo': 182 };
    const days = INTERVAL_DAYS[req.query.period];
    const period = days ? req.query.period : 'all';
    const cutoff = days ? Date.now() - days * 86400000 : null;

    let mySubs = await submissionRepo.listByUser(userId);
    if (cutoff) mySubs = mySubs.filter(s => subMillis(s) >= cutoff);

    const verdictCounts = {};
    const langCounts = {};
    for (const s of mySubs) {
      if (s.verdict) verdictCounts[s.verdict] = (verdictCounts[s.verdict] || 0) + 1;
      if (s.language) langCounts[s.language] = (langCounts[s.language] || 0) + 1;
    }
    const verdicts = Object.entries(verdictCounts).map(([verdict, n]) => ({ verdict, n }));
    const languages = Object.entries(langCounts).map(([language, n]) => ({ language, n })).sort((a, b) => b.n - a.n);

    res.json({
      success: true,
      data: { period, total: mySubs.length, verdicts, languages },
    });
  } catch (error) {
    console.error('getStats error:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
};

exports.getPlacementReadiness = async (req, res) => {
  const userId = req.user.id;
  try {
    const { TRACKS } = require('../config/placementTracks');

    // Distinct accepted problems per topic for this student.
    const mySubs = await submissionRepo.listByUser(userId);
    const acceptedIds = [...new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId))];
    const acceptedProblemsMap = await problemRepo.getMapByIds(acceptedIds);
    const solvedByTopic = {};
    for (const p of acceptedProblemsMap.values()) {
      for (const tag of (p.tags || [])) {
        const key = tag.toLowerCase();
        solvedByTopic[key] = (solvedByTopic[key] || 0) + 1;
      }
    }
    const tagRows = Object.entries(solvedByTopic).map(([topic, solved]) => ({ topic, solved }));

    // Build each track's readiness from real solved counts.
    const deficitByTopic = {};
    const tracks = TRACKS.map(t => {
      let targetSum = 0, gotSum = 0;
      const topics = t.topics.map(tp => {
        const solved = solvedByTopic[tp.topic] || 0;
        const counted = Math.min(solved, tp.target);
        targetSum += tp.target;
        gotSum += counted;
        const deficit = Math.max(0, tp.target - solved);
        if (deficit > 0) deficitByTopic[tp.topic] = Math.max(deficitByTopic[tp.topic] || 0, deficit);
        return { topic: tp.topic, label: tp.label, target: tp.target, solved, pct: Math.round((counted / tp.target) * 100) };
      });
      const readiness = targetSum > 0 ? Math.round((gotSum / targetSum) * 100) : 0;
      const gaps = topics.filter(x => x.solved < x.target)
        .sort((a, b) => (b.target - b.solved) - (a.target - a.solved))
        .slice(0, 4)
        .map(x => ({ label: x.label, need: x.target - x.solved }));
      return {
        key: t.key, label: t.label, color: t.color, companies: t.companies, focus: t.focus,
        readiness, topics, gaps,
      };
    });

    // Recommend unsolved problems in the most-deficient topics overall.
    const weakTopics = Object.entries(deficitByTopic)
      .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
    let recommended = [];
    if (weakTopics.length) {
      const acceptedSet = new Set(acceptedIds);
      const order = { easy: 1, medium: 2, hard: 3 };
      const candidates = (await problemRepo.getAll())
        .filter(p => !acceptedSet.has(p.id) && (p.tags || []).some(t => weakTopics.includes(t)));
      recommended = candidates
        .map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v)
        .sort((a, b) => (order[a.difficulty] || 4) - (order[b.difficulty] || 4))
        .slice(0, 6)
        .map(p => ({ id: p.id, title: p.title, difficulty: p.difficulty, tags: p.tags || [] }));
    }

    res.json({ success: true, data: { tracks, recommended, solvedTotal: tagRows.reduce((s, r) => s + (parseInt(r.solved) || 0), 0) } });
  } catch (error) {
    console.error('Placement readiness error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute placement readiness' });
  }
};

exports.getProblemSolutions = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    // Gate: you can only view peers' solutions AFTER you've solved it yourself.
    const mine = (await submissionRepo.listByUserAndProblem(userId, id)).some(s => s.verdict === 'Accepted');
    if (!mine) {
      return res.status(403).json({ success: false, error: 'Solve this problem first to unlock community solutions.' });
    }

    // Latest accepted submission per other student.
    const problemSubs = (await submissionRepo.listByProblem(id))
      .filter(s => s.verdict === 'Accepted' && s.userId !== userId)
      .sort((a, b) => subMillis(b) - subMillis(a));
    const latestPerUser = new Map();
    for (const s of problemSubs) {
      if (!latestPerUser.has(s.userId)) latestPerUser.set(s.userId, s);
    }

    const usersMap = await userRepo.getAllUsersMap();
    const solutions = [...latestPerUser.values()]
      .sort((a, b) => (a.runtime ?? 1e9) - (b.runtime ?? 1e9))
      .slice(0, 5)
      .map(r => ({
        id: r.id,
        author: usersMap.get(r.userId)?.name || 'Unknown',
        language: r.language, runtime: r.runtime, code: r.code,
      }));

    res.json({ success: true, data: solutions });
  } catch (error) {
    console.error('Peer solutions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch solutions' });
  }
};

exports.getBadges = async (req, res) => {
  const userId = req.user.id;
  try {
    const mySubs = await submissionRepo.listByUser(userId);
    const acceptedSubs = mySubs.filter(s => s.verdict === 'Accepted');

    const totalSolved = new Set(acceptedSubs.map(s => s.problemId)).size;
    const nightOwl = acceptedSubs.some(s => { const h = subDate(s).getHours(); return h >= 0 && h <= 4; });
    const langs = new Set(acceptedSubs.map(s => s.language).filter(Boolean)).size;

    const badgeProblemsMap = await problemRepo.getMapByIds([...new Set(acceptedSubs.map(s => s.problemId))]);
    const topic = {};
    for (const p of badgeProblemsMap.values()) {
      for (const tag of (p.tags || [])) {
        const key = tag.toLowerCase();
        topic[key] = (topic[key] || 0) + 1;
      }
    }

    const twelveMonthsAgo = Date.now() - 365 * 86400000;
    const heatmapCounts = {};
    for (const s of mySubs) {
      const ms = subMillis(s);
      if (ms < twelveMonthsAgo) continue;
      const date = subDate(s).toISOString().split('T')[0];
      heatmapCounts[date] = (heatmapCounts[date] || 0) + 1;
    }
    const heatmap = Object.entries(heatmapCounts).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    const streak = calculateStreak(heatmap);

    const def = [
      { key: 'first_blood', label: 'First Blood',   icon: '🎯', desc: 'Solve your first problem',          cur: totalSolved, target: 1 },
      { key: 'getting_started', label: 'Getting Started', icon: '🚀', desc: 'Solve 10 problems',            cur: totalSolved, target: 10 },
      { key: 'half_century', label: 'Half Century', icon: '🔥', desc: 'Solve 50 problems',                  cur: totalSolved, target: 50 },
      { key: 'centurion',  label: 'Centurion',      icon: '🏆', desc: 'Solve 100 problems',                 cur: totalSolved, target: 100 },
      { key: 'week_streak', label: 'On Fire',       icon: '📅', desc: '7-day solving streak',               cur: streak, target: 7 },
      { key: 'month_streak', label: 'Unstoppable',  icon: '⚡', desc: '30-day solving streak',              cur: streak, target: 30 },
      { key: 'night_owl',  label: 'Night Owl',      icon: '🦉', desc: 'Solve a problem after midnight',     cur: nightOwl ? 1 : 0, target: 1 },
      { key: 'graph_master', label: 'Graph Master', icon: '🕸️', desc: 'Solve 10 graph problems',           cur: topic['graph'] || 0, target: 10 },
      { key: 'dp_master',  label: 'DP Wizard',      icon: '🧠', desc: 'Solve 10 dynamic programming problems', cur: topic['dynamic programming'] || 0, target: 10 },
      { key: 'polyglot',   label: 'Polyglot',       icon: '🌐', desc: 'Solve in 3 different languages',     cur: langs, target: 3 },
    ];

    const badges = def.map(b => ({
      key: b.key, label: b.label, icon: b.icon, desc: b.desc,
      earned: b.cur >= b.target,
      progress: Math.min(100, Math.round((b.cur / b.target) * 100)),
      cur: b.cur, target: b.target,
    }));

    res.json({ success: true, data: { badges, earnedCount: badges.filter(b => b.earned).length } });
  } catch (error) {
    console.error('Badges error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch badges' });
  }
};

// @desc    Self strengths/weaknesses + difficulty progression, so a student sees
//          the same skill-gap analysis faculty see on the drill-down page.
// @route   GET /api/student/skills
exports.getSkills = async (req, res) => {
  try {
    const userId = req.user.id;
    const [masteryRows, mySubs] = await Promise.all([
      topicMasteryRepo.listByUser(userId),
      submissionRepo.listByUser(userId),
    ]);

    const { strengths, weaknesses } = computeStrengthsWeaknesses(masteryRows.map(m => ({
      topic: m.topic, solved_count: m.solvedCount, failed_count: m.failedCount, hint_usage_count: m.hintUsageCount,
    })));
    const acceptedIds = [...new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId))];
    const skillsProblemsMap = await problemRepo.getMapByIds(acceptedIds);
    const byDifficulty = {};
    for (const p of skillsProblemsMap.values()) {
      const d = p.difficulty || 'Unknown';
      byDifficulty[d] = (byDifficulty[d] || 0) + 1;
    }
    const difficultyProgression = Object.entries(byDifficulty).map(([difficulty, solved]) => ({ difficulty, solved }));

    res.json({ success: true, data: { strengths, weaknesses, difficultyProgression } });
  } catch (error) {
    console.error('getSkills error:', error);
    res.status(500).json({ success: false, error: 'Failed to load skills' });
  }
};

exports.getSolvedProblems = async (req, res) => {
  try {
    const userId = req.user.id;
    const mySubs = await submissionRepo.listByUser(userId);
    const solvedIds = [...new Set(mySubs.filter(s => s.verdict === 'Accepted').map(s => s.problemId))];
    res.json({ success: true, data: solvedIds });
  } catch (error) {
    console.error('Solved Problems Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch solved problems' });
  }
};
