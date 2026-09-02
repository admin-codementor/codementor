#!/usr/bin/env node
// Pre-deploy smoke suite.
//
//   npm run test:smoke            # everything
//   npm run test:smoke -- roles   # one suite by name
//
// Requires the backend to be running (npm start) and pointed at the environment
// you intend to verify. Exits non-zero if anything failed, so it can gate a deploy.
//
// Every suite cleans up after itself; the runner reports what teardown removed so a
// leak is visible rather than silently accumulating in the database.
const { capabilities, BASE } = require('./harness');

const SUITES = {
  roles: require('./suites/roles'),
  authoring: require('./suites/authoring'),
  mcqImport: require('./suites/mcqAndImport'),
  examTargeting: require('./suites/examAndTargeting'),
  examsCore: require('./suites/examsCore'),
  examCodingProctor: require('./suites/examCodingAndProctor'),
  codingRunSubmit: require('./suites/codingRunAndSubmit'),
  analyticsAi: require('./suites/analyticsAndAi'),
};

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

(async () => {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const selected = only.length ? Object.entries(SUITES).filter(([k]) => only.includes(k)) : Object.entries(SUITES);

  if (only.length && selected.length === 0) {
    console.error(`Unknown suite. Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(2);
  }

  console.log(`${C.bold}CodeMentor pre-deploy smoke suite${C.reset}`);
  console.log(`${C.dim}target: ${BASE}${C.reset}\n`);

  const caps = await capabilities();
  if (!caps.backend) {
    console.error(`${C.red}The backend is not reachable at ${BASE}.${C.reset}`);
    console.error('Start it first:  npm start\n');
    process.exit(2);
  }

  console.log(`${C.bold}Environment${C.reset}`);
  console.log(`  backend           ${C.green}reachable${C.reset}`);
  console.log(`  judge0 execution  ${caps.judge0Executes ? `${C.green}working${C.reset}` : `${C.yellow}unavailable${C.reset} ${C.dim}(${caps.judge0Detail})${C.reset}`}`);
  console.log(`  AI provider       ${caps.ai ? `${C.green}working${C.reset}` : `${C.yellow}unavailable${C.reset} ${C.dim}(${caps.aiDetail})${C.reset}`}`);
  console.log('');

  const suites = [];
  let hadError = false;

  for (const [key, factory] of selected) {
    let suite = null;
    process.stdout.write(`${C.cyan}▶ ${key}${C.reset}\n`);
    try {
      suite = await factory();
    } catch (err) {
      hadError = true;
      console.log(`  ${C.red}SUITE CRASHED${C.reset} ${err.message}`);
      if (process.env.SMOKE_VERBOSE) console.log(err.stack);
      if (suite) suites.push(suite);
      continue;
    }

    for (const r of suite.results) {
      if (r.skipped) console.log(`  ${C.yellow}SKIP${C.reset}  ${r.label} ${C.dim}— ${r.detail}${C.reset}`);
      else if (r.ok) console.log(`  ${C.green}PASS${C.reset}  ${r.label}${r.detail ? ` ${C.dim}→ ${r.detail}${C.reset}` : ''}`);
      else console.log(`  ${C.red}FAIL${C.reset}  ${r.label}${r.detail ? ` ${C.dim}→ ${r.detail}${C.reset}` : ''}`);
    }

    // Teardown always runs, and reports itself.
    for (const step of suite.cleanup) {
      try {
        const removed = await step.fn();
        console.log(`  ${C.dim}cleaned: ${step.description}${typeof removed === 'number' ? ` (${removed})` : ''}${C.reset}`);
      } catch (err) {
        console.log(`  ${C.yellow}cleanup failed: ${step.description} — ${err.message}${C.reset}`);
      }
    }
    suites.push(suite);
    console.log('');
  }

  const passed = suites.reduce((a, s) => a + s.passed, 0);
  const failed = suites.reduce((a, s) => a + s.failed, 0);
  const skipped = suites.reduce((a, s) => a + s.skipped, 0);

  console.log(`${C.bold}Summary${C.reset}`);
  for (const s of suites) {
    const mark = s.failed ? `${C.red}✗${C.reset}` : `${C.green}✓${C.reset}`;
    console.log(`  ${mark} ${s.name.padEnd(40)} ${s.passed} passed` +
      (s.failed ? `, ${C.red}${s.failed} failed${C.reset}` : '') +
      (s.skipped ? `, ${C.yellow}${s.skipped} skipped${C.reset}` : ''));
  }

  console.log('');
  if (failed || hadError) {
    console.log(`${C.red}${C.bold}NOT READY TO DEPLOY${C.reset} — ${failed} check(s) failed${hadError ? ', and a suite crashed' : ''}.`);
  } else if (skipped) {
    console.log(`${C.yellow}${C.bold}PASSED WITH GAPS${C.reset} — ${passed} passed, ${skipped} skipped.`);
    console.log(`${C.dim}Skipped checks are unverified, not verified-good. See the environment block above.${C.reset}`);
  } else {
    console.log(`${C.green}${C.bold}ALL CHECKS PASSED${C.reset} — ${passed} checks.`);
  }

  await shutdown(failed || hadError ? 1 : 0);
})().catch(async (err) => {
  console.error('Runner crashed:', err);
  await shutdown(2);
});

// Teardown touches Firestore directly, and its gRPC handles make process.exit()
// crash libuv (reporting 127 instead of the real code). Close it, then let Node
// exit on its own.
async function shutdown(code) {
  try {
    const { db } = require('./harness');
    await db().terminate();
  } catch { /* never opened */ }
  process.exitCode = code;
}
