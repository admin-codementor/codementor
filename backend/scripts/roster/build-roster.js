// Step 1 of onboarding the real students: read the college roll-list PDF and write a
// DRAFT roster CSV (no passwords yet) plus a review report. Touches no database.
//
//   node scripts/roster/build-roster.js --pdf "<file.pdf>" --out ../docs/credentials/roster-draft.csv
//   node scripts/roster/build-roster.js --text raw.txt  --out ...      (text from `pdftotext -raw`)
//
// The PDF is a table whose cells wrap, so a name can run onto the next lines. This reads
// `pdftotext -raw` (content order, which keeps each roll number beside its name) and
// NEVER pairs silently: every row is checked and anything odd is listed for a human.
//
// Checks per row/section: valid roll pattern; roll and email unique; rolls ascending within a
// series (24VE1A..., 25VE1A..., lateral 25VE5A...); names alphabetical within a series (the
// college prints them that way, so a break often means a mis-paired or wrapped name);
// serial number matches the running count; roll-number gaps are listed as information.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const PDF = opt('pdf');
const TEXT = opt('text');
const OUT = opt('out') || path.join(__dirname, '../../../docs/private-credentials/roster-draft.csv');
const DOMAIN = 'sreyas.ac.in';

// A roll line, optionally led by the serial number on the same line ("12 25VE1A6611 ELE ABHINAV").
const ROLL = /^(?:S?(\d{1,3})\.?\s+)?(\d{2}[A-Z]{2}\d[A-Z][0-9A-Z]{4})\b\s*(.*)$/;
const SECTION = /^\s*([234])-([12])\s*(?:SEC-)?\s*([A-D])\b/;
const HEADER = /Sreyas Institute|Autonomous Institution|Approved by AICTE|Accredited by NAAC|^DEPARTMENT OF|^SNo\.?\b|Roll No\.?|STUDENT NAME|ROLL LIST/i;
const SNO = /^S?(\d{1,3})\.?$/;
const NAME_CHARS = /^[A-Za-z][A-Za-z .'\-]*$/;

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s.\-'])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const base36 = (c) => parseInt(c, 36);
// Position of a roll within its series. The college counts 6601..6699, then 66A0..66A9, 66B0..: the tens
// character runs 0-9 then A, B, C..., the units character is a decimal digit.
const seq = (roll) => base36(roll[8]) * 10 + base36(roll[9]);
const series = (roll) => roll.slice(0, 6); // e.g. 25VE1A, 25VE5A

function loadText() {
  if (TEXT) return fs.readFileSync(TEXT, 'utf8');
  if (!PDF) { console.error('Give --pdf <file> or --text <file>.'); process.exit(2); }
  return execFileSync('pdftotext', ['-raw', PDF, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function parse(text) {
  const rows = [];
  const notes = [];
  let section = null; // { year, sem, sec }
  let cur = null;
  let lastSno = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\f/g, '').trim();
    if (!line) return;
    const sm = SECTION.exec(line);
    if (sm && !ROLL.test(line)) { section = { year: Number(sm[1]), sem: Number(sm[2]), sec: sm[3] }; cur = null; return; }
    if (HEADER.test(line)) return;
    const rm = ROLL.exec(line);
    if (rm) {
      if (!section) { notes.push(`line ${i + 1}: roll ${rm[2]} before any section heading`); return; }
      cur = { ...section, roll: rm[2], name: rm[3].trim(), sno: rm[1] != null ? Number(rm[1]) : lastSno, line: i + 1, flags: [] };
      rows.push(cur);
      lastSno = null;
      return;
    }
    const sn = SNO.exec(line);
    if (sn) { lastSno = Number(sn[1]); return; }
    // Anything else directly after a roll line is the rest of a wrapped name.
    if (cur && NAME_CHARS.test(line)) { cur.name = `${cur.name} ${line}`.trim(); return; }
    notes.push(`line ${i + 1}: ignored text "${line.slice(0, 60)}"`);
  });
  return { rows, notes };
}

function check(rows) {
  const seen = new Map();
  const info = [];
  // Exact repeats (the first rows of a section printed twice) are dropped; a roll in two places with different names is a conflict.
  const unique = [];
  for (const r of rows) {
    const prev = seen.get(r.roll);
    if (prev) {
      if (prev.name === r.name && prev.sec === r.sec && prev.year === r.year) { info.push(`repeat dropped: ${r.roll} ${r.name} (line ${r.line}, same as line ${prev.line})`); continue; }
      r.flags.push(`roll ${r.roll} also appears as "${prev.name}" (${prev.year}-1 ${prev.sec}, line ${prev.line})`);
      prev.flags.push(`roll ${r.roll} also appears as "${r.name}" (${r.year}-1 ${r.sec}, line ${r.line})`);
    } else seen.set(r.roll, r);
    unique.push(r);
  }

  const bySection = new Map();
  for (const r of unique) { const k = `${r.year}-${r.sem}${r.sec}`; (bySection.get(k) || bySection.set(k, []).get(k)).push(r); }

  for (const [k, list] of bySection) {
    list.forEach((r, idx) => {
      if (!r.name) r.flags.push('no name found');
      if (r.name && !/[A-Za-z]{2}/.test(r.name)) r.flags.push('name looks wrong');
      if (r.sno != null && r.sno !== idx + 1) r.flags.push(`serial ${r.sno} but position ${idx + 1} in section`);
      const p = list.slice(0, idx).reverse().find((x) => series(x.roll) === series(r.roll));
      if (p) {
        if (seq(r.roll) < seq(p.roll)) r.flags.push(`roll ${r.roll} is lower than the one before it (${p.roll})`);
        else if (seq(r.roll) - seq(p.roll) > 1) info.push(`${k}: roll gap between ${p.roll} and ${r.roll} (${seq(r.roll) - seq(p.roll) - 1} missing)`);
        if (r.name && p.name && r.name.split(' ')[0].toUpperCase().slice(0, 3) < p.name.split(' ')[0].toUpperCase().slice(0, 3)) {
          r.flags.push(`name "${r.name}" sorts before the previous one "${p.name}" (check the pairing)`);
        }
      }
    });
  }
  return { unique, bySection, info };
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function main() {
  const { rows, notes } = parse(loadText());
  const { unique, bySection, info } = check(rows);

  const emails = new Map();
  unique.forEach((r) => {
    r.email = `${r.roll.toLowerCase()}@${DOMAIN}`;
    if (emails.has(r.email)) r.flags.push(`email ${r.email} duplicated`);
    emails.set(r.email, r);
    r.admission = 2000 + Number(r.roll.slice(0, 2));
    r.entry = r.roll.slice(4, 6) === '5A' ? 'lateral' : 'regular';
    // A year-N student in the autumn term of 2026 joined in 2026-N+1; a lateral-entry student joins a year later.
    const expected = new Date().getFullYear() - r.year + 1 + (r.entry === 'lateral' ? 1 : 0);
    if (r.admission !== expected) r.flags.push(`admission ${r.admission} in a year-${r.year} list (expected ${expected}); kept, but confirm`);
  });

  const header = ['sno', 'Year', 'Section', 'Name', 'Rollno', 'email', 'admission_year', 'entry', 'review'];
  const sorted = [...unique].sort((a, b) => a.year - b.year || a.sec.localeCompare(b.sec) || series(a.roll).localeCompare(series(b.roll)) || seq(a.roll) - seq(b.roll));
  const lines = [header.join(',')];
  sorted.forEach((r, i) => lines.push([i + 1, r.year, r.sec, titleCase(r.name), r.roll, r.email, r.admission, r.entry, r.flags.join(' | ')].map(csvCell).join(',')));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `﻿${lines.join('\r\n')}\r\n`, 'utf8');

  console.log(`Students: ${unique.length} in ${bySection.size} sections`);
  for (const [k, list] of [...bySection].sort()) {
    const maxSno = Math.max(0, ...list.map((r) => r.sno || 0));
    console.log(`  ${k.padEnd(5)} ${String(list.length).padStart(3)} students   last serial printed: ${maxSno}   needing review: ${list.filter((r) => r.flags.length).length}`);
  }
  const flagged = sorted.filter((r) => r.flags.length);
  console.log(`\nRows needing review: ${flagged.length}`);
  flagged.forEach((r) => console.log(`  ${r.year}-${r.sem}${r.sec} ${r.roll} "${r.name}": ${r.flags.join(' | ')}`));
  if (info.length) { console.log(`\nInformation (${info.length}):`); info.slice(0, 60).forEach((x) => console.log(`  ${x}`)); if (info.length > 60) console.log(`  … ${info.length - 60} more`); }
  if (notes.length) { console.log(`\nText the parser ignored (${notes.length}):`); notes.slice(0, 30).forEach((x) => console.log(`  ${x}`)); }
  console.log(`\nDraft written: ${OUT}`);
}

main();
