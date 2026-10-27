// Gives every request a reference and makes every error response use the standard shape (utils/apiError.js).
//
//   - req.id and the X-Request-Id response header: the reference the website shows ("quote 4F2A9C1B") and the server logs next to
//     the full technical error
//   - res.json is wrapped so any response with an error status is upgraded to { success, error, code, hint, requestId }, whichever
//     endpoint produced it
const { requestIdFrom, shapeErrorBody, fromError } = require('../utils/apiError');

/** A client-supplied value made safe to write into one log line. */
function logSafe(value) {
  return String(value).replace(/[\r\n]/g, ' ').replace(/[^\x20-\x7e]/g, '?').slice(0, 300);
}

function requestContext(req, res, next) {
  const id = requestIdFrom(req.headers['x-request-id']);
  req.id = id;
  res.setHeader('X-Request-Id', id);
  const json = res.json.bind(res);
  res.json = (body) => json(res.statusCode >= 400 ? shapeErrorBody(res.statusCode, body, id) : body);
  next();
}

/** The last handler: turns anything thrown into the standard response, and logs the real error with its reference. */
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const e = fromError(err);
  if (e.log !== 'none') {
    // The address and user id come from the client: strip line breaks and control characters (so a request cannot forge a log line),
    // cap the length, and pass them as arguments to a fixed format string (so a "%" in an address is never read as a format code).
    const who = req.user?.id ? ` user=${logSafe(req.user.id)}` : '';
    const where = logSafe(String(req.originalUrl).split('?')[0]);
    if (e.log === 'error') console.error('[%s] %s %s -> %d %s%s', req.id, logSafe(req.method), where, e.status, e.code, who, err);
    else console.warn('[%s] %s %s -> %d %s%s', req.id, logSafe(req.method), where, e.status, e.code, who, err?.message ?? '');
  }
  return res.status(e.status).json({ success: false, error: e.error, code: e.code, hint: e.hint });
}

/** Unknown /api or other address. */
function notFound(req, res) {
  res.status(404).json({ success: false, error: 'We could not find that.', code: 'NOT_FOUND', hint: 'Check the address, or go back and try again.' });
}

module.exports = { requestContext, errorHandler, notFound, logSafe };
