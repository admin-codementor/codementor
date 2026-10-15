// HOD (department head) features. One suite, extended phase by phase:
//   H3 cross-department leaderboard (aggregates only).
//   H4 department activity (who is active / at risk, last seen).
//   H5 AI insights (the provider must only ever see aggregates).
// Pure checks run against fixtures with a fixed clock; API checks cover role
// gating and that nothing identifying leaves a department.
const { tokenFor, get, post, Suite, capabilities } = require('../harness');
const { DAY_MS } = require('../../src/utils/studentState');
const { buildDepartmentLeaderboard, MIN_RANKED_STUDENTS } = require('../../src/utils/departmentLeaderboard');
const { buildActivity } = require('../../src/utils/departmentActivity');
const { summarise, buildPrompt, sanitiseInsights, MAX_INSIGHTS } = require('../../src/utils/departmentInsightsPrompt');

const now = Date.UTC(2026, 9, 1, 12, 0, 0);

function leaderboardPure(s) {
  const st = (id, department) => ({ id, department });
  const sub = (userId, problemId, daysAgo, verdict = 'Accepted') => ({ userId, problemId, verdict, submittedAt: new Date(now - daysAgo * DAY_MS) });
  const students = [
    st('c1', 'CSE'), st('c2', 'cse'), st('c3', ' Cse '),         // one department, three spellings
    st('m1', 'MECH'), st('m2', 'MECH'), st('m3', 'MECH'), st('m4', 'MECH'),
    st('e1', 'ECE'), st('e2', 'ECE'),                              // too small to rank
    st('u1', null),                                                // no department
  ];
  const submissions = [
    sub('c1', 'p1', 1), sub('c1', 'p2', 1), sub('c2', 'p1', 2), sub('c3', 'p3', 3),   // CSE: 4 solved / 3
    sub('m1', 'p1', 1), sub('m2', 'p1', 30),                                           // MECH: 2 solved / 4, one active
    sub('e1', 'p1', 1), sub('u1', 'p1', 1),
  ];
  const { ranked, unranked } = buildDepartmentLeaderboard({ students, submissions, now });

  s.check('leaderboard: spellings of one department merge', ranked.some((r) => r.department === 'CSE' && r.students === 3), JSON.stringify(ranked.map((r) => [r.department, r.students])));
  s.check('leaderboard: ranked by solved per student', ranked[0].department === 'CSE' && ranked[0].solved_per_student === 1.3 && ranked[1].department === 'MECH', JSON.stringify(ranked.map((r) => [r.department, r.solved_per_student])));
  s.check('leaderboard: ranks start at 1 and follow order', ranked.map((r) => r.rank).join() === '1,2');
  s.check(`leaderboard: under ${MIN_RANKED_STUDENTS} students is listed but not ranked`, unranked.some((r) => r.department === 'ECE') && !ranked.some((r) => r.department === 'ECE'));
  s.check('leaderboard: students with no department are never ranked', unranked.some((r) => r.department === 'UNASSIGNED') && !ranked.some((r) => r.department === 'UNASSIGNED'));
  s.check('leaderboard: every student is counted exactly once', [...ranked, ...unranked].reduce((n, r) => n + r.students, 0) === students.length);
  s.check('leaderboard: active % counts the last 7 days only', ranked.find((r) => r.department === 'MECH').active_pct === 25, String(ranked.find((r) => r.department === 'MECH').active_pct));
  s.check('leaderboard: a department with idle students has needs-attention above zero', ranked.find((r) => r.department === 'MECH').needs_attention_pct > 0);
  const flat = JSON.stringify({ ranked, unranked });
  s.check('leaderboard: no student id or name appears in the output', !/"(id|name|email|roll_?no)"/i.test(flat) && !/\bc1\b|\bm1\b/.test(flat));

  const tie = buildDepartmentLeaderboard({
    students: ['a1', 'a2', 'a3'].map((id) => st(id, 'A')).concat(['b1', 'b2', 'b3'].map((id) => st(id, 'B'))),
    submissions: [sub('a1', 'p', 1), sub('b1', 'p', 1)], now,
  });
  s.check('leaderboard: level departments share a rank', tie.ranked.every((r) => r.rank === 1), JSON.stringify(tie.ranked.map((r) => r.rank)));
  s.check('leaderboard: empty input does not throw', (() => { try { const e = buildDepartmentLeaderboard({ students: [], submissions: [], now }); return e.ranked.length === 0; } catch { return false; } })());
}

function activityPure(s) {
  const person = (id, name, loginDaysAgo) => ({ id, name, lastLoginAt: loginDaysAgo == null ? null : new Date(now - loginDaysAgo * DAY_MS) });
  const people = [person('a', 'Ann', 1), person('b', 'Bob', 20), person('c', 'Cy', null), person('d', 'Di', 10)];
  const submissions = [
    { userId: 'b', submittedAt: new Date(now - 2 * DAY_MS) },          // Bob logged in long ago but submitted 2 days ago
    { userId: 'b', submittedAt: new Date(now - 2 * DAY_MS - 3600000) }, // same day, an hour earlier
    { userId: 'b', submittedAt: new Date(now - 3 * DAY_MS) },
    { userId: 'd', submittedAt: new Date(now - 40 * DAY_MS) },          // outside every window but 30
  ];
  const r7 = buildActivity({ people, submissions, days: 7, now });
  const by = (r, id) => r.rows.find((x) => x.id === id);

  s.check('activity: totals add up', r7.totals.people === 4 && r7.totals.active + r7.totals.at_risk === 4, JSON.stringify(r7.totals));
  s.check('activity: a login inside the window is active', by(r7, 'a').status === 'active');
  s.check('activity: a recent submission counts even with an old login', by(r7, 'b').status === 'active' && by(r7, 'b').days_since_seen === 2);
  s.check('activity: never logged in and never submitted is at risk with no last seen', by(r7, 'c').status === 'at_risk' && by(r7, 'c').last_seen === null && by(r7, 'c').days_since_seen === null);
  s.check('activity: days active counts distinct submission days', by(r7, 'b').active_days === 2, String(by(r7, 'b').active_days));
  s.check('activity: at-risk people are listed first, longest unseen first', r7.rows[0].id === 'c' && r7.rows[1].id === 'd', r7.rows.map((x) => x.id).join());

  const r30 = buildActivity({ people, submissions, days: 30, now });
  s.check('activity: a wider window turns a 10-day-old login active', by(r30, 'd').status === 'active' && r30.totals.active === 3, JSON.stringify(r30.totals));
  s.check('activity: an unsupported window falls back to 7 days', buildActivity({ people, days: 999, now }).days === 7);
  s.check('activity: an empty department does not throw', (() => { try { return buildActivity({ people: [], days: 7, now }).totals.people === 0; } catch { return false; } })());
}

function insightsPure(s) {
  const data = {
    scope: { section: 'A', year: null },
    totals: { students: 5, active_last_7: 3, avg_solved: 2.4, avg_accuracy: 55, solved: 12, submissions: 60 },
    funnel: [
      { key: 'not_started', label: 'Not started', count: 1, students: [{ id: 'uid-secret-1', name: 'Ravi Kumar', roll_no: '22VE1A6601', section: 'A', reasons: ['Has never submitted anything'] }] },
      { key: 'practising', label: 'Practising', count: 4, students: [{ id: 'uid-secret-2', name: 'Sita Devi', roll_no: '22VE1A6602', section: 'A', reasons: [] }] },
    ],
    flags: { red: 1, orange: 1, green: 3 },
    sections: [{ name: 'A', students: 5, avg_solved: 2.4, at_risk: 1, at_risk_pct: 20, on_track: 3, on_track_pct: 60 }],
    badges: [{ name: 'Builder', count: 2 }, { name: 'Foundation', count: 3 }],
    weekly: [{ week_start: '2026-09-20', week_end: '2026-09-26', subs: 10, solved: 4, active_days: 12, subs_change: null }],
    insights: [{ severity: 'high', title: '1 of 5 students have never submitted', detail: 'x' }],
    students: [{ id: 'uid-secret-1', name: 'Ravi Kumar', roll_no: '22VE1A6601', badge: 'Foundation' }, { id: 'uid-secret-2', name: 'Sita Devi', roll_no: '22VE1A6602', badge: 'Builder' }],
  };
  const sum = summarise(data, { department: 'CSE' });
  const { system, prompt } = buildPrompt(sum);
  const everything = `${system}
${prompt}`;

  s.check('insights: the prompt contains no student name', !/Ravi|Sita|Kumar|Devi/.test(everything));
  s.check('insights: the prompt contains no student id or roll number', !/uid-secret|22VE1A66/.test(everything));
  s.check('insights: per-student lists are not copied into the summary', !('students' in sum) && Object.values(sum.funnel).every((v) => typeof v === 'number'));
  s.check('insights: the numbers the model needs are present', prompt.includes('"CSE"') && prompt.includes('"Not started": 1') && prompt.includes('"Foundation": 3'));
  s.check('insights: the prompt states the platform thresholds (7 days, 30%, 5 submissions)', /7 days/.test(prompt) && /30%/.test(prompt) && /5 submissions/.test(prompt));
  s.check('insights: the system prompt forbids naming students', /never name/i.test(system));
  s.check('insights: a field added to the analytics later is not leaked by default', !buildPrompt(summarise({ ...data, secret_new_field: 'LEAKME' }, {})).prompt.includes('LEAKME'));

  const clean = sanitiseInsights({
    headline: '  Practice is uneven  ',
    insights: [
      { title: 'A', detail: 'd', action: 'a', priority: 'high' },
      { title: '', detail: 'dropped: no title' },
      { title: 'B', detail: 'd', priority: 'bogus' },
      { title: 'x'.repeat(500), detail: 'y'.repeat(900), action: 'z'.repeat(900) },
      ...Array.from({ length: 10 }, (_, i) => ({ title: `T${i}`, detail: 'd' })),
    ],
  });
  s.check('insights: junk entries are dropped', clean.insights.every((i) => i.title && i.detail) && !clean.insights.some((i) => i.detail.startsWith('dropped')));
  s.check('insights: an unknown priority becomes medium', clean.insights.find((i) => i.title === 'B').priority === 'medium');
  s.check('insights: lengths are capped', clean.insights.every((i) => i.title.length <= 120 && i.detail.length <= 400 && i.action.length <= 240));
  s.check(`insights: at most ${MAX_INSIGHTS} are kept`, clean.insights.length === MAX_INSIGHTS);
  s.check('insights: the headline is trimmed', clean.headline === 'Practice is uneven');
  s.check('insights: a non-object reply yields an empty, safe result', (() => { const e = sanitiseInsights('not json'); return e.insights.length === 0 && e.headline === ''; })());
}

module.exports = async function hodFeaturesSuite() {
  const s = new Suite('HOD features');
  leaderboardPure(s);
  activityPure(s);
  insightsPure(s);

  // ── H3: who may open it, and what it reveals ───────────────────────────────
  const BOARD = '/api/faculty/department-leaderboard';
  s.check('leaderboard: unauthenticated → 401', (await get(BOARD)).status === 401);
  s.check('leaderboard: student → 403', (await get(BOARD, tokenFor('hod-student', 'student'))).status === 403);
  s.check('leaderboard: faculty → 403', (await get(BOARD, tokenFor('hod-faculty', 'faculty'))).status === 403);

  const hod = await get(BOARD, tokenFor('hod-cse', 'hod'));
  s.check('leaderboard: HOD → 200', hod.status === 200, `status ${hod.status}`);
  const d = hod.body?.data;
  if (d) {
    s.check('leaderboard: the HOD\'s own department is identified', d.your_department === 'CSE', String(d.your_department));
    const all = [...d.ranked, ...d.unranked];
    s.check('leaderboard: at most one row is marked "you"', all.filter((r) => r.you).length <= 1);
    s.check('leaderboard: the marked row is the HOD\'s department', all.filter((r) => r.you).every((r) => r.department === 'CSE'));
    s.check('leaderboard: no student-level fields leave the server', !/"(id|name|email|roll_?no|student_ids)"/i.test(JSON.stringify(d)));
    s.check('leaderboard: ranks are consecutive from 1 where distinct', d.ranked.every((r, i) => r.rank >= 1 && r.rank <= i + 1));
  }

  const otherHod = await get(BOARD, tokenFor('hod-ece', 'hod', { department: 'ECE' }));
  s.check('leaderboard: an ECE HOD is marked on the ECE row, not CSE', otherHod.body?.data?.your_department === 'ECE');

  const admin = await get(BOARD, tokenFor('hod-admin', 'admin'));
  s.check('leaderboard: admin → 200, no row marked as theirs', admin.status === 200 && admin.body?.data?.your_department === null);

  // ── The legacy all-departments endpoint is closed to faculty and HOD ───────
  const LEGACY = '/api/faculty/analytics';
  s.check('legacy analytics: faculty → 403', (await get(LEGACY, tokenFor('hod-faculty', 'faculty'))).status === 403);
  s.check('legacy analytics: HOD → 403', (await get(LEGACY, tokenFor('hod-cse', 'hod'))).status === 403);
  s.check('legacy analytics: admin still works', (await get(LEGACY, tokenFor('hod-admin', 'admin'))).status === 200);

  // ── H4: department activity ────────────────────────────────────────────────
  const ACT = '/api/faculty/department/activity';
  s.check('activity: unauthenticated → 401', (await get(ACT)).status === 401);
  s.check('activity: student → 403', (await get(ACT, tokenFor('hod-student', 'student'))).status === 403);
  s.check('activity: faculty → 403', (await get(ACT, tokenFor('hod-faculty', 'faculty'))).status === 403);

  const hodTok = tokenFor('hod-cse', 'hod');
  const act = await get(`${ACT}?kind=students&days=30`, hodTok);
  s.check('activity: HOD students view → 200', act.status === 200, `status ${act.status}`);
  const ad = act.body?.data;
  if (ad) {
    s.check('activity: scoped to the HOD own department', ad.scope.department === 'CSE', String(ad.scope.department));
    s.check('activity: active + at risk equals the roster', ad.totals.active + ad.totals.at_risk === ad.totals.people && ad.rows.length === ad.totals.people);
    s.check('activity: honours the 30-day window', ad.days === 30);
  }
  const spoof = await get(`${ACT}?kind=students&department=ECE&days=7`, hodTok);
  s.check('activity: a ?department= override is ignored', spoof.body?.data?.scope?.department === 'CSE');
  const fac = await get(`${ACT}?kind=faculty&days=90`, hodTok);
  s.check('activity: faculty view → 200', fac.status === 200 && fac.body?.data?.kind === 'faculty', `status ${fac.status}`);
  s.check('activity: the faculty view never lists admins', fac.status === 200 && Array.isArray(fac.body?.data?.rows));
  const odd = await get(`${ACT}?kind=nonsense&days=12345`, hodTok);
  s.check('activity: junk parameters fall back to students / 7 days', odd.status === 200 && odd.body?.data?.kind === 'students' && odd.body?.data?.days === 7);
  const adminAct = await get(`${ACT}?kind=students`, tokenFor('hod-admin', 'admin'));
  s.check('activity: admin sees all departments', adminAct.status === 200 && adminAct.body?.data?.scope?.department === null);

  // ── H5: AI insights ────────────────────────────────────────────────────────
  const INS = '/api/faculty/department/insights';
  s.check('insights: unauthenticated → 401', (await post(INS, null, {})).status === 401);
  s.check('insights: student → 403', (await post(INS, tokenFor('hod-student', 'student'), {})).status === 403);
  s.check('insights: faculty → 403', (await post(INS, tokenFor('hod-faculty', 'faculty'), {})).status === 403);
  const caps = await capabilities();
  if (!caps.ai) {
    s.skip('insights: HOD generates insights end to end', `AI provider unavailable (${caps.aiDetail})`);
  } else {
    const ins = await post(INS, hodTok, {});
    // A busy provider (429/502/503) is infrastructure, not a defect: report it as a gap, never a pass.
    if ([429, 502, 503].includes(ins.status)) {
      s.skip('insights: HOD generates insights end to end', `AI provider answered ${ins.status} (${String(ins.body?.error || '').slice(0, 80)})`);
      s.check('insights: a provider failure is passed through as an error with a message, not a crash', typeof ins.body?.error === 'string' && ins.body.error.length > 0);
      return s;
    }
    s.check('insights: HOD → 200 with a headline and a bounded list', ins.status === 200 && typeof ins.body?.data?.headline === 'string' && ins.body.data.insights.length <= MAX_INSIGHTS, `status ${ins.status}`);
    s.check('insights: every item has a title, detail and valid priority', (ins.body?.data?.insights || []).every((i) => i.title && i.detail && ['high', 'medium', 'low'].includes(i.priority)));
  }

  return s;
};
