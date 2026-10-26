// Browser reports of Content-Security-Policy violations, reduced to one safe log line. The browser sends either the older
// {"csp-report": {...}} body or the newer Reporting API array of {type, body}. We keep only what is needed to fix the policy
// and drop query strings (they can hold tokens or names) and anything long.
const cut = (v, n = 160) => String(v ?? '').slice(0, n);
const noQuery = (url) => cut(String(url ?? '').split(/[?#]/)[0]);

/** @returns {{directive: string, blocked: string, page: string, source: string, line: number|null}|null} */
function summariseCspReport(body) {
  const raw = Array.isArray(body) ? (body.find((r) => r && r.type === 'csp-violation') || {}).body : (body && (body['csp-report'] || body));
  if (!raw || typeof raw !== 'object') return null;
  const directive = raw['effective-directive'] || raw.effectiveDirective || raw['violated-directive'] || raw.violatedDirective;
  if (!directive) return null;
  const line = Number(raw['line-number'] ?? raw.lineNumber);
  return {
    directive: cut(directive, 60),
    blocked: noQuery(raw['blocked-uri'] ?? raw.blockedURL ?? raw.blockedURI),
    page: noQuery(raw['document-uri'] ?? raw.documentURL ?? raw.documentURI),
    source: noQuery(raw['source-file'] ?? raw.sourceFile),
    line: Number.isFinite(line) ? line : null,
  };
}

module.exports = { summariseCspReport };
