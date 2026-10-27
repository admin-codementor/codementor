// Keep-alive settings for the HTTP server.
//
// Node closes an idle connection after 5 seconds by default. A student answering an exam question pauses 20 to 60 seconds between saves,
// and whatever sits in front of the API (an ingress, a tunnel, a load balancer) keeps idle connections open for about a minute. When the
// two disagree, the proxy sends a request down a connection Node has just closed and the student gets a reset (a 502 or "connection
// closed") on a save that was fine. The rule: the server must hold an idle connection LONGER than anything in front of it.
//
// KEEP_ALIVE_TIMEOUT_MS overrides the default if the proxy in front is set differently.
const DEFAULT_KEEP_ALIVE_MS = 65_000;

function applyServerTimeouts(server, env = process.env) {
  const asked = Number(env.KEEP_ALIVE_TIMEOUT_MS);
  const keepAlive = Number.isFinite(asked) && asked >= 1000 && env.KEEP_ALIVE_TIMEOUT_MS !== '' ? asked : DEFAULT_KEEP_ALIVE_MS;
  server.keepAliveTimeout = keepAlive;
  // Node requires the headers timeout to be longer than the keep-alive timeout, or the keep-alive wait can be cut short.
  server.headersTimeout = keepAlive + 1000;
  return { keepAliveTimeout: server.keepAliveTimeout, headersTimeout: server.headersTimeout };
}

module.exports = { applyServerTimeouts, DEFAULT_KEEP_ALIVE_MS };
