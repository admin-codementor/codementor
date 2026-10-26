// The standard error shape: plain messages, stable codes, references, and no leaking of technical text.
const { codeFor, defaultFor, requestIdFrom, newRequestId, isTechnical, shapeErrorBody, fromError } = require('../../src/utils/apiError');

module.exports = function (s) {
  // ── codes and defaults ──
  s.check('every common status has a code, a plain message and a hint', [400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 504].every((st) => { const d = defaultFor(st); return d.code && d.message && d.hint; }));
  s.check('codes are stable and readable', codeFor(404) === 'NOT_FOUND' && codeFor(429) === 'RATE_LIMITED' && codeFor(503) === 'UNAVAILABLE' && codeFor(401) === 'UNAUTHORIZED');
  s.check('an unlisted 5xx falls back to the server error, an unlisted 4xx to bad request', codeFor(599) === 'SERVER_ERROR' && codeFor(418) === 'BAD_REQUEST');

  // ── request references ──
  const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
  s.check('a new reference is 8 hex characters and they do not repeat in practice', [...ids].every((i) => /^[0-9A-F]{8}$/.test(i)) && ids.size === 200);
  s.check('a caller\'s reference is kept when it is short and harmless', requestIdFrom('web-4f2a9c1b.7') === 'web-4f2a9c1b.7');
  s.check('a reference with odd characters, too short or too long is replaced, so nothing nasty reaches the logs', ['a b c d e f g h', 'short', 'x'.repeat(65), 'line\nbreak12345', '<script>12345', undefined, 42].every((bad) => /^[0-9A-F]{8}$/.test(requestIdFrom(bad))));

  // ── technical text is never shown ──
  const tech = ['TypeError: Cannot read properties of undefined (reading \'id\')', 'connect ECONNREFUSED 127.0.0.1:6379', 'FirebaseError: 7 PERMISSION_DENIED: Missing or insufficient permissions.', 'Unexpected token } in JSON at position 41', 'at Object.<anonymous> (D:\\app\\src\\x.js:12:3)', 'x'.repeat(400)];
  s.check('stack, library and database messages are recognised as technical', tech.every(isTechnical));
  s.check('plain sentences are not technical', ['Choose a different password from the temporary one you were given.', 'Drive not found.', 'You can remind at most 100 students at a time.'].every((m) => !isTechnical(m)));
  s.check('a non-string message counts as technical', isTechnical(undefined) && isTechnical({ message: 'x' }));

  // ── shaping legacy bodies ──
  const a = shapeErrorBody(404, { success: false, error: 'Drive not found.' }, 'ABCD1234');
  s.check('a 4xx keeps the endpoint\'s own plain message and gains a code, a hint and the reference', a.error === 'Drive not found.' && a.code === 'NOT_FOUND' && a.hint && a.requestId === 'ABCD1234' && a.success === false);
  const b = shapeErrorBody(500, { success: false, error: 'connect ECONNREFUSED 127.0.0.1:6379' }, 'ABCD1234');
  s.check('a 5xx with a technical message is replaced by a plain one, and the raw text is not in the body', b.error === defaultFor(500).message && !JSON.stringify(b).includes('ECONNREFUSED'));
  const c = shapeErrorBody(500, { success: false, error: 'Failed to load the coding scores.' }, 'ABCD1234');
  s.check('a 5xx whose message is already a plain sentence keeps it', c.error === 'Failed to load the coding scores.' && c.code === 'SERVER_ERROR');
  const d = shapeErrorBody(400, { error: 'Pick a class first.' }, 'ABCD1234');
  s.check('an old { error } body with no success flag is upgraded', d.success === false && d.error === 'Pick a class first.' && d.code === 'BAD_REQUEST');
  s.check('an endpoint\'s own code (for example PASSWORD_CHANGE_REQUIRED) is kept', shapeErrorBody(403, { success: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Please set a new password before continuing.' }, 'ABCD1234').code === 'PASSWORD_CHANGE_REQUIRED');
  s.check('extra fields such as details are kept', shapeErrorBody(400, { error: 'x', details: [1, 2] }, 'ABCD1234').details.length === 2);
  s.check('an empty or odd body still gets the full shape', ['', null, undefined, [], 'text'].every((body) => { const r = shapeErrorBody(500, body, 'ABCD1234'); return r.success === false && r.error && r.code && r.hint && r.requestId; }));
  s.check('a very long 4xx message is replaced rather than shown', shapeErrorBody(400, { error: 'y'.repeat(500) }, 'ABCD1234').error === defaultFor(400).message);

  // ── thrown errors ──
  const got = (err) => fromError(err);
  s.check('invalid JSON is a 400 BAD_JSON, not a server error', got({ type: 'entity.parse.failed' }).status === 400 && got({ type: 'entity.parse.failed' }).code === 'BAD_JSON');
  s.check('a body over the limit is a 413 and is not logged as a server error', got({ type: 'entity.too.large' }).status === 413 && got({ type: 'entity.too.large' }).log === 'none');
  s.check('an expired session says so and asks to sign in again', got({ name: 'TokenExpiredError' }).code === 'SESSION_ENDED' && got({ name: 'JsonWebTokenError' }).status === 401);
  s.check('an upload that is too big is a 413', got({ code: 'LIMIT_FILE_SIZE' }).status === 413 && got({ code: 'LIMIT_UNEXPECTED_FILE' }).status === 400);
  s.check('a cross-origin refusal is a 403', got(new Error('Not allowed by CORS')).status === 403);
  s.check('a busy AI provider is a 503, another AI failure a 502', got({ name: 'AiError', status: 429 }).status === 503 && got({ name: 'AiError', status: 500 }).status === 502);
  s.check('database unavailable or slow is a 503 that says the work is safe', got({ code: 14 }).status === 503 && /safe/.test(got({ code: 4 }).hint) && got({ code: 8 }).code === 'CAPACITY');
  s.check('a refused connection to a service we depend on is a 503', got({ code: 'ECONNREFUSED' }).status === 503);
  s.check('an upstream HTTP failure is a 502', got({ isAxiosError: true, response: { status: 500 } }).status === 502);
  s.check('an error carrying a client status keeps it, and shows its message only when it is meant to be shown and plain', got({ status: 404, expose: true, message: 'Drive not found.' }).error === 'Drive not found.' && got({ status: 404, expose: false, message: 'secret detail' }).error === defaultFor(404).message && got({ status: 400, expose: true, message: 'Unexpected token } in JSON' }).error === defaultFor(400).message);
  s.check('an unknown error is a 500 with the plain message and none of its text', (() => { const r = got(new TypeError('Cannot read properties of undefined')); return r.status === 500 && r.error === defaultFor(500).message && r.log === 'error'; })());
  s.check('null, strings and other junk do not crash the handler', [null, undefined, 'boom', 7, {}].every((x) => got(x).status === 500));
};
