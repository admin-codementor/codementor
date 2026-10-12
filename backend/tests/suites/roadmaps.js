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

// A graph roadmap's steps (nodes minus notes, which are commentary rather
// than a step) are the same thing a flat roadmap's milestones are — unify
// here so the generic checks below don't need to assume either shape.
const stepsOf = (detail) => (detail?.format === 'graph'
  ? (detail?.nodes ?? []).filter((n) => n.type !== 'note')
  : (detail?.milestones ?? []));

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
  const milestones = stepsOf(detail);
  s.check('detail returns the milestones', detailRes.status === 200 && milestones.length === first.milestoneCount,
    `${milestones.length} vs ${first.milestoneCount}`);

  s.check('a milestone we cannot verify says so rather than reporting 0%',
    milestones.filter((m) => !m.tracked).every((m) => m.solved === undefined && m.percent === undefined
      && ['reading', 'test', 'checkpoint'].includes(m.status)),
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
    const stepAfter = stepsOf(after).find((m) => m.id === step.id);

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
    const rejectedProblem = stepsOf(after).find((m) => m.tracked && m.nextProblems?.length)?.nextProblems?.[0];
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

  // ── Node-type-specific graph coverage ───────────────────────────────────────
  // The generic block above already exercises the graph resolver end to end
  // (every roadmap is graph-shaped as of S13 Phase B) — this block specifically
  // pins down `java-developer`'s note and checkpoint node, the two node types
  // the generic block's roadmap (service-company-placement) does not contain.
  const graphRes = await get('/api/roadmaps/java-developer', TOKEN);
  const graph = graphRes.body?.data;
  s.check('a graph roadmap says so in its format field',
    graphRes.status === 200 && graph?.format === 'graph', `format ${graph?.format}`);

  s.check('a graph roadmap returns nodes/edges/groups, not milestones',
    Array.isArray(graph?.nodes) && Array.isArray(graph?.edges) && Array.isArray(graph?.groups)
      && graph?.milestones === undefined,
    JSON.stringify({ hasNodes: !!graph?.nodes, hasMilestones: graph?.milestones !== undefined }));

  const noteNode = graph?.nodes?.find((n) => n.type === 'note');
  s.check('a note node is never tracked and never "you are here"',
    !!noteNode && noteNode.tracked === false && noteNode.status === 'note'
      && graph.currentMilestone?.id !== noteNode.id,
    JSON.stringify(noteNode));

  const checkpointNode = graph?.nodes?.find((n) => n.type === 'checkpoint');
  s.check('a checkpoint node is untracked with its own status, not folded into reading/test',
    !!checkpointNode && checkpointNode.tracked === false && checkpointNode.status === 'checkpoint',
    JSON.stringify(checkpointNode));

  const graphTracked = (graph?.nodes ?? []).filter((n) => n.tracked);
  s.check('the graph roadmap target is the sum of its tracked nodes, same arithmetic as the legacy path',
    graph.target === graphTracked.reduce((n, x) => n + x.target, 0),
    `${graph.target} vs ${graphTracked.reduce((n, x) => n + x.target, 0)}`);

  // Same "solving moves progress" proof as the legacy block above, run once
  // more against the graph shape so the resolver generalisation is actually
  // checked, not just assumed from the legacy roadmap passing.
  const graphStep = graphTracked.find((n) => n.nextProblems?.length > 0);
  if (!graphStep) {
    s.skip('solving a graph node\'s problems raises that node', 'no node resolved to any problem');
  } else {
    const now2 = Date.now();
    for (const p of graphStep.nextProblems) {
      await db().collection('submissions').add({
        userId: ME, problemId: p.id, verdict: 'Accepted', language: 'python',
        submittedAt: new Date(now2 - HOUR),
      });
    }
    const n2 = graphStep.nextProblems.length;
    const graphAfter = (await get('/api/roadmaps/java-developer', TOKEN)).body?.data;
    const graphStepAfter = graphAfter.nodes.find((x) => x.id === graphStep.id);
    // `ME` already solved problems earlier in this same suite run, against the
    // legacy roadmap tested above — on a shared catalogue, some of those can
    // land in this node's pool too (e.g. an "arrays" solve counts for more
    // than one roadmap's Arrays node). The expectation has to add to whatever
    // was already solved here, not assume a clean slate.
    const expectedSolved = Math.min(graphStep.solved + n2, graphStepAfter.target);
    s.check('solving a graph node\'s problems moves that node',
      graphStepAfter.solved === expectedSolved,
      `expected ${expectedSolved}, got ${graphStepAfter.solved}`);
  }

  return s;
};
