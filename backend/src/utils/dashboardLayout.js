// A staff member's dashboard layout: which widgets are shown and in what order. Saved per person; the server owns the list of widgets, so a
// saved layout can never name something that does not exist, and a widget added in a later release appears for everyone (at the end).
const REGISTRY = [
  { id: 'stats', title: 'Class numbers', description: 'Students, active this week, acceptance rate and submissions.' },
  { id: 'attention', title: 'Needs attention', description: 'Students who have not started, went quiet, or are stuck on a problem.' },
  { id: 'at-risk', title: 'At-risk students', description: 'Students flagged by inactivity, deadlines and failed attempts.' },
  { id: 'hardest', title: 'Hardest problems', description: 'Problems most of the students who tried did not solve.' },
  { id: 'deadlines', title: 'Upcoming deadlines', description: 'Your assignments, soonest first.' },
  { id: 'summary', title: 'Quick summary', description: 'The numbers in one list.' },
];
const IDS = REGISTRY.map((w) => w.id);
const VERSION = 1;
const MAX_WIDGETS = 30;

const PRESETS = [
  { id: 'default', title: 'Everything', widgets: IDS.map((id) => ({ id, visible: true })) },
  { id: 'monitoring', title: 'Watching students', widgets: [
    { id: 'stats', visible: true }, { id: 'at-risk', visible: true }, { id: 'attention', visible: true }, { id: 'deadlines', visible: true },
    { id: 'hardest', visible: false }, { id: 'summary', visible: false },
  ] },
  { id: 'minimal', title: 'Just the essentials', widgets: [
    { id: 'stats', visible: true }, { id: 'at-risk', visible: true },
    { id: 'attention', visible: false }, { id: 'hardest', visible: false }, { id: 'deadlines', visible: false }, { id: 'summary', visible: false },
  ] },
];

const clone = (list) => list.map((w) => ({ id: w.id, visible: !!w.visible }));
const defaultLayout = () => ({ version: VERSION, preset: 'default', widgets: clone(PRESETS[0].widgets) });

/**
 * Make anything that was saved safe to use: widgets that no longer exist are dropped, repeats are dropped, bad entries are ignored, and
 * widgets that are new since it was saved are added at the end, visible. Anything unusable gives the default layout.
 */
function normalise(saved) {
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.widgets)) return defaultLayout();
  const seen = new Set();
  const widgets = [];
  for (const w of saved.widgets.slice(0, MAX_WIDGETS)) {
    if (!w || typeof w.id !== 'string' || !IDS.includes(w.id) || seen.has(w.id)) continue;
    seen.add(w.id);
    widgets.push({ id: w.id, visible: w.visible !== false });
  }
  for (const id of IDS) if (!seen.has(id)) widgets.push({ id, visible: true });
  const preset = PRESETS.find((p) => p.id === saved.preset && JSON.stringify(p.widgets) === JSON.stringify(widgets)) ? saved.preset : null;
  return { version: VERSION, preset, widgets };
}

/** Strict check of what a person sends to save. @returns {{ok: true, layout: object} | {ok: false, error: string}} */
function validateInput(body) {
  if (body && typeof body.preset === 'string' && !Array.isArray(body.widgets)) {
    const p = PRESETS.find((x) => x.id === body.preset);
    return p ? { ok: true, layout: { version: VERSION, preset: p.id, widgets: clone(p.widgets) } } : { ok: false, error: 'There is no such preset.' };
  }
  if (!body || !Array.isArray(body.widgets)) return { ok: false, error: 'Send the list of widgets.' };
  if (body.widgets.length > MAX_WIDGETS) return { ok: false, error: 'Too many widgets.' };
  const seen = new Set();
  for (const w of body.widgets) {
    if (!w || typeof w.id !== 'string' || typeof w.visible !== 'boolean') return { ok: false, error: 'Each widget needs an id and visible true or false.' };
    if (!IDS.includes(w.id)) return { ok: false, error: `There is no widget called "${String(w.id).slice(0, 30)}".` };
    if (seen.has(w.id)) return { ok: false, error: 'A widget is listed twice.' };
    seen.add(w.id);
  }
  return { ok: true, layout: normalise({ widgets: body.widgets }) };
}

module.exports = { REGISTRY, PRESETS, VERSION, defaultLayout, normalise, validateInput };
