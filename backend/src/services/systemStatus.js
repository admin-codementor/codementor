// A one-glance answer to "is the platform working": the API, the database and the code judge. Safe to publish (no names, versions or error text),
// so a free uptime monitor or a status page can read it. See docs/EXAM_DAY_PLAYBOOK.md.
//
// The answer is held for a short time and a burst of callers shares ONE check, so a public address cannot be used to run up database reads
// or to hammer the judge.
const PROBE_TIMEOUT_MS = 3000;
const CACHE_MS = 30_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 'ok' | 'down' | 'not_configured'. A probe that is not given (null) is "not configured"; any failure or a slow answer is "down". */
async function probe(fn, timeoutMs = PROBE_TIMEOUT_MS) {
  if (typeof fn !== 'function') return 'not_configured';
  try { await withTimeout(Promise.resolve().then(fn), timeoutMs); return 'ok'; } catch (_) { return 'down'; }
}

/**
 * ok        everything works
 * degraded  exams with only multiple-choice sections still work, coding does not (the judge is down)
 * down      the database is unreachable: nothing that saves anything can work
 */
function rollUp({ firestore, judge0 }) {
  if (firestore === 'down') return 'down';
  if (judge0 === 'down') return 'degraded';
  return 'ok';
}

function createStatusService({ firestorePing, judgePing, now = Date.now, cacheMs = CACHE_MS, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  let last = null;       // { at, value }
  let inFlight = null;

  async function check() {
    const [firestore, judge0] = await Promise.all([probe(firestorePing, timeoutMs), probe(judgePing, timeoutMs)]);
    return { status: rollUp({ firestore, judge0 }), api: 'ok', firestore, judge0, checked_at: new Date(now()).toISOString() };
  }

  return {
    async get() {
      if (last && now() - last.at < cacheMs) return last.value;
      if (!inFlight) {
        inFlight = check().then((value) => { last = { at: now(), value }; return value; }).finally(() => { inFlight = null; });
      }
      return inFlight;
    },
  };
}

module.exports = { createStatusService, rollUp, probe, PROBE_TIMEOUT_MS, CACHE_MS };
