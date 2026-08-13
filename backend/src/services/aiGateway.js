// Single door to whatever LLM the platform is pointed at.
//
// Why this exists: the locked decision (PR-1) is "model-agnostic now, keep Gemini
// live, self-host a Qwen-Coder-class model on vLLM when the college H100 arrives".
// Every AI call therefore goes through here, so that switch is a config change
// rather than a hunt through controllers. It also concentrates the two things that
// have already bitten us:
//
//   * the model id (a pinned `gemini-2.5-flash` silently killed every AI feature
//     when Google blocked retired ids for new keys — see docs/product/
//     faculty-authoring-analytics-plan.md §0)
//   * JSON responses (each provider spells "give me JSON" differently, and a
//     model that answers in prose breaks callers that JSON.parse the reply)
//
// Providers:
//   AI_PROVIDER=gemini             → Google AI Studio via @google/genai  (default)
//   AI_PROVIDER=openai-compatible  → any /v1/chat/completions endpoint, which is
//                                    what vLLM, Ollama and llama.cpp all expose.
//                                    Set AI_BASE_URL (+ AI_API_KEY, AI_MODEL).
const { GoogleGenAI } = require('@google/genai');

const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

// Gemini keeps its own env vars so existing deployments keep working untouched.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const OPENAI_MODEL = process.env.AI_MODEL || 'qwen2.5-coder-7b-instruct';

const activeModel = () => (PROVIDER === 'gemini' ? GEMINI_MODEL : OPENAI_MODEL);

/** True when the gateway has enough configuration to actually reach a model. */
function isConfigured() {
  if (PROVIDER === 'gemini') return !!process.env.GEMINI_API_KEY;
  return !!process.env.AI_BASE_URL;
}

/**
 * Thrown for any provider-side failure so callers can distinguish "the model
 * refused/failed" from a bug in our own code. `status` mirrors the upstream HTTP
 * status where there is one.
 */
class AiError extends Error {
  constructor(message, { status = null, provider = PROVIDER, cause = null } = {}) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.provider = provider;
    this.cause = cause;
  }
}

// Provider overload is routine, not exceptional: Gemini answers 503 "experiencing
// high demand" and 429 under quota pressure, and either would otherwise fail a
// faculty member's whole import or a student's question. Retry those a couple of
// times with backoff; never retry a 4xx we caused (bad key, bad model, bad request).
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [800, 2500];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  let last;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const status = err?.status ?? null;
      const retryable = status === null ? false : RETRYABLE.has(status);
      if (!retryable || attempt === RETRY_DELAYS_MS.length) break;
      console.warn(`⚠️  AI ${label} got ${status}; retrying in ${RETRY_DELAYS_MS[attempt]}ms`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw last;
}

// ── Gemini ───────────────────────────────────────────────────────────────────
let geminiClient = null;
const gemini = () => {
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return geminiClient;
};

async function generateGemini({ prompt, system, json, model, temperature, maxTokens }) {
  const config = {};
  if (json) config.responseMimeType = 'application/json';
  if (system) config.systemInstruction = system;
  if (typeof temperature === 'number') config.temperature = temperature;
  if (maxTokens) config.maxOutputTokens = maxTokens;

  try {
    const res = await gemini().models.generateContent({
      model: model || GEMINI_MODEL,
      contents: prompt,
      ...(Object.keys(config).length ? { config } : {}),
    });
    return { text: res.text ?? '', usage: res.usageMetadata ?? null };
  } catch (err) {
    throw new AiError(err.message || 'Gemini request failed', { status: err.status ?? null, cause: err });
  }
}

// ── OpenAI-compatible (vLLM / Ollama / llama.cpp / OpenAI itself) ────────────
async function generateOpenAiCompatible({ prompt, system, json, model, temperature, maxTokens }) {
  const base = (process.env.AI_BASE_URL || '').replace(/\/$/, '');
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model: model || OPENAI_MODEL,
    messages,
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    // Supported by vLLM and OpenAI; harmless where ignored, and we defensively
    // strip code fences below for servers that ignore it entirely.
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

  let res;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AiError(`Could not reach ${base}: ${err.message}`, { cause: err });
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AiError(payload?.error?.message || `HTTP ${res.status}`, { status: res.status });
  }
  return {
    text: payload?.choices?.[0]?.message?.content ?? '',
    usage: payload?.usage ?? null,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Free-text generation.
 * @returns {Promise<{text: string, usage: object|null, model: string}>}
 */
async function generateText({ prompt, system, model, temperature, maxTokens } = {}) {
  if (!prompt) throw new AiError('prompt is required');
  if (!isConfigured()) throw new AiError('No AI provider configured', { status: 503 });

  const args = { prompt, system, json: false, model, temperature, maxTokens };
  const out = await withRetry(
    () => (PROVIDER === 'gemini' ? generateGemini(args) : generateOpenAiCompatible(args)),
    'generateText',
  );
  return { ...out, model: model || activeModel() };
}

// Some providers wrap JSON in ```json fences even when asked not to. Strip them
// rather than failing a whole generation over formatting.
function stripFences(text) {
  const t = (text || '').trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : t).trim();
}

/**
 * JSON generation. Returns the PARSED object, so callers never JSON.parse a
 * provider reply themselves (and never crash on a stray code fence).
 * Retries once on unparseable output — a single reroll fixes most formatting
 * slips and is far cheaper than failing the caller's whole workflow.
 * @returns {Promise<{data: any, usage: object|null, model: string}>}
 */
async function generateJson({ prompt, system, model, temperature, maxTokens, attempts = 2 } = {}) {
  if (!prompt) throw new AiError('prompt is required');
  if (!isConfigured()) throw new AiError('No AI provider configured', { status: 503 });

  const args = { prompt, system, json: true, model, temperature, maxTokens };
  let lastText = '';
  for (let i = 0; i < Math.max(1, attempts); i++) {
    const out = await withRetry(
      () => (PROVIDER === 'gemini' ? generateGemini(args) : generateOpenAiCompatible(args)),
      'generateJson',
    );
    lastText = out.text;
    try {
      return { data: JSON.parse(stripFences(out.text)), usage: out.usage, model: model || activeModel() };
    } catch {
      // fall through and retry
    }
  }
  throw new AiError(
    `Model did not return valid JSON after ${attempts} attempt(s): ${lastText.slice(0, 200)}`,
    { status: 502 },
  );
}

/** Config summary for health checks and diagnostics. Never returns secrets. */
function describe() {
  return {
    provider: PROVIDER,
    model: activeModel(),
    configured: isConfigured(),
    baseUrl: PROVIDER === 'gemini' ? 'https://generativelanguage.googleapis.com' : (process.env.AI_BASE_URL || null),
  };
}

module.exports = { generateText, generateJson, isConfigured, describe, activeModel, AiError, PROVIDER };
