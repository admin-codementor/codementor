// Minimal test harness — no framework, no new dependencies.
//
// These are SMOKE tests: they run against a real running backend and the real
// Firestore project, because the bugs this suite exists to catch (a role missing
// from a route, a camelCase/snake_case mismatch, a draft leaking to students) only
// appear when the real stack is wired together. Unit tests with mocks would have
// passed while every one of those shipped broken.
//
// Every suite registers what it creates and the runner deletes it afterwards, so a
// run leaves the database exactly as it found it.
require('dotenv').config({ quiet: true });
const jwt = require('jsonwebtoken');

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

// ── Identities ───────────────────────────────────────────────────────────────
// Signed with the real JWT secret. `protect` only verifies the token, so these
// need no Firestore user rows — which keeps the suite from touching real accounts.
const TEST_PREFIX = 'smoketest-';
const tokenFor = (id, role, extra = {}) =>
  jwt.sign({ id: TEST_PREFIX + id, role, permissions: {}, department: 'CSE', ...extra }, process.env.JWT_SECRET, { expiresIn: '30m' });

const userId = (id) => TEST_PREFIX + id;

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function request(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON (blob/PDF) */ }
  return { status: res.status, body: parsed, ok: res.ok };
}

const get = (path, token) => request('GET', path, { token });
const post = (path, token, body) => request('POST', path, { token, body });
const put = (path, token, body) => request('PUT', path, { token, body });
const patch = (path, token, body) => request('PATCH', path, { token, body });
const del = (path, token) => request('DELETE', path, { token });

// ── Assertions ───────────────────────────────────────────────────────────────
class Suite {
  constructor(name) {
    this.name = name;
    this.results = [];
    this.cleanup = [];
  }

  check(label, ok, detail = '') {
    this.results.push({ label, ok: !!ok, detail: String(detail) });
    return !!ok;
  }

  /** Records a step that could not run (missing dependency), not a failure. */
  skip(label, why) {
    this.results.push({ label, skipped: true, detail: why });
  }

  /** Register a teardown action; runs even if the suite throws. */
  onCleanup(fn, description) {
    this.cleanup.push({ fn, description });
  }

  get passed() { return this.results.filter((r) => r.ok).length; }
  get failed() { return this.results.filter((r) => r.ok === false).length; }
  get skipped() { return this.results.filter((r) => r.skipped).length; }
}

// ── Capability probes ────────────────────────────────────────────────────────
// Some checks depend on infrastructure that legitimately isn't available in every
// environment (Judge0 needs a Linux host; the AI provider needs quota). Those are
// reported as SKIPPED with the reason, never as silent passes.
let capabilityCache = null;
async function capabilities() {
  if (capabilityCache) return capabilityCache;

  const caps = { backend: false, judge0Reachable: false, judge0Executes: false, ai: false, judge0Detail: '', aiDetail: '' };

  try {
    const res = await fetch(`${BASE}/api/judge-health`, { signal: AbortSignal.timeout(5000) });
    caps.backend = res.status === 401 || res.status === 200; // 401 = up, auth working
  } catch (e) {
    caps.backendDetail = e.message;
  }

  // Judge0: reachable is not the same as able to execute — on Docker Desktop it
  // accepts submissions and returns Internal Error for every one.
  try {
    const { runOnJudge0 } = require('../src/utils/judge0Run');
    const out = await runOnJudge0({ source_code: 'print(6*7)', language_id: 71, stdin: '' });
    caps.judge0Reachable = out.statusId !== null;
    caps.judge0Executes = out.ok && out.stdout.trim() === '42';
    if (!caps.judge0Executes) {
      caps.judge0Detail = out.statusId === null
        ? `unreachable: ${out.message}`
        : `reachable but did not execute (status ${out.statusId}: ${out.message || 'no message'})`;
    }
  } catch (e) {
    caps.judge0Detail = e.message;
  }

  try {
    const ai = require('../src/services/aiGateway');
    if (!ai.isConfigured()) {
      caps.aiDetail = 'no provider configured';
    } else {
      const { text } = await ai.generateText({ prompt: 'Reply with the single word OK' });
      caps.ai = !!text;
      if (!caps.ai) caps.aiDetail = 'empty response';
    }
  } catch (e) {
    caps.aiDetail = (e.message || 'failed').slice(0, 120);
  }

  capabilityCache = caps;
  return caps;
}

// ── Direct Firestore access, for teardown the API can't do ───────────────────
function db() {
  return require('../src/config/firestore').db;
}

/** Delete every document in `collection` whose `field` equals one of `values`. */
async function purge(collection, field, values) {
  if (!values.length) return 0;
  let n = 0;
  for (const v of values) {
    const snap = await db().collection(collection).where(field, '==', v).get();
    for (const doc of snap.docs) {
      // Remove known subcollections first so nothing is orphaned. Note: this is
      // one level deep only — exams/{id}/sections/{sid}/questions (two levels
      // down) isn't covered here, so suites touching `exams` should prefer an
      // explicit DELETE via the API (which cascades fully) over relying on this
      // as their only cleanup.
      for (const sub of ['members', 'questions', 'attempts', 'testCases', 'sections']) {
        const kids = await doc.ref.collection(sub).get();
        for (const k of kids.docs) await k.ref.delete();
      }
      await doc.ref.delete();
      n += 1;
    }
  }
  return n;
}

module.exports = {
  BASE, TEST_PREFIX, tokenFor, userId,
  request, get, post, put, patch, del,
  Suite, capabilities, db, purge,
};
