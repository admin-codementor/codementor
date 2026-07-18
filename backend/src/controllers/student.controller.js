const db = require('../config/db');
const { computeStrengthsWeaknesses } = require('../utils/topicScores');

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

exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Total Submissions & AC Rate
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total_submissions,
        SUM(CASE WHEN verdict = 'Accepted' THEN 1 ELSE 0 END) as total_accepted
      FROM code_submissions
      WHERE user_id = $1
    `, [userId]);

    const totalSubs = parseInt(statsResult.rows[0].total_submissions) || 0;
    const totalAccepted = parseInt(statsResult.rows[0].total_accepted) || 0;
    const acRate = totalSubs > 0 ? Math.round((totalAccepted / totalSubs) * 100) : 0;

    // 2. Problems Solved (Unique)
    const solvedResult = await db.query(`
      SELECT COUNT(DISTINCT problem_id) as problems_solved
      FROM code_submissions
      WHERE user_id = $1 AND verdict = 'Accepted'
    `, [userId]);
    const problemsSolved = parseInt(solvedResult.rows[0].problems_solved) || 0;

    // 3. Languages Used
    const langResult = await db.query(`
      SELECT language, COUNT(*) as count
      FROM code_submissions
      WHERE user_id = $1
      GROUP BY language
      ORDER BY count DESC
    `, [userId]);
    const languages = langResult.rows;

    // 4. Heatmap Data (last 12 months)
    const heatmapResult = await db.query(`
      SELECT DATE(submitted_at) as date, COUNT(*) as count
      FROM code_submissions
      WHERE user_id = $1 AND submitted_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE(submitted_at)
      ORDER BY date ASC
    `, [userId]);
    const heatmap = heatmapResult.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      count: parseInt(r.count)
    }));

    // 5. Real streak calculation
    const streak = calculateStreak(heatmap);

    // 6. Real rank from leaderboard
    const rankResult = await db.query(`
      SELECT rank FROM (
        SELECT
          u.id,
          ROW_NUMBER() OVER (
            ORDER BY COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) DESC
          ) AS rank
        FROM users u
        LEFT JOIN code_submissions s ON u.id = s.user_id
        WHERE u.role = 'student'
        GROUP BY u.id
      ) ranked
      WHERE id = $1
    `, [userId]);
    const rank = rankResult.rows.length > 0 ? parseInt(rankResult.rows[0].rank) : 0;

    // 6b. Contest rating (Elo)
    const ratingResult = await db.query(`SELECT rating FROM users WHERE id = $1`, [userId]);
    const rating = ratingResult.rows.length > 0 && ratingResult.rows[0].rating != null
      ? parseInt(ratingResult.rows[0].rating, 10)
      : 1200;

    // 7. Topics Analytics from mastery table (with fallback to submissions)
    const topicsResult = await db.query(`
      SELECT topic, solved_count, failed_count
      FROM student_topic_mastery
      WHERE user_id = $1
    `, [userId]);

    let masteredTopics = topicsResult.rows.map(r => ({
      topic: r.topic,
      mastery: Math.min(100, parseInt(r.solved_count) * 20)
    }));

    // Fallback: derive from submissions if mastery table is empty
    if (masteredTopics.length === 0) {
      const fallbackResult = await db.query(`
        SELECT unnest(p.tags) as topic, COUNT(DISTINCT s.problem_id) as solved_count
        FROM code_submissions s
        JOIN problems p ON s.problem_id = p.id
        WHERE s.user_id = $1 AND s.verdict = 'Accepted'
        GROUP BY unnest(p.tags)
      `, [userId]);
      masteredTopics = fallbackResult.rows.map(r => ({
        topic: r.topic,
        mastery: Math.min(100, parseInt(r.solved_count) * 20)
      }));
    }

    // Recent submissions for the dashboard widget
    const recentResult = await db.query(`
      SELECT s.verdict, s.language, s.submitted_at AS created_at,
             p.title AS problem_title, p.id AS problem_id
        FROM code_submissions s
        JOIN problems p ON p.id = s.problem_id
       WHERE s.user_id = $1
       ORDER BY s.submitted_at DESC
       LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      data: {
        stats: { totalSubs, acRate, problemsSolved, streak, rank, rating },
        languages,
        heatmap,
        topics: masteredTopics,
        recentSubmissions: recentResult.rows
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

    const { rows } = await db.query(`
      SELECT
        a.id as assignment_id,
        a.title as assignment_title,
        a.deadline,
        a.is_exam,
        p.id as problem_id,
        p.title as problem_title,
        p.difficulty,
        EXISTS (
          SELECT 1 FROM code_submissions cs
          WHERE cs.user_id = $1 AND cs.problem_id = p.id AND cs.verdict = 'Accepted'
        ) as is_solved
      FROM assignments a
      JOIN assignment_problems ap ON a.id = ap.assignment_id
      JOIN problems p ON ap.problem_id = p.id
      ORDER BY a.deadline ASC
    `, [userId]);

    const assignmentsMap = new Map();
    rows.forEach(r => {
      if (!assignmentsMap.has(r.assignment_id)) {
        assignmentsMap.set(r.assignment_id, {
          id: r.assignment_id,
          title: r.assignment_title,
          deadline: r.deadline,
          isExam: r.is_exam === true,
          problems: []
        });
      }
      assignmentsMap.get(r.assignment_id).problems.push({
        id: r.problem_id,
        title: r.problem_title,
        difficulty: r.difficulty,
        is_solved: r.is_solved
      });
    });

    const assignments = Array.from(assignmentsMap.values()).map(a => ({
      ...a,
      total: a.problems.length,
      solved: a.problems.filter(p => p.is_solved).length
    }));

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('Get Assignments Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch assignments' });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    // Return assignments due within 48 hours as notifications
    const { rows } = await db.query(`
      SELECT a.id, a.title, a.deadline
      FROM assignments a
      WHERE a.deadline BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
      ORDER BY a.deadline ASC
      LIMIT 10
    `);

    const notifications = rows.map(r => ({
      id: r.id,
      type: 'deadline',
      message: `Assignment "${r.title}" is due soon`,
      deadline: r.deadline
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
    // ── Adaptive difficulty: pick a target band from recent performance ──────────
    // Recent acceptance rate (last 20 submissions) gauges whether to push or ease.
    const recentRes = await db.query(`
      SELECT verdict FROM code_submissions
      WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 20
    `, [userId]);
    const recentTotal = recentRes.rows.length;
    const recentAcc = recentRes.rows.filter(r => r.verdict === 'Accepted').length;
    const recentAcRate = recentTotal > 0 ? recentAcc / recentTotal : 0;

    // Distinct solved problems per difficulty → current demonstrated level.
    const diffRes = await db.query(`
      SELECT lower(p.difficulty) AS difficulty, COUNT(DISTINCT s.problem_id) AS solved
      FROM code_submissions s JOIN problems p ON p.id = s.problem_id
      WHERE s.user_id = $1 AND s.verdict = 'Accepted'
      GROUP BY lower(p.difficulty)
    `, [userId]);
    const solved = { easy: 0, medium: 0, hard: 0 };
    diffRes.rows.forEach(r => { if (solved[r.difficulty] !== undefined) solved[r.difficulty] = parseInt(r.solved) || 0; });

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
    const weakTopicsResult = await db.query(`
      SELECT topic FROM student_topic_mastery
      WHERE user_id = $1 AND solved_count < 3
      ORDER BY failed_count DESC LIMIT 5
    `, [userId]);
    const weakTopics = weakTopicsResult.rows.map(r => r.topic);
    const weakParam = weakTopics.length ? weakTopics : ['__none__'];

    // Unsolved problems in the target band, weak topics first, then band preference.
    let { rows: problems } = await db.query(`
      SELECT p.id, p.title, p.difficulty, p.tags
      FROM problems p
      WHERE lower(p.difficulty) = ANY($2::text[])
        AND p.id NOT IN (
          SELECT DISTINCT problem_id FROM code_submissions WHERE user_id = $1 AND verdict = 'Accepted'
        )
      ORDER BY
        (CASE WHEN p.tags && $3::text[] THEN 0 ELSE 1 END),
        array_position($2::text[], lower(p.difficulty)),
        RANDOM()
      LIMIT 6
    `, [userId, band, weakParam]);

    // Fallback: any unsolved, easiest first.
    if (problems.length === 0) {
      const r = await db.query(`
        SELECT p.id, p.title, p.difficulty, p.tags FROM problems p
        WHERE p.id NOT IN (SELECT DISTINCT problem_id FROM code_submissions WHERE user_id = $1 AND verdict = 'Accepted')
        ORDER BY CASE lower(difficulty) WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, RANDOM()
        LIMIT 6
      `, [userId]);
      problems = r.rows;
    }

    res.json({ success: true, data: problems, level, recentAcRate: Math.round(recentAcRate * 100) });
  } catch (error) {
    console.error('Recommendation Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recommendations' });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        u.id,
        u.name,
        u.rating,
        u.department,
        u.section,
        COUNT(DISTINCT CASE WHEN s.verdict = 'Accepted' THEN s.problem_id END) as solved_count,
        COUNT(s.id) as total_submissions
      FROM users u
      LEFT JOIN code_submissions s ON u.id = s.user_id
      WHERE u.role = 'student'
      GROUP BY u.id, u.name, u.rating, u.department, u.section
      ORDER BY solved_count DESC, u.name ASC
      LIMIT 100
    `);

    const leaderboard = rows.map((r, index) => ({
      id: r.id,
      rank: index + 1,
      name: r.name,
      rating: r.rating != null ? parseInt(r.rating, 10) : 1200,
      department: r.department || null,
      section: r.section || null,
      score: parseInt(r.solved_count) * 10,
      solvedCount: parseInt(r.solved_count),
      totalSubmissions: parseInt(r.total_submissions)
    }));

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

    const { rows } = await db.query(
      'SELECT id, title, difficulty, tags FROM problems ORDER BY created_at ASC'
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const problem = rows[dateHash % rows.length];
    res.json({ success: true, data: problem });
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
      await db.query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), userId]);
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
    // Whitelist → fixed interval strings (no user input interpolated into SQL).
    const INTERVALS = { '7d': '7 days', '30d': '30 days', '6mo': '6 months' };
    const interval = INTERVALS[req.query.period];
    const period = interval ? req.query.period : 'all';
    const timeClause = interval ? `AND submitted_at >= NOW() - INTERVAL '${interval}'` : '';

    const [verdictRes, langRes] = await Promise.all([
      db.query(
        `SELECT verdict, COUNT(*)::int AS n FROM code_submissions
         WHERE user_id = $1 ${timeClause} GROUP BY verdict`,
        [userId],
      ),
      db.query(
        `SELECT language, COUNT(*)::int AS n FROM code_submissions
         WHERE user_id = $1 ${timeClause} GROUP BY language ORDER BY n DESC`,
        [userId],
      ),
    ]);

    const total = verdictRes.rows.reduce((a, r) => a + r.n, 0);
    res.json({
      success: true,
      data: {
        period,
        total,
        verdicts: verdictRes.rows,   // [{ verdict, n }]
        languages: langRes.rows,     // [{ language, n }]
      },
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
    const { rows: tagRows } = await db.query(`
      SELECT unnest(p.tags) AS topic, COUNT(DISTINCT s.problem_id) AS solved
        FROM code_submissions s
        JOIN problems p ON p.id = s.problem_id
       WHERE s.user_id = $1 AND s.verdict = 'Accepted'
       GROUP BY unnest(p.tags)
    `, [userId]);
    const solvedByTopic = {};
    tagRows.forEach(r => { solvedByTopic[r.topic.toLowerCase()] = parseInt(r.solved) || 0; });

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
      const { rows } = await db.query(`
        SELECT id, title, difficulty, tags
          FROM problems
         WHERE tags && $1::text[]
           AND id NOT IN (SELECT DISTINCT problem_id FROM code_submissions WHERE user_id = $2 AND verdict = 'Accepted')
         ORDER BY CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, RANDOM()
         LIMIT 6
      `, [weakTopics, userId]);
      recommended = rows;
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
    const mine = await db.query(
      `SELECT 1 FROM code_submissions WHERE user_id=$1 AND problem_id=$2 AND verdict='Accepted' LIMIT 1`,
      [userId, id]
    );
    if (!mine.rows.length) {
      return res.status(403).json({ success: false, error: 'Solve this problem first to unlock community solutions.' });
    }

    // Latest accepted submission per other student.
    const { rows } = await db.query(`
      SELECT DISTINCT ON (s.user_id) s.id, s.language, s.runtime, s.code, u.name
        FROM code_submissions s JOIN users u ON u.id = s.user_id
       WHERE s.problem_id = $1 AND s.verdict = 'Accepted' AND s.user_id <> $2
       ORDER BY s.user_id, s.submitted_at DESC
    `, [id, userId]);

    const solutions = rows
      .sort((a, b) => (a.runtime ?? 1e9) - (b.runtime ?? 1e9))
      .slice(0, 5)
      .map(r => ({ id: r.id, author: r.name, language: r.language, runtime: r.runtime, code: r.code }));

    res.json({ success: true, data: solutions });
  } catch (error) {
    console.error('Peer solutions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch solutions' });
  }
};

exports.getBadges = async (req, res) => {
  const userId = req.user.id;
  try {
    const [solvedRes, nightRes, langRes, topicRes, heatmapRes] = await Promise.all([
      db.query(`SELECT COUNT(DISTINCT problem_id)::int AS n FROM code_submissions WHERE user_id=$1 AND verdict='Accepted'`, [userId]),
      db.query(`SELECT EXISTS(SELECT 1 FROM code_submissions WHERE user_id=$1 AND verdict='Accepted' AND EXTRACT(HOUR FROM submitted_at) BETWEEN 0 AND 4) AS owl`, [userId]),
      db.query(`SELECT COUNT(DISTINCT language)::int AS n FROM code_submissions WHERE user_id=$1 AND verdict='Accepted'`, [userId]),
      db.query(`SELECT unnest(p.tags) AS topic, COUNT(DISTINCT s.problem_id)::int AS n
                FROM code_submissions s JOIN problems p ON p.id=s.problem_id
                WHERE s.user_id=$1 AND s.verdict='Accepted' GROUP BY unnest(p.tags)`, [userId]),
      db.query(`SELECT DATE(submitted_at) as date, COUNT(*) as count FROM code_submissions
                WHERE user_id=$1 AND submitted_at >= NOW() - INTERVAL '12 months'
                GROUP BY DATE(submitted_at) ORDER BY date ASC`, [userId]),
    ]);

    const totalSolved = solvedRes.rows[0].n || 0;
    const nightOwl = nightRes.rows[0].owl === true;
    const langs = langRes.rows[0].n || 0;
    const topic = {};
    topicRes.rows.forEach(r => { topic[r.topic.toLowerCase()] = r.n; });
    const heatmap = heatmapRes.rows.map(r => ({ date: r.date.toISOString().split('T')[0], count: parseInt(r.count) }));
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
    const [masteryRes, difficultyRes] = await Promise.all([
      db.query(`
        SELECT topic, solved_count, failed_count, hint_usage_count
          FROM student_topic_mastery WHERE user_id = $1
      `, [userId]),
      db.query(`
        SELECT p.difficulty, COUNT(DISTINCT s.problem_id) AS solved
          FROM code_submissions s JOIN problems p ON p.id = s.problem_id
         WHERE s.user_id = $1 AND s.verdict = 'Accepted'
         GROUP BY p.difficulty
      `, [userId]),
    ]);

    const { strengths, weaknesses } = computeStrengthsWeaknesses(masteryRes.rows);
    const difficultyProgression = difficultyRes.rows.map(r => ({
      difficulty: r.difficulty || 'Unknown', solved: parseInt(r.solved) || 0,
    }));

    res.json({ success: true, data: { strengths, weaknesses, difficultyProgression } });
  } catch (error) {
    console.error('getSkills error:', error);
    res.status(500).json({ success: false, error: 'Failed to load skills' });
  }
};

exports.getSolvedProblems = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await db.query(`
      SELECT DISTINCT problem_id
      FROM code_submissions
      WHERE user_id = $1 AND verdict = 'Accepted'
    `, [userId]);

    // Return UUIDs as-is (not parseInt — problem IDs are UUIDs)
    const solvedIds = rows.map(r => r.problem_id);
    res.json({ success: true, data: solvedIds });
  } catch (error) {
    console.error('Solved Problems Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch solved problems' });
  }
};
