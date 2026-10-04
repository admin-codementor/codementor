// The one endpoint in this app that answers without a token.
//
// Everything about it is written defensively, because a recruiter opening a
// link is the only visitor it is for and anyone at all can be the visitor it
// gets. Three rules:
//
//   1. Nothing personal. No email, no phone, no roll number, no class section,
//      no identifiers that tie the profile to a record anywhere else. Name,
//      college, department and year, because those are what the link is for.
//   2. Nothing unverified. Solve counts come from our own judge. An external
//      platform appears only after the student has proved they own the account
//      by putting a one-time code on it.
//   3. Nothing by default. `published` starts false and the student turns it
//      on; turning it off makes the link 404 immediately.
//
// The response is assembled field by field from the sources rather than by
// spreading a user document and deleting what should not go out — the second
// shape leaks whatever gets added to users later, and nobody notices.
const userRepo = require('../repositories/userRepository');
const publicHandleRepo = require('../repositories/publicHandleRepository');
const submissionRepo = require('../repositories/submissionRepository');
const problemRepo = require('../repositories/problemRepository');
const courseRepo = require('../repositories/courseRepository');
const codingProfileRepo = require('../repositories/codingProfileRepository');
const roadmapRepo = require('../repositories/roadmapRepository');
const { buildCatalog, resolveRoadmap } = require('../services/roadmapService');
const { jobReadinessFor } = require('./jobReadiness.controller');

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const DAY_MS = 86_400_000;

// Handles that would let a profile impersonate the platform or sit at a path
// the app might want later.
const RESERVED = new Set([
  'admin', 'administrator', 'api', 'app', 'faculty', 'hod', 'login', 'logout', 'register',
  'codementor', 'support', 'help', 'about', 'settings', 'profile', 'student', 'staff',
  'me', 'you', 'new', 'null', 'undefined', 'public', 'u',
]);

const isPublished = (p) => (p?.status ?? 'published') !== 'draft';

// Imported problems are routinely tagged with their own difficulty, so "easy"
// and "medium" came back as two of the student's strongest *topics* — which on
// a page whose only job is to look credible reads as a bug.
const NOT_A_TOPIC = new Set(['easy', 'medium', 'hard', 'beginner', 'intermediate', 'advanced']);
const millis = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

function validateHandle(raw) {
  const handle = String(raw || '').trim().toLowerCase();
  if (!handle) return { error: 'Choose a handle for your profile link' };
  if (!HANDLE_RE.test(handle)) {
    return { error: 'Handles are 3–30 characters: lowercase letters, numbers and hyphens, starting with a letter or number' };
  }
  if (RESERVED.has(handle)) return { error: 'That handle is reserved' };
  return { handle };
}

// ── The student's own settings ──────────────────────────────────────────────

// @route GET /api/student/public-profile
exports.getSettings = async (req, res) => {
  try {
    const [me, reservation] = await Promise.all([
      userRepo.getById(req.user.id, req.user.role),
      publicHandleRepo.findByUser(req.user.id),
    ]);
    res.json({
      success: true,
      data: {
        handle: reservation?.handle ?? null,
        published: !!me?.publicProfile?.published,
        showScore: !!me?.publicProfile?.showScore,
        url: reservation ? `/u/${reservation.handle}` : null,
      },
    });
  } catch (error) {
    console.error('publicProfile getSettings error:', error);
    res.status(500).json({ success: false, error: 'Failed to load your profile settings' });
  }
};

// @route PUT /api/student/public-profile   body: { handle?, published?, showScore? }
exports.updateSettings = async (req, res) => {
  try {
    const { handle: rawHandle, published, showScore } = req.body;
    const current = await publicHandleRepo.findByUser(req.user.id);

    let handle = current?.handle ?? null;
    if (rawHandle !== undefined) {
      const checked = validateHandle(rawHandle);
      if (checked.error) return res.status(400).json({ success: false, error: checked.error });
      const reserved = await publicHandleRepo.reserve(req.user.id, checked.handle);
      if (!reserved.ok) return res.status(409).json({ success: false, error: 'That handle is already taken' });
      handle = reserved.handle;
    }

    // Publishing without a handle would give the student a switch that turns on
    // a page with no address.
    if (published === true && !handle) {
      return res.status(400).json({ success: false, error: 'Choose a handle before publishing' });
    }

    const next = {
      published: published === undefined ? !!(await userRepo.getById(req.user.id, req.user.role))?.publicProfile?.published : !!published,
      showScore: showScore === undefined ? !!(await userRepo.getById(req.user.id, req.user.role))?.publicProfile?.showScore : !!showScore,
    };
    await userRepo.update(req.user.id, req.user.role, { publicProfile: next });

    res.json({ success: true, data: { handle, ...next, url: handle ? `/u/${handle}` : null } });
  } catch (error) {
    console.error('publicProfile updateSettings error:', error);
    res.status(500).json({ success: false, error: 'Failed to save your profile settings' });
  }
};

// ── The public page ─────────────────────────────────────────────────────────

/** A year's worth of solve counts per day, for the activity grid. */
function activityByDay(acceptedSubs, now) {
  const since = now - 365 * DAY_MS;
  const counts = new Map();
  for (const s of acceptedSubs) {
    const t = millis(s.submittedAt);
    if (t < since) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return [...counts.entries()].sort().map(([date, count]) => ({ date, count }));
}

// @route GET /api/public/profile/:handle   (no token)
exports.getPublicProfile = async (req, res) => {
  try {
    const owner = await publicHandleRepo.getOwner(req.params.handle);
    // Deliberately the same answer for "no such handle" and "not published":
    // otherwise the endpoint reports which handles exist.
    const notFound = () => res.status(404).json({ success: false, error: 'No public profile at that address' });
    if (!owner) return notFound();

    const student = await userRepo.getById(owner.userId, 'student');
    if (!student?.publicProfile?.published) return notFound();

    const [mySubs, problems, courses, codingProfiles] = await Promise.all([
      submissionRepo.listByUser(owner.userId),
      problemRepo.listCatalog(),
      courseRepo.listPublished(),
      codingProfileRepo.listByUser(owner.userId),
    ]);

    const published = problems.filter(isPublished);
    const byId = new Map(published.map((p) => [p.id, p]));
    const acceptedSubs = mySubs.filter((s) => s.verdict === 'Accepted');
    const solvedIds = new Set(acceptedSubs.map((s) => s.problemId));
    const solvedProblems = [...solvedIds].map((id) => byId.get(id)).filter(Boolean);

    const byDifficulty = { easy: 0, medium: 0, hard: 0 };
    const byTopic = new Map();
    for (const p of solvedProblems) {
      const d = String(p.difficulty || '').toLowerCase();
      if (byDifficulty[d] !== undefined) byDifficulty[d] += 1;
      for (const tag of p.tags || []) {
        const key = String(tag).toLowerCase().replace(/[-_]+/g, ' ').trim();
        if (!key || NOT_A_TOPIC.has(key)) continue;
        byTopic.set(key, (byTopic.get(key) || 0) + 1);
      }
    }

    const moduleLists = await Promise.all(courses.map((c) => courseRepo.getModules(c.id)));
    const modules = courses.flatMap((c, i) =>
      moduleLists[i].map((m) => ({
        id: m.id, title: m.title, problemIds: m.problemIds || [], courseId: c.id, courseTitle: c.title,
      })),
    );
    const completedCourses = courses
      .map((c, i) => {
        const ids = [...new Set(moduleLists[i].flatMap((m) => m.problemIds || []))];
        const done = ids.filter((id) => solvedIds.has(id)).length;
        return { title: c.title, total: ids.length, solved: done };
      })
      .filter((c) => c.total > 0 && c.solved === c.total)
      .map((c) => ({ title: c.title, problems: c.total }));

    let roadmap = null;
    if (student.activeRoadmapId) {
      const rm = await roadmapRepo.getById(student.activeRoadmapId);
      if (rm) {
        const resolved = resolveRoadmap(rm, buildCatalog(published, modules), solvedIds, { includeMilestones: false });
        roadmap = { role: resolved.role, percent: resolved.percent, step: resolved.currentStep, steps: resolved.trackedCount };
      }
    }

    let jobReady = null;
    if (student.publicProfile?.showScore) {
      const readiness = await jobReadinessFor(owner.userId, 'student');
      jobReady = readiness.targets.map((t) => ({ key: t.key, label: t.label, score: t.score }));
    }

    const externals = codingProfiles
      // Q-F: verified only. An unverified handle is a claim, and the whole
      // point of this page is that a recruiter does not have to take claims.
      .filter((p) => p.verified)
      .map((p) => ({
        platform: p.platform,
        handle: p.handle,
        solved: p.solved || 0,
        rating: p.rating ?? null,
        verifiedAt: millis(p.verifiedAt) || null,
      }));

    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.json({
      success: true,
      data: {
        handle: owner.handle,
        name: student.name ?? null,
        college: student.college ?? null,
        department: student.department ?? null,
        year: student.year ?? null,
        verified: {
          solved: solvedProblems.length,
          byDifficulty,
          topTopics: [...byTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([topic, count]) => ({ topic, count })),
          activity: activityByDay(acceptedSubs, Date.now()),
        },
        completedCourses,
        roadmap,
        jobReady,
        externals,
      },
    });
  } catch (error) {
    console.error('getPublicProfile error:', error);
    res.status(500).json({ success: false, error: 'Failed to load that profile' });
  }
};

module.exports.validateHandle = validateHandle;
