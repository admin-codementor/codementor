#!/usr/bin/env node
// How many database reads does a page cost, and how long does the server spend on it?
//
//   node loadtest/read-cost.cjs --backend backend [--students 3000] [--subs 60] [--records] [--burst 30] [--only dashboard,leaderboard]
//
// It runs the REAL controllers and repositories of the backend folder you point at, on top of an in-memory stand-in for Firestore
// that COUNTS every document returned (Firestore bills one read per document). Point --backend at two checkouts (before and after a
// change) and compare. Nothing touches a real database, Redis or the network, so it is safe to run any time.
//
// What it proves: reads per request, calls per request and the server's own compute time, cold (first request) and warm (the next
// ones), and how a burst of simultaneous requests behaves.
// What it does NOT prove: real Firestore latency, Redis latency, or the network. "est. wait" is a MODEL, not a measurement:
// calls x 25 ms + documents x 0.05 ms (about 20,000 documents a second per query), both assumptions you can change below.
//
//   --records   pretend the one-time backfill (scripts/backfill-student-stats.js) has run, so the per-student records are used
//               (only meaningful for a backend that has them)
const path = require('path');

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? dflt : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const BACKEND = path.resolve(String(arg('backend', 'backend')));
const STUDENTS = Number(arg('students', 3000));
const SUBS = Number(arg('subs', 60));
const BURST = Number(arg('burst', 30));
const RECORDS = arg('records', false) === true;
const ONLY = String(arg('only', '')).split(',').filter(Boolean);
const CALL_MS = 25; const DOC_MS = 0.05; // the latency model

// ── a small deterministic random generator, so two runs see identical data ──
let seed = 1234567;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ── in-memory Firestore that counts reads ──
const meter = { reads: 0, calls: 0 };
const store = new Map(); // collection path -> Map(id -> data)
const coll = (p) => { if (!store.has(p)) store.set(p, new Map()); return store.get(p); };
const project = (data, fields) => { if (!fields || !fields.length) return data; const o = {}; for (const f of fields) if (f in data) o[f] = data[f]; return o; };
const mkDoc = (p, id, data, fields) => ({ id, exists: data !== undefined, ref: { path: `${p}/${id}` }, data: () => (data === undefined ? undefined : project(data, fields)) });

class Query {
  constructor(p, filters = [], fields = null) { this.p = p; this.filters = filters; this.fields = fields; }
  where(f, op, v) { if (op !== '==' && op !== 'in') throw new Error(`fake db: operator ${op} not supported`); return new Query(this.p, [...this.filters, [f, op, v]], this.fields); }
  select(...fields) { return new Query(this.p, this.filters, fields); }
  limit() { return this; }
  async get() {
    meter.calls += 1;
    const docs = [];
    for (const [id, data] of coll(this.p)) {
      if (this.filters.every(([f, op, v]) => (op === '==' ? data[f] === v : v.includes(data[f])))) docs.push(mkDoc(this.p, id, data, this.fields));
    }
    meter.reads += Math.max(1, docs.length);
    return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
  }
}
const docRef = (p, id) => ({
  id, path: `${p}/${id}`,
  async get() { meter.calls += 1; meter.reads += 1; return mkDoc(p, id, coll(p).get(id)); },
  async set(data, opts) { const cur = coll(p).get(id); coll(p).set(id, opts?.merge && cur ? { ...cur, ...data } : { ...data }); },
  collection: (sub) => collRef(`${p}/${id}/${sub}`),
});
const collRef = (p) => ({ doc: (id) => docRef(p, id), where: (...a) => new Query(p).where(...a), select: (...a) => new Query(p).select(...a), get: () => new Query(p).get(), limit: () => new Query(p) });
const fakeDb = {
  collection: (p) => collRef(p),
  async getAll(...args) {
    const opts = args.length && typeof args[args.length - 1].get !== 'function' ? args.pop() : null;
    meter.calls += 1;
    meter.reads += args.length;
    return args.map((r) => { const i = r.path.lastIndexOf('/'); const p = r.path.slice(0, i); const id = r.path.slice(i + 1); return mkDoc(p, id, coll(p).get(id), opts?.fieldMask); });
  },
  async runTransaction(fn) { return fn({ get: (ref) => ref.get(), set: (ref, d, o) => ref.set(d, o) }); },
};

// ── a stand-in Redis: stores JSON text like the real one, honours expiry, adds a small fixed latency ──
const redisData = new Map();
const REDIS_MS = Number(arg('redis-ms', 0));
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const fakeRedis = {
  async get(k) { await sleep(REDIS_MS); const e = redisData.get(k); if (!e || (e.exp && e.exp < Date.now())) return null; return JSON.parse(e.v); },
  async set(k, v, o) { await sleep(REDIS_MS); redisData.set(k, { v: JSON.stringify(v), exp: o?.ex ? Date.now() + o.ex * 1000 : 0 }); return 'OK'; },
  async incr(k) { const e = redisData.get(k); const n = (e ? Number(JSON.parse(e.v)) : 0) + 1; redisData.set(k, { v: JSON.stringify(n), exp: 0 }); return n; },
  async del(k) { redisData.delete(k); },
};

process.env.NODE_ENV = 'test';
const inject = (rel, exports) => { const f = require.resolve(path.join(BACKEND, rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
inject('src/config/firestore.js', { db: fakeDb, admin: {} });
inject('src/config/redis.js', { redis: fakeRedis });

// ── seed ──
function seedData() {
  const depts = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
  const students = coll('students');
  const ids = [];
  for (let i = 0; i < STUDENTS; i++) {
    const id = `s${String(i).padStart(5, '0')}`;
    ids.push(id);
    students.set(id, { name: `Student ${i}`, role: 'student', rollNo: `R${i}`, email: `${id}@x.test`, department: depts[i % 5], year: 1 + (Math.floor(i / 5) % 4), section: 'ABC'[Math.floor(i / 20) % 3], rating: 1200 + (i % 300) });
  }
  const problems = coll('problems');
  const tags = ['arrays', 'strings', 'loops', 'recursion', 'sorting', 'oop', 'dp'];
  const PROBLEMS = 692;
  const pids = [];
  for (let i = 0; i < PROBLEMS; i++) {
    const id = `p${i}`;
    pids.push(id);
    problems.set(id, { title: `Problem ${i}`, description: 'd'.repeat(600), lesson: 'l'.repeat(2000), difficulty: pick(['Easy', 'Medium', 'Hard']), tags: [pick(tags), pick(tags)], status: 'published', createdAt: new Date() });
  }
  const courses = coll('courses');
  const mk = (cid, title, mods, per, from) => {
    courses.set(cid, { title, description: `${title} course`, isPublished: true, sortOrder: cid === 'python' ? 0 : 1 });
    const m = coll(`courses/${cid}/modules`);
    for (let k = 0; k < mods; k++) m.set(`${cid}-m${k}`, { title: `Module ${k + 1}`, sortOrder: k, problemIds: pids.slice(from + k * per, from + (k + 1) * per) });
  };
  mk('python', 'Python', 18, 17, 0); mk('java', 'Java', 19, 20, 312);
  const subs = coll('submissions');
  let n = 0;
  for (const uid of ids) {
    const count = Math.max(1, Math.round(SUBS * (0.4 + rnd() * 1.2)));
    for (let j = 0; j < count; j++) {
      subs.set(`sub${n++}`, { userId: uid, problemId: pick(pids), code: 'c'.repeat(500), language: '71', verdict: rnd() < 0.35 ? 'Accepted' : pick(['Wrong Answer', 'Runtime Error', 'Time Limit Exceeded', 'Compilation Error']), runtime: 120, memory: 9000, score: null, testResults: [true, false], assignmentId: null, examId: null, submittedAt: new Date(Date.now() - Math.floor(rnd() * 90 * 86400000)) });
    }
  }
  return { ids, n };
}

function seedRecords(ids) {
  const { aggregateRows, mergeSolved } = require(path.join(BACKEND, 'src/utils/solvedStats'));
  const per = new Map();
  for (const s of coll('submissions').values()) {
    if (!per.has(s.userId)) per.set(s.userId, { total: 0, accepted: 0, p: new Set() });
    const e = per.get(s.userId); e.total += 1;
    if (s.verdict === 'Accepted') { e.accepted += 1; e.p.add(s.problemId); }
  }
  void aggregateRows;
  const stats = coll('studentStats');
  for (const id of ids) {
    const e = per.get(id); if (!e) continue;
    const solved = mergeSolved(null, [...e.p]);
    stats.set(id, { userId: id, ...solved, totalSubmissions: e.total, acceptedSubmissions: e.accepted });
  }
  coll('collegeSettings').set('studentStatsBackfill', { done: true });
}

// ── scenarios: each is one page's data request ──
const resp = () => { const r = { code: 200, body: null, json(b) { this.body = b; return this; }, status(c) { this.code = c; return this; }, set() { return this; }, setHeader() { return this; } }; return r; };
const student = (i) => ({ user: { id: `s${String(i % STUDENTS).padStart(5, '0')}`, role: 'student', department: 'CSE' }, query: {}, params: {}, body: {} });
const hod = { user: { id: 'hod1', role: 'hod', department: 'CSE' }, query: {}, params: {}, body: {} };

function scenarios() {
  const S = require(path.join(BACKEND, 'src/controllers/student.controller'));
  const C = require(path.join(BACKEND, 'src/controllers/courses.controller'));
  const F = require(path.join(BACKEND, 'src/controllers/faculty.controller'));
  const run = (fn, req) => async () => { const res = resp(); await fn(req, res); if (res.code >= 400) throw new Error(`HTTP ${res.code}: ${JSON.stringify(res.body)}`); return res.body; };
  return {
    dashboard: (i) => run(S.getDashboardData, student(i)),
    leaderboard: (i) => run(S.getLeaderboard, { ...student(i), query: { scope: 'college' } }),
    courses: (i) => run(C.getCourses, student(i)),
    coursePage: (i) => run(C.getCourseById, { ...student(i), params: { id: 'python' } }),
    cohorts: () => run(F.getCohorts, { ...hod, query: { dimension: 'section' } }),
    cohortStudents: () => run(F.getCohortStudents, { ...hod, query: { dimension: 'department', value: 'CSE', page: '1', limit: '20' } }),
    classAnalytics: () => run(F.getClassAnalytics, hod),
    cohortTopics: () => run(F.getCohortTopics, { ...hod, query: { dim: 'department' } }),
  };
}

function resetCaches() {
  redisData.clear();
  for (const m of ['rankingService', 'studentAggregateService', 'courseCatalogService', 'solvedService']) {
    try { require(path.join(BACKEND, 'src/services', m)).reset?.(); } catch { /* this backend does not have it */ }
  }
}

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
async function timed(fn) { meter.reads = 0; meter.calls = 0; const t = process.hrtime.bigint(); await fn(); return { ms: Number(process.hrtime.bigint() - t) / 1e6, reads: meter.reads, calls: meter.calls }; }

async function main() {
  console.log(`Backend: ${BACKEND}`);
  const { ids, n } = seedData();
  if (RECORDS) seedRecords(ids);
  console.log(`Seeded ${fmt(STUDENTS)} students, ${fmt(n)} submissions, 692 problems in 2 courses${RECORDS ? ', per-student records (backfilled)' : ''}\n`);
  const all = scenarios();
  const names = Object.keys(all).filter((k) => !ONLY.length || ONLY.includes(k));
  const rows = [];
  for (const name of names) {
    resetCaches();
    let cold; let warm = []; let burst = null; let error = null;
    try {
      cold = await timed(all[name](0));
      for (let i = 1; i <= 5; i++) warm.push(await timed(all[name](i * 7)));
      // simultaneous requests, from a cold start (the worst moment: everyone opens the page together)
      resetCaches();
      burst = await timed(async () => { await Promise.all(Array.from({ length: BURST }, (_, i) => all[name](i * 3)())); });
    } catch (e) { error = e.message; }
    if (error) { rows.push({ name, error }); continue; }
    const avg = (k) => warm.reduce((a, w) => a + w[k], 0) / warm.length;
    rows.push({ name, cold, warm: { reads: avg('reads'), calls: avg('calls'), ms: avg('ms') }, burst });
  }
  const est = (r) => r.calls * CALL_MS + r.reads * DOC_MS;
  console.log('page                 | first request              | next requests (avg of 5)   | burst: all at once from cold');
  console.log('                     | reads     compute  est.wait | reads     compute  est.wait | reads       compute');
  for (const r of rows) {
    if (r.error) { console.log(`${r.name.padEnd(20)} | ERROR ${r.error.slice(0, 120)}`); continue; }
    console.log(`${r.name.padEnd(20)} | ${fmt(r.cold.reads).padStart(8)} ${(fmt(r.cold.ms) + 'ms').padStart(8)} ${(fmt(est(r.cold)) + 'ms').padStart(8)} | ${fmt(r.warm.reads).padStart(8)} ${(fmt(r.warm.ms) + 'ms').padStart(8)} ${(fmt(est({ reads: r.warm.reads, calls: r.warm.calls })) + 'ms').padStart(8)} | ${fmt(r.burst.reads).padStart(10)} ${(fmt(r.burst.ms) + 'ms').padStart(8)}  (${BURST} requests)`);
  }
  console.log(`\nest.wait = calls x ${CALL_MS} ms + documents x ${DOC_MS} ms: a model of Firestore time, not a measurement. compute = this process's own time.`);
  console.log(`peak memory: ${fmt(process.memoryUsage().rss / 1048576)} MB`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
