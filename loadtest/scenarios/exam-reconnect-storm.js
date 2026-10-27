// Scenario 4: the reconnect storm. A network blip or a server restart makes every student reload the exam at about the same moment
// (STORM_AT seconds in). Each one claims a new session, and the window they had before must be refused (not silently accepted). Saves
// carry on with the new session, and at the end every accepted answer is still there.
import { runStudent, sharedThresholds, envConfig, num } from '../lib/journey.js';

const cfg = envConfig();
const stormAt = num('STORM_AT', Math.round(cfg.runSeconds / 2));
const vus = num('VUS', 1000);

export const options = {
  scenarios: {
    storm: { executor: 'per-vu-iterations', vus: vus, iterations: 1, maxDuration: (cfg.startWindow + cfg.runSeconds + 900) + 's' },
  },
  thresholds: sharedThresholds({
    old_session_refused: ['count>=' + vus],   // every replaced window was turned away
  }),
};

export default function () {
  runStudent(Object.assign({}, cfg, { stormAt: stormAt, submit: false }));
}
