// A student's percentile and badge among their cohort, from distinct problems solved. Pure.
const { badgeFor } = require('./departmentAnalytics');

// A percentile among a handful of people says nothing and can point at one person, so a small cohort shows no badge.
const MIN_COHORT = 10;

/** Percentile = share of the cohort that solved strictly fewer. Null when the cohort is too small. */
function standingFrom(solved, cohortCounts) {
  if (cohortCounts.length < MIN_COHORT) return null;
  const below = cohortCounts.filter((v) => v < solved).length;
  const percentile = Math.round((below / cohortCounts.length) * 100);
  return { percentile, badge: badgeFor(percentile), cohortSize: cohortCounts.length };
}

module.exports = { standingFrom, MIN_COHORT };
