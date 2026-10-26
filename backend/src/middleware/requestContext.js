// Gives every request a reference and makes every error response use the standard shape (utils/apiError.js).
//
//   - req.id and the X-Request-Id response header: the reference the website shows ("quote 4F2A9C1B") and the server logs next to
//     the full technical error
//   - res.json is wrapped so any response with an error status is upgraded to { success, error, code, hint, requestId }, whichever
//     endpoint produced it
const { requestIdFrom, shapeErrorBody, fromError } = require('../utils/apiError');

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
    const who = req.user?.id ? ` user=${req.user.id}` : '';
    const line = `[${req.id}] ${req.method} ${req.originalUrl.split('?')[0]} -> ${e.status} ${e.code}${who}`;
    if (e.log === 'error') console.error(line, err); else console.warn(line, err?.message ?? '');
  }
  return res.status(e.status).json({ success: false, error: e.error, code: e.code, hint: e.hint });
}

/** Unknown /api or other address. */
function notFound(req, res) {
  res.status(404).json({ success: false, error: 'We could not find that.', code: 'NOT_FOUND', hint: 'Check the address, or go back and try again.' });
}

module.exports = { requestContext, errorHandler, notFound };
