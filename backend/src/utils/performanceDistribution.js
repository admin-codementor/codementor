// How a student's accepted solution compares with everyone else's, for the runtime / memory graph.
//
// Rules, stated once so the graph and its caption cannot drift apart:
//  - Only accepted submissions count, and each student counts once, with their best (lowest) value.
//  - Solutions are compared within one language: a Java run and a Python run are not comparable.
//  - "Faster than X%" is the share of OTHER students' solutions that are slower, with a tie counting as half.
//    With no other solution yet there is no percentage (null) rather than a made-up 100%.

const METRICS = ['runtime', 'memory'];
const BIN_COUNT = 8;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function bestPerStudent(subs, key) {
  const best = new Map();
  for (const s of subs) {
    if (!s.userId || s.verdict !== 'Accepted' || !isNum(s[key])) continue;
    const cur = best.get(s.userId);
    if (cur === undefined || s[key] < cur) best.set(s.userId, s[key]);
  }
  return best;
}

function histogram(values, mine) {
  const all = mine == null ? values : [...values, mine];
  if (!all.length) return [];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  if (lo === hi) return [{ from: lo, to: hi, count: values.length, mine: mine != null }];
  const width = (hi - lo) / BIN_COUNT;
  const bins = Array.from({ length: BIN_COUNT }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0, mine: false }));
  const at = (v) => Math.min(BIN_COUNT - 1, Math.floor((v - lo) / width));
  values.forEach((v) => { bins[at(v)].count++; });
  if (mine != null) bins[at(mine)].mine = true;
  return bins;
}

function percentileFaster(others, mine) {
  if (!others.length || mine == null) return null;
  const slower = others.filter((v) => v > mine).length;
  const same = others.filter((v) => v === mine).length;
  return Math.round(((slower + same / 2) / others.length) * 100);
}

function performanceDistribution(submissions, userId) {
  const mineSubs = submissions.filter((s) => s.userId === userId && s.verdict === 'Accepted');
  const myBest = mineSubs.reduce((b, s) => (isNum(s.runtime) && (!b || s.runtime < b.runtime) ? s : b), null);
  const language = myBest ? String(myBest.language ?? '') : null;
  // With no accepted solution of their own there is nothing to compare, so use every language together.
  const pool = language === null ? submissions : submissions.filter((s) => String(s.language ?? '') === language);

  const out = { language, mine: null, students: 0 };
  for (const key of METRICS) {
    const all = bestPerStudent(pool, key);
    const mine = all.get(userId) ?? null;
    const others = [...all.entries()].filter(([id]) => id !== userId).map(([, v]) => v);
    out[key] = {
      mine,
      bins: histogram(others, mine),
      others: others.length,
      fasterThanPercent: percentileFaster(others, mine),
      best: all.size ? Math.min(...all.values()) : null,
      median: others.length ? [...others].sort((a, b) => a - b)[Math.floor(others.length / 2)] : null,
    };
  }
  out.students = new Set(pool.filter((s) => s.verdict === 'Accepted').map((s) => s.userId)).size;
  out.mine = out.runtime.mine != null || out.memory.mine != null;
  return out;
}

module.exports = { performanceDistribution, BIN_COUNT };
