// Startup configuration check.
//
// The rule here: FAIL only on configuration the server cannot work without, and
// WARN on everything else. A deployed backend that refuses to boot is worse than
// one running with a degraded feature, so a missing Judge0 or AI key is a warning
// — those break one feature, not the service. Missing auth secrets or Firebase
// credentials are fatal because nothing works without them.
//
// `npm run preflight` is the stricter, pre-deploy gate (it also makes live calls
// to Judge0/Gemini/Firestore). This runs on every boot and only reads config.
const fs = require('fs');
const path = require('path');

const usingFirestoreEmulator = () => !!process.env.FIRESTORE_EMULATOR_HOST;

function collect() {
  const errors = [];
  const warnings = [];

  const fail = (what, fix) => errors.push({ what, fix });
  const warn = (what, fix) => warnings.push({ what, fix });

  // ── Fatal: auth secrets ────────────────────────────────────────────────────
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if (!process.env[key]) {
      fail(`${key} is not set`, `Add ${key} to backend/.env (generate one with: openssl rand -hex 32)`);
    }
  }

  // ── Fatal: Firebase credentials (the database) ─────────────────────────────
  if (!usingFirestoreEmulator()) {
    const hasEnvCredential = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    const hasFileCredential = fs.existsSync(path.join(__dirname, '../../service-account.json'));
    if (!hasEnvCredential && !hasFileCredential) {
      fail(
        'No Firebase credentials found',
        'Set FIREBASE_SERVICE_ACCOUNT (raw or base64 JSON), or place the key at backend/service-account.json. ' +
        'See backend/.env.example.',
      );
    }
  }

  // ── Warnings: insecure but functional ──────────────────────────────────────
  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    warn(
      'JWT_SECRET and JWT_REFRESH_SECRET are identical',
      'Use two different secrets — otherwise a refresh token is accepted as an access token.',
    );
  }

  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[key];
    if (value && value.length < 24) {
      warn(`${key} is only ${value.length} characters`, 'Use a long random secret: openssl rand -hex 32');
    }
  }

  // ── Warnings: degraded features ────────────────────────────────────────────
  if (!process.env.JUDGE0_URL) {
    warn('JUDGE0_URL is not set', 'Code submissions will fail. See backend/.env.example.');
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    warn('Upstash Redis is not configured', 'Analytics caching and rate limiting are disabled (requests are never limited).');
  }

  if (process.env.NODE_ENV === 'production') {
    const cors = process.env.CORS_ORIGIN;
    if (!cors || cors === '*') {
      warn('CORS_ORIGIN allows every origin in production', 'Set CORS_ORIGIN to the deployed frontend origin.');
    }
    if (process.env.JUDGE0_URL && process.env.JUDGE0_URL.includes('localhost')) {
      warn('JUDGE0_URL points at localhost in production', 'A deployed backend cannot reach a laptop.');
    }
  }

  return { errors, warnings };
}

/**
 * Checks configuration and reports it. Exits the process when something required
 * is missing, so the failure is visible at boot rather than on a user's request.
 */
function validateEnvOrExit() {
  const { errors, warnings } = collect();

  for (const w of warnings) {
    console.warn(`[config] warning: ${w.what}\n          → ${w.fix}`);
  }

  if (errors.length) {
    console.error(`\n[config] Cannot start — ${errors.length} required setting(s) missing:\n`);
    for (const e of errors) {
      console.error(`  ✗ ${e.what}\n    → ${e.fix}`);
    }
    console.error('');
    process.exit(1);
  }

  if (usingFirestoreEmulator()) {
    console.log(`[config] Using the Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST} — no real data is touched.`);
  }
}

module.exports = { validateEnvOrExit, usingFirestoreEmulator };
