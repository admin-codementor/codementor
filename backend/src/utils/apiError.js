// One shape for every error the API sends, and plain words for the person who sees it. Pure, so every rule is testable.
//
//   { success: false, error: "<what happened, in plain words>", code: "NOT_FOUND", hint: "<what to do next>", requestId: "4F2A9C1B" }
//
//   error      always a short sentence a student can read. Never a stack, a file path, a database or library message.
//   code       stable and machine-readable; the website decides how to react from this (retry, sign in again, show a form error).
//   hint       one line on what to do next.
//   requestId  also sent as the X-Request-Id header and written next to the full technical error in the server log, so "quote this
//              reference" lets us find exactly what went wrong.
//
// Older endpoints still answer { success: false, error: "..." } or { error: "..." }; shapeErrorBody() upgrades those on the way out, so
// nothing had to be rewritten at once, and it replaces a technical message on a 5xx with a plain one.
const crypto = require('crypto');

const BY_STATUS = {
  400: { code: 'BAD_REQUEST', message: 'That request could not be understood.', hint: 'Check what you entered and try again.' },
  401: { code: 'UNAUTHORIZED', message: 'You need to sign in to do that.', hint: 'Sign in again, then retry.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to do that.', hint: 'If you think you should, ask your faculty or admin.' },
  404: { code: 'NOT_FOUND', message: 'We could not find that.', hint: 'It may have been moved or deleted.' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'That action is not allowed here.', hint: 'Reload the page and try again.' },
  408: { code: 'TIMEOUT', message: 'That took too long.', hint: 'Check your connection and try again.' },
  409: { code: 'CONFLICT', message: 'That conflicts with something that already exists.', hint: 'Reload to see the latest, then try again.' },
  410: { code: 'GONE', message: 'That is no longer available.', hint: 'Go back and choose again.' },
  413: { code: 'TOO_LARGE', message: 'That is too large to send.', hint: 'Use something smaller and try again.' },
  415: { code: 'UNSUPPORTED_TYPE', message: 'That kind of file or data is not accepted.', hint: 'Check the format and try again.' },
  422: { code: 'INVALID', message: 'Some of what you entered is not valid.', hint: 'Fix the highlighted fields and try again.' },
  429: { code: 'RATE_LIMITED', message: 'You are going a little too fast.', hint: 'Wait a few seconds and try again.' },
  500: { code: 'SERVER_ERROR', message: 'Something went wrong on our side.', hint: 'This was not your fault. Try again in a moment, and tell us the reference if it keeps happening.' },
  502: { code: 'UPSTREAM_ERROR', message: 'A service we depend on did not answer properly.', hint: 'Try again in a moment.' },
  503: { code: 'UNAVAILABLE', message: 'The system is busy right now.', hint: 'Your work is safe. Wait a moment and try again.' },
  504: { code: 'UPSTREAM_TIMEOUT', message: 'A service we depend on took too long.', hint: 'Try again in a moment.' },
};

const clampStatus = (n) => (Number.isInteger(n) && n >= 400 && n <= 599 ? n : 500);
const defaultFor = (status) => BY_STATUS[status] || (status >= 500 ? BY_STATUS[500] : BY_STATUS[400]);
const codeFor = (status) => defaultFor(status).code;

// A reference people can read out over the phone: 8 hex characters. A caller may supply its own (so a browser and the server can
// agree), but only if it is short and harmless, because it is written into logs.
const newRequestId = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const requestIdFrom = (header) => (typeof header === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(header) ? header : newRequestId());

// Messages that describe our insides rather than help the person. These are never shown, whatever status they came with.
const TECHNICAL = [
  /\n\s+at\s/, /\bat\s+[\w.$<>]+\s*\(.*:\d+:\d+\)/, /node_modules/, /\.(js|ts)x?:\d+/,
  /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|FirebaseError|FirestoreError|AxiosError|MongoError)\b/,
  /\b(PERMISSION_DENIED|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|ABORTED)\b/,
  /Cannot read propert/i, /is not a function/i, /is not defined/i, /\bundefined\b/, /\bnull\b.*\b(property|properties)\b/i,
  /JSON at position/i, /Unexpected token/i, /\bstack\b/i,
];
const isTechnical = (message) => typeof message !== 'string' || message.length > 300 || TECHNICAL.some((re) => re.test(message));

/**
 * Upgrades whatever an endpoint sent with an error status into the standard shape.
 * @param {number} status  the HTTP status
 * @param {*} body         what the handler passed to res.json
 * @param {string} requestId
 */
function shapeErrorBody(status, body, requestId) {
  const base = body && typeof body === 'object' && !Array.isArray(body) ? body : { error: typeof body === 'string' ? body : undefined };
  const dflt = defaultFor(status);
  const said = typeof base.error === 'string' && base.error.trim() ? base.error.trim() : null;
  // On a 5xx the person gets a plain sentence unless the endpoint already wrote one. On a 4xx the endpoint's own words are kept: they
  // are validation messages written for the user ("Choose a different password...").
  const message = said && !(status >= 500 && isTechnical(said)) && !(status < 500 && said.length > 300) ? said : dflt.message;
  return { ...base, success: false, error: message, code: typeof base.code === 'string' && base.code ? base.code : dflt.code, hint: typeof base.hint === 'string' && base.hint ? base.hint : dflt.hint, requestId };
}

/**
 * What to tell the client about a thrown error. The full error is logged separately, with the request id; none of it is sent.
 * @returns {{status: number, code: string, error: string, hint: string, log: 'error'|'warn'|'none'}}
 */
function fromError(err) {
  const make = (status, code, error, hint, log = status >= 500 ? 'error' : 'warn') => ({ status, code: code || codeFor(status), error: error || defaultFor(status).message, hint: hint || defaultFor(status).hint, log });
  if (!err || typeof err !== 'object') return make(500);

  // body-parser: invalid JSON, or a body over the limit
  if (err.type === 'entity.parse.failed') return make(400, 'BAD_JSON', 'The request was not valid JSON.', 'Reload the page and try again.', 'none');
  if (err.type === 'entity.too.large') return make(413, 'TOO_LARGE', 'That is too large to send.', 'Use something smaller and try again.', 'none');
  if (err.type === 'request.aborted' || err.code === 'ECONNABORTED') return make(400, 'ABORTED', 'The connection was closed before we received everything.', 'Check your connection and try again.', 'none');
  // sign-in tokens
  if (err.name === 'TokenExpiredError') return make(401, 'SESSION_ENDED', 'Your session has ended. Please sign in again.', 'Sign in again, then retry.', 'none');
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') return make(401, 'UNAUTHORIZED', 'You need to sign in to do that.', 'Sign in again, then retry.', 'none');
  // file uploads (multer)
  if (err.code === 'LIMIT_FILE_SIZE') return make(413, 'TOO_LARGE', 'That file is too large.', 'Use a smaller file and try again.', 'none');
  if (typeof err.code === 'string' && err.code.startsWith('LIMIT_')) return make(400, 'BAD_UPLOAD', 'That upload could not be accepted.', 'Check the file and try again.', 'none');
  // cross-origin refusal
  if (err.message === 'Not allowed by CORS') return make(403, 'FORBIDDEN', null, null, 'warn');
  // AI provider (services/aiGateway.js)
  if (err.name === 'AiError') {
    const busy = err.status === 429 || err.status === 503;
    return make(busy ? 503 : 502, busy ? 'AI_BUSY' : 'AI_ERROR', busy ? 'The AI service is busy right now.' : 'The AI service could not answer.', 'Try again in a moment.');
  }
  // database (gRPC codes) and network failures to something we depend on
  if (err.code === 14 || err.code === 4 || err.code === 'UNAVAILABLE' || err.code === 'DEADLINE_EXCEEDED') return make(503, 'DATABASE_UNAVAILABLE', 'The database is not answering right now.', 'Your work is safe. Wait a moment and try again.');
  if (err.code === 8 || err.code === 'RESOURCE_EXHAUSTED') return make(503, 'CAPACITY', 'The system is very busy right now.', 'Wait a minute and try again.');
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.code)) return make(503, 'UPSTREAM_UNAVAILABLE', 'A service we depend on is not answering.', 'Try again in a moment.');
  if (err.isAxiosError) return make(502, 'UPSTREAM_ERROR', null, null);
  // errors that already carry an HTTP status (http-errors, body-parser, our own)
  const s = clampStatus(err.status ?? err.statusCode);
  if (s !== 500 || err.status === 500 || err.statusCode === 500) {
    const exposed = err.expose === true && typeof err.message === 'string' && !isTechnical(err.message);
    return make(s, null, exposed ? err.message : null, null);
  }
  return make(500);
}

module.exports = { BY_STATUS, codeFor, defaultFor, newRequestId, requestIdFrom, isTechnical, shapeErrorBody, fromError };
