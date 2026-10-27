// One student's exam, as the real exam page does it. Every scenario in ../scenarios uses this and only changes the knobs.
//
//   dashboard -> instructions -> start (claims the session) -> [think -> save an answer -> now and then reload / record a violation]
//   -> read everything back and compare -> (optionally) submit
//
// The read-back is the point: an answer the server accepted must still be there at the end. `lost_answers` counts every one that is not.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

export const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3399';
export const EXAM_ID = __ENV.EXAM_ID || '11111111-1111-4111-8111-111111111111';

export const num = (name, fallback) => (__ENV[name] !== undefined && __ENV[name] !== '' ? Number(__ENV[name]) : fallback);
const rand = (min, max) => min + Math.random() * (max - min);

export const students = new SharedArray('students', () => {
  if (!__ENV.TOKENS_FILE) throw new Error('Set TOKENS_FILE to the sign-in tokens file written by the sandbox (loadtest/run-local.js does this).');
  return JSON.parse(open(__ENV.TOKENS_FILE));
});

// What the run counts, beyond k6's own numbers.
export const lostAnswers = new Counter('lost_answers');           // accepted by the server, missing or different at the end
export const answersSaved = new Counter('answers_saved');
export const badStatus = new Counter('bad_status');               // a 5xx, or a 4xx that the scenario did not expect
export const replacedRefused = new Counter('old_session_refused'); // the replaced window was correctly turned away
export const submitsDone = new Counter('submits_done');

export function parse(res) {
  try { return res.json(); } catch (e) { return null; }
}

export function call(method, path, body, headers, name, expected, extraTags) {
  const tags = Object.assign({ name: name }, extraTags || {});
  const res = http.request(method, BASE + path, body === null ? null : JSON.stringify(body), { headers, tags });
  // status 0 = no answer at all (connection refused or reset, timeout): the worst kind of failure, so it is counted like a 5xx.
  const ok = (res.status !== 0 && res.status < 400) || (expected || []).indexOf(res.status) !== -1;
  if (!ok) badStatus.add(1, tags);
  return res;
}

/** Thresholds every scenario shares. Pass criteria come from docs/scale-readiness/19-load-testing.md and the S2 targets. */
export function sharedThresholds(extra) {
  return Object.assign({
    bad_status: ['count==0'],            // zero 5xx
    lost_answers: ['count==0'],          // nothing accepted is ever lost
    checks: ['rate>0.999'],
    'http_req_duration{name:save}': ['p(95)<500'],
    'http_req_duration{name:attempt}': ['p(95)<1000'],
    'http_req_duration{name:start}': ['p(95)<2000'],
  }, extra || {});
}

/**
 * @param cfg.startWindow    seconds over which students arrive (the start burst)
 * @param cfg.stopAfterStart true = only the start sequence (the burst scenario)
 * @param cfg.runSeconds     how long the student keeps answering
 * @param cfg.thinkMin/Max   seconds between answers
 * @param cfg.surgeAt        from this many seconds in, answer surgeFactor times faster (the last-minutes rush)
 * @param cfg.stormAt        at this many seconds in, reload the exam: claim a new session and prove the old one is refused
 * @param cfg.reloadRate     chance per answer of reloading the page's state
 * @param cfg.violationRate  chance per answer of recording a tab-switch event
 * @param cfg.submit         submit at the end, spread over submitWindow seconds
 */
export function runStudent(cfg) {
  const me = students[(__VU - 1) % students.length];
  const headers = { Authorization: 'Bearer ' + me.token, 'Content-Type': 'application/json' };
  const examPath = '/api/exams/' + EXAM_ID;

  sleep(Math.random() * (cfg.startWindow || 0));

  call('GET', '/api/exams/available', null, headers, 'dashboard');
  call('GET', examPath + '/instructions', null, headers, 'instructions');
  const started = call('POST', examPath + '/start', {}, headers, 'start');
  const body = parse(started);
  const data = body && body.data;
  const ok = check(started, { 'start gives a session': (r) => r.status === 200 && !!data && !!data.session_id });
  if (!ok) return;
  let session = data.session_id;

  if (cfg.stopAfterStart) {
    call('GET', examPath + '/attempt', null, Object.assign({ 'X-Exam-Session': session }, headers), 'attempt');
    return;
  }

  const section = data.sections.filter((s) => s.type === 'mcq')[0];
  const questions = section.questions;
  const sent = {};                 // question id -> option sent last
  let seq = 0;
  let cursor = 0;
  let stormDone = false;
  const t0 = Date.now();
  const elapsed = () => (Date.now() - t0) / 1000;
  const withSession = () => Object.assign({ 'X-Exam-Session': session }, headers);

  while (elapsed() < cfg.runSeconds) {
    const surging = cfg.surgeAt !== undefined && elapsed() >= cfg.surgeAt;
    sleep(rand(cfg.thinkMin, cfg.thinkMax) / (surging ? cfg.surgeFactor : 1));

    if (cfg.stormAt !== undefined && !stormDone && elapsed() >= cfg.stormAt) {
      stormDone = true;
      const old = session;
      const again = call('POST', examPath + '/start', {}, headers, 'start');
      const again2 = parse(again);
      if (!check(again, { 'reload claims a new session': (r) => r.status === 200 && !!again2 && !!again2.data && again2.data.session_id !== old })) continue;
      session = again2.data.session_id;
      seq = 0;                      // a new session counts its saves from the start, like the page does
      // The window that was replaced must be refused, not silently accepted.
      const stale = call('PATCH', examPath + '/attempt/questions/' + questions[0].id, { section_id: section.id, marked: false, seq: 1, selected_index: 0 },
        Object.assign({ 'X-Exam-Session': old }, headers), 'save_old_session', [409]);
      const refused = check(stale, { 'old session is refused': (r) => r.status === 409 });
      if (refused) replacedRefused.add(1);
    }

    cursor = Math.random() < 0.1 ? Math.max(0, cursor - 3) : cursor + 1;     // mostly forward, sometimes back to a skipped one
    const q = questions[cursor % questions.length];
    const pick = Math.floor(Math.random() * 4);
    seq += 1;
    const saved = call('PATCH', examPath + '/attempt/questions/' + q.id, { section_id: section.id, marked: false, seq: seq, selected_index: pick }, withSession(), 'save');
    if (check(saved, { 'save accepted': (r) => r.status === 200 })) { sent[q.id] = pick; answersSaved.add(1); }

    if (Math.random() < cfg.reloadRate) call('GET', examPath + '/attempt', null, withSession(), 'attempt');
    if (Math.random() < cfg.violationRate) call('POST', '/api/proctor/event', { exam_id: EXAM_ID, event_type: 'tab_switch' }, headers, 'proctor');
  }

  if (cfg.submit) {
    sleep(Math.random() * (cfg.submitWindow || 0));
    const done = call('POST', examPath + '/submit', {}, withSession(), 'submit');
    if (check(done, { 'submit accepted': (r) => r.status === 200 })) submitsDone.add(1);
  }

  // Read everything back and compare with what was accepted.
  const final = parse(call('GET', examPath + '/attempt', null, withSession(), 'attempt'));
  const state = final && final.data && final.data.question_state;
  const ids = Object.keys(sent);
  for (let i = 0; i < ids.length; i += 1) {
    const s = state && state[ids[i]];
    if (!s || s.selectedIndex !== sent[ids[i]]) lostAnswers.add(1);
  }
  if (cfg.submit) check(final, { 'submitted attempt reads back as submitted': () => !!(final && final.data && final.data.submitted) });
}

/** The knobs most scenarios read from the environment (-e NAME=value). */
export function envConfig() {
  return {
    startWindow: num('START_WINDOW', 600),
    runSeconds: num('RUN_SECONDS', 600),
    thinkMin: num('THINK_MIN', 20),
    thinkMax: num('THINK_MAX', 60),
    reloadRate: num('RELOAD_RATE', 0.02),
    violationRate: num('VIOLATION_RATE', 0.01),
  };
}
