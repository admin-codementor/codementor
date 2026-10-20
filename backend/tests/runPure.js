#!/usr/bin/env node
// Offline tests for the pure calculation modules (backend/src/utils/*). No server, no database, no network:
// every figure is checked against a hand-computed fixture, so it is safe to run any time, in CI, and as often as
// you like (the live smoke suites in tests/run.js read the real Firestore project and use its daily quota).
//
//   npm run test:pure            # everything in tests/pure
//   npm run test:pure -- course  # files whose name contains "course"
//
// A test file exports `function (s)` and records results with s.check(label, ok, detail).
const fs = require('fs');
const path = require('path');

class Suite {
  constructor(name) { this.name = name; this.results = []; }
  check(label, ok, detail = '') { this.results.push({ label, ok: !!ok, detail: String(detail) }); return !!ok; }
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = fs.readdirSync(path.join(__dirname, 'pure')).filter((f) => f.endsWith('.js') && (!only.length || only.some((o) => f.includes(o)))).sort();
if (!files.length) { console.error('No pure test files matched.'); process.exit(2); }

let passed = 0;
let failed = 0;
for (const f of files) {
  const s = new Suite(f.replace(/\.js$/, ''));
  try {
    require(path.join(__dirname, 'pure', f))(s);
  } catch (e) {
    s.check(`the test file ran without crashing`, false, e.stack.split('\n').slice(0, 3).join(' | '));
  }
  const bad = s.results.filter((r) => !r.ok);
  console.log(`${bad.length ? '✗' : '✓'} ${s.name}: ${s.results.length - bad.length}/${s.results.length}`);
  bad.forEach((r) => console.log(`    FAIL ${r.label}${r.detail ? `  → ${r.detail}` : ''}`));
  passed += s.results.length - bad.length;
  failed += bad.length;
}
console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
