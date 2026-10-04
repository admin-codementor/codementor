// Career roadmaps and their progress.
//
// The promise this feature makes is specific: a student who has already solved
// problems opens a roadmap part-way along, not at zero. That is arithmetic over
// the real catalog, and it is what these checks are for. A roadmap that renders
// but reports progress a student did not earn — or fails to report progress
// they did — is worse than no roadmap, because it is the number they will use
// to decide what to study next.
const { tokenFor, get, put, Suite, purge, userId, db } = require('../harness');

const HOUR = 3600_000;

module.exports = async function roadmapsSuite() {
  const s = new Suite('Roadmaps: content, progress & active choice');

  const ME = userId('rm-me');
  const TOKEN = tokenFor('rm-me', 'student', { department: 'SMOKE_DEPT' });

  s.onCleanup(async () => {
    const doc = await db().collection('students').doc(ME).get();
    if (!doc.exists) return 0;
    await doc.ref.delete();
    return 1;
  }, 'probe student');
  s.onCleanup(() => purge('submissions', 'userId', [ME]), 'probe submissions');

  // ── Listing ────────────────────────────────────────────────────────────────
  const unauth = await get('/api/roadmaps');
  s.check('listing requires a token', unauth.status === 401, `status ${unauth.status}`);

  const list = await get('/api/roadmaps', TOKEN);
  const roadmaps = list.body?.data ?? [];
  s.check('listing returns roadmaps', list.status === 200 && roadmaps.length >= 4,
    `status ${list.status}, ${roadmaps.length} roadmaps`);

  s.check('every roadmap carries the documented summary shape',
    roadmaps.every((r) => r.id && r.role
      && typeof r.percent === 'number' && typeof r.solved === 'number' && typeof r.target === 'number'
      && typeof r.milestoneCount === 'number'),
    JSON.stringify(roadmaps[0] ?? null));

  s.check('the listing does not ship every milestone',
    roadmaps.every((r) => r.milestones === undefined),
    'summary rows should stay small');

  s.check('no roadmap is empty', roadmaps.every((r) => r.milestoneCount >= 8),
    roadmaps.map((r) => `${r.id}:${r.milestoneCount}`).join(', '));

  s.check('nobody is active until the student chooses', list.body?.activeRoadmapId === null,
    String(list.body?.activeRoadmapId));

  // ── Detail ─────────────────────────────────────────────────────────────────
  const missing = await get('/api/roadmaps/not-a-roadmap', TOKEN);
  s.check('an unknown roadmap is 404, not an empty page', missing.status === 404, `status ${missing.status}`);

  const first = roadmaps[0];
  const detailRes = await get(`/api/roadmaps/${first.id}`, TOKEN);
  const detail = detailRes.body?.data;
  const milestones = detail?.milestones ?? [];
  s.check('detail returns the milestones', detailRes.status === 200 && milestones.length === first.milestoneCount,
    `${milestones.length} vs ${first.milestoneCount}`);

  s.check('a milestone we cannot verify says so rather than reporting 0%',
    milestones.filter((m) => !m.tracked).every((m) => m.solved === undefined && m.percent === undefined
      && ['reading', 'test'].includes(m.status)),
    milestones.filter((m) => !m.tracked).map((m) => m.status).join(', '));

  const tracked = milestones.filter((m) => m.tracked);
  s.check('a tracked milestone never asks for more problems than exist',
    tracked.every((m) => m.target <= m.available),
    tracked.map((m) => `${m.target}/${m.available}`).join(' '));

  s.check('the roadmap target is the sum of its tracked milestones',
    detail.target === tracked.reduce((n, m) => n + m.target, 0),
    `${detail.target} vs ${tracked.reduce((n, m) => n + m.target, 0)}`);

  s.check('the current step is the position of "you are here", not a count of finished steps',
    detail.currentStep === null
      || tracked.findIndex((m) => m.id === detail.currentMilestone?.id) + 1 === detail.currentStep,
    `currentStep ${detail.currentStep}`);

  s.check('"you are here" points at work that can actually be completed',
    detail.currentMilestone === null
      || tracked.some((m) => m.id === detail.currentMilestone.id && m.status !== 'done'),
    JSON.stringify(detail.currentMilestone));

  s.check('every tracked milestone offers somewhere to go',
    tracked.every((m) => m.target === 0 || m.link !== null),
    tracked.filter((m) => m.target > 0 && !m.link).map((m) => m.id).join(', '));

  // ── Progress fills from work already done ──────────────────────────────────
  const step = tracked.find((m) => m.nextProblems?.length > 0);
  if (!step) {
    s.skip('solved problems raise the matching milestone', 'no milestone resolved to any problem');
  } else {
    s.check('a fresh student starts this roadmap at zero', detail.percent === 0 && detail.solved === 0,
      `${detail.solved}/${detail.target}`);

    const now = Date.now();
    for (const p of step.nextProblems) {
      await db().collection('submissions').add({
        userId: ME, problemId: p.id, verdict: 'Accepted', language: 'python',
        submittedAt: new Date(now - HOUR),
      });
    }
    const n = step.nextProblems.length;

    const after = (await get(`/api/roadmaps/${first.id}`, TOKEN)).body?.data;
    const stepAfter = after.milestones.find((m) => m.id === step.id);

    s.check('solving the next problems moves that milestone',
      stepAfter.solved === Math.min(n, stepAfter.target),
      `expected ${Math.min(n, stepAfter.target)}, got ${stepAfter.solved}`);

    s.check('the milestone no longer offers problems the student has solved',
      (stepAfter.nextProblems ?? []).every((p) => !step.nextProblems.some((q) => q.id === p.id)),
      'solved problems reappeared in next up');

    s.check('the roadmap total moves with it', after.solved >= stepAfter.solved && after.percent > 0,
      `${after.solved}/${after.target} = ${after.percent}%`);

    s.check('the same progress shows in the listing',
      (await get('/api/roadmaps', TOKEN)).body?.data?.find((r) => r.id === first.id)?.solved === after.solved,
      'listing and detail disagree');

    // A wrong answer is not progress. This is the student dashboard rule (S3)
    // applied here: only Accepted counts.
    const rejectedProblem = after.milestones.find((m) => m.tracked && m.nextProblems?.length)?.nextProblems?.[0];
    if (rejectedProblem) {
      const before = after.solved;
      await db().collection('submissions').add({
        userId: ME, problemId: rejectedProblem.id, verdict: 'Wrong Answer', language: 'python',
        submittedAt: new Date(now - HOUR),
      });
      const afterWrong = (await get(`/api/roadmaps/${first.id}`, TOKEN)).body?.data;
      s.check('a wrong submission does not count as progress', afterWrong.solved === before,
        `${before} -> ${afterWrong.solved}`);
    } else {
      s.skip('a wrong submission does not count as progress', 'roadmap already complete');
    }
  }

  // ── Choosing an active roadmap ─────────────────────────────────────────────
  const setBad = await put('/api/student/active-roadmap', TOKEN, { roadmapId: 42 });
  s.check('a non-string roadmap id is rejected', setBad.status === 400, `status ${setBad.status}`);

  const setMissing = await put('/api/student/active-roadmap', TOKEN, { roadmapId: 'not-a-roadmap' });
  s.check('an unknown roadmap cannot be made active', setMissing.status === 404, `status ${setMissing.status}`);

  const setOk = await put('/api/student/active-roadmap', TOKEN, { roadmapId: first.id });
  s.check('the student can choose a roadmap', setOk.status === 200
    && setOk.body?.data?.activeRoadmapId === first.id, JSON.stringify(setOk.body));

  const afterSet = await get('/api/roadmaps', TOKEN);
  s.check('the choice is remembered', afterSet.body?.activeRoadmapId === first.id,
    String(afterSet.body?.activeRoadmapId));

  const detailActive = await get(`/api/roadmaps/${first.id}`, TOKEN);
  s.check('the detail page knows it is the active one', detailActive.body?.isActive === true,
    String(detailActive.body?.isActive));

  const cleared = await put('/api/student/active-roadmap', TOKEN, { roadmapId: null });
  s.check('the student can clear the choice', cleared.status === 200
    && (await get('/api/roadmaps', TOKEN)).body?.activeRoadmapId === null, JSON.stringify(cleared.body));

  return s;
};
