const submissionRepo = require('../repositories/submissionRepository');
const { cached } = require('../utils/cache');
const { aggregateProblemStats } = require('../utils/studentStats');

// One full-collection scan per TTL window, shared by every request — the problem
// list is public and hit by every student, so computing this per request would
// multiply the scan by the number of concurrent users.
const TTL_SECONDS = 180;

exports.getProblemStats = () =>
  cached('problems:stats:v1', TTL_SECONDS, async () =>
    aggregateProblemStats(await submissionRepo.listAllForAnalytics()));
