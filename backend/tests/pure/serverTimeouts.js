// The HTTP server holds an idle connection longer than a proxy in front of it will (see utils/serverTimeouts.js).
const http = require('http');
const { applyServerTimeouts, DEFAULT_KEEP_ALIVE_MS } = require('../../src/utils/serverTimeouts');

module.exports = async function (s) {
  const server = http.createServer();
  s.check('Node default (5 seconds) is shorter than a proxy idle timeout, which is why this setting exists', server.keepAliveTimeout === 5000);

  const set = applyServerTimeouts(server, {});
  s.check('by default an idle connection is held for 65 seconds, longer than the usual 60 second proxy idle timeout', set.keepAliveTimeout === DEFAULT_KEEP_ALIVE_MS && DEFAULT_KEEP_ALIVE_MS > 60000);
  s.check('the headers timeout is longer than the keep-alive timeout, as Node requires', set.headersTimeout > set.keepAliveTimeout && server.headersTimeout === set.headersTimeout);

  const custom = applyServerTimeouts(http.createServer(), { KEEP_ALIVE_TIMEOUT_MS: '120000' });
  s.check('KEEP_ALIVE_TIMEOUT_MS overrides the default', custom.keepAliveTimeout === 120000 && custom.headersTimeout === 121000);

  for (const bad of ['', 'abc', '0', '-5', '500']) {
    const r = applyServerTimeouts(http.createServer(), { KEEP_ALIVE_TIMEOUT_MS: bad });
    s.check(`an unusable KEEP_ALIVE_TIMEOUT_MS ("${bad}") falls back to the default`, r.keepAliveTimeout === DEFAULT_KEEP_ALIVE_MS);
  }
};
