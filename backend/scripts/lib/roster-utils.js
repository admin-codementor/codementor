// Shared by the roster and account scripts: password generation, a small CSV reader,
// roll-number rules and where private files go. No database access here.
const path = require('path');
const crypto = require('crypto');

// Everything sensitive (roster CSVs, passwords, logs) goes here. docs/private-credentials/ is gitignored.
const PRIVATE_DIR = path.join(__dirname, '../../../docs/private-credentials');
const DOMAIN = 'sreyas.ac.in';
const DEPARTMENT = 'CSE(AIML)'; // must match HOD and faculty accounts character for character

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const ALL = UPPER + LOWER + DIGIT;
const pick = (set) => set[crypto.randomInt(set.length)];

/** 10 characters, no look-alikes (0/O, 1/l/I), at least one upper, lower and digit. */
function makePassword(length = 10) {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

/** Minimal CSV reader: quoted cells, doubled quotes, CRLF, BOM. Returns an array of objects keyed by the header row. */
function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const ROLL = /^\d{2}[A-Z]{2}\d[A-Z][0-9A-Z]{4}$/;
/** Facts that follow from the roll number: joined in 20NN; VE5A is lateral entry, VE1A a regular admission. */
const fromRoll = (roll) => ({ admissionYear: 2000 + Number(roll.slice(0, 2)), entryType: roll.slice(4, 6) === '5A' ? 'lateral' : 'regular' });

/** Problems with one credentials row; an empty list means it is usable. */
function rowProblems(r) {
  const out = [];
  if (!ROLL.test(r.Rollno || '')) out.push('roll number is not valid');
  else if (r.email !== `${r.Rollno.toLowerCase()}@${DOMAIN}`) out.push('email is not the roll number at the college domain');
  if (!String(r.Name || '').trim()) out.push('no name');
  if (!['2', '3', '4'].includes(String(r.Year))) out.push('year must be 2, 3 or 4');
  if (!/^[A-D]$/.test(r.Section || '')) out.push('section must be A to D');
  if (!r.Password || r.Password.length < 8) out.push('no usable password');
  return out;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

module.exports = { PRIVATE_DIR, DOMAIN, DEPARTMENT, makePassword, parseCsv, fromRoll, rowProblems, stamp };
