const userRepo = require('../repositories/userRepository');
const ratingHistoryRepo = require('../repositories/ratingHistoryRepository');
const contestRepo = require('../repositories/contestRepository');

// ── Elo / Codeforces-style rating engine ──────────────────────────────────────
//
// We treat a contest as a round-robin of pairwise games. For every ordered pair
// of distinct participants (i, j) we compute player i's expected score against j
// using the logistic Elo formula, then compare it to the actual outcome
// (1 = i ranked above j, 0.5 = tie, 0 = i ranked below j). The participant's new
// rating is their seed rating plus K times the (actual − expected) sum, averaged
// over all opponents.
//
//   E_ij      = 1 / (1 + 10^((R_j − R_i) / 400))
//   S_ij      = 1 if rank_i < rank_j (better), 0.5 if equal, 0 otherwise
//   delta_i   = K * Σ_j (S_ij − E_ij) / (n − 1)
//   newR_i    = round(R_i + delta_i)
//
// K = 40 (moderately reactive; standard for active rating systems).
//
// `participants` is an array of { user_id, rating, rank } where lower rank == better
// standing. Returns an array of { user_id, old_rating, new_rating, rank }.
const K_FACTOR = 40;

const computeEloUpdates = (participants) => {
  const n = participants.length;
  if (n === 0) return [];
  // A single participant has no opponents — rating is unchanged.
  if (n === 1) {
    const p = participants[0];
    return [{ user_id: p.user_id, old_rating: p.rating, new_rating: p.rating, rank: p.rank }];
  }

  return participants.map((self) => {
    let expected = 0;
    let actual = 0;
    for (const opp of participants) {
      if (opp.user_id === self.user_id) continue;
      expected += 1 / (1 + Math.pow(10, (opp.rating - self.rating) / 400));
      if (self.rank < opp.rank) actual += 1;
      else if (self.rank === opp.rank) actual += 0.5;
      // self.rank > opp.rank contributes 0
    }
    const delta = (K_FACTOR * (actual - expected)) / (n - 1);
    const newRating = Math.round(self.rating + delta);
    return {
      user_id: self.user_id,
      old_rating: self.rating,
      new_rating: newRating,
      rank: self.rank,
    };
  });
};

// ── Build final standings from contest_submissions ────────────────────────────
// ACM scoring identical to getScoreboard: solved DESC, penalty ASC.
// First Accepted submission per (user, problem) counts; earlier WAs add 20-min
// penalties. Only non-virtual submissions are counted toward official rating.
const buildStandings = async (contestId, contestStartsAt) => {
  const subs = (await contestRepo.listSubmissions(contestId))
    .filter(s => s.isVirtual !== true)
    .sort((a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));

  const board = {};
  for (const sub of subs) {
    const uid = sub.userId;
    if (!board[uid]) board[uid] = { user_id: uid, solved: 0, penalty: 0, problems: {} };
    const entry = board[uid];
    const pid = sub.problemId;
    if (!entry.problems[pid]) entry.problems[pid] = { accepted: false, attempts: 0 };
    const p = entry.problems[pid];
    if (p.accepted) continue;

    p.attempts++;
    if (sub.verdict === 'Accepted') {
      p.accepted = true;
      const subTime = sub.submittedAt?.toDate?.() ?? new Date(sub.submittedAt);
      const minutesFromStart = Math.floor((subTime - new Date(contestStartsAt)) / 60000);
      const penalty = (p.attempts - 1) * 20 + minutesFromStart;
      entry.solved++;
      entry.penalty += penalty;
    }
  }

  const standings = Object.values(board).sort((a, b) =>
    b.solved !== a.solved ? b.solved - a.solved : a.penalty - b.penalty
  );

  // Assign competition ranks (ties share a rank).
  let rank = 0;
  let lastSolved = null;
  let lastPenalty = null;
  standings.forEach((entry, idx) => {
    if (entry.solved !== lastSolved || entry.penalty !== lastPenalty) {
      rank = idx + 1;
      lastSolved = entry.solved;
      lastPenalty = entry.penalty;
    }
    entry.rank = rank;
  });

  return standings;
};

// ── Faculty/admin: recompute ratings for a finished contest ────────────────────
// Idempotency guard: if rating_history rows already exist for this contest we
// refuse to recompute, since re-running would double-apply the Elo deltas to the
// stored users.rating. To re-run, the existing rating_history rows for the
// contest must be deleted first.
exports.recomputeForContest = async (req, res) => {
  try {
    const { id: contestId } = req.params;

    const contest = await contestRepo.getById(contestId);
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });

    const existingCount = await ratingHistoryRepo.countByContest(contestId);
    if (existingCount > 0) {
      return res.status(409).json({
        success: false,
        error: 'Ratings have already been computed for this contest. Delete its rating_history rows to recompute.',
      });
    }

    const standings = await buildStandings(contestId, contest.startsAt);
    if (standings.length === 0) {
      return res.status(400).json({ success: false, error: 'No submissions to rate for this contest.' });
    }

    // Seed each participant with their current rating.
    const userIds = standings.map(s => s.user_id);
    const profiles = (await Promise.all(userIds.map(id => userRepo.getById(id)))).filter(Boolean);
    const ratingMap = new Map(profiles.map(p => [p.id, p.rating ?? 1200]));

    const participants = standings.map(s => ({
      user_id: s.user_id,
      rating: ratingMap.has(s.user_id) ? ratingMap.get(s.user_id) : 1200,
      rank: s.rank,
    }));

    const updates = computeEloUpdates(participants);

    // Persist new ratings + history rows (both Firestore now).
    for (const u of updates) {
      const profile = profiles.find(p => p.id === u.user_id);
      await userRepo.update(u.user_id, profile?.role, { rating: u.new_rating });
      await ratingHistoryRepo.create({
        userId: u.user_id, contestId, oldRating: u.old_rating, newRating: u.new_rating, rank: u.rank,
      });
    }

    const results = updates
      .map(u => ({ ...u, delta: u.new_rating - u.old_rating }))
      .sort((a, b) => a.rank - b.rank);

    res.json({ success: true, data: { contest_id: contestId, participants: results.length, results } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Get a single user's current rating + history ───────────────────────────────
exports.getUserRating = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await userRepo.getById(userId);
    if (!profile) return res.status(404).json({ success: false, error: 'User not found' });
    const user = { id: profile.id, name: profile.name, rating: profile.rating ?? 1200 };

    const history = await ratingHistoryRepo.listByUser(userId);
    const contestIds = [...new Set(history.map(h => h.contestId).filter(Boolean))];
    const contestTitleMap = new Map(
      (await Promise.all(contestIds.map(id => contestRepo.getById(id)))).filter(Boolean).map(c => [c.id, c.title])
    );

    res.json({
      success: true,
      data: {
        user_id: user.id,
        name: user.name,
        rating: user.rating,
        history: history.map(h => ({
          id: h.id,
          contest_id: h.contestId,
          contest_title: contestTitleMap.get(h.contestId) || 'Untitled contest',
          old_rating: h.oldRating,
          new_rating: h.newRating,
          delta: h.newRating - h.oldRating,
          rank: h.rank,
          created_at: h.createdAt?.toDate?.() ?? h.createdAt,
        })),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Rating leaderboard ─────────────────────────────────────────────────────────
exports.getRatingLeaderboard = async (req, res) => {
  try {
    const usersMap = await userRepo.getAllUsersMap();
    const ids = [...usersMap.keys()];

    // Count distinct contests participated, grouped by user, from Firestore.
    const allHistoryDocs = await Promise.all(ids.map(id => ratingHistoryRepo.listByUser(id)));
    const contestsParticipatedMap = new Map(
      ids.map((id, i) => [id, new Set(allHistoryDocs[i].map(h => h.contestId)).size])
    );

    const data = ids
      .map(id => ({
        id,
        name: usersMap.get(id)?.name || 'Unknown',
        rating: usersMap.get(id)?.rating ?? 1200,
        contestsParticipated: contestsParticipatedMap.get(id) || 0,
      }))
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
      .slice(0, 100)
      .map((r, index) => ({ ...r, rank: index + 1 }));

    res.json({ success: true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Exported for unit testing / reuse.
exports.computeEloUpdates = computeEloUpdates;
