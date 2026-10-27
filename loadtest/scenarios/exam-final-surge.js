// Scenario 3: the last-minutes rush (the "hockey stick"). A steady exam, then from SURGE_AT seconds everyone answers SURGE_FACTOR times
// faster, and when time is nearly up everyone presses Finish within SUBMIT_WINDOW seconds. Every submit must succeed and read back as submitted.
import { runStudent, sharedThresholds, envConfig, num } from '../lib/journey.js';

const cfg = envConfig();
const surgeAt = num('SURGE_AT', Math.round(cfg.runSeconds * 0.66));
const submitWindow = num('SUBMIT_WINDOW', 120);

export const options = {
  scenarios: {
    surge: { executor: 'per-vu-iterations', vus: num('VUS', 1000), iterations: 1, maxDuration: (cfg.startWindow + cfg.runSeconds + submitWindow + 900) + 's' },
  },
  thresholds: sharedThresholds({
    submits_done: ['count>0'],
    'http_req_duration{name:submit}': ['p(95)<2000'],
  }),
};

export default function () {
  runStudent(Object.assign({}, cfg, { surgeAt: surgeAt, surgeFactor: num('SURGE_FACTOR', 5), submit: true, submitWindow: submitWindow }));
}
