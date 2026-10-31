// A "Report a problem" message from a person who hit an error. Pure: checks and cleans what the website sent.
//
//   requestId   the reference the error screen showed ("4F2A9C1B"); lets the Admin find the exact line in the server log
//   page        where the person was (a path only; query strings are dropped because they can carry names or codes)
//   message     what they were doing, in their words (optional)
//   code        the error code the screen had (optional)

const STATUSES = ['open', 'seen', 'resolved'];
const clean = (v, max) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** @returns {{error: string} | {value: {requestId: string|null, page: string, message: string, code: string|null, httpStatus: number|null}}} */
function validateReport(input) {
  if (!input || typeof input !== 'object') return { error: 'Nothing to send.' };
  const message = String(input.message ?? '').replace(/\r/g, '').trim().slice(0, 600);
  const requestId = /^[A-Za-z0-9._-]{8,64}$/.test(String(input.requestId ?? '')) ? String(input.requestId) : null;
  let page = clean(input.page, 200).split('?')[0].split('#')[0];
  if (!page.startsWith('/')) page = '';
  const code = /^[A-Z][A-Z0-9_]{1,40}$/.test(String(input.code ?? '')) ? String(input.code) : null;
  const httpStatus = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599 ? input.status : null;
  if (!requestId && message.length < 5) return { error: 'Tell us in a few words what you were doing.' };
  return { value: { requestId, page, message, code, httpStatus } };
}

function validateStatus(s) {
  return STATUSES.includes(s) ? { value: s } : { error: `Status must be one of: ${STATUSES.join(', ')}.` };
}

module.exports = { STATUSES, validateReport, validateStatus };
