// Local-dev and container entry point. `npm run dev`/`npm start` run this.
// Kept separate from app.js so nothing here — a listening port, Judge0's startup
// health check, signal handlers — runs in a context that doesn't want them.
const app = require('./app');
const { checkJudge0Health } = require('./config/judge0Health');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, async () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  await checkJudge0Health();
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Render (and any container host) sends SIGTERM on redeploy and restart. Without
// this the process dies mid-request, so a student pressing Submit at that moment
// loses the submission. Stop taking new requests, let in-flight ones finish, then
// close Firestore's gRPC handles.
const SHUTDOWN_TIMEOUT_MS = 15_000;
let shuttingDown = false;

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${reason} — finishing in-flight requests…`);

  // Don't hang forever on a stuck request (a slow judge poll, say).
  const forceExit = setTimeout(() => {
    console.error('[shutdown] Timed out waiting for requests. Exiting now.');
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await new Promise((resolve) => server.close(resolve));
    // Idle keep-alive sockets hold the server open even with no active request.
    server.closeIdleConnections?.();
    const { db } = require('./config/firestore');
    await db.terminate();
    console.log('[shutdown] Closed cleanly.');
  } catch (err) {
    console.error('[shutdown] Error while closing:', err.message);
    exitCode = exitCode || 1;
  }

  clearTimeout(forceExit);
  process.exitCode = exitCode;
}

process.on('SIGTERM', () => shutdown('Received SIGTERM'));
process.on('SIGINT', () => shutdown('Received SIGINT'));

// A crash that isn't logged is a crash nobody can fix. Log it with the stack,
// then shut down — the process state is unreliable after either of these.
process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err);
  shutdown('Uncaught exception', 1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
  shutdown('Unhandled promise rejection', 1);
});

module.exports = server;
