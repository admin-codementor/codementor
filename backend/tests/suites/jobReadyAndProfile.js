// The Job-Ready Score and the public profile.
//
// These two carry more risk than anything else in the student app. The score is
// the number a student will use to decide what to study, so it has to be
// arithmetic they can check rather than a figure we assert. The profile is the
// only page in the product that answers without a token, so what it does *not*
// say matters more than what it does.
const { tokenFor, get, put, post, Suite, purge, userId, db, BASE } = require('../harness');

const HOUR = 3600_000;

module.exports = async function jobReadyAndProfileSuite() {
  const s = new Suite('Job-Ready Score & public profile');

  const ME = userId('jr-me');
  const TOKEN = tokenFor('jr-me', 'student', { department: 'SMOKE_DEPT' });
  const HANDLE = `smoke-${Date.now().toString(36)}`;

  s.onCleanup(async () => {
    const doc = await db().collection('students').doc(ME).get();
    if (!doc.exists) return 0;
    await doc.ref.delete();
    return 1;
  }, 'probe student');
  s.onCleanup(() => purge('submissions', 'userId', [ME]), 'probe submissions');
  s.onCleanup(async () => {
    const snap = await db().collection('publicHandles').where('userId', '==', ME).get();
    for (const d of snap.docs) await d.ref.delete();
    return snap.size;
  }, 'probe handle');
  s.onCleanup(async () => {
    const snap = await db().collection('codingProfiles').where('userId', '==', ME).get();
    for (const d of snap.docs) await d.ref.delete();
    return snap.size;
  }, 'probe coding profiles');

  await db().collection('students').doc(ME).set({
    id: ME, name: 'JR Probe', email: 'jr-probe@example.test', role: 'student',
    department: 'SMOKE_DEPT', section: 'A', college: 'Smoke College', year: 3,
  });

  // ── The score ──────────────────────────────────────────────────────────────
  const unauth = await get('/api/student/job-ready');
  s.check('the score needs a token', unauth.status === 401, `status ${unauth.status}`);

  const first = await get('/api/student/job-ready', TOKEN);
  const data = first.body?.data;
  s.check('the score loads', first.status === 200 && Array.isArray(data?.targets), `status ${first.status}`);

  const service = data?.targets?.find((t) => t.key === 'service');
  s.check('a fresh student scores zero rather than something flattering',
    service?.score === 0, String(service?.score));

  s.check('the roadmap target is hidden until a roadmap is chosen',
    data?.roleTargetAvailable === false && !data.targets.some((t) => t.key === 'role'),
    JSON.stringify(data?.targets?.map((t) => t.key)));

  s.check('every component shows its weight and its workings',
    (service?.components ?? []).every((c) => typeof c.weight === 'number' && c.weight > 0
      && typeof c.score === 'number' && c.data !== undefined && c.label && c.detail),
    'a component is missing weight, score, label or data');

  s.check('the weights of a target sum to 100',
    (service?.components ?? []).reduce((n, c) => n + c.weight, 0) === 100,
    String((service?.components ?? []).reduce((n, c) => n + c.weight, 0)));

  // Exactly, not approximately: the page invites the student to add the
  // contributions up, so they have to come to the number on the dial.
  s.check('the components add up to the score a student is shown',
    service.score === service.components.reduce((n, c) => n + c.contributes, 0),
    `${service.score} vs ${service.components.reduce((n, c) => n + c.contributes, 0)}`);

  s.check('a fresh student is told three things to do', service?.nextActions?.length === 3,
    String(service?.nextActions?.length));
  s.check('every next action says why and where to go',
    (service?.nextActions ?? []).every((a) => a.label && a.why && a.href?.startsWith('/')),
    JSON.stringify(service?.nextActions));

  // ── The score responds to work, and dates it correctly ─────────────────────
  const problems = (await get('/api/problems?page=1', TOKEN)).body?.data;
  const list = Array.isArray(problems) ? problems : (problems?.problems ?? []);
  if (list.length < 4) {
    s.skip('solving problems raises the score', `needs 4 problems, found ${list.length}`);
  } else {
    const now = Date.now();
    // Pinned to midday UTC so the two "today" solves cannot straddle a day
    // boundary and turn one active day into two depending on the clock.
    const d = new Date(now);
    const noon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
    // Two solved weeks ago, two solved today: the weekly change must see only
    // the recent pair, which is the whole point of computing it from dates
    // rather than from a stored snapshot. Three distinct days in the last 30.
    const seed = [
      { problemId: String(list[0].id), submittedAt: new Date(noon - 25 * 24 * HOUR) },
      { problemId: String(list[1].id), submittedAt: new Date(noon - 20 * 24 * HOUR) },
      { problemId: String(list[2].id), submittedAt: new Date(noon) },
      { problemId: String(list[3].id), submittedAt: new Date(noon + HOUR) },
    ];
    for (const row of seed) {
      await db().collection('submissions').add({ userId: ME, verdict: 'Accepted', language: 'python', ...row });
    }

    const after = (await get('/api/student/job-ready', TOKEN)).body?.data;
    const afterService = after.targets.find((t) => t.key === 'service');
    s.check('solving problems raises the score', afterService.score > 0, String(afterService.score));

    s.check('this week\'s change counts only this week\'s work',
      afterService.weekChange > 0 && afterService.weekChange < afterService.score,
      `change ${afterService.weekChange} of ${afterService.score}`);

    const consistency = afterService.components.find((c) => c.key === 'consistency');
    s.check('consistency counts distinct days, not submissions',
      consistency.data.activeDays === 3, `${consistency.data.activeDays} active days from 4 submissions on 3 days`);

    const coverage = afterService.components.find((c) => c.key === 'coverage');
    s.check('topic coverage finds the solves',
      coverage.data.got > 0, `${coverage.data.got}/${coverage.data.target}`);

    // A wrong submission is not progress — the same rule as everywhere else.
    await db().collection('submissions').add({
      userId: ME, problemId: String(list[0].id), verdict: 'Wrong Answer', language: 'python',
      submittedAt: new Date(now - HOUR),
    });
    const afterWrong = (await get('/api/student/job-ready', TOKEN)).body?.data;
    s.check('a wrong submission does not raise the score',
      afterWrong.targets.find((t) => t.key === 'service').score === afterService.score,
      'score moved on a rejected submission');
  }

  // ── The public profile ─────────────────────────────────────────────────────
  const settings = await get('/api/student/public-profile', TOKEN);
  s.check('a profile is unpublished until the student says otherwise',
    settings.body?.data?.published === false && settings.body?.data?.handle === null,
    JSON.stringify(settings.body?.data));

  // Checked before anything is claimed: a handle reserved by one of these would
  // make the next check pass for the wrong reason.
  const early = await put('/api/student/public-profile', TOKEN, { published: true });
  s.check('publishing without a handle is refused', early.status === 400, `status ${early.status}`);

  for (const [bad, why] of [['ab', 'too short'], ['has space', 'a space'], ['admin', 'reserved'], ['-leading', 'leading hyphen']]) {
    const res = await put('/api/student/public-profile', TOKEN, { handle: bad });
    s.check(`"${bad}" is refused (${why})`, res.status === 400, `status ${res.status}`);
  }

  // Case is normalised rather than refused: a student typing their own name
  // with a capital should get the handle, not an error message.
  const cased = await put('/api/student/public-profile', TOKEN, { handle: `${HANDLE}-CASE` });
  s.check('a handle typed with capitals is lowercased, not rejected',
    cased.status === 200 && cased.body?.data?.handle === `${HANDLE}-case`,
    JSON.stringify(cased.body?.data));

  const claimed = await put('/api/student/public-profile', TOKEN, { handle: HANDLE });
  s.check('a handle can be claimed', claimed.status === 200 && claimed.body?.data?.handle === HANDLE,
    JSON.stringify(claimed.body));

  const hidden = await get(`/api/public/profile/${HANDLE}`);
  s.check('an unpublished profile is not readable, even with the right handle',
    hidden.status === 404, `status ${hidden.status}`);

  const unknown = await get('/api/public/profile/definitely-not-a-handle');
  s.check('an unknown handle answers exactly like an unpublished one',
    unknown.status === hidden.status, `${unknown.status} vs ${hidden.status}`);

  await put('/api/student/public-profile', TOKEN, { published: true });

  const pub = await get(`/api/public/profile/${HANDLE}`);
  s.check('a published profile is readable without a token', pub.status === 200, `status ${pub.status}`);

  const profile = pub.body?.data ?? {};
  s.check('the profile shows what the link is for',
    profile.name === 'JR Probe' && profile.college === 'Smoke College' && profile.department === 'SMOKE_DEPT',
    JSON.stringify({ name: profile.name, college: profile.college }));

  const leaked = ['email', 'phone', 'rollNumber', 'roll_number', 'section', 'id', 'userId', 'password', 'firebaseUid'];
  const serialised = JSON.stringify(profile);
  s.check('no personal identifier leaves the building',
    leaked.every((f) => !Object.prototype.hasOwnProperty.call(profile, f))
      && !serialised.includes('jr-probe@example.test'),
    leaked.filter((f) => Object.prototype.hasOwnProperty.call(profile, f)).join(', ') || 'email address found in body');

  s.check('the score is not shown unless the student switched it on',
    profile.jobReady === null, JSON.stringify(profile.jobReady));

  // The page is for recruiters, not for search engines.
  const raw = await fetch(`${BASE}/api/public/profile/${HANDLE}`);
  s.check('the response tells crawlers to stay away',
    (raw.headers.get('x-robots-tag') || '').includes('noindex'),
    String(raw.headers.get('x-robots-tag')));

  await put('/api/student/public-profile', TOKEN, { showScore: true });
  const withScore = (await get(`/api/public/profile/${HANDLE}`)).body?.data;
  s.check('switching the score on shows it', Array.isArray(withScore?.jobReady) && withScore.jobReady.length > 0,
    JSON.stringify(withScore?.jobReady));
  s.check('the public score is a number only, not the full workings',
    (withScore?.jobReady ?? []).every((t) => t.score !== undefined && t.components === undefined),
    'component detail leaked to the public page');

  // ── Verified-only external accounts (Q-F) ──────────────────────────────────
  await put('/api/profiles/me', TOKEN, { platform: 'codeforces', handle: 'tourist' });
  const claimedOnly = (await get(`/api/public/profile/${HANDLE}`)).body?.data;
  s.check('an unverified external handle is a claim, and is not shown',
    (claimedOnly?.externals ?? []).length === 0, JSON.stringify(claimedOnly?.externals));

  const code = await post('/api/profiles/me/codeforces/verify-code', TOKEN, {});
  s.check('a verification code can be issued',
    code.status === 200 && /^CM-[0-9A-F]{8}$/.test(code.body?.data?.code || ''),
    JSON.stringify(code.body));
  s.check('the code comes with where to put it',
    typeof code.body?.data?.where === 'string' && code.body.data.where.length > 10,
    String(code.body?.data?.where));

  const unverifiable = await post('/api/profiles/me/hackerrank/verify-code', TOKEN, {});
  s.check('a platform we cannot read back refuses to issue a code',
    unverifiable.status === 400, `status ${unverifiable.status}`);

  // Not asserting a successful verification: it would mean putting our code on
  // somebody's real Codeforces profile. The failure path is the one that has to
  // be right anyway — a profile without the code must not verify.
  const premature = await post('/api/profiles/me/codeforces/verify', TOKEN, {});
  s.check('verification fails when the code is not on the profile',
    premature.status === 400 || premature.status === 502, `status ${premature.status}`);

  const stillHidden = (await get(`/api/public/profile/${HANDLE}`)).body?.data;
  s.check('a failed verification leaves the account off the profile',
    (stillHidden?.externals ?? []).length === 0, JSON.stringify(stillHidden?.externals));

  // ── Unpublishing ───────────────────────────────────────────────────────────
  await put('/api/student/public-profile', TOKEN, { published: false });
  const gone = await get(`/api/public/profile/${HANDLE}`);
  s.check('unpublishing takes the page down immediately', gone.status === 404, `status ${gone.status}`);

  return s;
};
