// Step 2: turn the reviewed draft roster into the final credentials CSV by adding a
// random password per student. Touches no database.
//
//   node scripts/roster/make-passwords.js --in ../docs/private-credentials/roster-draft.csv
//        [--accept-flagged] [--split]
//
// Output (never printed to the terminal):
//   docs/private-credentials/students-cseaiml-<date>.csv     sno, Year, Section, Name, Rollno, email, Password
//   with --split also one sheet per class, e.g. 2-1-A.csv, to hand to each class teacher.
//
// The final CSV is the ONLY record of the passwords, so this refuses to overwrite one that
// already exists. Passwords: 10 characters, no look-alikes (no 0/O, 1/l/I), at least one
// upper-case letter, lower-case letter and digit, drawn with crypto.randomInt.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const flag = (name) => args.includes(`--${name}`);

const IN = opt('in');
const OUT_DIR = path.join(__dirname, '../../../docs/private-credentials');
const DATE = new Date().toISOString().slice(0, 10);
const OUT = path.join(OUT_DIR, `students-cseaiml-${DATE}.csv`);
const COLUMNS = ['sno', 'Year', 'Section', 'Name', 'Rollno', 'email', 'Password'];

const { makePassword, parseCsv } = require('../lib/roster-utils');

const cellOut = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => `﻿${[COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cellOut(r[c])).join(','))].join('\r\n')}\r\n`;

function main() {
  if (!IN) { console.error('Give --in <reviewed draft csv>.'); process.exit(2); }
  if (fs.existsSync(OUT)) {
    console.error(`${OUT} already exists. It holds the only copy of the passwords, so it will not be overwritten.\nMove or delete it yourself if you really want new passwords.`);
    process.exit(1);
  }
  const draft = parseCsv(fs.readFileSync(IN, 'utf8'));
  if (draft.length === 0) { console.error('The draft has no rows.'); process.exit(1); }

  const flagged = draft.filter((r) => (r.review || '').trim());
  if (flagged.length && !flag('accept-flagged')) {
    console.error(`${flagged.length} row(s) in the draft still carry a review note. Resolve them in the draft, or confirm they are fine with --accept-flagged.`);
    process.exit(1);
  }
  const bad = draft.filter((r) => !/^\d{2}[A-Z]{2}\d[A-Z][0-9A-Z]{4}$/.test(r.Rollno) || r.email !== `${r.Rollno.toLowerCase()}@sreyas.ac.in` || !r.Name.trim() || !['2', '3', '4'].includes(r.Year) || !/^[A-D]$/.test(r.Section));
  if (bad.length) { console.error(`${bad.length} row(s) are malformed (roll, email, name, year or section), for example ${bad[0].Rollno}. Fix the draft first.`); process.exit(1); }
  if (new Set(draft.map((r) => r.Rollno)).size !== draft.length || new Set(draft.map((r) => r.email)).size !== draft.length) { console.error('Duplicate roll numbers or emails in the draft.'); process.exit(1); }

  const used = new Set();
  const rows = draft
    .sort((a, b) => Number(a.Year) - Number(b.Year) || a.Section.localeCompare(b.Section) || Number(a.sno) - Number(b.sno))
    .map((r, i) => {
      let pw; do { pw = makePassword(); } while (used.has(pw));
      used.add(pw);
      return { sno: i + 1, Year: r.Year, Section: r.Section, Name: r.Name, Rollno: r.Rollno, email: r.email, Password: pw };
    });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, toCsv(rows), { encoding: 'utf8', flag: 'wx' });
  console.log(`Wrote ${rows.length} students to ${OUT}`);

  if (flag('split')) {
    const groups = new Map();
    for (const r of rows) (groups.get(`${r.Year}-1-${r.Section}`) || groups.set(`${r.Year}-1-${r.Section}`, []).get(`${r.Year}-1-${r.Section}`)).push(r);
    for (const [k, list] of groups) {
      fs.writeFileSync(path.join(OUT_DIR, `class-${k}-${DATE}.csv`), toCsv(list.map((r, i) => ({ ...r, sno: i + 1 }))), { encoding: 'utf8', flag: 'wx' });
    }
    console.log(`Wrote ${groups.size} class sheets (class-<year>-1-<section>-${DATE}.csv) with a per-class serial number.`);
  }
  console.log('Passwords are in the files only; none were printed. Treat them as secrets and delete the files once handed out.');
}

main();
