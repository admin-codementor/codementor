// Multi-section Exams engine (PR-1): exam + section CRUD, publish gating,
// classroom targeting, the student taking flow (visit/answer/mark-for-review),
// negative marking, and submit scoring. Coding-section Judge0 reconciliation is
// PR-4 scope — here a coding section is only exercised structurally (attach
// problems, publish gate, totals), never actually judged.
const { tokenFor, get, post, put, patch, del, Suite, purge, userId, db } = require('../harness');

module.exports = async function examsCoreSuite() {
  const s = new Suite('Exams: sections, targeting, taking flow, scoring');
  const F = tokenFor('exams', 'faculty');
  const OTHER = tokenFor('exams-other', 'faculty');
  const MEMBER = tokenFor('exams-member', 'student');
  const OUTSIDER = tokenFor('exams-outsider', 'student');
  const problems = [];

  s.onCleanup(async () => {
    for (const id of problems) await del(`/api/faculty/problems/${id}`, F);
    await purge('exams', 'facultyId', [userId('exams')]);
    await purge('classrooms', 'facultyId', [userId('exams')]);
  }, 'probe exams, classes and problems');

  const now = Date.now();
  const windowStart = new Date(now - 60_000).toISOString();
  const windowEnd = new Date(now + 3600_000).toISOString();

  // ── A published problem for the coding section ──────────────────────────────
  const p = await post('/api/faculty/problems', F, {
    title: 'SMOKE exam coding problem', description: 'x', difficulty: 'easy',
    test_cases: [{ input: '1', output: '1', is_public: true }],
  });
  const probId = p.body?.data?.id;
  if (probId) problems.push(probId);
  // createProblem defaults status to 'published' unless 'draft' is requested,
  // so no separate publish step is needed here.

  // ── Classroom targeting setup ─────────────────────────────────────────────
  const cls = await post('/api/classrooms', F, { name: 'SMOKE exams class', department: 'CSE', section: 'A' });
  const classId = cls.body?.data?.id;
  const joinCode = cls.body?.data?.join_code;
  await post('/api/classrooms/join', MEMBER, { code: joinCode });

  // ── Create exam, targeted at the class ───────────────────────────────────
  const mk = await post('/api/exams', F, {
    title: 'SMOKE exam', description: 'desc', window_start: windowStart, window_end: windowEnd,
    duration_minutes: 30, general_instructions: 'Read carefully.', classroom_ids: [classId],
  });
  const examId = mk.body?.data?.id;
  s.check('create an exam', mk.status === 201 && !!examId, `status ${mk.status} ${JSON.stringify(mk.body)}`);

  const badWindow = await post('/api/exams', F, {
    title: 'SMOKE bad window', window_start: windowEnd, window_end: windowStart, duration_minutes: 30,
  });
  s.check('window_end before window_start rejected', badWindow.status === 400, `status ${badWindow.status}`);

  // ── Sections: two MCQ + one coding ───────────────────────────────────────
  const sec1 = await post(`/api/exams/${examId}/sections`, F, { title: 'Aptitude', type: 'mcq', marks_per_question: 2, negative_marking: 0.5 });
  const sec1Id = sec1.body?.data?.id;
  const sec2 = await post(`/api/exams/${examId}/sections`, F, { title: 'Technical', type: 'mcq', marks_per_question: 1 });
  const sec2Id = sec2.body?.data?.id;
  const sec3 = await post(`/api/exams/${examId}/sections`, F, { title: 'Coding', type: 'coding', marks_per_question: 10 });
  const sec3Id = sec3.body?.data?.id;
  s.check('three sections created', sec1.status === 201 && sec2.status === 201 && sec3.status === 201);

  const badType = await post(`/api/exams/${examId}/sections`, F, { title: 'Bad', type: 'essay' });
  s.check('unknown section type rejected', badType.status === 400, `status ${badType.status}`);

  // ── Publish gate: every section must be populated ────────────────────────
  const earlyPublish = await patch(`/api/exams/${examId}/publish`, F, { is_published: true });
  s.check('cannot publish with empty sections', earlyPublish.status === 400, `status ${earlyPublish.status}`);

  const questionsSec1 = [
    { question_text: 'What is 2 + 2?', options: ['3', '4', '5'], correct_index: 1, marks: 2, topic: 'arithmetic' },
    { question_text: 'What is 10 / 2?', options: ['4', '5', '6'], correct_index: 1, marks: 2, topic: 'arithmetic' },
  ];
  const save1 = await put(`/api/exams/${examId}/sections/${sec1Id}/questions`, F, { questions: questionsSec1 });
  s.check('save section 1 questions', save1.status === 200 && save1.body?.data?.count === 2, `status ${save1.status}`);

  const save2 = await put(`/api/exams/${examId}/sections/${sec2Id}/questions`, F, {
    questions: [{ question_text: 'Which is FIFO?', options: ['Stack', 'Queue'], correct_index: 1, marks: 1 }],
  });
  s.check('save section 2 questions', save2.status === 200);

  const stillMissingCoding = await patch(`/api/exams/${examId}/publish`, F, { is_published: true });
  s.check('still blocked — coding section has no problems yet', stillMissingCoding.status === 400, `status ${stillMissingCoding.status}`);

  const attach = await put(`/api/exams/${examId}/sections/${sec3Id}/problems`, F, { problem_ids: [probId] });
  s.check('attach a problem to the coding section', attach.status === 200 && attach.body?.data?.count === 1, `status ${attach.status}`);

  const badProblem = await put(`/api/exams/${examId}/sections/${sec3Id}/problems`, F, { problem_ids: ['does-not-exist'] });
  s.check('unknown problem id rejected', badProblem.status === 400, `status ${badProblem.status}`);

  // ── Reorder ───────────────────────────────────────────────────────────────
  const reorder = await put(`/api/exams/${examId}/sections/reorder`, F, { section_ids: [sec3Id, sec1Id, sec2Id] });
  s.check("'reorder' isn't swallowed as a section id", reorder.status === 200, `status ${reorder.status}`);

  // ── Ownership ─────────────────────────────────────────────────────────────
  const hijack = await put(`/api/exams/${examId}`, OTHER, { title: 'hijacked' });
  s.check("another faculty member can't edit it", hijack.status === 404, `status ${hijack.status}`);

  // ── Publish ───────────────────────────────────────────────────────────────
  const pub = await patch(`/api/exams/${examId}/publish`, F, { is_published: true });
  s.check('publish succeeds once every section is populated', pub.status === 200 && pub.body?.data?.is_published === true, `status ${pub.status} ${JSON.stringify(pub.body)}`);

  // ── Classroom targeting ───────────────────────────────────────────────────
  const memberSees = (await get('/api/exams/available', MEMBER)).body?.data ?? [];
  const outsiderSees = (await get('/api/exams/available', OUTSIDER)).body?.data ?? [];
  s.check('targeted exam reaches the class member', memberSees.some((e) => e.id === examId));
  s.check('targeted exam does NOT reach a non-member', !outsiderSees.some((e) => e.id === examId));

  const outsiderInstructions = await get(`/api/exams/${examId}/instructions`, OUTSIDER);
  s.check('a non-member gets 404 on instructions too', outsiderInstructions.status === 404, `status ${outsiderInstructions.status}`);

  const instructions = await get(`/api/exams/${examId}/instructions`, MEMBER);
  s.check('instructions show per-section breakdown, no answers', instructions.status === 200
    && instructions.body?.data?.sections?.length === 3
    && instructions.body.data.sections.every((sec) => sec.correct_index === undefined));

  // ── Start attempt ─────────────────────────────────────────────────────────
  const outsiderStart = await post(`/api/exams/${examId}/start`, OUTSIDER, {});
  s.check("a non-member can't start it", outsiderStart.status === 403, `status ${outsiderStart.status}`);

  const start = await post(`/api/exams/${examId}/start`, MEMBER, {});
  s.check('member can start the exam', start.status === 200, `status ${start.status} ${JSON.stringify(start.body)}`);
  const view = start.body?.data;
  s.check('taking view has all three sections with no correct_index leaked',
    view?.sections?.length === 3 && view.sections.every((sec) => (sec.questions || []).every((q) => q.correct_index === undefined)));
  s.check('server-computed seconds_remaining is present and sane', typeof view?.seconds_remaining === 'number' && view.seconds_remaining > 0 && view.seconds_remaining <= 1800);

  const restart = await post(`/api/exams/${examId}/start`, MEMBER, {});
  s.check('restarting is idempotent (does not reset the clock forward)', restart.body?.data?.seconds_remaining <= view.seconds_remaining);

  // ── Resume state ──────────────────────────────────────────────────────────
  const resumed = await get(`/api/exams/${examId}/attempt`, MEMBER);
  s.check('GET attempt resumes the same state', resumed.status === 200 && resumed.body?.data?.submitted === false);

  // ── Visit / answer / mark-for-review state machine ───────────────────────
  const sec1Questions = view.sections.find((sec) => sec.id === sec1Id).questions;
  const [qA, qB] = sec1Questions;
  const sec2Questions = view.sections.find((sec) => sec.id === sec2Id).questions;
  const [qC] = sec2Questions;

  const visitOnly = await patch(`/api/exams/${examId}/attempt/questions/${qA.id}`, MEMBER, { section_id: sec1Id });
  s.check('opening a question with no answer marks it visited', visitOnly.status === 200 && visitOnly.body?.data?.status === 'visited', JSON.stringify(visitOnly.body));

  const answerA = await patch(`/api/exams/${examId}/attempt/questions/${qA.id}`, MEMBER, { section_id: sec1Id, selected_index: 1 }); // correct
  s.check('answering sets status=answered', answerA.body?.data?.status === 'answered');

  const answerBWrong = await patch(`/api/exams/${examId}/attempt/questions/${qB.id}`, MEMBER, { section_id: sec1Id, selected_index: 0 }); // wrong (correct is 1)
  s.check('wrong answer still records', answerBWrong.body?.data?.status === 'answered');

  const markC = await patch(`/api/exams/${examId}/attempt/questions/${qC.id}`, MEMBER, { section_id: sec2Id, marked: true });
  s.check('marking without an answer sets status=marked', markC.body?.data?.status === 'marked');

  const answerAndMarkC = await patch(`/api/exams/${examId}/attempt/questions/${qC.id}`, MEMBER, { section_id: sec2Id, selected_index: 1, marked: true });
  s.check('answer + mark sets status=answered_marked', answerAndMarkC.body?.data?.status === 'answered_marked');

  const wrongSectionForQuestion = await patch(`/api/exams/${examId}/attempt/questions/${qA.id}`, MEMBER, { section_id: sec2Id, selected_index: 0 });
  s.check("a question id from the wrong section is rejected", wrongSectionForQuestion.status === 404, `status ${wrongSectionForQuestion.status}`);

  // ── Coding-section visit ping (structural only — no Judge0 in PR-1) ──────
  const visitProblem = await patch(`/api/exams/${examId}/attempt/visit/${probId}`, MEMBER, { section_id: sec3Id });
  s.check('coding-section visit ping records visited', visitProblem.status === 200 && visitProblem.body?.data?.status === 'visited', JSON.stringify(visitProblem.body));

  // ── Submit & scoring ──────────────────────────────────────────────────────
  // Sec1 (marks 2, negative 0.5): qA correct (+2), qB wrong (-0.5) → 1.5 / 4
  // Sec2 (marks 1, no negative): qC correct (+1) → 1 / 1
  // Sec3 (coding, marks 10, 1 problem, never judged) → 0 / 10
  const submit = await post(`/api/exams/${examId}/submit`, MEMBER, {});
  s.check('submit succeeds', submit.status === 200, `status ${submit.status} ${JSON.stringify(submit.body)}`);
  s.check('negative marking applied correctly', submit.body?.data?.score === 2.5, `score ${submit.body?.data?.score}`);
  s.check('total reflects all sections incl. unjudged coding', submit.body?.data?.total === 15, `total ${submit.body?.data?.total}`);
  const secResults = submit.body?.data?.sections ?? [];
  s.check('per-section breakdown present', secResults.length === 3);
  s.check('sec1 score/total correct', secResults.find((r) => r.id === sec1Id)?.score === 1.5 && secResults.find((r) => r.id === sec1Id)?.total === 4);
  s.check('coding section total counted even though unjudged', secResults.find((r) => r.id === sec3Id)?.total === 10 && secResults.find((r) => r.id === sec3Id)?.score === 0);

  const resubmit = await post(`/api/exams/${examId}/submit`, MEMBER, {});
  s.check("can't submit twice", resubmit.status === 409, `status ${resubmit.status}`);

  const answerAfterSubmit = await patch(`/api/exams/${examId}/attempt/questions/${qA.id}`, MEMBER, { section_id: sec1Id, selected_index: 1 });
  s.check("can't edit an answer after submitting", answerAfterSubmit.status === 409, `status ${answerAfterSubmit.status}`);

  // ── Faculty results ───────────────────────────────────────────────────────
  const results = await get(`/api/exams/${examId}/results`, F);
  s.check('faculty results endpoint works', results.status === 200 && results.body?.data?.summary?.attempts === 1, `status ${results.status}`);
  s.check('results include per-question accuracy for mcq sections',
    results.body?.data?.sections?.find((sec) => sec.id === sec1Id)?.question_stats?.length === 2);

  // ── Delete cascades ───────────────────────────────────────────────────────
  const delRes = await del(`/api/exams/${examId}`, F);
  s.check('delete succeeds', delRes.status === 200, `status ${delRes.status}`);
  s.check('deleted exam 404s for faculty', (await get(`/api/exams/${examId}`, F)).status === 404);
  s.check('deleted exam 404s for students too', (await get(`/api/exams/${examId}/instructions`, MEMBER)).status === 404);

  const leftoverSections = await db().collection('exams').doc(examId).collection('sections').get();
  s.check('sections subcollection actually cascaded, not just the parent doc', leftoverSections.empty);

  return s;
};
