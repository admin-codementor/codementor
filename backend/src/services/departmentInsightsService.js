// AI "actionable insights" for the HOD dashboard. The provider only sees the
// aggregates built by utils/departmentInsightsPrompt.summarise().
const { cached } = require('../utils/cache');
const aiGateway = require('./aiGateway');
const departmentAnalyticsService = require('./departmentAnalyticsService');
const { scopeDept } = require('../middleware/role.middleware');
const { summarise, buildPrompt, sanitiseInsights } = require('../utils/departmentInsightsPrompt');

const TTL_SECONDS = 600; // 10 minutes: insights change slowly and every call spends AI quota
const VERSION = 1;

exports.getInsights = async (req, { section, year }) => {
  const dept = scopeDept(req);
  const key = `ai:dept-insights:v${VERSION}:${dept ?? 'all'}:${section || 'all'}:${year || 'all'}`;
  return cached(key, TTL_SECONDS, async () => {
    const data = await departmentAnalyticsService.getDepartmentAnalytics(req, { section, year });
    if (data.totals.students === 0) {
      return { headline: 'There are no students in this view yet.', insights: [], generated_at: new Date().toISOString() };
    }
    const { system, prompt } = buildPrompt(summarise(data, { department: dept }));
    const { data: reply } = await aiGateway.generateJson({ system, prompt, temperature: 0.3 });
    return { ...sanitiseInsights(reply), generated_at: new Date().toISOString() };
  });
};
