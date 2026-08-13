const { canManageOwnedBy } = require('../middleware/role.middleware');
const userRepo = require('../repositories/userRepository');
const problemRepo = require('../repositories/problemRepository');
const contestRepo = require('../repositories/contestRepository');

const VALID_MODES = ['public', 'frozen', 'hidden'];

// ── Faculty: create contest ────────────────────────────────────────────────────

exports.createContest = async (req, res) => {
  try {
    const { title, description, starts_at, ends_at, problem_ids = [],
            scoreboard_mode = 'public', freeze_at = null } = req.body;

    if (!title || !starts_at || !ends_at) {
      return res.status(400).json({ success: false, error: 'title, starts_at, ends_at are required' });
    }
    if (!VALID_MODES.includes(scoreboard_mode)) {
      return res.status(400).json({ success: false, error: 'scoreboard_mode must be public | frozen | hidden' });
    }
    if (new Date(ends_at) <= new Date(starts_at)) {
      return res.status(400).json({ success: false, error: 'ends_at must be after starts_at' });
    }
    if (scoreboard_mode === 'frozen' && !freeze_at) {
      return res.status(400).json({ success: false, error: 'freeze_at is required for frozen mode' });
    }

    const contest = await contestRepo.create({
      facultyId: req.user.id, title, description: description || null,
      startsAt: starts_at, endsAt: ends_at, scoreboardMode: scoreboard_mode, freezeAt: freeze_at || null,
      problemIds: problem_ids,
    });

    res.status(201).json({ success: true, data: { id: contest.id } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Faculty: update scoreboard mode ───────────────────────────────────────────

exports.updateScoreboardMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { scoreboard_mode, freeze_at } = req.body;

    if (!VALID_MODES.includes(scoreboard_mode)) {
      return res.status(400).json({ success: false, error: 'scoreboard_mode must be public | frozen | hidden' });
    }

    const contest = await contestRepo.getById(id);
    if (!contest || !(await canManageOwnedBy(req, contest.facultyId))) {
      return res.status(404).json({ success: false, error: 'Contest not found' });
    }

    const updated = await contestRepo.update(id, { scoreboardMode: scoreboard_mode, freezeAt: freeze_at || null });
    res.json({ success: true, data: { id: updated.id, scoreboard_mode: updated.scoreboardMode, freeze_at: updated.freezeAt } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Public: list contests ─────────────────────────────────────────────────────

exports.listContests = async (req, res) => {
  try {
    const contests = await contestRepo.listAll();
    const usersMap = await userRepo.getAllUsersMap();
    const data = await Promise.all(contests.map(async (c) => ({
      id: c.id, title: c.title, description: c.description,
      starts_at: c.startsAt, ends_at: c.endsAt, scoreboard_mode: c.scoreboardMode, freeze_at: c.freezeAt,
      created_at: c.createdAt, faculty_id: c.facultyId,
      problem_count: (c.problemIds || []).length,
      registrant_count: await contestRepo.getRegistrationCount(c.id),
      host_name: usersMap.get(c.facultyId)?.name || 'Unknown',
    })));
    data.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Public: get single contest ────────────────────────────────────────────────

exports.getContest = async (req, res) => {
  try {
    const { id } = req.params;
    const contest = await contestRepo.getById(id);
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });
    const hostProfile = await userRepo.getById(contest.facultyId, 'faculty');

    const problemsMap = await problemRepo.getMapByIds(contest.problemIds || []);
    const problems = (contest.problemIds || []).map((pid, i) => {
      const p = problemsMap.get(pid);
      return { id: pid, title: p?.title || 'Unknown', difficulty: p?.difficulty, tags: p?.tags || [], sort_order: i };
    });

    res.json({
      success: true,
      data: {
        id: contest.id, title: contest.title, description: contest.description,
        starts_at: contest.startsAt, ends_at: contest.endsAt,
        scoreboard_mode: contest.scoreboardMode, freeze_at: contest.freezeAt,
        faculty_id: contest.facultyId, host_name: hostProfile?.name || 'Unknown',
        problems,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Public: register for contest ──────────────────────────────────────────────

exports.register = async (req, res) => {
  try {
    const { id } = req.params;
    await contestRepo.addRegistration(id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Public: scoreboard ────────────────────────────────────────────────────────
// Scoreboard rules:
//   mode=public  → always show live standings
//   mode=frozen  → show standings up to freeze_at; after freeze, own row is live, rest are frozen
//   mode=hidden  → faculty sees live; students see nothing during contest, live after end

exports.getScoreboard = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;

    const contest = await contestRepo.getById(id);
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });

    const now = new Date();
    const contestOver = now > new Date(contest.endsAt);
    const isFaculty = requesterRole === 'faculty' || requesterRole === 'admin'
                      || String(contest.facultyId) === String(requesterId);

    // Hidden mode: students see nothing during contest
    if (contest.scoreboardMode === 'hidden' && !isFaculty && !contestOver) {
      return res.json({ success: true, data: [], hidden: true });
    }

    // Cutoff time for frozen mode
    let cutoff = null;
    if (contest.scoreboardMode === 'frozen' && !isFaculty && !contestOver) {
      cutoff = contest.freezeAt ? new Date(contest.freezeAt) : null;
    }

    const problemIds = contest.problemIds || [];

    // All submissions (respecting cutoff for frozen)
    const allSubs = (await contestRepo.listSubmissions(id))
      .sort((a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));
    const usersMap = await userRepo.getAllUsersMap();

    // Aggregate per user
    const board = {};
    for (const sub of allSubs) {
      const uid = sub.userId;
      if (!board[uid]) {
        const profile = usersMap.get(uid) || {};
        board[uid] = {
          user_id: uid, name: profile.name || 'Unknown', email: profile.email || null,
          solved: 0, penalty: 0, problems: {},
          is_frozen_row: false,
        };
      }
      const entry = board[uid];
      const pid   = sub.problemId;
      if (!entry.problems[pid]) entry.problems[pid] = { accepted: false, attempts: 0, penalty: 0 };
      const p = entry.problems[pid];
      if (p.accepted) continue; // already solved — ignore later subs

      // In frozen mode, non-faculty see subs only up to cutoff
      const isOwn = uid === requesterId;
      const subTime = sub.submittedAt?.toDate?.() ?? new Date(sub.submittedAt);
      if (cutoff && !isOwn && subTime > cutoff) {
        entry.is_frozen_row = true;
        continue;
      }

      p.attempts++;
      if (sub.verdict === 'Accepted') {
        p.accepted = true;
        const minutesFromStart = Math.floor((subTime - new Date(contest.startsAt)) / 60000);
        p.penalty = (p.attempts - 1) * 20 + minutesFromStart; // 20-min penalty per WA
        entry.solved++;
        entry.penalty += p.penalty;
      }
    }

    const rows = Object.values(board).sort((a, b) =>
      b.solved !== a.solved ? b.solved - a.solved : a.penalty - b.penalty
    );

    const frozen = contest.scoreboardMode === 'frozen' && !isFaculty && !contestOver
      && cutoff && now > cutoff;

    res.json({
      success: true,
      data: rows,
      problem_ids: problemIds,
      scoreboard_mode: contest.scoreboardMode,
      frozen,
      freeze_at: contest.freezeAt,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── Feature 6: Virtual participation ─────────────────────────────────────────

exports.startVirtual = async (req, res) => {
  try {
    const { id: contestId } = req.params;
    const userId = req.user.id;

    const contest = await contestRepo.getById(contestId);
    if (!contest) return res.status(404).json({ success: false, error: 'Contest not found' });
    if (new Date() < new Date(contest.endsAt)) {
      return res.status(400).json({ success: false, error: 'Contest is still running — join the live contest instead' });
    }

    const vp = await contestRepo.startVirtualParticipation(contestId, userId);
    res.json({ success: true, data: vp });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Personal virtual scoreboard — shows only this user's virtual submissions
exports.getVirtualScoreboard = async (req, res) => {
  try {
    const { id: contestId } = req.params;
    const userId = req.user.id;

    const vp = await contestRepo.getVirtualParticipation(contestId, userId);
    if (!vp) return res.status(404).json({ success: false, error: 'No virtual participation found. Start one first.' });

    const contest = await contestRepo.getById(contestId);
    const problemIds = contest?.problemIds || [];

    const subs = (await contestRepo.listSubmissionsByUser(contestId, userId, { virtualOnly: true }))
      .sort((a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0));

    const board = {};
    let totalSolved = 0;
    let totalPenalty = 0;

    for (const sub of subs) {
      const pid = sub.problemId;
      if (!board[pid]) board[pid] = { accepted: false, attempts: 0, penalty: 0, elapsed: 0 };
      const p = board[pid];
      if (p.accepted) continue;
      p.attempts++;
      if (sub.verdict === 'Accepted') {
        p.accepted = true;
        p.elapsed  = sub.virtualElapsedMinutes || 0;
        p.penalty  = (p.attempts - 1) * 20 + p.elapsed;
        totalSolved++;
        totalPenalty += p.penalty;
      }
    }

    res.json({
      success: true,
      data: {
        started_at: vp.startedAt,
        problem_ids: problemIds,
        problems: board,
        solved: totalSolved,
        penalty: totalPenalty,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
