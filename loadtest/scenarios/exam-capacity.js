// Scenario 5: capacity. Everyone has already started; then the rate of answer-saves is stepped up (RATES, saves per second, STEP_SECONDS
// each) and every request is tagged with the step it belongs to. The runner prints a table of rate / achieved / p95 / errors per step, and
// "capacity" is the highest step that held p95 under 500 ms with no errors.
//
// For scale: 1000 students answering one question every 40 seconds is 25 saves per second. A last-minutes rush at 5x is about 125.
import http from 'k6/http';
import { sleep } from 'k6';
import { students, call, parse, badStatus, BASE, EXAM_ID, num } from '../lib/journey.js';

const rates = (__ENV.RATES || '50,100,200,300,400,500,600,700,800,1000').split(',').map(Number);
const stepSeconds = num('STEP_SECONDS', 20);

const thresholds = { bad_status: ['count==0'] };
rates.forEach((r) => {
  // Placeholder thresholds (always true) only make k6 write each step's numbers into the summary file the runner reads.
  thresholds['http_req_duration{name:save,rate:' + r + '}'] = ['p(95)>=0'];
  thresholds['http_reqs{name:save,rate:' + r + '}'] = ['count>=0'];
  thresholds['bad_status{name:save,rate:' + r + '}'] = ['count>=0'];
});

export const options = {
  setupTimeout: '600s',
  scenarios: {
    capacity: {
      executor: 'ramping-arrival-rate',
      startRate: rates[0], timeUnit: '1s',
      preAllocatedVUs: num('PRE_VUS', 300), maxVUs: num('MAX_VUS', 3000),
      // Jump to each rate in one second, then hold it, so a step runs at its own rate (a straight ramp would average it with the one before).
      stages: rates.reduce((acc, r) => acc.concat([{ target: r, duration: '1s' }, { target: r, duration: (stepSeconds - 1) + 's' }]), []),
    },
  },
  thresholds: thresholds,
};

// Start every student and keep what a save needs.
export function setup() {
  const list = [];
  for (let from = 0; from < students.length; from += 50) {
    const reqs = [];
    for (let i = from; i < Math.min(from + 50, students.length); i += 1) {
      reqs.push(['POST', BASE + '/api/exams/' + EXAM_ID + '/start', '{}', { headers: { Authorization: 'Bearer ' + students[i].token, 'Content-Type': 'application/json' }, tags: { name: 'setup_start' } }]);
    }
    const responses = http.batch(reqs);
    for (let j = 0; j < responses.length; j += 1) {
      const body = parse(responses[j]);
      const data = body && body.data;
      if (!data || !data.session_id) { badStatus.add(1, { name: 'setup_start' }); continue; }
      const section = data.sections.filter((s) => s.type === 'mcq')[0];
      list.push({ token: students[from + j].token, session: data.session_id, sectionId: section.id, qids: section.questions.slice(0, 10).map((q) => q.id) });
    }
    sleep(0.05);
  }
  return { list: list, t0: Date.now() };
}

export default function (data) {
  // Which step are we in? Counted from the moment the first request is allowed to run (setup ends, then the ramp begins).
  const step = Math.min(rates.length - 1, Math.max(0, Math.floor((Date.now() - data.t0) / (stepSeconds * 1000))));
  const me = data.list[Math.floor(Math.random() * data.list.length)];
  const qid = me.qids[Math.floor(Math.random() * me.qids.length)];
  call('PATCH', '/api/exams/' + EXAM_ID + '/attempt/questions/' + qid,
    { section_id: me.sectionId, marked: false, seq: Date.now(), selected_index: Math.floor(Math.random() * 4) },
    { Authorization: 'Bearer ' + me.token, 'Content-Type': 'application/json', 'X-Exam-Session': me.session }, 'save', undefined, { rate: String(rates[step]) });
}
