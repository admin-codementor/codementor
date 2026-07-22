const { GoogleGenAI } = require('@google/genai');
const aiTutorRepo = require('../repositories/aiTutorRepository');

const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY is not set. Using mock AI response.');
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

const SYSTEM_PROMPT = `You are a Socratic coding tutor for engineering students.
Your ONLY job is to guide students to the answer through questions.
NEVER give the solution or write code for them.
NEVER say "here is the answer" or "the fix is".

When a student is stuck:
1. First ask what they have tried so far
2. Ask them to explain what their current code does line by line
3. Ask what happens at a specific edge case
4. Lead them to discover the bug themselves

Keep responses under 3 sentences.
Always end with a question.`;

const constructPrompt = (problemDescription, studentCode, studentMessage) => {
  return `${SYSTEM_PROMPT}

Problem:
${problemDescription}

Student's current code:
${studentCode}

Student's error/question:
${studentMessage}`;
};

const askTutor = async (req, res) => {
  const { problemId, problemDescription, code, message } = req.body;
  const userId = req.user?.id; // Assuming authMiddleware sets req.user

  if (!userId || !problemId || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Store the user's message
    await aiTutorRepo.addMessage({ userId, problemId, role: 'user', content: message });

    // 2. Retrieve history for context
    const history = await aiTutorRepo.getHistory(userId, problemId);

    // 3. Call Gemini
    const ai = getGeminiClient();
    let aiResponseText = '';

    if (ai) {
      // Construct conversation context
      let context = constructPrompt(problemDescription, code, "Here is the conversation history and my new question.");
      context += "\n\nConversation History:\n";
      history.forEach(msg => {
        context += `${msg.role.toUpperCase()}: ${msg.content}\n`;
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: context,
      });
      aiResponseText = response.text;
    } else {
      // Mock Response if no API Key
      aiResponseText = "This is a mock AI response since the GEMINI_API_KEY is not set. What do you think your code is doing on line 4?";
    }

    // 4. Store the AI's response
    await aiTutorRepo.addMessage({ userId, problemId, role: 'assistant', content: aiResponseText });

    res.json({ success: true, response: aiResponseText });
  } catch (error) {
    console.error('AI Tutor Error:', error);
    res.status(500).json({ error: 'Failed to communicate with AI Tutor' });
  }
};

const getHistory = async (req, res) => {
  const { problemId } = req.params;
  const userId = req.user?.id;

  if (!userId || !problemId) {
    return res.status(400).json({ error: 'Missing userId or problemId' });
  }

  try {
    const history = (await aiTutorRepo.getHistory(userId, problemId)).map(m => ({
      role: m.role, content: m.content, created_at: m.createdAt?.toDate?.() ?? m.createdAt,
    }));
    res.json({ success: true, history });
  } catch (error) {
    console.error('Fetch AI History Error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
};

const explainError = async (req, res) => {
  const { problemDescription, code, errorTrace } = req.body;
  if (!problemDescription || !code || !errorTrace) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({ 
        success: true, 
        explanation: "Mock Explanation: Your code crashes because you are trying to access an element out of bounds on line 8. Please check your loop condition." 
      });
    }

    const prompt = `You are an expert programming mentor. Your student's code just failed with an error.
Explain the error in plain English in 2-3 sentences. Do NOT give the exact code fix. Focus on the "why".

Problem:
${problemDescription}

Student's code:
${code}

Error Trace:
${errorTrace}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({ success: true, explanation: response.text });
  } catch (error) {
    console.error('Explain Error failed:', error);
    res.status(500).json({ error: 'Failed to explain error' });
  }
};

const reviewCode = async (req, res) => {
  const { problemDescription, code } = req.body;
  if (!problemDescription || !code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        success: true,
        review: {
          qualityScore: 85,
          timeComplexity: "O(N)",
          spaceComplexity: "O(1)",
          codeSmells: ["Variable 'i' could be more descriptive"],
          improvementSuggestions: ["Consider using a hash map for O(1) lookups instead of nested loops."]
        }
      });
    }

    const prompt = `You are a Senior Software Engineer reviewing a junior engineer's code that just passed all test cases.
Review the code for quality, complexity, and smells.
You MUST output valid JSON strictly matching this schema, without markdown formatting:
{
  "qualityScore": number (0-100),
  "timeComplexity": string (e.g. "O(N)"),
  "spaceComplexity": string (e.g. "O(1)"),
  "codeSmells": [string],
  "improvementSuggestions": [string]
}

Problem:
${problemDescription}

Code:
${code}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsedReview = JSON.parse(response.text);
    res.json({ success: true, review: parsedReview });
  } catch (error) {
    console.error('Code Review failed:', error);
    res.status(500).json({ error: 'Failed to review code' });
  }
};

module.exports = {
  getGeminiClient,
  askTutor,
  getHistory,
  explainError,
  reviewCode,
};
