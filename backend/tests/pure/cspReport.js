// CSP violation reports: both browser formats, reduced to a safe line.
const { summariseCspReport } = require('../../src/utils/cspReport');

module.exports = function (s) {
  const legacy = summariseCspReport({ 'csp-report': { 'document-uri': 'https://app.example/app/dashboard?token=SECRET', 'violated-directive': 'script-src', 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?a=b', 'source-file': 'https://app.example/_next/chunk.js', 'line-number': 12 } });
  s.check('the older report format is read', legacy.directive === 'script-src-elem' && legacy.line === 12 && legacy.blocked === 'https://evil.example/x.js');
  s.check('query strings and fragments are dropped, so a token in a URL is never logged', !JSON.stringify(legacy).includes('SECRET') && legacy.page === 'https://app.example/app/dashboard');

  const modern = summariseCspReport([{ type: 'deprecation', body: {} }, { type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'inline', documentURL: 'https://app.example/', sourceFile: '', lineNumber: 3 } }]);
  s.check('the newer Reporting API array is read, picking the violation', modern.directive === 'img-src' && modern.blocked === 'inline' && modern.line === 3);

  s.check('garbage returns null instead of throwing', summariseCspReport(null) === null && summariseCspReport('x') === null && summariseCspReport({}) === null && summariseCspReport([]) === null);
  s.check('very long values are cut', summariseCspReport({ 'csp-report': { 'effective-directive': 'x'.repeat(500), 'blocked-uri': 'y'.repeat(900) } }).blocked.length === 160);
};
