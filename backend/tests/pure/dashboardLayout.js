// A staff member's dashboard layout (utils/dashboardLayout.js) and the class insights (utils/classInsights.js).
const L = require('../../src/utils/dashboardLayout');
const { classInsights } = require('../../src/utils/classInsights');

const DAY = 86400000;

module.exports = async function (s) {
  // ── layout ──
  const ids = L.REGISTRY.map((w) => w.id);
  s.check('the default layout shows every widget, in the registry order', JSON.stringify(L.defaultLayout().widgets.map((w) => w.id)) === JSON.stringify(ids) && L.defaultLayout().widgets.every((w) => w.visible) && L.defaultLayout().preset === 'default');
  s.check('nothing saved, or something unusable, gives the default', ['', null, undefined, 5, 'x', {}, { widgets: 'no' }, []].every((v) => JSON.stringify(L.normalise(v).widgets) === JSON.stringify(L.defaultLayout().widgets)));

  const saved = { widgets: [{ id: 'summary', visible: false }, { id: 'stats', visible: true }, { id: 'at-risk', visible: true }] };
  const n = L.normalise(saved);
  s.check('a saved order and visibility are kept', n.widgets[0].id === 'summary' && n.widgets[0].visible === false && n.widgets[1].id === 'stats');
  s.check('widgets added since it was saved appear at the end, visible', n.widgets.length === ids.length && ['attention', 'hardest', 'deadlines'].every((id) => n.widgets.find((w) => w.id === id)?.visible === true) && n.widgets.slice(3).every((w) => ids.includes(w.id)));
  s.check('widgets that no longer exist are dropped, repeats are dropped, and bad entries are ignored', (() => { const m = L.normalise({ widgets: [{ id: 'gone', visible: true }, { id: 'stats', visible: true }, { id: 'stats', visible: false }, null, 7, { id: 5 }, { visible: true }] }); return m.widgets.filter((w) => w.id === 'stats').length === 1 && m.widgets[0].id === 'stats' && m.widgets[0].visible === true && !m.widgets.some((w) => w.id === 'gone') && m.widgets.length === ids.length; })());
  s.check('a widget with no "visible" is shown', L.normalise({ widgets: [{ id: 'stats' }] }).widgets[0].visible === true);
  s.check('a huge list cannot blow up the work', L.normalise({ widgets: Array.from({ length: 100000 }, () => ({ id: 'stats', visible: true })) }).widgets.length === ids.length);
  s.check('a saved layout that is exactly a preset is recognised as that preset', L.normalise({ preset: 'monitoring', widgets: L.PRESETS[1].widgets }).preset === 'monitoring' && L.normalise({ preset: 'monitoring', widgets: L.PRESETS[2].widgets }).preset === null);

  // ── input ──
  const ok = L.validateInput({ widgets: ids.map((id, i) => ({ id, visible: i % 2 === 0 })).reverse() });
  s.check('a valid list is accepted and normalised', ok.ok && ok.layout.widgets[0].id === ids[ids.length - 1] && ok.layout.version === 1);
  s.check('an unknown widget is refused by name, not silently dropped', (() => { const r = L.validateInput({ widgets: [{ id: 'nope', visible: true }] }); return !r.ok && /nope/.test(r.error); })());
  s.check('repeats, missing fields and wrong types are refused', [{ widgets: [{ id: 'stats', visible: true }, { id: 'stats', visible: true }] }, { widgets: [{ id: 'stats' }] }, { widgets: [{ id: 'stats', visible: 'yes' }] }, { widgets: 'x' }, null, {}, { widgets: [null] }].every((b) => !L.validateInput(b).ok));
  s.check('too many entries are refused', !L.validateInput({ widgets: Array.from({ length: 31 }, () => ({ id: 'stats', visible: true })) }).ok);
  s.check('a preset can be chosen by name, and an unknown one is refused', L.validateInput({ preset: 'minimal' }).ok && L.validateInput({ preset: 'minimal' }).layout.widgets.filter((w) => w.visible).length === 2 && !L.validateInput({ preset: 'nope' }).ok);
  s.check('every preset covers every widget exactly once', L.PRESETS.every((p) => p.widgets.length === ids.length && new Set(p.widgets.map((w) => w.id)).size === ids.length && p.widgets.every((w) => ids.includes(w.id))));

  // ── insights ──
  const now = 1_700_000_000_000;
  const snap = {
    totalStudents: 6,
    studentStats: [
      { id: 'a1', name: 'Never', subs: 0, lastActiveMs: null, stuck: [] },
      { id: 'a2', name: 'Quiet', subs: 8, lastActiveMs: now - 20 * DAY, stuck: [] },
      { id: 'a3', name: 'Stuck', subs: 9, lastActiveMs: now - 1 * DAY, stuck: [{ problemId: 'p1', title: 'Two Sum', attempts: 7 }] },
      { id: 'a4', name: 'Fine', subs: 5, lastActiveMs: now - 2 * DAY, stuck: [] },
      { id: 'a5', name: 'Stuck less', subs: 6, lastActiveMs: now - 3 * DAY, stuck: [{ problemId: 'p1', title: 'Two Sum', attempts: 4 }] },
      { id: 'a6', name: 'Quiet longer', subs: 2, lastActiveMs: now - 40 * DAY, stuck: [] },
    ],
    problemStats: [
      { id: 'p1', title: 'Two Sum', difficulty: 'easy', attempters: 4, solvers: 0, solveRate: 0 },
      { id: 'p2', title: 'Easy one', difficulty: 'easy', attempters: 6, solvers: 6, solveRate: 100 },
      { id: 'p3', title: 'Tried by two', difficulty: 'hard', attempters: 2, solvers: 0, solveRate: 0 },
      { id: 'p4', title: 'Half', difficulty: 'medium', attempters: 5, solvers: 2, solveRate: 40 },
      { id: 'p5', title: 'Hard', difficulty: 'hard', attempters: 8, solvers: 2, solveRate: 25 },
    ],
  };
  const r = classInsights(snap, now);
  s.check('"not started" is exactly the students with no submissions', r.notStarted.total === 1 && r.notStarted.items[0].id === 'a1');
  s.check('"quiet" is students who submitted before but not for a week, the longest quiet first, with the days', r.quiet.total === 2 && r.quiet.items[0].id === 'a6' && r.quiet.items[0].daysQuiet === 40 && r.quiet.items[1].id === 'a2' && r.quiet.items[1].daysQuiet === 20);
  s.check('a student who never started is not also called quiet', !r.quiet.items.some((x) => x.id === 'a1'));
  s.check('"stuck" lists who and on what, the most attempts first', r.stuck.total === 2 && r.stuck.items[0].id === 'a3' && r.stuck.items[0].problems[0].attempts === 7 && r.stuck.items[1].id === 'a5');
  s.check('"hardest" needs at least 3 who tried and under 40% solving; the lowest rate first', r.hardest.total === 2 && r.hardest.items[0].id === 'p1' && r.hardest.items[1].id === 'p5' && !r.hardest.items.some((p) => p.id === 'p3' || p.id === 'p4' || p.id === 'p2'));
  s.check('every list reports its full count even when it is cut short', (() => { const big = { totalStudents: 100, studentStats: Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, subs: 0, stuck: [] })), problemStats: [] }; const x = classInsights(big, now); return x.notStarted.total === 100 && x.notStarted.items.length === 25; })());
  s.check('an empty class gives empty lists, not an error', (() => { const x = classInsights({ studentStats: [], problemStats: [] }, now); return x.notStarted.total === 0 && x.stuck.total === 0 && x.hardest.items.length === 0 && x.students === 0; })());
  s.check('missing data is tolerated', (() => { const x = classInsights(undefined, now); return x.quiet.total === 0 && x.students === 0; })());
  s.check('only names and roll numbers are listed, not email or marks', JSON.stringify(Object.keys(r.notStarted.items[0]).sort()) === JSON.stringify(['id', 'name', 'rollNo', 'section']));
};
