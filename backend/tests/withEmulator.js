#!/usr/bin/env node
// Runs the smoke suite against a throwaway Firestore emulator instead of the real
// project, so CI can run it on every pull request.
//
//   npx firebase emulators:exec --only firestore --project codementor-ci "npm run test:emulator"
//
// `firebase emulators:exec` starts the emulator, puts FIRESTORE_EMULATOR_HOST in
// the environment, runs this, then shuts the emulator down. This script starts the
// backend against that emulator, waits for it to answer, runs tests/run.js, and
// stops the backend again.
//
// Note on coverage: anything needing Judge0 or the AI provider reports SKIPPED
// here, same as it does locally without them. This suite protects routes, roles
// and payload shapes — not code execution.
const { spawn } = require('child_process');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '3199';
const BASE = `http://127.0.0.1:${PORT}`;

// ── Safety gate ──────────────────────────────────────────────────────────────
// The suite writes and deletes documents. Without the emulator it would do that
// to the live project, so refuse to start rather than risk real student data.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    '\nFIRESTORE_EMULATOR_HOST is not set, so this would run against the REAL database.\n' +
    'Start it through the emulator instead:\n\n' +
    '  npx firebase emulators:exec --only firestore --project codementor-ci "npm run test:emulator"\n',
  );
  process.exit(2);
}

// Deliberately fixed, obviously-fake values: the suite signs its own tokens with
// these, and nothing else should ever accept them.
const childEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT,
  SMOKE_BASE_URL: BASE,
  JWT_SECRET: process.env.JWT_SECRET || 'emulator-only-access-secret-not-for-any-real-use',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'emulator-only-refresh-secret-not-for-any-real-use',
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'codementor-ci',
};

function run(command, args, opts = {}) {
  return spawn(command, args, {
    cwd: BACKEND_ROOT,
    env: childEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
}

async function waitForBackend(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  console.log(`Starting backend on ${BASE} against the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}\n`);
  const server = run('node', ['src/server.js']);

  let serverExited = false;
  server.on('exit', (code) => {
    serverExited = true;
    if (code !== 0 && code !== null) console.error(`Backend exited early with code ${code}.`);
  });

  const up = await waitForBackend();
  if (!up || serverExited) {
    console.error('The backend did not become reachable. See its output above.');
    server.kill();
    process.exit(2);
  }

  const tests = run('node', ['tests/run.js']);
  const testCode = await new Promise((resolve) => tests.on('exit', resolve));

  server.kill('SIGTERM');
  await new Promise((resolve) => {
    if (serverExited) return resolve();
    server.on('exit', resolve);
    setTimeout(() => { server.kill('SIGKILL'); resolve(); }, 10_000).unref();
  });

  process.exit(testCode ?? 1);
})();
