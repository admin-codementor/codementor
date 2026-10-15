// HOD (department head) features. One suite, extended phase by phase:
//   H3 cross-department leaderboard (aggregates only).
//   H4 department activity (who is active / at risk, last seen).
//   H5 AI insights (the provider must only ever see aggregates).
//   H6 mentor mapping, mentor leaderboard and the dashboard mentor filter.
//   H7 student portfolio and the department completeness view.
// Pure checks run against fixtures with a fixed clock; API checks cover role
// gating and that nothing identifying leaves a department.
const { tokenFor, userId, get, post, put, patch, del, Suite, capabilities, db, purge } = require('../harness');
const { DAY_MS } = require('../../src/utils/studentState');
const { buildDepartmentLeaderboard, MIN_RANKED_STUDENTS } = require('../../src/utils/departmentLeaderboard');
const { buildActivity } = require('../../src/utils/departmentActivity');
const { summarise, buildPrompt, sanitiseInsights, MAX_INSIGHTS } = require('../../src/utils/departmentInsightsPrompt');
const { buildMentorBoard, checkAssignment, MAX_ASSIGN } = require('../../src/utils/mentors');
const { validateItem, buildPortfolioOverview, MAX_TITLE, MAX_DETAIL } = require('../../src/utils/portfolio');

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

function mentorsPure(s) {
  const sub = (userId, problemId, daysAgo, verdict = 'Accepted') => ({ userId, problemId, verdict, submittedAt: new Date(now - daysAgo * DAY_MS) });
  const mentors = [{ id: 'm1', name: 'Mira' }, { id: 'm2', name: 'Nikhil' }, { id: 'm3', name: 'Idle' }];
  const students = [
    { id: 's1', mentorId: 'm1' }, { id: 's2', mentorId: 'm1' }, { id: 's3', mentorId: 'm2' },
    { id: 's4', mentorId: null }, { id: 's5', mentorId: 'gone' }, // no mentor / mentor left the department
  ];
  const submissions = [
    sub('s1', 'p1', 2), sub('s1', 'p2', 40), sub('s2', 'p1', 3), // m1: s1 solved 2 (one 40 days ago), s2 solved 1
    sub('s3', 'p1', 1), sub('s3', 'p2', 1), sub('s3', 'p3', 1),   // m2: s3 solved 3
  ];
  const all = buildMentorBoard({ mentors, students, submissions, period: 'overall', now });
  const mo = buildMentorBoard({ mentors, students, submissions, period: 'monthly', now });
  const by = (b, id) => b.mentors.find((m) => m.id === id);

  s.check('mentors: overall ranks by solved per mentee', by(all, 'm2').rank === 1 && by(all, 'm1').rank === 2, JSON.stringify(all.mentors.map((m) => [m.id, m.solved_per_mentee, m.rank])));
  s.check('mentors: overall solved per mentee is the mean', by(all, 'm1').solved_per_mentee === 1.5 && by(all, 'm2').solved_per_mentee === 3);
  s.check('mentors: monthly counts only problems first solved in the last 30 days', by(mo, 'm1').solved_per_mentee === 1, String(by(mo, 'm1').solved_per_mentee));
  s.check('mentors: a mentor with no mentees is listed last and unranked', all.mentors[all.mentors.length - 1].id === 'm3' && by(all, 'm3').rank === null && by(all, 'm3').mentees === 0);
  s.check('mentors: unassigned counts students with no mentor or a mentor outside scope', all.unassigned_students === 2, String(all.unassigned_students));
  s.check('mentors: every student is either a mentee or unassigned', all.mentors.reduce((n, m) => n + m.mentees, 0) + all.unassigned_students === students.length);
  s.check('mentors: active % counts mentees active in the last 7 days', by(all, 'm2').active_pct === 100 && by(all, 'm1').active_pct === 100);
  s.check('mentors: an empty department does not throw', (() => { try { return buildMentorBoard({ mentors: [], students: [], submissions: [], now }).mentors.length === 0; } catch { return false; } })());

  const hod = { requesterRole: 'hod', requesterDepartment: 'CSE' };
  const inCse = { id: 'a', department: 'CSE' };
  s.check('assign: same-department pairing is allowed', checkAssignment({ mentor: { role: 'faculty', department: 'CSE' }, students: [inCse], ...hod }) === null);
  s.check('assign: an HOD cannot use another department mentor', /outside your department/.test(checkAssignment({ mentor: { role: 'faculty', department: 'ECE' }, students: [inCse], ...hod }) || ''));
  s.check('assign: an HOD cannot assign another department students', /outside your department/.test(checkAssignment({ mentor: { role: 'faculty', department: 'CSE' }, students: [{ id: 'b', department: 'ECE' }], ...hod }) || ''));
  s.check('assign: an admin account can never be a mentor', /admin/.test(checkAssignment({ mentor: { role: 'admin', department: 'CSE' }, students: [inCse], ...hod }) || ''));
  s.check('assign: removing a mentor (null) needs no mentor check', checkAssignment({ mentor: null, students: [inCse], ...hod }) === null);
  s.check('assign: an admin may pair across departments', checkAssignment({ mentor: { role: 'faculty', department: 'ECE' }, students: [inCse], requesterRole: 'admin', requesterDepartment: null }) === null);
}

function portfolioPure(s) {
  const ok = (o) => validateItem({ type: 'certification', title: 'AWS Cloud Practitioner', ...o }, now);
  s.check('portfolio: a minimal valid entry is accepted', !!ok({}).item);
  s.check('portfolio: the title is trimmed and whitespace collapsed', ok({ title: '  A   B  ' }).item.title === 'A B');
  s.check('portfolio: an unknown type is rejected', !!validateItem({ type: 'hobby', title: 'Chess' }).error);
  s.check('portfolio: a missing or one-character title is rejected', !!ok({ title: '' }).error && !!ok({ title: 'x' }).error);
  s.check(`portfolio: a title over ${MAX_TITLE} characters is rejected`, !!ok({ title: 'x'.repeat(MAX_TITLE + 1) }).error);
  s.check(`portfolio: details over ${MAX_DETAIL} characters are rejected`, !!ok({ detail: 'x'.repeat(MAX_DETAIL + 1) }).error);
  s.check('portfolio: a real date is accepted and kept', ok({ date: '2026-03-14' }).item.date === '2026-03-14');
  s.check('portfolio: a malformed date is rejected', !!ok({ date: '14/03/2026' }).error);
  s.check('portfolio: an impossible date (31 February) is rejected', !!ok({ date: '2026-02-31' }).error);
  s.check('portfolio: a date well in the future is rejected', !!ok({ date: '2030-01-01' }).error);
  s.check('portfolio: an https link is accepted', ok({ link: 'https://example.com/cert/1' }).item.link === 'https://example.com/cert/1');
  s.check('portfolio: a javascript: link is rejected (it would be an XSS vector)', !!ok({ link: 'javascript:alert(1)' }).error);
  s.check('portfolio: data: and ftp: links are rejected', !!ok({ link: 'data:text/html,hi' }).error && !!ok({ link: 'ftp://x.test/a' }).error);
  s.check('portfolio: text that is not a link is rejected', !!ok({ link: 'not a link' }).error);
  s.check('portfolio: empty optional fields become null, not empty strings', (() => { const i = ok({ date: '', link: '' }).item; return i.date === null && i.link === null; })());
  s.check('portfolio: a non-object body is rejected', !!validateItem(null).error && !!validateItem('x').error);

  const students = [
    { id: 'a', name: 'A', section: 'A', year: 3, mentorId: 'm1' }, { id: 'b', name: 'B', section: 'A', year: 3, mentorId: null },
    { id: 'c', name: 'C', section: 'B', year: 2, mentorId: 'm1' }, { id: 'd', name: 'D', section: 'B', year: 2, mentorId: null },
  ];
  const items = [
    { userId: 'a', type: 'certification' }, { userId: 'a', type: 'certification' }, { userId: 'a', type: 'project' }, { userId: 'a', type: 'achievement' },
    { userId: 'b', type: 'certification' }, { userId: 'b', type: 'certification' }, { userId: 'b', type: 'certification' }, // many, but one type
    { userId: 'c', type: 'project' }, { userId: 'c', type: 'achievement' },
    { userId: 'outsider', type: 'project' },
  ];
  const o = buildPortfolioOverview({ students, items, mentorNames: new Map([['m1', 'Mira']]) });
  const band = (k) => o.bands.find((b) => b.key === k).count;
  s.check('portfolio: bands are counted by types covered, not by item count', band('none') === 1 && band('one') === 1 && band('two') === 1 && band('all') === 1, JSON.stringify(o.bands));
  s.check('portfolio: the four bands add up to the students', o.bands.reduce((n, b) => n + b.count, 0) === students.length);
  s.check('portfolio: ten certificates and nothing else is still one type', o.records.find((r) => r.id === 'b').types === 1);
  s.check('portfolio: items of students outside the view are not counted', o.totals.items === 9, String(o.totals.items));
  s.check('portfolio: records list the emptiest students first', o.records[0].id === 'd' && o.records[0].types === 0);
  s.check('portfolio: the gap table is worst first (share with nothing)', o.gaps.section[0].label === 'Section B' && o.gaps.section[0].nothing_pct === 50, JSON.stringify(o.gaps.section));
  s.check('portfolio: gaps can be grouped by mentor, with a "No mentor" group', o.gaps.mentor.some((g) => g.label === 'Mira') && o.gaps.mentor.some((g) => g.label === 'No mentor'));
  s.check('portfolio: an empty department does not throw', (() => { try { return buildPortfolioOverview({ students: [], items: [] }).totals.students === 0; } catch { return false; } })());
}

module.exports = async function hodFeaturesSuite() {
  const s = new Suite('HOD features');
  leaderboardPure(s);
  activityPure(s);
  insightsPure(s);
  mentorsPure(s);
  portfolioPure(s);

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
    } else {
      s.check('insights: HOD → 200 with a headline and a bounded list', ins.status === 200 && typeof ins.body?.data?.headline === 'string' && ins.body.data.insights.length <= MAX_INSIGHTS, `status ${ins.status}`);
      s.check('insights: every item has a title, detail and valid priority', (ins.body?.data?.insights || []).every((i) => i.title && i.detail && ['high', 'medium', 'low'].includes(i.priority)));
    }
  }

  // ── H6: mentors, over the API, on throwaway records ────────────────────────
  const MENT = '/api/faculty/mentors';
  s.check('mentors: unauthenticated → 401', (await get(MENT)).status === 401);
  s.check('mentors: student → 403', (await get(MENT, tokenFor('hod-student', 'student'))).status === 403);
  s.check('mentors: faculty cannot list → 403', (await get(MENT, tokenFor('hod-faculty', 'faculty'))).status === 403);
  s.check('mentors: faculty cannot assign → 403', (await put(`${MENT}/assign`, tokenFor('hod-faculty', 'faculty'), { mentor_id: null, student_ids: ['x'] })).status === 403);

  // Temporary records in a department nobody else uses; every one is deleted afterwards.
  const D = 'SMOKEDEPT';
  const made = [];
  const mk = async (collection, id, data) => { await db().collection(collection).doc(id).set({ ...data, isSmokeTest: true }); made.push([collection, id]); };
  s.onCleanup(async () => { for (const [c, id] of made) await db().collection(c).doc(id).delete().catch(() => {}); }, 'temporary mentor/student records');
  await mk('faculty', 'smoketest-mentor-a', { name: 'Smoke Mentor A', role: 'faculty', department: D });
  await mk('faculty', 'smoketest-mentor-other', { name: 'Smoke Mentor Other', role: 'faculty', department: 'SMOKEOTHER' });
  await mk('faculty', 'smoketest-mentor-admin', { name: 'Smoke Admin', role: 'admin', department: D });
  for (const n of [1, 2, 3]) await mk('students', `smoketest-mstu-${n}`, { name: `Smoke Student ${n}`, role: 'student', department: D, section: 'A', year: 3 });
  await mk('students', 'smoketest-mstu-out', { name: 'Smoke Outsider', role: 'student', department: 'SMOKEOTHER', section: 'A', year: 3 });

  const head = tokenFor('mentor-hod', 'hod', { department: D });
  const board0 = await get(MENT, head);
  s.check('mentors: HOD lists their department mentors', board0.status === 200 && board0.body?.data?.mentors?.some((m) => m.id === 'smoketest-mentor-a'), `status ${board0.status}`);
  s.check('mentors: other departments staff and admins are not listed', !board0.body?.data?.mentors?.some((m) => ['smoketest-mentor-other', 'smoketest-mentor-admin'].includes(m.id)));
  s.check('mentors: all three students start unassigned', board0.body?.data?.unassigned_students === 3, String(board0.body?.data?.unassigned_students));

  const A = `${MENT}/assign`;
  s.check('assign: no students → 400', (await put(A, head, { mentor_id: 'smoketest-mentor-a', student_ids: [] })).status === 400);
  s.check('assign: unknown mentor → 400', (await put(A, head, { mentor_id: 'nope', student_ids: ['smoketest-mstu-1'] })).status === 400);
  s.check('assign: unknown student → 400', (await put(A, head, { mentor_id: 'smoketest-mentor-a', student_ids: ['nope'] })).status === 400);
  s.check('assign: another department mentor → 400', (await put(A, head, { mentor_id: 'smoketest-mentor-other', student_ids: ['smoketest-mstu-1'] })).status === 400);
  s.check('assign: another department student → 400', (await put(A, head, { mentor_id: 'smoketest-mentor-a', student_ids: ['smoketest-mstu-out'] })).status === 400);
  s.check('assign: an admin account as mentor → 400', (await put(A, head, { mentor_id: 'smoketest-mentor-admin', student_ids: ['smoketest-mstu-1'] })).status === 400);
  s.check(`assign: more than ${MAX_ASSIGN} students → 400`, (await put(A, head, { mentor_id: 'smoketest-mentor-a', student_ids: Array.from({ length: MAX_ASSIGN + 1 }, (_, i) => `x${i}`) })).status === 400);

  const ok = await put(A, head, { mentor_id: 'smoketest-mentor-a', student_ids: ['smoketest-mstu-1', 'smoketest-mstu-2'] });
  s.check('assign: HOD assigns two students to a mentor', ok.status === 200 && ok.body?.data?.updated === 2, `status ${ok.status}`);

  const board1 = await get(MENT, head);
  const mA = board1.body?.data?.mentors?.find((m) => m.id === 'smoketest-mentor-a');
  s.check('mentors: the board reflects the assignment immediately (no stale cache)', mA?.mentees === 2 && board1.body?.data?.unassigned_students === 1, `mentees ${mA?.mentees}, unassigned ${board1.body?.data?.unassigned_students}`);

  const dMine = await get('/api/faculty/department?mentor=smoketest-mentor-a', head);
  s.check('dashboard: the mentor filter narrows the roster to their mentees', dMine.body?.data?.totals?.students === 2, String(dMine.body?.data?.totals?.students));
  s.check('dashboard: each row names its mentor', (dMine.body?.data?.students || []).every((r) => r.mentor_name === 'Smoke Mentor A'));
  const dNone = await get('/api/faculty/department?mentor=none', head);
  s.check('dashboard: mentor=none lists students nobody mentors', dNone.body?.data?.totals?.students === 1, String(dNone.body?.data?.totals?.students));
  const dAll = await get('/api/faculty/department', head);
  s.check('dashboard: the filter menu lists mentors with their mentee counts', (dAll.body?.data?.scope?.mentors || []).some((m) => m.id === 'smoketest-mentor-a' && m.mentees === 2));
  s.check('dashboard: the roster is not narrowed without the filter', dAll.body?.data?.totals?.students === 3);

  const cleared = await put(A, head, { mentor_id: null, student_ids: ['smoketest-mstu-1', 'smoketest-mstu-2'] });
  s.check('assign: a null mentor removes the assignment', cleared.status === 200);
  const board2 = await get(MENT, head);
  s.check('mentors: after removal everyone is unassigned again', board2.body?.data?.unassigned_students === 3, String(board2.body?.data?.unassigned_students));

  const adminTok = tokenFor('mentor-admin', 'admin');
  const adminCross = await put(A, adminTok, { mentor_id: 'smoketest-mentor-other', student_ids: ['smoketest-mstu-3'] });
  s.check('assign: an admin may pair across departments', adminCross.status === 200, `status ${adminCross.status}`);
  await put(A, adminTok, { mentor_id: null, student_ids: ['smoketest-mstu-3'] });
  const monthly = await get(`${MENT}?period=monthly`, head);
  s.check('mentors: the monthly period is accepted', monthly.status === 200 && monthly.body?.data?.period === 'monthly');
  s.check('mentors: an unknown period falls back to overall', (await get(`${MENT}?period=weekly`, head)).body?.data?.period === 'overall');

  // ── H7: portfolio, over the API ────────────────────────────────────────────
  const PORT = '/api/student/portfolio';
  const stuTok = (n) => tokenFor(`pstu-${n}`, 'student', { department: D });
  s.onCleanup(async () => { await purge('portfolioItems', 'userId', [1, 2, 3].map((n) => userId(`pstu-${n}`))); }, 'temporary portfolio entries');
  for (const n of [1, 2, 3]) await mk('students', userId(`pstu-${n}`), { name: `Smoke Portfolio ${n}`, role: 'student', department: D, section: 'P', year: 2 });

  s.check('portfolio: unauthenticated → 401', (await get(PORT)).status === 401);
  s.check('portfolio: faculty cannot use the student endpoints → 403', (await get(PORT, tokenFor('hod-faculty', 'faculty'))).status === 403);
  s.check('portfolio: an HOD cannot use the student endpoints → 403', (await post(PORT, head, { type: 'project', title: 'x1' })).status === 403);

  s.check('portfolio: an unknown type → 400', (await post(PORT, stuTok(1), { type: 'hobby', title: 'Chess' })).status === 400);
  s.check('portfolio: a javascript: link → 400', (await post(PORT, stuTok(1), { type: 'project', title: 'Site', link: 'javascript:alert(1)' })).status === 400);
  s.check('portfolio: a missing title → 400', (await post(PORT, stuTok(1), { type: 'project', title: ' ' })).status === 400);

  const c1 = await post(PORT, stuTok(1), { type: 'certification', title: 'Smoke Cert', detail: 'issuer', date: '2026-01-10', link: 'https://example.com/c' });
  s.check('portfolio: a student adds a certification', c1.status === 201 && c1.body?.data?.title === 'Smoke Cert', `status ${c1.status}`);
  const p1 = await post(PORT, stuTok(1), { type: 'project', title: 'Smoke Project' });
  const a1 = await post(PORT, stuTok(1), { type: 'achievement', title: 'Smoke Award' });
  await post(PORT, stuTok(2), { type: 'certification', title: 'Only Cert' });
  s.check('portfolio: all three entries for student 1 saved', p1.status === 201 && a1.status === 201);

  const mine = await get(PORT, stuTok(1));
  s.check('portfolio: a student lists their own entries', mine.status === 200 && mine.body?.data?.length === 3, String(mine.body?.data?.length));
  s.check('portfolio: another student sees none of them', (await get(PORT, stuTok(3))).body?.data?.length === 0);

  const cid = c1.body?.data?.id;
  const edited = await patch(`${PORT}/${cid}`, stuTok(1), { title: 'Smoke Cert Renamed' });
  s.check('portfolio: the owner edits an entry', edited.status === 200 && edited.body?.data?.title === 'Smoke Cert Renamed', `status ${edited.status}`);
  s.check('portfolio: editing keeps the entry type', edited.body?.data?.type === 'certification');
  s.check('portfolio: another student cannot edit it (looks missing → 404)', (await patch(`${PORT}/${cid}`, stuTok(2), { title: 'hijack' })).status === 404);
  s.check('portfolio: another student cannot delete it → 404', (await del(`${PORT}/${cid}`, stuTok(2))).status === 404);
  s.check('portfolio: an invalid edit is rejected and changes nothing', (await patch(`${PORT}/${cid}`, stuTok(1), { link: 'ftp://nope' })).status === 400
    && (await get(PORT, stuTok(1))).body.data.some((i) => i.title === 'Smoke Cert Renamed'));

  // ── H7: what the HOD sees ──────────────────────────────────────────────────
  const POV = '/api/faculty/portfolio';
  s.check('portfolio overview: student → 403', (await get(POV, tokenFor('hod-student', 'student'))).status === 403);
  s.check('portfolio overview: faculty → 403', (await get(POV, tokenFor('hod-faculty', 'faculty'))).status === 403);
  const ov = await get(`${POV}?section=P`, head);
  s.check('portfolio overview: HOD → 200', ov.status === 200, `status ${ov.status}`);
  const bandOf = (k) => ov.body?.data?.bands?.find((b) => b.key === k)?.count;
  s.check('portfolio overview: student 1 covers all three types, student 2 one, student 3 none', bandOf('all') === 1 && bandOf('one') === 1 && bandOf('none') === 1 && bandOf('two') === 0, JSON.stringify(ov.body?.data?.bands));
  s.check('portfolio overview: records carry counts per type, not entry text', (ov.body?.data?.records || []).every((r) => 'certifications' in r && !('title' in r)));
  s.check('portfolio overview: the emptiest student is listed first', ov.body?.data?.records?.[0]?.types === 0);
  const detail = await get(`/api/faculty/students/${userId('pstu-1')}/detail`, head);
  s.check('student profile (faculty view) lists the portfolio entries', detail.status === 200 && detail.body?.data?.portfolio?.length === 3, `status ${detail.status}`);
  const outside = await get(`/api/faculty/students/${userId('pstu-1')}/detail`, tokenFor('other-hod', 'hod', { department: 'SMOKEOTHER' }));
  s.check('student profile: another department HOD cannot read it', outside.status === 403 || outside.status === 404, `status ${outside.status}`);

  const delOk = await del(`${PORT}/${cid}`, stuTok(1));
  s.check('portfolio: the owner deletes an entry', delOk.status === 200);
  s.check('portfolio: it is gone afterwards', (await get(PORT, stuTok(1))).body.data.length === 2);

  return s;
};
