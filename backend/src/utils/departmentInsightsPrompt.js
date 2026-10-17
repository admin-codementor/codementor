// Builds the AI prompt for the HOD "actionable insights" button.
//
// Privacy rule (decision D2 in the faculty-authoring plan): an AI provider only
// ever sees AGGREGATES. summarise() copies named numeric fields out of the
// department analytics and nothing else, so no student name, id, roll number or
// per-student row can reach the prompt, and a field added to the analytics later
// is excluded by default rather than leaked by default.
const { QUIET_DAYS, LOW_ACCURACY_PCT, MIN_SUBS_FOR_ACCURACY } = require('./studentState');

const MAX_INSIGHTS = 5;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** @param {object} data  result of departmentAnalyticsService (contains per-student rows we must not copy) */
function summarise(data, { department = null } = {}) {
  return {
    department: department ?? 'All departments',
    view: {
      section: data.scope?.section ?? null,
      year: data.scope?.year ?? null,
    },
    totals: {
      students: data.totals.students,
      active_last_7_days: data.totals.active_last_7,
      avg_problems_solved: data.totals.avg_solved,
      avg_accuracy_pct: data.totals.avg_accuracy,
    },
    funnel: Object.fromEntries(data.funnel.map((f) => [f.label, f.count])),
    flags: { red: data.flags.red, orange: data.flags.orange, green: data.flags.green },
    sections: data.sections.map((s) => ({
      section: s.name, students: s.students, avg_solved: s.avg_solved,
      needs_attention_pct: s.at_risk_pct, on_track_pct: s.on_track_pct,
    })),
    badges: Object.fromEntries(data.badges.map((b) => [b.name, b.count])),
    weekly: data.weekly.map((w) => ({ week_start: w.week_start, submissions: w.subs, solved: w.solved, active_days: w.active_days })),
    rule_based_findings: data.insights.map((i) => i.title),
  };
}

function buildPrompt(summary) {
  const system = [
    'You advise the head of a college engineering department on student coding practice.',
    'You are given ONLY aggregate numbers for one department. Use only those numbers; never invent figures,',
    'and never name or guess at individual students. Do not give advice about any one student.',
    'Write plain, specific recommendations a head of department can act on this week.',
    'Reply with JSON only, in exactly this shape:',
    '{"headline": string, "insights": [{"title": string, "detail": string, "action": string, "priority": "high"|"medium"|"low"}]}',
    `Give between 3 and ${MAX_INSIGHTS} insights, most important first. "detail" cites the numbers that justify it;`,
    '"action" is one concrete step (who does what).',
  ].join(' ');

  const rules = `Definitions used by the platform: "Gone quiet" = no submission for ${QUIET_DAYS} days; ` +
    `low accuracy = below ${LOW_ACCURACY_PCT}% with at least ${MIN_SUBS_FOR_ACCURACY} submissions; ` +
    'badges are percentile bands on problems solved within the view.';
  const prompt = `${rules}\n\nDepartment summary (aggregates only):\n${JSON.stringify(summary, null, 2)}`;
  return { system, prompt };
}

/** Never trust the model's shape: keep only well-formed, length-limited strings. */
function sanitiseInsights(raw) {
  const list = Array.isArray(raw?.insights) ? raw.insights : [];
  const insights = list
    .map((i) => ({
      title: clip(i?.title, 120),
      detail: clip(i?.detail, 400),
      action: clip(i?.action, 240),
      priority: ['high', 'medium', 'low'].includes(i?.priority) ? i.priority : 'medium',
    }))
    .filter((i) => i.title && i.detail)
    .slice(0, MAX_INSIGHTS);
  return { headline: clip(raw?.headline, 200), insights };
}

module.exports = { summarise, buildPrompt, sanitiseInsights, MAX_INSIGHTS };
