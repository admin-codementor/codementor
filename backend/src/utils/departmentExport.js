// The department export for a HOD or Admin: a fixed list of fields, in a fixed order, as a spreadsheet-safe CSV. Pure.
// Every export is written to the audit log by the caller (who, which fields, how many students).
const { csvCell } = require('./placementPolicy');
const { batchOf } = require('./batch');

const FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'rollNo', label: 'Roll number' },
  { key: 'department', label: 'Department' },
  { key: 'batch', label: 'Batch' },
  { key: 'year', label: 'Year' },
  { key: 'section', label: 'Section' },
  { key: 'email', label: 'Email' },
  { key: 'practiceState', label: 'Practice state' },
  { key: 'needsAttention', label: 'Needs attention' },
  { key: 'problemsSolved', label: 'Problems solved' },
  { key: 'accuracy', label: 'Accuracy %' },
  { key: 'lastActive', label: 'Last practised' },
  { key: 'codingScore', label: 'Coding score' },
  { key: 'codingBand', label: 'Coding band' },
];
const KEYS = FIELDS.map((f) => f.key);
const STATE = { not_started: 'Not started', practising: 'Practising', stuck: 'Stuck', gone_quiet: 'Gone quiet' };
const FLAG = { red: 'Red', orange: 'Orange', green: 'Green' };

/** @returns {{error: string} | {fields: string[]}} always in the same column order */
function validateFields(list) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'Choose at least one field to export.' };
  const asked = [...new Set(list.map(String))];
  const bad = asked.find((f) => !KEYS.includes(f));
  if (bad) return { error: `"${bad.slice(0, 30)}" is not a field that can be exported.` };
  return { fields: KEYS.filter((k) => asked.includes(k)) };
}

/**
 * One row per student.
 * @param {object[]} analytics  rows from the department analytics (id, roll_no, section, year, state, flag, solved, ac_rate, last_active)
 * @param {object[]} scores     rows from the coding score (id, overall, flag)
 * @param {Map<string, object>} students  full student records by id (name, email, department, admissionYear)
 */
function buildRows({ analytics, scores, students, now }) {
  const byScore = new Map((scores || []).map((r) => [r.id, r]));
  return (analytics || []).map((a) => {
    const s = students.get(a.id) || {};
    const c = byScore.get(a.id);
    return {
      name: s.name || 'Unknown', rollNo: a.roll_no, department: s.department ?? null, batch: batchOf({ ...s, year: a.year ?? s.year }, now).label,
      year: a.year, section: a.section, email: s.email ?? null, practiceState: STATE[a.state] || a.state, needsAttention: FLAG[a.flag] || a.flag,
      problemsSolved: a.solved, accuracy: a.subs ? a.ac_rate : null, lastActive: a.last_active ? String(a.last_active).slice(0, 10) : null,
      codingScore: c ? c.overall : null, codingBand: c ? FLAG[c.flag] : null,
    };
  });
}

function toCsv(fields, rows) {
  const labels = fields.map((k) => FIELDS.find((f) => f.key === k).label);
  return `${[labels.map(csvCell).join(','), ...rows.map((r) => fields.map((k) => csvCell(r[k])).join(','))].join('\r\n')}\r\n`;
}

module.exports = { FIELDS, validateFields, buildRows, toCsv };
