// Practice analytics for a department: what its students did on CodeMentor in a period. Pure: plain arrays and a clock in, one object out, so every
// figure can be checked against a small fixture.
//
// Words (see utils/definitions.js): "not started" is a student who has never submitted anything at all; "stuck" and "gone quiet" are the practice
// states of utils/studentState.js, so this page cannot disagree with the Overview. "Solved" counts a problem once per student, on the day it was
// first accepted.
const { studentState, DAY_MS } = require('./studentState');
const { batchOf } = require('./batch');

const PERIODS = [1, 7, 30, 90, 180, 365, 0]; // 0 means all time
const IST_MS = 330 * 60000;
const LANGUAGE = { 50: 'C', 51: 'C#', 54: 'C++', 60: 'Go', 62: 'Java', 63: 'JavaScript', 71: 'Python 3.8', 73: 'Rust', 74: 'TypeScript', 92: 'Python 3.11', 100: 'Python 3.12' };

const toMs = (v) => (v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)) || 0;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const round1 = (n) => Math.round(n * 10) / 10;
const difficultyOf = (p) => { const d = String(p?.difficulty ?? '').toLowerCase(); return d === 'easy' || d === 'medium' || d === 'hard' ? d : 'other'; };
const istParts = (ms) => { const d = new Date(ms + IST_MS); return { day: d.getUTCDay(), hour: d.getUTCHours(), key: d.toISOString().slice(0, 10) }; };

/** The chart buckets for the period: hours for today, days up to a month, weeks to a year, months for all time. */
function bucketsFor(days, now, firstMs) {
  const out = [];
  if (days === 1) {
    for (let h = 23; h >= 0; h -= 1) { const start = Math.floor((now - h * 3600000) / 3600000) * 3600000; out.push({ start, end: start + 3600000, label: `${istParts(start).hour}:00` }); }
  } else if (days > 0 && days <= 31) {
    const todayStart = Math.floor((now + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
    for (let i = days - 1; i >= 0; i -= 1) { const start = todayStart - i * DAY_MS; out.push({ start, end: start + DAY_MS, label: istParts(start).key.slice(5) }); }
  } else if (days > 0) {
    const weeks = Math.ceil(days / 7);
    for (let i = weeks - 1; i >= 0; i -= 1) { const end = now - i * 7 * DAY_MS; const start = end - 7 * DAY_MS; out.push({ start, end, label: istParts(start).key.slice(5) }); }
  } else {
    const first = firstMs || now;
    const d0 = new Date(Math.max(first, now - 365 * DAY_MS));
    let y = d0.getUTCFullYear(); let m = d0.getUTCMonth();
    const endY = new Date(now).getUTCFullYear(); const endM = new Date(now).getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const start = Date.UTC(y, m, 1); const end = Date.UTC(y, m + 1, 1);
      out.push({ start, end, label: `${y}-${String(m + 1).padStart(2, '0')}` });
      m += 1; if (m > 11) { m = 0; y += 1; }
    }
  }
  return out;
}

/**
 * @param {object} a
 * @param {{id, name?, rollNo?, section?, year?, admissionYear?}[]} a.students   the students in the view (department, section, year, batch already applied)
 * @param {{userId, problemId, verdict, submittedAt, language?}[]} a.submissions
 * @param {{id, title?, difficulty?, tags?: string[]}[]} a.catalog              the problems that exist
 * @param {number} a.days  1, 7, 30, 90, 180, 365 or 0 (all time)
 * @param {number} a.now
 */
function buildPracticeAnalytics({ students, submissions, catalog, days, now = Date.now() }) {
  const window = PERIODS.includes(days) ? days : 7;
  const since = window ? now - window * DAY_MS : 0;
  const prevSince = window ? since - window * DAY_MS : null;
  const problems = new Map(catalog.map((p) => [p.id, p]));

  // One pass over the submissions: per student totals, first accept per (student, problem), and everything inside the period.
  const per = new Map(students.map((s) => [s.id, { subs: 0, accepted: 0, lastMs: 0, solved: new Map(), inSubs: 0 }]));
  const events = []; // submissions of these students
  let firstMs = 0;
  for (const sub of submissions) {
    const p = per.get(sub.userId);
    if (!p) continue;
    const ms = toMs(sub.submittedAt);
    if (!ms || ms > now) continue;
    const ok = sub.verdict === 'Accepted';
    p.subs += 1; p.lastMs = Math.max(p.lastMs, ms);
    if (ok) { p.accepted += 1; const cur = p.solved.get(sub.problemId); if (cur == null || ms < cur) p.solved.set(sub.problemId, ms); }
    events.push({ userId: sub.userId, problemId: sub.problemId, ok, ms, language: sub.language });
    if (!firstMs || ms < firstMs) firstMs = ms;
  }

  const inPeriod = (ms) => ms >= since && ms <= now;
  const inPrev = (ms) => prevSince != null && ms >= prevSince && ms < since;
  const periodEvents = events.filter((e) => inPeriod(e.ms));
  const solvedIn = (lo, hi) => { let n = 0; for (const p of per.values()) for (const ms of p.solved.values()) if (ms >= lo && ms < hi) n += 1; return n; };
  const solvedNow = solvedIn(since, now + 1);
  const solvedPrev = prevSince != null ? solvedIn(prevSince, since) : null;
  const subsNow = periodEvents.length;
  const subsPrev = prevSince != null ? events.filter((e) => inPrev(e.ms)).length : null;
  const acceptedNow = periodEvents.filter((e) => e.ok).length;
  const practisingIds = new Set(periodEvents.map((e) => e.userId));

  // Practice states, the same words and rule as the Overview.
  let notStarted = 0; let stuck = 0; let goneQuiet = 0;
  for (const p of per.values()) {
    const st = studentState({ subs: p.subs, solved: p.solved.size, lastActiveMs: p.lastMs }, now);
    if (st === 'not_started') notStarted += 1; else if (st === 'stuck') stuck += 1; else if (st === 'gone_quiet') goneQuiet += 1;
  }
  const total = students.length;

  // Over time.
  const buckets = bucketsFor(window, now, firstMs).map((b) => ({ ...b, solved: 0, submissions: 0 }));
  for (const e of periodEvents) { const b = buckets.find((x) => e.ms >= x.start && e.ms < x.end); if (b) b.submissions += 1; }
  for (const p of per.values()) for (const ms of p.solved.values()) { const b = buckets.find((x) => ms >= x.start && ms < x.end); if (b) b.solved += 1; }

  // Difficulty: what was solved in the period, against what exists.
  const mix = { easy: 0, medium: 0, hard: 0, other: 0 };
  for (const p of per.values()) for (const [pid, ms] of p.solved) if (inPeriod(ms)) mix[difficultyOf(problems.get(pid))] += 1;
  const bank = { easy: 0, medium: 0, hard: 0, other: 0 };
  for (const pr of catalog) bank[difficultyOf(pr)] += 1;

  // When they practise: weekday by hour, in India.
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const e of periodEvents) { const t = istParts(e.ms); heat[t.day][t.hour] += 1; }

  // Languages.
  const langs = new Map();
  for (const e of periodEvents) {
    const l = langs.get(e.language) || { id: e.language, submissions: 0, passed: 0, students: new Set() };
    l.submissions += 1; if (e.ok) l.passed += 1; l.students.add(e.userId); langs.set(e.language, l);
  }
  const languages = [...langs.values()].map((l) => ({ id: l.id, name: LANGUAGE[l.id] || (l.id != null ? `Language ${l.id}` : 'Unknown'), submissions: l.submissions, passed: l.passed, pass_rate: pct(l.passed, l.submissions), students: l.students.size }))
    .sort((a, b) => b.submissions - a.submissions);

  // Problems people worked on in the period.
  const pm = new Map();
  for (const e of periodEvents) {
    const r = pm.get(e.problemId) || { subs: 0, ok: 0, tried: new Set(), solved: new Set() };
    r.subs += 1; if (e.ok) { r.ok += 1; r.solved.add(e.userId); } r.tried.add(e.userId); pm.set(e.problemId, r);
  }
  const problemRows = [...pm].map(([pid, r]) => {
    const pr = problems.get(pid);
    return { id: pid, title: pr?.title || 'A problem that was removed', difficulty: pr ? difficultyOf(pr) : 'other', tags: (pr?.tags || []).slice(0, 4), tried: r.tried.size, solved: r.solved.size, submissions: r.subs, pass_rate: pct(r.ok, r.subs) };
  }).sort((a, b) => b.tried - a.tried || b.submissions - a.submissions || a.title.localeCompare(b.title)).slice(0, 50);

  // Topic coverage: all time, because "how much of a topic has this department covered" does not depend on the period.
  const topicProblems = new Map();
  for (const pr of catalog) for (const raw of pr.tags || []) { const tag = String(raw).trim(); if (tag) { const k = tag.toLowerCase(); if (!topicProblems.has(k)) topicProblems.set(k, { name: tag, ids: new Set() }); topicProblems.get(k).ids.add(pr.id); } }
  const triedBy = new Map(); // student -> problems tried
  for (const e of events) { if (!triedBy.has(e.userId)) triedBy.set(e.userId, new Set()); triedBy.get(e.userId).add(e.problemId); }
  const topics = [...topicProblems.values()].map((t) => {
    let started = 0; let completed = 0; let shareSum = 0;
    for (const s of students) {
      const tried = triedBy.get(s.id);
      if (!tried || ![...t.ids].some((id) => tried.has(id))) continue;
      started += 1;
      const solvedCount = [...t.ids].filter((id) => per.get(s.id).solved.has(id)).length;
      if (solvedCount === t.ids.size) completed += 1;
      shareSum += solvedCount / t.ids.size;
    }
    return { name: t.name, problems: t.ids.size, started, completed, solved_share: started ? Math.round((shareSum / started) * 100) : 0, started_pct: pct(started, total) };
  }).sort((a, b) => b.problems - a.problems || a.name.localeCompare(b.name)).slice(0, 40);

  // By batch.
  const batchMap = new Map();
  for (const s of students) {
    const b = batchOf(s, now).label || 'No batch';
    const r = batchMap.get(b) || { name: b, students: 0, practising: 0, solved: 0 };
    r.students += 1; if (practisingIds.has(s.id)) r.practising += 1;
    for (const ms of per.get(s.id).solved.values()) if (inPeriod(ms)) r.solved += 1;
    batchMap.set(b, r);
  }
  const batches = [...batchMap.values()].map((r) => ({ ...r, practising_pct: pct(r.practising, r.students), per_student: r.students ? round1(r.solved / r.students) : 0 })).sort((a, b) => b.name.localeCompare(a.name));

  // What to look at: plain rules over the numbers above.
  const insights = [];
  const label = window === 0 ? 'overall' : window === 1 ? 'today' : `in the last ${window} days`;
  if (total && pct(notStarted, total) >= 25) insights.push({ severity: 'high', title: `${notStarted} of ${total} students have never practised`, detail: `That is ${pct(notStarted, total)}% of this view. They do not appear in any pass rate or topic figure until they start.` });
  if (stuck > 0) insights.push({ severity: 'high', title: `${stuck} student${stuck === 1 ? ' is' : 's are'} stuck`, detail: 'Submitting within the last 7 days but never had a solution accepted.' });
  if (solvedPrev && solvedPrev > 0 && solvedNow <= solvedPrev * 0.75) insights.push({ severity: 'medium', title: `Practice is falling off: ${solvedNow} problems solved ${label}, against ${solvedPrev} in the period before`, detail: `That is ${Math.round(((solvedPrev - solvedNow) / solvedPrev) * 100)}% fewer.` });
  if (goneQuiet > 0) insights.push({ severity: 'medium', title: `${goneQuiet} student${goneQuiet === 1 ? ' has' : 's have'} gone quiet`, detail: 'They practised before and have submitted nothing in the last 7 days.' });
  const weak = topics.filter((t) => t.problems >= 3 && t.started >= 3).sort((a, b) => a.solved_share - b.solved_share)[0];
  if (weak && weak.solved_share < 40) insights.push({ severity: 'medium', title: `${weak.name} is the weakest topic`, detail: `Students who started it have solved ${weak.solved_share}% of its ${weak.problems} problems on average.` });
  if (insights.length === 0 && total > 0) insights.push({ severity: 'low', title: 'Nothing stands out', detail: 'Few non-starters, nobody stuck, and no topic is far behind.' });

  return {
    period_days: window, computed_at: new Date(now).toISOString(),
    tiles: {
      students: total, problems: catalog.length, bank,
      participation_pct: pct(practisingIds.size, total), practising: practisingIds.size, not_started: notStarted, stuck, gone_quiet: goneQuiet,
      solved: solvedNow, solved_change: solvedPrev == null ? null : solvedNow - solvedPrev, submissions: subsNow, submissions_change: subsPrev == null ? null : subsNow - subsPrev,
      per_practising: practisingIds.size ? round1(solvedNow / practisingIds.size) : 0, pass_rate: pct(acceptedNow, subsNow),
    },
    over_time: buckets.map(({ label: l, solved, submissions: s }) => ({ label: l, solved, submissions: s })),
    difficulty: { solved: mix, bank },
    heatmap: heat, languages, problems: problemRows, topics, batches, insights,
  };
}

module.exports = { PERIODS, LANGUAGE, buildPracticeAnalytics, bucketsFor };
