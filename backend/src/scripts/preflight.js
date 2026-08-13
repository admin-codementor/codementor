#!/usr/bin/env node
// Environment preflight — run this BEFORE deploying, and before the smoke suite.
//
//   npm run preflight
//
// It checks configuration and connectivity only; it writes nothing. Every check
// that can fail explains what to do about it, because each one here has actually
// bitten this project:
//   * JUDGE0_URL pointing at a paused cloud VM (submissions silently dead)
//   * a Gemini key that lists models but cannot generate
//   * a pinned model id that Google retired for new keys
//   * Judge0 reachable but unable to execute (cgroup v2 on Docker Desktop)
require('dotenv').config({ quiet: true });

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };
const results = [];
const record = (level, label, detail, fix) => results.push({ level, label, detail, fix });
const ok = (l, d) => record('ok', l, d);
const warn = (l, d, fix) => record('warn', l, d, fix);
const fail = (l, d, fix) => record('fail', l, d, fix);

async function checkEnv() {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'FIREBASE_SERVICE_ACCOUNT'];
  for (const key of required) {
    if (!process.env[key]) fail(`env ${key}`, 'missing', `Set ${key} in backend/.env`);
    else if (key.startsWith('JWT') && process.env[key].length < 24) {
      warn(`env ${key}`, `only ${process.env[key].length} chars`, 'Use a long random secret: openssl rand -hex 32');
    } else ok(`env ${key}`, 'set');
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    fail('JWT secrets', 'access and refresh secrets are identical',
      'Use two different secrets — otherwise a refresh token is accepted as an access token.');
  }

  if (process.env.NODE_ENV !== 'production') {
    warn('NODE_ENV', process.env.NODE_ENV || 'unset', 'Set NODE_ENV=production on the deployed host.');
  } else ok('NODE_ENV', 'production');

  for (const key of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (!process.env[key]) warn(`env ${key}`, 'not set', 'Analytics caching and rate limiting fall back to in-process behaviour.');
    else ok(`env ${key}`, 'set');
  }
}

async function checkFirestore() {
  try {
    const { db } = require('../config/firestore');
    const snap = await db.collection('problems').count().get();
    ok('Firestore', `connected (${snap.data().count} problems)`);
  } catch (e) {
    fail('Firestore', e.message.slice(0, 120), 'Check FIREBASE_SERVICE_ACCOUNT is a valid service-account JSON for the right project.');
  }
}

async function checkJudge0() {
  const url = process.env.JUDGE0_URL;
  if (!url) return fail('JUDGE0_URL', 'not set', 'Set it to your Judge0 base URL (see .env.example).');

  try {
    const res = await fetch(`${url}/about`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      return fail('Judge0 reachable', `${url} → HTTP ${res.status}`, 'Check the host is up and the port is open.');
    }
    ok('Judge0 reachable', url);
  } catch (e) {
    return fail('Judge0 reachable', `${url} → ${e.message}`,
      'A dead JUDGE0_URL takes down submissions, contests AND AI test generation together. ' +
      'If this is the GCP VM, confirm it is running — a stopped VM also loses its external IP unless it is reserved.');
  }

  // Reachable is not the same as working.
  try {
    const { runOnJudge0 } = require('../utils/judge0Run');
    const out = await runOnJudge0({ source_code: 'print(6*7)', language_id: 71, stdin: '' });
    if (out.ok && out.stdout.trim() === '42') {
      ok('Judge0 executes code', 'verified with a real submission');
    } else {
      fail('Judge0 executes code', out.message || `status ${out.statusId}`,
        'Judge0 accepts submissions but cannot run them — usually the cgroup v1 requirement. ' +
        'On Linux: add systemd.unified_cgroup_hierarchy=0 to GRUB and reboot. ' +
        'On Docker Desktop for Windows there is no working equivalent — verify on a Linux host.');
    }
  } catch (e) {
    fail('Judge0 executes code', e.message.slice(0, 120), 'See docs/DEPLOYMENT_GUIDE.md.');
  }
}

async function checkAi() {
  const ai = require('../services/aiGateway');
  const info = ai.describe();
  if (!info.configured) {
    return warn('AI provider', `${info.provider} not configured`,
      'AI tutor and test generation will return errors. Set GEMINI_API_KEY (or AI_PROVIDER/AI_BASE_URL).');
  }
  try {
    const { text } = await ai.generateText({ prompt: 'Reply with the single word OK' });
    if (text) ok('AI provider', `${info.provider} / ${info.model} responding`);
    else warn('AI provider', 'empty response', 'Check quota and the model id.');
  } catch (e) {
    const msg = e.message || '';
    let fix = 'Run: node src/scripts/checkAiKey.js for a detailed diagnosis.';
    if (/no longer available|not found|404/i.test(msg)) {
      fix = `The model "${info.model}" appears retired. Set GEMINI_MODEL to a current one (a floating alias like gemini-flash-latest avoids this).`;
    } else if (/denied|permission/i.test(msg)) {
      fix = 'The key authenticates but the project is blocked. Create a key in a NEW project at https://aistudio.google.com/apikey.';
    } else if (/quota|429|exhausted/i.test(msg)) {
      fix = 'Quota exhausted. Enable billing on the Google project before a full-cohort exam.';
    }
    fail('AI provider', msg.slice(0, 140), fix);
  }
}

async function checkSecurity() {
  // These are cheap config mistakes with real consequences.
  const cors = process.env.CORS_ORIGIN;
  if (!cors || cors === '*') {
    warn('CORS_ORIGIN', cors || 'unset', 'Set it to the deployed frontend origin rather than allowing any site.');
  } else ok('CORS_ORIGIN', cors);

  if (process.env.JUDGE0_URL?.includes('localhost') && process.env.NODE_ENV === 'production') {
    fail('JUDGE0_URL in production', 'points at localhost',
      'A deployed backend cannot reach a laptop. Point this at the Judge0 host.');
  }
}

// Firestore's gRPC client keeps handles open, and calling process.exit() on top of
// them crashes libuv with an assertion — which reports exit 127 instead of the
// intended code, so a CI gate would read a clean run as a hard failure.
async function shutdown(code) {
  try {
    const { db } = require('../config/firestore');
    await db.terminate();
  } catch { /* never loaded, or already closed */ }
  process.exitCode = code;
}

(async () => {
  console.log(`${C.bold}CodeMentor preflight${C.reset}\n`);
  await checkEnv();
  await checkFirestore();
  await checkJudge0();
  await checkAi();
  await checkSecurity();

  const pad = Math.max(...results.map((r) => r.label.length)) + 2;
  for (const r of results) {
    const mark = r.level === 'ok' ? `${C.green}ok  ${C.reset}` : r.level === 'warn' ? `${C.yellow}warn${C.reset}` : `${C.red}FAIL${C.reset}`;
    console.log(`${mark}  ${r.label.padEnd(pad)} ${C.dim}${r.detail}${C.reset}`);
    if (r.fix) console.log(`      ${C.dim}→ ${r.fix}${C.reset}`);
  }

  const fails = results.filter((r) => r.level === 'fail').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  console.log('');
  if (fails) {
    console.log(`${C.red}${C.bold}${fails} blocking problem(s)${C.reset}${warns ? ` and ${warns} warning(s)` : ''}.`);
    return shutdown(1);
  }
  console.log(`${C.green}${C.bold}No blocking problems${C.reset}${warns ? `, ${C.yellow}${warns} warning(s) to review${C.reset}` : ''}.`);
  return shutdown(0);
})().catch(async (e) => { console.error('Preflight crashed:', e); await shutdown(2); });
