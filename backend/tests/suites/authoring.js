// Problem authoring, the draft lifecycle, and assignments.
//
// Covers the P1 data-loss bugs (edit wiping the statement, test cases silently
// ignored, assignments created empty) and the P3 lifecycle rules.
const { tokenFor, get, post, put, patch, del, Suite, purge, userId } = require('../harness');

module.exports = async function authoringSuite() {
  const s = new Suite('Authoring, draft lifecycle & assignments');
  const F = tokenFor('author', 'faculty');
  const OTHER = tokenFor('author-other', 'faculty');
  const problems = [];

  s.onCleanup(async () => {
    for (const id of problems) await del(`/api/faculty/problems/${id}`, F);
    await purge('assignments', 'facultyId', [userId('author')]);
  }, 'probe problems and assignments');

  // ── Create with test cases, then read the full record back ─────────────────
  const create = await post('/api/faculty/problems', F, {
    title: 'SMOKE Sum', description: 'Read two integers and print their sum.',
    difficulty: 'easy', tags: ['smoke', 'math'],
    test_cases: [
      { input: '2 3', output: '5', is_public: true },
      { input: '10 20', output: '30' },
    ],
  });
  s.check('create a problem', create.status === 200 && !!create.body?.data?.id, `status ${create.status}`);
  const pid = create.body?.data?.id;
  if (pid) problems.push(pid);
  s.check('defaults to published', create.body?.data?.status === 'published', create.body?.data?.status);

  const detail = await get(`/api/faculty/problems/${pid}`, F);
  s.check('detail endpoint returns the statement', detail.body?.data?.description?.includes('two integers'));
  s.check('detail returns every test case', detail.body?.data?.test_cases?.length === 2, `${detail.body?.data?.test_cases?.length}`);
  s.check('sample flag survives', detail.body?.data?.test_cases?.[0]?.is_public === true);
  s.check('test case order is stable', detail.body?.data?.test_cases?.[0]?.input === '2 3');

  // ── Editing must not silently drop test cases (the P1 data-loss bug) ───────
  const upd = await put(`/api/faculty/problems/${pid}`, F, {
    title: 'SMOKE Sum v2', description: 'Updated statement.', difficulty: 'medium',
    test_cases: [{ input: '1 1', output: '2', is_public: true }],
  });
  s.check('update accepted', upd.status === 200, `status ${upd.status}`);
  const after = await get(`/api/faculty/problems/${pid}`, F);
  s.check('statement updated', after.body?.data?.description === 'Updated statement.');
  s.check('TEST CASES REPLACED, not ignored', after.body?.data?.test_cases?.length === 1, `${after.body?.data?.test_cases?.length}`);
  s.check('new expected output is live', after.body?.data?.test_cases?.[0]?.output === '2');

  const wipe = await put(`/api/faculty/problems/${pid}`, F, {
    title: 'x', description: 'y', test_cases: [{ input: '  ', output: '' }],
  });
  s.check('refuses to leave a problem with no usable test case', wipe.status === 400, `status ${wipe.status}`);

  // ── Draft lifecycle ────────────────────────────────────────────────────────
  const draft = await post('/api/faculty/problems', F, {
    title: 'SMOKE draft', description: 'Hidden while drafting.', difficulty: 'easy',
    status: 'draft', test_cases: [{ input: '1', output: '1', is_public: true }],
  });
  const draftId = draft.body?.data?.id;
  if (draftId) problems.push(draftId);
  s.check('can create a draft', draft.body?.data?.status === 'draft', draft.body?.data?.status);

  const studentView = await get(`/api/problems/${draftId}`);
  s.check('draft is invisible to students (404)', studentView.status === 404, `status ${studentView.status}`);
  const adjacency = await get(`/api/problems/${draftId}/adjacent`);
  s.check('draft excluded from prev/next navigation', adjacency.status === 404, `status ${adjacency.status}`);
  const facultyView = await get(`/api/faculty/problems/${draftId}`, F);
  s.check('but its author can still open it', facultyView.status === 200);

  const emptyDraft = await post('/api/faculty/problems', F, {
    title: 'SMOKE no tests', description: 'No tests.', difficulty: 'easy', status: 'draft', test_cases: [],
  });
  const emptyId = emptyDraft.body?.data?.id;
  if (emptyId) problems.push(emptyId);
  const badPublish = await patch(`/api/faculty/problems/${emptyId}/status`, F, { status: 'published' });
  s.check('cannot publish something ungradeable', badPublish.status === 422, `status ${badPublish.status}`);
  s.check('and it says what is missing', /test case/i.test(badPublish.body?.error ?? ''), badPublish.body?.error);

  const publish = await patch(`/api/faculty/problems/${draftId}/status`, F, { status: 'published' });
  s.check('publishing a complete draft works', publish.status === 200, `status ${publish.status}`);
  s.check('students can now open it', (await get(`/api/problems/${draftId}`)).status === 200);

  const steal = await patch(`/api/faculty/problems/${draftId}/status`, OTHER, { status: 'draft' });
  s.check("another faculty member can't unpublish it", steal.status === 404, `status ${steal.status}`);

  // ── Assignments ────────────────────────────────────────────────────────────
  const deadline = new Date(Date.now() + 7 * 86400000).toISOString();

  const empty = await post('/api/faculty/assignments', F, { title: 'SMOKE empty', deadline, problem_ids: [] });
  s.check('assignment with no problems is rejected', empty.status === 400, `status ${empty.status}`);

  const withDraft = await post('/api/faculty/assignments', F, {
    title: 'SMOKE draft asg', deadline, problem_ids: [emptyId],
  });
  s.check('assignment containing a draft problem is rejected', withDraft.status === 400, `status ${withDraft.status}`);

  const badDate = await post('/api/faculty/assignments', F, { title: 'SMOKE bad date', deadline: 'soon', problem_ids: [pid] });
  s.check('invalid deadline rejected', badDate.status === 400, `status ${badDate.status}`);

  const asg = await post('/api/faculty/assignments', F, {
    title: 'SMOKE assignment', deadline, problem_ids: [pid, draftId], is_exam: true,
  });
  s.check('valid assignment created', asg.status === 200, `status ${asg.status}`);
  const asgId = asg.body?.data?.id;

  const asgDetail = await get(`/api/faculty/assignments/${asgId}`, F);
  s.check('assignment keeps its problems in order',
    asgDetail.body?.data?.problems?.[0]?.id === pid && asgDetail.body?.data?.problems?.[1]?.id === draftId,
    (asgDetail.body?.data?.problems ?? []).map((p) => p.title).join(' → '));
  s.check('exam flag round-trips', asgDetail.body?.data?.is_exam === true);

  const reorder = await put(`/api/faculty/assignments/${asgId}`, F, {
    title: 'SMOKE assignment', deadline, problem_ids: [draftId, pid], is_exam: false,
  });
  s.check('assignment update works', reorder.status === 200, `status ${reorder.status}`);
  const afterReorder = await get(`/api/faculty/assignments/${asgId}`, F);
  s.check('new problem order persisted', afterReorder.body?.data?.problems?.[0]?.id === draftId);

  return s;
};
