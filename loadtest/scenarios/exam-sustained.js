// Scenario 2: a sustained exam. Everyone starts, then answers one question every THINK_MIN..THINK_MAX seconds, now and then reloads the
// page or records a violation, and at the end every accepted answer is read back and compared. Run it for 3 hours (RUN_SECONDS=10800)
// as the soak test: the thing to watch is memory growing over time (the runner reports it).
import { runStudent, sharedThresholds, envConfig, num } from '../lib/journey.js';

const cfg = envConfig();

export const options = {
  scenarios: {
    sustained: { executor: 'per-vu-iterations', vus: num('VUS', 1000), iterations: 1, maxDuration: (cfg.startWindow + cfg.runSeconds + 900) + 's' },
  },
  thresholds: sharedThresholds(),
};

export default function () {
  runStudent(Object.assign({}, cfg, { submit: false }));
}
