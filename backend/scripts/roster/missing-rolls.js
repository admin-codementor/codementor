// List the roll numbers that are skipped inside each batch of the roster, so the department can
// say who they are. Touches no database. Nobody is invented: this only names the gaps.
//
//   node scripts/roster/missing-rolls.js --in ../docs/private-credentials/roster-draft.csv
//
// A roll number is "missing" when it falls between the first and last roll printed for its series
// (e.g. 25VE1A66..) but appears in no section. The college counts 6601..6699, then 66A0..66A9, 66B0..,
// skipping the tens letters I and O. Series with only a few students (repeaters from older batches)
// are not checked: their gaps would mean nothing. Rolls AFTER the last printed one cannot be found.
const fs = require('fs');
const path = require('path');
const { PRIVATE_DIR, DOMAIN, parseCsv } = require('../lib/roster-utils');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const IN = opt('in');
const MIN_SERIES = 10; // fewer students than this in a series: a handful of repeaters, not a batch
const TENS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const seq = (roll) => parseInt(roll[8], 36) * 10 + parseInt(roll[9], 36);
const makeRoll = (prefix8, n) => `${prefix8}${TENS[Math.floor(n / 10)]}${n % 10}`;
const SKIPPED_TENS = new Set([TENS.indexOf('I'), TENS.indexOf('O')]);
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function main() {
  if (!IN) { console.error('Give --in <roster csv>.'); process.exit(2); }
  const rows = parseCsv(fs.readFileSync(IN, 'utf8'));
  const series = new Map();
  for (const r of rows) {
    const key = r.Rollno.slice(0, 8); // e.g. 25VE1A66
    (series.get(key) || series.set(key, []).get(key)).push(r);
  }

  const out = [];
  for (const [key, list] of [...series].sort()) {
    if (list.length < MIN_SERIES) continue;
    const have = new Map(list.map((r) => [seq(r.Rollno), r]));
    const lo = Math.min(...have.keys());
    const hi = Math.max(...have.keys());
    const sorted = [...have.keys()].sort((a, b) => a - b);
    for (let n = lo; n <= hi; n++) {
      if (have.has(n) || SKIPPED_TENS.has(Math.floor(n / 10))) continue;
      const before = have.get(Math.max(...sorted.filter((k) => k < n)));
      const after = have.get(Math.min(...sorted.filter((k) => k > n)));
      const sameList = before.Year === after.Year && before.Section === after.Section;
      const roll = makeRoll(key, n);
      out.push({
        batch: `${2000 + Number(key.slice(0, 2))} admission (${key.slice(4, 6) === '5A' ? 'lateral entry' : 'regular'})`,
        missing_roll: roll,
        would_be_email: `${roll.toLowerCase()}@${DOMAIN}`,
        likely_year: before.Year === after.Year ? before.Year : `${before.Year} or ${after.Year}`,
        likely_section: sameList ? before.Section : `${before.Section} or ${after.Section} (between two sections)`,
        listed_just_before: `${before.Rollno} ${before.Name}`,
        listed_just_after: `${after.Rollno} ${after.Name}`,
        student_name: '', // for the department to fill in
      });
    }
  }

  const cols = ['batch', 'missing_roll', 'would_be_email', 'likely_year', 'likely_section', 'listed_just_before', 'listed_just_after', 'student_name'];
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const file = path.join(PRIVATE_DIR, `missing-students-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(file, `﻿${[cols.join(','), ...out.map((o) => cols.map((c) => csvCell(o[c])).join(','))].join('\r\n')}\r\n`, 'utf8');

  const byBatch = new Map();
  out.forEach((o) => byBatch.set(o.batch, (byBatch.get(o.batch) || 0) + 1));
  console.log(`Missing roll numbers: ${out.length}`);
  [...byBatch].forEach(([b, n]) => console.log(`  ${b}: ${n}`));
  console.log(`Written: ${file}`);
}

main();
