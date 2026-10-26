#!/usr/bin/env node
// Dependency audit gate: runs `npm audit` for one app's production dependencies and fails on any finding of severity high or above
// that is not listed (with a reason and a review date) in security/accepted-audit-risks.json.
//
//   node scripts/audit-gate.cjs backend
//   node scripts/audit-gate.cjs frontend-next
//
// Why not plain `npm audit`: it cannot record "we looked at this and accept it", so it either fails forever or gets switched off.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const threshold = RANK.high;

/** Pure: which findings stop the build? */
function evaluate(vulnerabilities, accepted, today = new Date()) {
  const acceptedBy = new Map(accepted.map((a) => [a.package, a]));
  const failures = [];
  const acceptedOk = [];
  for (const v of Object.values(vulnerabilities || {})) {
    if ((RANK[v.severity] ?? 0) < threshold) continue;
    const a = acceptedBy.get(v.name);
    if (!a) { failures.push({ name: v.name, severity: v.severity, why: 'not accepted' }); continue; }
    if (!a.reason || !a.review_by) { failures.push({ name: v.name, severity: v.severity, why: 'accepted without a reason and review date' }); continue; }
    if (new Date(a.review_by) < today) { failures.push({ name: v.name, severity: v.severity, why: `acceptance expired on ${a.review_by}` }); continue; }
    acceptedOk.push({ name: v.name, severity: v.severity, review_by: a.review_by });
  }
  // An accepted entry that no longer matches any finding should be removed.
  const present = new Set(Object.values(vulnerabilities || {}).map((v) => v.name));
  const stale = accepted.filter((a) => !present.has(a.package)).map((a) => a.package);
  return { failures, acceptedOk, stale };
}

if (require.main === module) {
  const app = process.argv[2];
  if (!app) { console.error('usage: node scripts/audit-gate.cjs <backend|frontend-next>'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'security', 'accepted-audit-risks.json'), 'utf8'));
  let out;
  try {
    out = execSync('npm audit --omit=dev --json', { cwd: path.join(root, app), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = e.stdout; // npm audit exits non-zero when it finds something; the JSON is still on stdout
  }
  let report;
  try { report = JSON.parse(out); } catch { console.error('Could not read the npm audit result (is the registry reachable?).'); process.exit(2); }
  if (report.error) { console.error('npm audit failed:', report.error.summary || report.error.code); process.exit(2); }

  const { failures, acceptedOk, stale } = evaluate(report.vulnerabilities, cfg[app] || []);
  console.log(`${app}: ${Object.keys(report.vulnerabilities || {}).length} packages flagged, ${acceptedOk.length} accepted, ${failures.length} blocking.`);
  for (const a of acceptedOk) console.log(`  accepted  ${a.severity.padEnd(8)} ${a.name} (review by ${a.review_by})`);
  for (const s of stale) console.log(`  note: "${s}" is accepted but no longer flagged; remove it from security/accepted-audit-risks.json`);
  for (const f of failures) console.log(`  BLOCKING  ${f.severity.padEnd(8)} ${f.name}: ${f.why}`);
  process.exit(failures.length ? 1 : 0);
}

module.exports = { evaluate };
