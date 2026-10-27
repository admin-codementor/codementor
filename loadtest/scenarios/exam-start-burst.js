// Scenario 1: the start burst. Everyone opens the exam in the first minutes (default 1000 students over 10 minutes).
// Dashboard -> instructions -> start -> first read of the attempt. Nothing else.
import { runStudent, sharedThresholds, envConfig, num } from '../lib/journey.js';

const cfg = envConfig();

export const options = {
  scenarios: {
    burst: { executor: 'per-vu-iterations', vus: num('VUS', 1000), iterations: 1, maxDuration: (cfg.startWindow + 900) + 's' },
  },
  thresholds: sharedThresholds(),
};

export default function () {
  runStudent(Object.assign({}, cfg, { stopAfterStart: true }));
}
