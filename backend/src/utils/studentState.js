// Shared vocabulary for "how is this student doing" — pure functions, no I/O,
// so the per-student page and the department funnel can never disagree.
//
// The four states come from the CampusTrack HOD review (docs/COMPETITOR_UX_RESEARCH.md
// part 2): the useful question is not "what is their score" but "which of these
// four buckets are they in", because each bucket implies a different action.

const DAY_MS = 86400000;

/** A student is "quiet" after this many days with no submission. */
const QUIET_DAYS = 7;

/** Below this accuracy we call attention to it (percent). */
const LOW_ACCURACY_PCT = 30;
/** …but only once they have enough submissions for the rate to mean anything. */
const MIN_SUBS_FOR_ACCURACY = 5;

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const toMillis = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;

/**
 * Which of the four states a student is in.
 *   not_started — has never submitted anything at all
 *   stuck       — submitting recently, but has never had anything accepted
 *   gone_quiet  — has submitted before, but nothing in the last QUIET_DAYS
 *   practising  — submitted recently and is solving things
 * Deliberately exhaustive and mutually exclusive, so the four counts always
 * add up to the cohort size; a funnel whose parts do not sum is untrustworthy.
 */
function studentState({ subs, solved, lastActiveMs }, now = Date.now()) {
  if (!subs) return 'not_started';
  const quiet = !lastActiveMs || lastActiveMs < now - QUIET_DAYS * DAY_MS;
  if (!solved) return quiet ? 'gone_quiet' : 'stuck';
  return quiet ? 'gone_quiet' : 'practising';
}

const STATE_LABELS = {
  not_started: 'Not started',
  practising: 'Practising',
  stuck: 'Stuck',
  gone_quiet: 'Gone quiet',
};

/**
 * Traffic-light flag with the reasons behind it, never a bare colour.
 * green  — active and solving at a healthy rate
 * orange — one thing worth watching
 * red    — never started, or stuck, or two or more concerns
 */
function flagFor({ subs, solved, acRate, lastActiveMs }, now = Date.now()) {
  const state = studentState({ subs, solved, lastActiveMs }, now);
  const reasons = [];

  if (state === 'not_started') return { flag: 'red', state, reasons: ['Has never submitted anything'] };
  if (state === 'stuck') reasons.push('Submitting, but nothing solved yet');
  if (state === 'gone_quiet') {
    const days = lastActiveMs ? Math.floor((now - lastActiveMs) / DAY_MS) : null;
    reasons.push(days ? `No activity for ${days} days` : `No activity for ${QUIET_DAYS}+ days`);
  }
  if (subs >= MIN_SUBS_FOR_ACCURACY && acRate < LOW_ACCURACY_PCT) {
    reasons.push(`Low accuracy (${acRate}%)`);
  }

  const flag = reasons.length === 0 ? 'green' : reasons.length === 1 && state !== 'stuck' ? 'orange' : 'red';
  return { flag, state, reasons };
}

/**
 * Per-week activity for the last `weeks` weeks, newest last, each with the
 * change against the week before it. Weeks are 7-day buckets ending today
 * rather than calendar weeks, so "this week" always means "the last 7 days"
 * and the newest bucket is never a partial one.
 */
function weeklyActivity(submissions, weeks = 8, now = Date.now()) {
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = now - i * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    buckets.push({ start, end, subs: 0, accepted: 0, days: new Set(), solvedIds: new Set() });
  }
  // A problem counts as "solved this week" in the week it was FIRST accepted,
  // so re-solving an old problem doesn't inflate a later week.
  const firstAccepted = new Map();
  for (const s of submissions) {
    if (s.verdict !== 'Accepted') continue;
    const ms = toMillis(s.submittedAt);
    if (!ms) continue;
    const prev = firstAccepted.get(s.problemId);
    if (!prev || ms < prev) firstAccepted.set(s.problemId, ms);
  }

  for (const s of submissions) {
    const ms = toMillis(s.submittedAt);
    if (!ms) continue;
    const b = buckets.find((x) => ms >= x.start && ms < x.end);
    if (!b) continue;
    b.subs += 1;
    b.days.add(dayKey(ms));
    if (s.verdict === 'Accepted') b.accepted += 1;
  }
  for (const [pid, ms] of firstAccepted) {
    const b = buckets.find((x) => ms >= x.start && ms < x.end);
    if (b) b.solvedIds.add(pid);
  }

  return buckets.map((b, i) => {
    const prev = buckets[i - 1];
    return {
      week_start: dayKey(b.start),
      week_end: dayKey(b.end - DAY_MS),
      subs: b.subs,
      accepted: b.accepted,
      solved: b.solvedIds.size,
      active_days: b.days.size,
      // null (not 0) for the first bucket — there is nothing to compare it to,
      // and showing "0 change" there would be a claim we cannot support.
      solved_change: prev ? b.solvedIds.size - prev.solvedIds.size : null,
      subs_change: prev ? b.subs - prev.subs : null,
    };
  });
}

module.exports = {
  studentState, flagFor, weeklyActivity, STATE_LABELS,
  QUIET_DAYS, LOW_ACCURACY_PCT, MIN_SUBS_FOR_ACCURACY, DAY_MS,
};
