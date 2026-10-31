// AI "actionable insights" for the HOD dashboard. The provider only sees the
// aggregates built by utils/departmentInsightsPrompt.summarise().
//
// When the AI is switched off by the Admin, is over its daily limit, or fails, the HOD still gets a real summary: the department's own
// "what to look at" list, shaped like an AI answer and marked source "rules". It is never a blank page and never an invented score.
const { cached } = require('../utils/cache');
const aiGateway = require('./aiGateway');
const departmentAnalyticsService = require('./departmentAnalyticsService');
const { scopeDept } = require('../middleware/role.middleware');
const { summarise, buildPrompt, sanitiseInsights } = require('../utils/departmentInsightsPrompt');

const TTL_SECONDS = 600; // 10 minutes: insights change slowly and every call spends AI quota
const VERSION = 1;

/** The same facts the AI would be given, written by fixed rules. */
function rulesSummary(data, why) {
  const insights = (data.insights || []).slice(0, 6).map((i) => ({
    title: String(i.title).slice(0, 120),
    detail: String(i.detail).slice(0, 400),
    priority: i.severity === 'high' ? 'high' : i.severity === 'medium' ? 'medium' : 'low',
    action: i.severity === 'low' ? '' : 'Open the Needs attention list on the Overview tab and send a reminder.',
  }));
  return {
    headline: `${data.totals.students} students in this view. Written by fixed rules from the department's own numbers.`,
    insights, generated_at: new Date().toISOString(), source: 'rules', ai_note: why,
  };
}

const NO_STUDENTS = { headline: 'There are no students in this view yet.', insights: [] };

async function getInsights(req, { section, year }) {
  const dept = scopeDept(req);
  const rules = async (why) => {
    const data = await departmentAnalyticsService.getDepartmentAnalytics(req, { section, year });
    return data.totals.students === 0 ? { ...NO_STUDENTS, generated_at: new Date().toISOString(), source: 'rules', ai_note: why } : rulesSummary(data, why);
  };
  // Switched off by the Admin, or over the daily limit (see middleware/aiAccess.js, soft mode).
  if (req.aiRefusal) return rules(req.aiRefusal.error);

  const key = `ai:dept-insights:v${VERSION}:${dept ?? 'all'}:${section || 'all'}:${year || 'all'}`;
  try {
    return await cached(key, TTL_SECONDS, async () => {
      const data = await departmentAnalyticsService.getDepartmentAnalytics(req, { section, year });
      if (data.totals.students === 0) return { ...NO_STUDENTS, generated_at: new Date().toISOString(), source: 'ai' };
      const { system, prompt } = buildPrompt(summarise(data, { department: dept }));
      const { data: reply } = await aiGateway.generateJson({ system, prompt, temperature: 0.3 });
      return { ...sanitiseInsights(reply), generated_at: new Date().toISOString(), source: 'ai' };
    });
  } catch (e) {
    // The AI service failed (busy, not configured, a bad answer). The fallback is not cached, so the next press tries the AI again.
    console.error('department insights: AI failed, using the rules summary:', String(e?.status || e?.message || e).slice(0, 100));
    return rules('The AI service did not answer just now.');
  }
}

module.exports = { getInsights, rulesSummary };
