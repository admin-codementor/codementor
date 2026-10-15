// Student portfolio: certifications, projects and achievements a student records
// about themselves, and the department-level completeness view built from them.
// Pure: no I/O, so validation and the aggregates are checkable against fixtures.
//
// Completeness is counted by TYPES a student has covered (nothing / one / two /
// all three), never by a score: a student with ten certificates and no project
// has covered one type, and that is what the HOD needs to see.

const TYPES = ['certification', 'project', 'achievement'];
const MAX_TITLE = 120;
const MAX_DETAIL = 500;
const MAX_LINK = 300;
const MAX_ITEMS_PER_STUDENT = 100;

const TYPE_PLURAL = { certification: 'certifications', project: 'projects', achievement: 'achievements' };

/** @returns {{error: string} | {item: {type, title, detail, date, link}}} */
function validateItem(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return { error: 'Nothing to save.' };
  const type = String(input.type || '');
  if (!TYPES.includes(type)) return { error: `Type must be one of: ${TYPES.join(', ')}.` };

  const title = String(input.title ?? '').replace(/\s+/g, ' ').trim();
  if (title.length < 2 || title.length > MAX_TITLE) return { error: `A title of 2 to ${MAX_TITLE} characters is required.` };

  const detail = String(input.detail ?? '').trim();
  if (detail.length > MAX_DETAIL) return { error: `Details can be at most ${MAX_DETAIL} characters.` };

  let date = null;
  if (input.date != null && String(input.date).trim() !== '') {
    const raw = String(input.date).trim();
    const parsed = new Date(`${raw}T00:00:00Z`);
    // The round trip matters: V8 quietly rolls 2026-02-31 over to March, so a parse alone accepts impossible dates.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
      return { error: 'Date must be a real date like 2026-03-14.' };
    }
    // A day of slack so a student in an earlier time zone can still enter "today".
    if (new Date(`${raw}T00:00:00Z`).getTime() > now + 86400000) return { error: 'Date cannot be in the future.' };
    date = raw;
  }

  let link = null;
  if (input.link != null && String(input.link).trim() !== '') {
    const raw = String(input.link).trim();
    if (raw.length > MAX_LINK) return { error: `Link can be at most ${MAX_LINK} characters.` };
    let url;
    try { url = new URL(raw); } catch { return { error: 'Link must be a full web address, like https://example.com.' }; }
    // Only web links: a javascript: or data: URL rendered as a link would be an XSS vector.
    if (!['http:', 'https:'].includes(url.protocol)) return { error: 'Link must start with http:// or https://.' };
    link = url.toString();
  }

  return { item: { type, title, detail, date, link } };
}

const BANDS = [
  { key: 'none', label: 'Nothing on record', types: 0 },
  { key: 'one', label: 'One type', types: 1 },
  { key: 'two', label: 'Two types', types: 2 },
  { key: 'all', label: 'All three types', types: 3 },
];

/**
 * @param {object} a
 * @param {{id,name,rollNo?,section?,year?,mentorId?}[]} a.students
 * @param {{userId,type}[]} a.items
 * @param {Map<string,string>} [a.mentorNames]
 */
function buildPortfolioOverview({ students, items, mentorNames = new Map() }) {
  const per = new Map(students.map((s) => [s.id, { certification: 0, project: 0, achievement: 0 }]));
  for (const it of items) {
    const p = per.get(it.userId);
    if (p && TYPES.includes(it.type)) p[it.type] += 1;
  }

  const records = students.map((s) => {
    const c = per.get(s.id);
    const types = TYPES.filter((t) => c[t] > 0).length;
    return {
      id: s.id, name: s.name || 'Unknown', roll_no: s.rollNo || null, section: s.section || null, year: s.year ?? null,
      mentor_name: s.mentorId ? (mentorNames.get(s.mentorId) ?? null) : null,
      certifications: c.certification, projects: c.project, achievements: c.achievement, types,
    };
  }).sort((a, b) => a.types - b.types || a.name.localeCompare(b.name));

  const bands = BANDS.map((b) => ({ key: b.key, label: b.label, count: records.filter((r) => r.types === b.types).length }));

  // Where the gaps are, worst first: the share of each group with nothing at all.
  const gapsBy = (keyOf, labelOf) => {
    const groups = new Map();
    for (const r of records) {
      const k = keyOf(r);
      const g = groups.get(k) || { key: k, label: labelOf(k), students: 0, nothing: 0, all_three: 0 };
      g.students += 1;
      if (r.types === 0) g.nothing += 1;
      if (r.types === 3) g.all_three += 1;
      groups.set(k, g);
    }
    return [...groups.values()]
      .map((g) => ({ ...g, nothing_pct: Math.round((g.nothing / g.students) * 100) }))
      .sort((a, b) => b.nothing_pct - a.nothing_pct || b.students - a.students || String(a.label).localeCompare(String(b.label)));
  };

  return {
    totals: {
      students: records.length,
      nothing: bands[0].count,
      all_three: bands[3].count,
      items: items.filter((i) => per.has(i.userId)).length,
    },
    bands,
    gaps: {
      section: gapsBy((r) => r.section || 'Unassigned', (k) => (k === 'Unassigned' ? 'No section' : `Section ${k}`)),
      year: gapsBy((r) => (r.year == null ? 'Unassigned' : String(r.year)), (k) => (k === 'Unassigned' ? 'No year' : `Year ${k}`)),
      mentor: gapsBy((r) => r.mentor_name || 'none', (k) => (k === 'none' ? 'No mentor' : k)),
    },
    records,
  };
}

module.exports = {
  TYPES, TYPE_PLURAL, BANDS, MAX_TITLE, MAX_DETAIL, MAX_LINK, MAX_ITEMS_PER_STUDENT,
  validateItem, buildPortfolioOverview,
};
