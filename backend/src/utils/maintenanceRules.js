// The rules of the background upkeep, as pure functions (the clock is always passed in):
//   - which stuck judge jobs the reaper should push on, and which it should give up on
//   - who may run a periodic task (one server at a time, and not more often than the task's interval)
//   - what the self-checks found, rolled up into one word
//   - which placement applications point at a drive that no longer exists

const MINUTE = 60_000;

const toMs = (v) => (v == null ? null : typeof v === 'number' ? v : typeof v.toMillis === 'function' ? v.toMillis() : new Date(v).getTime());

/**
 * Decide what the reaper does with the jobs that are not finished.
 *   give up   open for longer than `maxAgeMs` (15 minutes): mark failed and keep it for the Admin
 *   advance   not touched for `staleMs` (90 seconds): nobody is polling it, so push it one step; oldest first, at most `maxAdvance`
 *   leave     everything else (a student is still polling it, or it was moved a moment ago)
 * A job with no timestamps (made before the reaper existed) is left alone.
 * @returns {{giveUp: {id: string, ageMs: number}[], advance: string[], left: number}}
 */
function planReap(jobs, now, { staleMs = 90_000, maxAgeMs = 15 * MINUTE, maxAdvance = 20 } = {}) {
  const giveUp = [];
  const stale = [];
  let left = 0;
  for (const j of jobs || []) {
    if (!j || j.phase === 'done') continue;
    const created = j.createdAtMs ?? toMs(j.createdAt);
    const touched = j.touchedAtMs ?? created;
    if (created == null || touched == null) { left += 1; continue; }
    if (now - created > maxAgeMs) giveUp.push({ id: j.id, ageMs: now - created });
    else if (now - touched >= staleMs) stale.push({ id: j.id, touched });
    else left += 1;
  }
  stale.sort((a, b) => a.touched - b.touched);
  const advance = stale.slice(0, maxAdvance).map((x) => x.id);
  left += stale.length - advance.length;
  return { giveUp, advance, left };
}

/**
 * May this server run the task now? `doc` is the stored lease: { owner, untilMs, lastRunMs }.
 * It may if nobody holds the lease (or the holder's time is up) and the task last ran at least `everyMs` ago.
 * @returns {{take: boolean, reason?: 'held'|'too_soon', next?: object}}
 */
function decideLease(doc, owner, now, { everyMs, ttlMs }) {
  const d = doc || {};
  if (d.untilMs && d.untilMs > now && d.owner !== owner) return { take: false, reason: 'held' };
  if (d.lastRunMs && now - d.lastRunMs < everyMs) return { take: false, reason: 'too_soon' };
  return { take: true, next: { owner, untilMs: now + ttlMs, lastRunMs: now } };
}

/** One word for a list of self-check results: error, then warn, then repaired, then ok. */
function rollUp(results) {
  const rank = { error: 3, warn: 2, repaired: 1, ok: 0 };
  return (results || []).reduce((worst, r) => ((rank[r.status] ?? 0) > (rank[worst] ?? 0) ? r.status : worst), 'ok');
}

/** Applications whose drive is gone. @returns {{driveId: string, studentId: string}[]} */
function findOrphanApplications(applications, drives) {
  const ids = new Set((drives || []).map((d) => d.id));
  return (applications || []).filter((a) => a?.driveId && !ids.has(a.driveId)).map((a) => ({ driveId: a.driveId, studentId: a.studentId }));
}

module.exports = { MINUTE, planReap, decideLease, rollUp, findOrphanApplications };
