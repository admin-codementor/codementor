// A circuit breaker for calls to a service that can go down (the code judge). Pure: the clock is passed in, so every rule is testable.
//
//   closed     calls go through. Failures are counted over a sliding window.
//   open       after `failureThreshold` failures inside `windowMs`, calls are refused at once, with no waiting, for `openMs`.
//   half-open  when that time is up ONE call is let through as a test. If it works the breaker closes; if it fails it opens again.
//
// What this is for: when the judge is down, hundreds of students would each wait 15 seconds for it to time out, and the judge would be hit by
// every one of them while it tries to recover. With the breaker, the first few fail, the rest are told immediately that the judge is busy and
// their work is safe, and the judge gets one test call every 20 seconds.

class CircuitOpenError extends Error {
  constructor(retryAtMs) {
    super('The judge is not answering right now.');
    this.name = 'CircuitOpenError';
    this.code = 'JUDGE_OPEN';
    this.retryAtMs = retryAtMs;
  }
}

/** Which errors mean "the service is unhealthy": no answer at all, a timeout, or a server-side status. Our own bad requests (4xx) do not. */
function defaultIsFailure(err) {
  if (err instanceof CircuitOpenError) return false;
  const status = err?.response?.status;
  if (status == null) return true; // network error, timeout, refused connection
  return status >= 500;
}

function createBreaker({ failureThreshold = 5, windowMs = 30_000, openMs = 20_000, now = Date.now, isFailure = defaultIsFailure } = {}) {
  let failures = []; // times of recent failures
  let openedAt = null;
  let probing = false;

  const prune = () => { const t = now(); failures = failures.filter((f) => t - f < windowMs); };

  function state() {
    if (openedAt == null) return 'closed';
    return now() - openedAt >= openMs ? 'half-open' : 'open';
  }

  function onSuccess() {
    failures = [];
    openedAt = null;
    probing = false;
  }
  function onFailure() {
    const t = now();
    if (openedAt != null) { openedAt = t; probing = false; return; } // the test call failed: open again for a full period
    failures.push(t);
    prune();
    if (failures.length >= failureThreshold) { openedAt = t; failures = []; }
  }

  /** Run `fn` through the breaker. Throws CircuitOpenError without calling `fn` when the breaker is open or a test call is already running. */
  async function exec(fn) {
    const s = state();
    if (s === 'open') throw new CircuitOpenError(openedAt + openMs);
    if (s === 'half-open') {
      if (probing) throw new CircuitOpenError(now() + 1000);
      probing = true;
    }
    try {
      const out = await fn();
      onSuccess();
      return out;
    } catch (err) {
      if (isFailure(err)) onFailure();
      else if (s === 'half-open') { probing = false; } // a 4xx proves the service answered: the next call may try
      throw err;
    }
  }

  return {
    exec, state,
    /** When calls will be allowed again (a test call), or null if the breaker is closed. */
    retryAtMs: () => (openedAt == null ? null : openedAt + openMs),
    snapshot: () => ({ state: state(), recent_failures: (prune(), failures.length), retry_at_ms: openedAt == null ? null : openedAt + openMs }),
    reset: () => { failures = []; openedAt = null; probing = false; },
  };
}

module.exports = { createBreaker, CircuitOpenError, defaultIsFailure };
