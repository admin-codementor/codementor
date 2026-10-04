// The Job-Ready Score: one number per target, and the reasons behind it.
//
// Two rules shape everything here.
//
// The first is that it must not be a black box. Every component comes back with
// its own 0-100, its weight, the raw numbers it was computed from and a
// sentence saying what would raise it. A score a student cannot act on is worse
// than no score, because it looks like a verdict.
//
// The second is that nothing is stored. The score is derived from submissions,
// attempts and progress on every request, which means it cannot drift out of
// sync with the data, and the "+6 this week" figure is the same computation run
// over the data as it stood seven days ago rather than a snapshot we remembered
// to take.
const { TRACKS } = require('../config/placementTracks');
const { COMPONENTS, TARGETS, CONSISTENCY_TARGET_DAYS, COURSE_TARGET_PROBLEMS } = require('../config/jobReadiness');
const { tagMatches } = require('./roadmapService');

const DAY_MS = 86_400_000;
const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

const millis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Topic coverage against a placement track.
 *
 * Track topics are written singular ("array", "tree") while problem tags are
 * mostly plural ("arrays", "trees"), so a literal lookup matched almost
 * nothing and the placement page under-reported nearly every topic. Matching
 * goes through the roadmap resolver's comparison, which ignores a trailing "s".
 */
function coverageFromTrack(track, solvedProblems) {
  const topics = track.topics.map((tp) => {
    const terms = tp.aliases?.length ? tp.aliases : [tp.topic];
    const solved = solvedProblems.filter((p) =>
      (p.tags || []).some((tag) => terms.some((term) => tagMatches(tag, term)))).length;
    return { topic: tp.topic, label: tp.label, target: tp.target, solved: Math.min(solved, tp.target), raw: solved };
  });
  const target = topics.reduce((n, t) => n + t.target, 0);
  const got = topics.reduce((n, t) => n + t.solved, 0);
  return { score: target > 0 ? clamp100((got / target) * 100) : 0, topics, got, target };
}

/** Coverage for the "my roadmap role" target: the roadmap's own practice steps. */
function coverageFromRoadmap(roadmapProgress) {
  if (!roadmapProgress) return { score: 0, topics: [], got: 0, target: 0 };
  const topics = (roadmapProgress.milestones || [])
    .filter((m) => m.tracked && m.target > 0)
    .map((m) => ({ topic: m.id, label: m.title, target: m.target, solved: m.solved, raw: m.solved }));
  const target = topics.reduce((n, t) => n + t.target, 0);
  const got = topics.reduce((n, t) => n + t.solved, 0);
  return { score: target > 0 ? clamp100((got / target) * 100) : 0, topics, got, target };
}

function difficultyScore(solvedProblems, hardShareTarget) {
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const p of solvedProblems) {
    const d = String(p.difficulty || '').toLowerCase();
    if (counts[d] !== undefined) counts[d] += 1;
  }
  const total = counts.easy + counts.medium + counts.hard;
  const share = total > 0 ? (counts.medium + counts.hard) / total : 0;
  // Below ten solved problems the share is noise — two mediums out of three
  // problems is not a student who is ready for medium questions.
  const confidence = Math.min(1, total / 10);
  return {
    score: clamp100((share / hardShareTarget) * 100 * confidence),
    counts,
    share: Math.round(share * 100),
    shareTarget: Math.round(hardShareTarget * 100),
  };
}

function consistencyScore(acceptedSubs, now) {
  const since = now - 30 * DAY_MS;
  const days = new Set();
  for (const s of acceptedSubs) {
    const t = millis(s.submittedAt);
    if (t >= since && t <= now) days.add(Math.floor(t / DAY_MS));
  }
  const activeDays = days.size;
  return {
    score: clamp100((activeDays / CONSISTENCY_TARGET_DAYS) * 100),
    activeDays,
    targetDays: CONSISTENCY_TARGET_DAYS,
  };
}

function aptitudeScore(attempts) {
  const scored = attempts.filter((a) => a.total > 0);
  if (scored.length === 0) return { score: 0, taken: 0, averagePercent: null };
  const avg = scored.reduce((n, a) => n + (a.score / a.total) * 100, 0) / scored.length;
  return { score: clamp100(avg), taken: scored.length, averagePercent: Math.round(avg) };
}

function coursesScore(courseProblemIds, solvedIdSet) {
  const assigned = courseProblemIds.length;
  const done = courseProblemIds.filter((id) => solvedIdSet.has(id)).length;
  // Measured against a fixed bar rather than against whatever this college has
  // uploaded, so a student at a college with one small course cannot reach 100
  // here on four problems.
  const target = Math.min(COURSE_TARGET_PROBLEMS, assigned) || COURSE_TARGET_PROBLEMS;
  return { score: clamp100((done / target) * 100), done, assigned, target };
}

function externalScore(profiles) {
  const verified = profiles.filter((p) => p.verified && (p.solved > 0 || p.rating));
  if (verified.length === 0) return { score: 0, verified: [] };
  return {
    score: 100,
    verified: verified.map((p) => ({ platform: p.platform, handle: p.handle, solved: p.solved || 0, rating: p.rating ?? null })),
  };
}

/**
 * One target's score.
 *
 * `inputs` is everything already gathered for this student; nothing in here
 * fetches. That keeps the seven-day-ago recomputation honest — it runs the same
 * function over a filtered copy of the same inputs.
 */
function scoreTarget(target, inputs) {
  const track = target.trackKey ? TRACKS.find((t) => t.key === target.trackKey) : null;

  const parts = {
    coverage: track ? coverageFromTrack(track, inputs.solvedProblems) : coverageFromRoadmap(inputs.roadmapProgress),
    difficulty: difficultyScore(inputs.solvedProblems, target.hardShareTarget),
    consistency: consistencyScore(inputs.acceptedSubs, inputs.now),
    aptitude: aptitudeScore(inputs.mcqAttempts),
    roadmap: { score: inputs.roadmapProgress ? clamp100(inputs.roadmapProgress.percent) : 0, following: !!inputs.roadmapProgress },
    courses: coursesScore(inputs.courseProblemIds, inputs.solvedIds),
    external: externalScore(inputs.codingProfiles),
  };

  const components = Object.entries(target.weights)
    .filter(([, weight]) => weight > 0)
    .map(([key, weight]) => ({
      key,
      label: COMPONENTS[key].label,
      detail: COMPONENTS[key].detail,
      weight,
      score: parts[key].score,
      contributes: Math.round((parts[key].score * weight) / 100),
      data: parts[key],
    }));

  // Summed from the *rounded* contributions rather than from the exact ones, so
  // the figures a student adds up on screen come to the number we show them.
  // Computing the total exactly and rounding at the end is more precise and
  // produced 23 + 8 + 15 + 0 + 7 + 7 = 60 under a headline reading 59, which is
  // the one thing a score that claims to show its workings cannot do.
  const total = components.reduce((n, c) => n + c.contributes, 0);

  return {
    key: target.key,
    label: target.label,
    blurb: target.blurb,
    score: clamp100(total),
    components,
  };
}

/** Inputs as they stood `days` ago, so the same scoring can be re-run on them. */
function rewind(inputs, days) {
  const cutoff = inputs.now - days * DAY_MS;
  const acceptedSubs = inputs.acceptedSubs.filter((s) => millis(s.submittedAt) <= cutoff);
  const solvedIds = new Set(acceptedSubs.map((s) => s.problemId));
  return {
    ...inputs,
    now: cutoff,
    acceptedSubs,
    solvedIds,
    solvedProblems: inputs.solvedProblems.filter((p) => solvedIds.has(p.id)),
    mcqAttempts: inputs.mcqAttempts.filter((a) => millis(a.submittedAt) <= cutoff),
    // External stats are a single current figure with no history, so they are
    // carried over unchanged: the weekly delta says nothing about them either
    // way, which is better than inventing a number.
  };
}

/**
 * The next three things to do, chosen from whichever components are costing the
 * most points — weight times the gap, not the gap alone, so it does not send a
 * student to fix a 5-point component while a 35-point one sits at zero.
 */
function nextActions(target, scored, inputs) {
  const by = Object.fromEntries(scored.components.map((c) => [c.key, c]));
  const lost = (key) => (by[key] ? ((100 - by[key].score) * by[key].weight) / 100 : -1);

  const candidates = [];

  if (by.coverage) {
    const gaps = (by.coverage.data.topics || [])
      .filter((t) => t.solved < t.target)
      .sort((a, b) => (b.target - b.solved) - (a.target - a.solved));
    for (const g of gaps.slice(0, 2)) {
      candidates.push({
        weightLost: lost('coverage'),
        label: `Solve ${g.target - g.solved} more ${g.label} problem${g.target - g.solved === 1 ? '' : 's'}`,
        why: `${g.label} is ${g.solved} of ${g.target} for this target.`,
        href: `/app/problems?tag=${encodeURIComponent(g.topic)}`,
      });
    }
  }

  if (by.aptitude && by.aptitude.data.taken === 0) {
    candidates.push({
      weightLost: lost('aptitude'),
      label: 'Take your first aptitude test',
      why: 'This is worth ' + by.aptitude.weight + ' points and you have not sat one yet.',
      href: '/app/tests?tab=aptitude',
    });
  } else if (by.aptitude) {
    candidates.push({
      weightLost: lost('aptitude'),
      label: 'Sit another aptitude test',
      why: `Your average is ${by.aptitude.data.averagePercent}% across ${by.aptitude.data.taken} test${by.aptitude.data.taken === 1 ? '' : 's'}.`,
      href: '/app/tests?tab=aptitude',
    });
  }

  if (by.consistency) {
    const d = by.consistency.data;
    candidates.push({
      weightLost: lost('consistency'),
      label: d.activeDays === 0 ? 'Solve one problem today' : 'Keep solving — aim for most days',
      why: `You solved something on ${d.activeDays} of the last 30 days; ${d.targetDays} is full marks.`,
      href: '/app/problems',
    });
  }

  if (by.roadmap) {
    candidates.push({
      weightLost: lost('roadmap'),
      label: inputs.roadmapProgress
        ? `Continue ${inputs.roadmapProgress.role}: ${inputs.roadmapProgress.currentMilestone?.title ?? 'next step'}`
        : 'Choose a roadmap to follow',
      why: inputs.roadmapProgress
        ? `You are ${inputs.roadmapProgress.percent}% along it.`
        : 'Following one turns this component on and gives you an ordered path.',
      href: inputs.roadmapProgress ? `/app/roadmaps/${inputs.roadmapProgress.id}` : '/app/roadmaps',
    });
  }

  if (by.difficulty) {
    const d = by.difficulty.data;
    candidates.push({
      weightLost: lost('difficulty'),
      label: 'Try a medium problem',
      why: `${d.share}% of what you have solved is medium or harder; this target wants about ${d.shareTarget}%.`,
      href: '/app/problems?difficulty=medium',
    });
  }

  if (by.courses) {
    const d = by.courses.data;
    candidates.push({
      weightLost: lost('courses'),
      label: 'Work through an assigned course',
      why: `${d.done} of ${d.assigned} course problems done.`,
      href: '/app/courses',
    });
  }

  if (by.external && by.external.data.verified.length === 0) {
    candidates.push({
      weightLost: lost('external'),
      label: 'Link and verify a Codeforces or LeetCode account',
      why: 'Verified outside practice counts here, and appears on your public profile.',
      href: '/app/profile?tab=coding-profiles',
    });
  }

  return candidates
    .sort((a, b) => b.weightLost - a.weightLost)
    .slice(0, 3)
    .map((c) => ({ label: c.label, why: c.why, href: c.href }));
}

/** Every target, with this week's movement and what to do next. */
function computeJobReadiness(inputs) {
  const lastWeek = rewind(inputs, 7);

  const targets = TARGETS.map((target) => {
    const scored = scoreTarget(target, inputs);
    const before = scoreTarget(target, lastWeek).score;
    return {
      ...scored,
      weekChange: scored.score - before,
      nextActions: nextActions(target, scored, inputs),
    };
  });

  // The roadmap target is meaningless without a roadmap, and showing it at 15%
  // would read as a verdict on the student rather than on the missing choice.
  const usable = inputs.roadmapProgress ? targets : targets.filter((t) => t.key !== 'role');

  return {
    targets: usable,
    roleTargetAvailable: !!inputs.roadmapProgress,
    roadmap: inputs.roadmapProgress
      ? { id: inputs.roadmapProgress.id, role: inputs.roadmapProgress.role, percent: inputs.roadmapProgress.percent }
      : null,
  };
}

module.exports = { computeJobReadiness, scoreTarget, rewind, coverageFromTrack, difficultyScore, consistencyScore };
