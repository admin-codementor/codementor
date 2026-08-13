// MCQ editing (the camelCase/snake_case bug) and the staged import pipeline.
const { tokenFor, get, post, put, patch, del, request, Suite, purge, userId, capabilities } = require('../harness');

module.exports = async function mcqAndImportSuite() {
  const s = new Suite('MCQ editing & staged import');
  const F = tokenFor('mcqimp', 'faculty');
  const OTHER = tokenFor('mcqimp-other', 'faculty');
  const problems = [];

  s.onCleanup(async () => {
    for (const id of problems) await del(`/api/faculty/problems/${id}`, F);
    await purge('mcqTests', 'facultyId', [userId('mcqimp')]);
    await purge('problemDrafts', 'createdBy', [userId('mcqimp')]);
  }, 'probe tests, drafts and problems');

  // ── MCQ round-trip: the bug was that reopening a saved test blanked it ──────
  const mk = await post('/api/mcq/tests', F, { title: 'SMOKE mcq', category: 'technical', duration_minutes: 15 });
  const testId = mk.body?.data?.id;
  s.check('create an MCQ test', mk.status === 201 && !!testId, `status ${mk.status}`);

  const questions = [
    { question_text: 'What is 2 + 2?', options: ['3', '4', '5'], correct_index: 1, marks: 2, topic: 'arithmetic', explanation: 'Basic addition.' },
    { question_text: 'Which is FIFO?', options: ['Stack', 'Queue'], correct_index: 1, marks: 1, topic: 'ds', explanation: '' },
  ];
  const save = await put(`/api/mcq/tests/${testId}/questions`, F, { questions });
  s.check('save questions', save.status === 200 && save.body?.data?.count === 2, `status ${save.status}`);

  const reopen = await get(`/api/mcq/tests/${testId}`, F);
  const got = reopen.body?.data?.questions ?? [];
  s.check('reopening returns the questions', got.length === 2, `${got.length}`);
  s.check('QUESTION TEXT survives (was blank before the fix)', got[0]?.question_text === questions[0].question_text, JSON.stringify(got[0]?.question_text));
  s.check('correct answer survives', got[0]?.correct_index === 1, String(got[0]?.correct_index));
  s.check('options survive', got[0]?.options?.length === 3);
  s.check('marks/topic/explanation survive', got[0]?.marks === 2 && got[0]?.topic === 'arithmetic' && !!got[0]?.explanation);
  s.check('test meta is snake_case for the UI', reopen.body?.data?.test?.duration_minutes === 15);

  const resave = await put(`/api/mcq/tests/${testId}/questions`, F, { questions: got });
  s.check('re-saving what was just read is accepted', resave.status === 200, `status ${resave.status}`);

  // ── Metadata editing (added in P3) ─────────────────────────────────────────
  const rename = await put(`/api/mcq/tests/${testId}`, F, { title: 'SMOKE mcq renamed', category: 'verbal', duration_minutes: 45 });
  s.check('test metadata is editable', rename.status === 200 && rename.body?.data?.title === 'SMOKE mcq renamed', `status ${rename.status}`);
  s.check('duration updated', rename.body?.data?.duration_minutes === 45);
  s.check('bad category rejected', (await put(`/api/mcq/tests/${testId}`, F, { category: 'nope' })).status === 400);
  s.check("another faculty member can't rename it", (await put(`/api/mcq/tests/${testId}`, OTHER, { title: 'hijack' })).status === 404);

  // ── Publish gating ─────────────────────────────────────────────────────────
  const emptyTest = await post('/api/mcq/tests', F, { title: 'SMOKE empty mcq', category: 'aptitude', duration_minutes: 5 });
  const emptyId = emptyTest.body?.data?.id;
  const badPub = await patch(`/api/mcq/tests/${emptyId}/publish`, F, { is_published: true });
  s.check('cannot publish a test with no questions', badPub.status === 400, `status ${badPub.status}`);

  const pub = await patch(`/api/mcq/tests/${testId}/publish`, F, { is_published: true });
  s.check('publishing a populated test works', pub.status === 200 && pub.body?.data?.is_published === true);

  const studentList = await get('/api/mcq/available', tokenFor('mcqimp-student', 'student'));
  s.check('published test appears for students', (studentList.body?.data ?? []).some((t) => t.id === testId));
  s.check('draft test does NOT appear for students', !(studentList.body?.data ?? []).some((t) => t.id === emptyId));

  // ── Staged import: parsing must never publish ──────────────────────────────
  const before = await get('/api/faculty/problems', F);
  const beforeCount = (before.body?.data ?? []).length;

  const form = new FormData();
  const payload = JSON.stringify([
    { title: 'SMOKE imported', description: 'Reverse a string.', difficulty: 'easy', tags: ['strings'],
      test_cases: [{ input: 'abc', output: 'cba', is_public: true }] },
    { title: 'SMOKE incomplete', description: 'No test cases here.', difficulty: 'nonsense' },
  ]);
  form.append('file', new Blob([payload], { type: 'application/json' }), 'smoke.json');
  const parsed = await request('POST', '/api/problem-import/parse', {
    token: F, body: form, raw: true,
  });
  s.check('JSON import parses', parsed.status === 201, `status ${parsed.status} ${parsed.body?.error ?? ''}`);
  const drafts = parsed.body?.data?.drafts ?? [];
  s.check('both rows staged', drafts.length === 2, `${drafts.length}`);
  s.check('complete row marked ready', drafts.find((d) => /imported/.test(d.title))?.ready === true);
  s.check('incomplete row NOT ready', drafts.find((d) => /incomplete/.test(d.title))?.ready === false);
  s.check('bad difficulty defaulted with a warning',
    drafts.find((d) => /incomplete/.test(d.title))?.difficulty === 'medium');

  const afterParse = await get('/api/faculty/problems', F);
  s.check('PARSING PUBLISHED NOTHING', (afterParse.body?.data ?? []).length === beforeCount,
    `${beforeCount} → ${(afterParse.body?.data ?? []).length}`);

  const commit = await post('/api/problem-import/commit', F, { draft_ids: drafts.map((d) => d.id) });
  s.check('commit succeeds', commit.status === 201, `status ${commit.status}`);
  s.check('only the publishable draft became a problem', (commit.body?.data?.created ?? []).length === 1);
  s.check('the incomplete one was skipped with a reason',
    /test case/i.test((commit.body?.data?.skipped ?? [])[0]?.reason ?? ''),
    JSON.stringify(commit.body?.data?.skipped));
  for (const c of commit.body?.data?.created ?? []) problems.push(c.problem_id);

  const recommit = await post('/api/problem-import/commit', F, { draft_ids: drafts.map((d) => d.id) });
  s.check('re-committing does not duplicate', (recommit.body?.data?.skipped ?? []).some((x) => /already published/.test(x.reason)));

  s.check('malformed JSON rejected clearly', await (async () => {
    const bad = new FormData();
    bad.append('file', new Blob(['{not json'], { type: 'application/json' }), 'bad.json');
    const r = await request('POST', '/api/problem-import/parse', { token: F, body: bad, raw: true });
    return r.status === 400 && /valid JSON/i.test(r.body?.error ?? '');
  })());

  s.check('unsupported file type rejected', await (async () => {
    const bad = new FormData();
    bad.append('file', new Blob(['x'], { type: 'application/pdf' }), 'notes.pdf');
    const r = await request('POST', '/api/problem-import/parse', { token: F, body: bad, raw: true });
    return r.status === 400 || r.status === 415;
  })());

  // DOCX extraction needs the AI provider; report honestly rather than skipping silently.
  const caps = await capabilities();
  if (!caps.ai) {
    s.skip('DOCX extraction', `AI provider unavailable — ${caps.aiDetail}`);
  } else {
    const docxLike = new FormData();
    docxLike.append('file', new Blob(['Question 1: Add two numbers.\nExample Input: 1 2\nExample Output: 3'], { type: 'text/plain' }), 'paper.txt');
    const r = await request('POST', '/api/problem-import/parse', { token: F, body: docxLike, raw: true });
    s.check('text extraction produces drafts', r.status === 201 && (r.body?.data?.drafts ?? []).length > 0, `status ${r.status}`);
  }

  return s;
};
