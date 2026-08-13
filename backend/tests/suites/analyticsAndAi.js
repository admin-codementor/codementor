// Analytics correctness, and the AI endpoints when a provider is available.
//
// The analytics checks assert the ARITHMETIC, not just HTTP 200 — a dashboard that
// renders confident wrong numbers is worse than one that errors.
const { tokenFor, get, post, Suite, capabilities, purge, userId, del } = require('../harness');

module.exports = async function analyticsAndAiSuite() {
  const s = new Suite('Analytics & AI');
  const ADMIN = tokenFor('an-admin', 'admin');
  const CSE = tokenFor('an-cse', 'faculty', { department: 'CSE' });

  // ── Overview ───────────────────────────────────────────────────────────────
  const o = await get('/api/faculty/analytics/overview?dimension=department&days=3650', ADMIN);
  s.check('overview returns 200', o.status === 200, `status ${o.status}`);
  const d = o.body?.data;

  if (!d) {
    s.check('overview payload present', false, 'no data');
    return s;
  }

  s.check('KPIs present', typeof d.kpis?.submissions?.value === 'number');
  s.check('day×hour grid is 7×24', d.activityByDayHour?.length === 7 && d.activityByDayHour.every((r) => r.length === 24));

  const gridTotal = d.activityByDayHour.flat().reduce((a, b) => a + b, 0);
  const dailyTotal = d.daily.reduce((a, r) => a + r.subs, 0);
  s.check('heatmap total matches the daily total', gridTotal === dailyTotal, `${gridTotal} vs ${dailyTotal}`);

  const box = d.solvedDistribution;
  if (box) {
    s.check('quartiles are ordered', box.min <= box.q1 && box.q1 <= box.median && box.median <= box.q3 && box.q3 <= box.max,
      `${box.min}/${box.q1}/${box.median}/${box.q3}/${box.max}`);
    s.check('distribution n matches the student count', box.n === d.kpis.totalStudents.value, `${box.n} vs ${d.kpis.totalStudents.value}`);
    s.check('histogram counts sum to the student count',
      d.solvedHistogram.reduce((a, b) => a + b.count, 0) === box.n);
  } else {
    s.skip('distribution checks', 'no student data in scope');
  }

  s.check('scatter percentages are within 0–100', (d.studentScatter ?? []).every((p) => p.y >= 0 && p.y <= 100));
  s.check('hardest problems sorted by solve rate ascending',
    (d.hardestProblems ?? []).every((p, i, arr) => i === 0 || arr[i - 1].solveRate <= p.solveRate));
  s.check('languages resolved to names, not raw ids',
    (d.languages ?? []).every((l) => !/^Lang(uage)? /.test(l.name) || /^Language \d+$/.test(l.name)),
    (d.languages ?? []).map((l) => l.name).join(', '));

  // ── Caching ────────────────────────────────────────────────────────────────
  const t0 = Date.now();
  await get('/api/faculty/analytics/overview?dimension=year&days=3650', ADMIN);
  const cachedMs = Date.now() - t0;
  s.check('cached snapshot serves quickly', cachedMs < 3000, `${cachedMs}ms`);

  // ── Problem level ──────────────────────────────────────────────────────────
  const pid = d.mostAttempted?.[0]?.id;
  if (!pid) {
    s.skip('problem analytics', 'no problem has submissions yet');
  } else {
    const pa = await get(`/api/faculty/analytics/problem/${pid}`, ADMIN);
    s.check('problem analytics returns 200', pa.status === 200, `status ${pa.status}`);
    const f = pa.body?.data?.funnel ?? [];
    s.check('funnel stages are nested (monotonically non-increasing)',
      f.every((x, i) => i === 0 || f[i - 1].value >= x.value),
      f.map((x) => `${x.stage}=${x.value}`).join(' → '));
    s.check('test-case fail rates are percentages',
      (pa.body?.data?.testHeatmap ?? []).every((t) => t.failRate >= 0 && t.failRate <= 100));
  }

  // ── MCQ item analysis ──────────────────────────────────────────────────────
  const tests = await get('/api/mcq/tests', ADMIN);
  const withAttempts = (tests.body?.data ?? []).find((t) => t.attempt_count > 0);
  if (!withAttempts) {
    s.skip('MCQ item analysis', 'no test has submitted attempts');
  } else {
    const ia = await get(`/api/faculty/analytics/mcq/${withAttempts.id}`, ADMIN);
    s.check('item analysis returns 200', ia.status === 200, `status ${ia.status}`);
    const items = ia.body?.data?.items ?? [];
    s.check('difficulty index within 0–1', items.every((i) => i.difficultyIndex >= 0 && i.difficultyIndex <= 1));
    s.check('discrimination index within −1–1', items.every((i) => i.discriminationIndex >= -1 && i.discriminationIndex <= 1));
    s.check('difficulty matches correct/attempts',
      items.every((i) => Math.abs(i.difficultyIndex - i.correct / ia.body.data.attempts) < 0.02));
  }

  // ── Department scoping ─────────────────────────────────────────────────────
  const scoped = await get('/api/faculty/analytics/overview?days=3650', CSE);
  s.check('faculty analytics scoped to their department', scoped.body?.data?.scope?.department === 'CSE', JSON.stringify(scoped.body?.data?.scope?.department));
  s.check('scoped student count does not exceed the global count',
    scoped.body.data.kpis.totalStudents.value <= d.kpis.totalStudents.value,
    `${scoped.body.data.kpis.totalStudents.value} vs ${d.kpis.totalStudents.value}`);
  const crossDept = await get('/api/faculty/analytics/cohort?dimension=department&value=ECE', CSE);
  s.check('CSE faculty blocked from an ECE cohort', crossDept.status === 403, `status ${crossDept.status}`);

  // ── AI endpoints ───────────────────────────────────────────────────────────
  const caps = await capabilities();
  if (!caps.ai) {
    s.skip('AI tutor', `provider unavailable — ${caps.aiDetail}`);
    s.skip('AI explain-error', 'same');
    s.skip('AI code review (JSON mode)', 'same');
    s.skip('AI test-case generation', 'same');
  } else {
    const S = tokenFor('an-student', 'student');
    s.onCleanup(async () => {
      await purge('aiTutorConversations', 'userId', [userId('an-student')]);
    }, 'AI conversation history');

    const tutor = await post('/api/ai/tutor', S, {
      problemId: 'smoke', problemDescription: 'Reverse a linked list.', code: 'x', message: 'my loop never ends',
    });
    s.check('AI tutor responds', tutor.status === 200 && (tutor.body?.response ?? '').length > 10, `status ${tutor.status}`);
    s.check('tutor stays Socratic (ends with a question)', (tutor.body?.response ?? '').trim().endsWith('?'),
      (tutor.body?.response ?? '').trim().slice(-50));

    const explain = await post('/api/ai/explain-error', S, {
      problemDescription: 'Sum an array.', code: 'for i in range(len(a)+1): s+=a[i]', errorTrace: 'IndexError',
    });
    s.check('AI explain-error responds', explain.status === 200 && (explain.body?.explanation ?? '').length > 10, `status ${explain.status}`);

    const review = await post('/api/ai/review-code', S, {
      problemDescription: 'Find duplicates.', code: 'function d(a){for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i]===a[j])return true;return false;}',
    });
    s.check('AI code review returns parsed JSON', review.status === 200 && typeof review.body?.review === 'object', `status ${review.status}`);
    s.check('review has a numeric quality score', typeof review.body?.review?.qualityScore === 'number', String(review.body?.review?.qualityScore));

    // Generation depends on Judge0 *executing*, not merely being reachable.
    if (!caps.judge0Executes) {
      s.skip('AI test-case generation', `needs a working sandbox — ${caps.judge0Detail}`);
    } else {
      const F = tokenFor('an-faculty', 'faculty');
      const gen = await post('/api/faculty/ai/generate-tests', F, {
        title: 'Sum of Two Numbers',
        description: 'Read two integers a and b on one line and print their sum.\n\nExample:\nInput:\n2 3\nOutput:\n5',
        count: 4,
      });
      s.check('generation returns verified cases', gen.status === 200 && gen.body?.data?.verification?.verified === true, `status ${gen.status} ${gen.body?.error ?? ''}`);
      s.check('the reference reproduced the statement samples',
        gen.body?.data?.verification?.samplesPassed === gen.body?.data?.verification?.samplesChecked);

      const wrong = await post('/api/faculty/ai/generate-tests', F, {
        title: 'Sum of Two Numbers',
        description: 'Read two integers a and b and print their sum.\n\nExample:\nInput:\n2 3\nOutput:\n6',
        count: 3,
      });
      s.check('REFUSES when the statement example is wrong', wrong.status === 422 && wrong.body?.code === 'REFERENCE_UNRELIABLE',
        `status ${wrong.status} ${wrong.body?.code ?? ''}`);
    }
  }

  return s;
};
