// Career preparation for students: resume check, mock interview, personal readiness. The resume check is rule-based and free; the
// interview uses the AI gateway and says so plainly when no provider is configured (no pretend scores).
const ai = require('../services/aiGateway');
const careerRepo = require('../repositories/careerPrepRepository');
const careerService = require('../services/careerService');
const { scoreResume, ROLES } = require('../utils/resumeScore');
const { TRACKS, LEVELS, QUESTIONS, MAX_ANSWER, readRequest, nextQuestionPrompt, scorePrompt, toScorecard } = require('../utils/mockInterview');

const NO_AI = 'The mock interview needs the AI service, which is not switched on for this college yet.';

function aiFailure(res, error, fallback) {
  if (error?.name === 'AiError') {
    const busy = error.status === 429 || error.status === 503;
    return res.status(busy ? 503 : 502).json({ success: false, error: busy ? 'The interview service is busy right now. Please try again in a moment.' : `AI provider error: ${error.message}` });
  }
  return res.status(500).json({ success: false, error: fallback });
}

// @route GET /api/career/me
exports.getMine = async (req, res) => {
  try {
    const mine = await careerService.getMine(req.user.id);
    res.json({
      success: true,
      data: {
        ...mine,
        aiConfigured: ai.isConfigured(),
        roles: Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label })),
        tracks: Object.entries(TRACKS).map(([key, t]) => ({ key, label: t.label })),
        levels: Object.keys(LEVELS),
        interview: { questions: QUESTIONS, maxAnswer: MAX_ANSWER },
      },
    });
  } catch (error) {
    console.error('career getMine error:', error);
    res.status(500).json({ success: false, error: 'Failed to load your career page' });
  }
};

// @route GET /api/faculty/placement/readiness?year=&section=   (HOD / admin)
exports.getReadiness = async (req, res) => {
  try {
    const year = /^\d$/.test(String(req.query.year || '')) ? String(req.query.year) : null;
    const section = /^[A-Za-z0-9]{1,4}$/.test(String(req.query.section || '')) ? String(req.query.section) : null;
    res.json({ success: true, data: await careerService.getReadiness(req, { year, section }) });
  } catch (error) {
    console.error('career getReadiness error:', error);
    res.status(500).json({ success: false, error: 'Failed to load placement readiness' });
  }
};

// @route POST /api/career/resume   body: { text, role }
exports.checkResume = async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 30000) : '';
    const result = scoreResume(text, req.body?.role);
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    await careerRepo.saveResume(req.user.id, { score: result.score, band: result.band, role: result.role, breakdown: result.breakdown, suggestions: result.suggestions.slice(0, 12), facts: result.facts });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('career checkResume error:', error);
    res.status(500).json({ success: false, error: 'Failed to check your resume' });
  }
};

// @route POST /api/career/interview/next   body: { track, level, transcript: [{question, answer}] }
exports.nextQuestion = async (req, res) => {
  const input = readRequest(req.body);
  if (input.error) return res.status(400).json({ success: false, error: input.error });
  if (input.transcript.length >= QUESTIONS) return res.status(400).json({ success: false, error: 'The interview is complete. Finish it to see your scorecard.' });
  if (!ai.isConfigured()) return res.status(503).json({ success: false, error: NO_AI });
  try {
    const { data } = await ai.generateJson({ ...nextQuestionPrompt(input), temperature: 0.7, maxTokens: 200 });
    const question = String(data?.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!question) return res.status(502).json({ success: false, error: 'The interviewer did not return a question. Please try again.' });
    res.json({ success: true, data: { question, number: input.transcript.length + 1, of: QUESTIONS } });
  } catch (error) {
    console.error('career nextQuestion error:', error);
    aiFailure(res, error, 'Failed to get the next question');
  }
};

// @route POST /api/career/interview/finish   body: { track, level, transcript }   (all QUESTIONS answered)
exports.finishInterview = async (req, res) => {
  const input = readRequest(req.body);
  if (input.error) return res.status(400).json({ success: false, error: input.error });
  if (input.transcript.length !== QUESTIONS) return res.status(400).json({ success: false, error: `Answer all ${QUESTIONS} questions to get a scorecard.` });
  if (!ai.isConfigured()) return res.status(503).json({ success: false, error: NO_AI });
  try {
    const { data } = await ai.generateJson({ ...scorePrompt(input), temperature: 0.2, maxTokens: 900 });
    const card = toScorecard(data, input);
    const interviews = await careerRepo.addInterview(req.user.id, card);
    res.json({ success: true, data: { scorecard: card, interviews: interviews.length } });
  } catch (error) {
    console.error('career finishInterview error:', error);
    aiFailure(res, error, 'Failed to mark the interview');
  }
};
