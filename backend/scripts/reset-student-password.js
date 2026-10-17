// Give a student a new temporary password and make them choose their own again at next sign-in.
// For "I forgot my password and cannot get the email".
//
//   node scripts/reset-student-password.js --roll 25VE1A6601            dry run (default)
//   node scripts/reset-student-password.js --roll 25VE1A6601 --confirm
//
// The password goes to docs/private-credentials/ and is never printed.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PRIVATE_DIR, makePassword, stamp } = require('./lib/roster-utils');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const ROLL = (opt('roll') || '').trim().toUpperCase();
const CONFIRM = args.includes('--confirm');

async function main() {
  if (!ROLL) { console.error('Give --roll <roll number>.'); process.exit(2); }
  const { firebaseAuth } = require('../src/config/firebaseAdmin');
  const { db } = require('../src/config/firestore');
  const userRepo = require('../src/repositories/userRepository');

  const snap = await db.collection('students').where('rollNo', '==', ROLL).get();
  if (snap.empty) { console.error(`No student has the roll number ${ROLL}.`); process.exit(1); }
  if (snap.size > 1) { console.error(`${snap.size} students share the roll number ${ROLL}. Refusing to guess.`); process.exit(1); }
  const s = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if (!s.firebaseUid) { console.error('That student has no sign-in linked.'); process.exit(1); }
  console.log(`${s.name} (${s.rollNo}, ${s.department} ${s.year}-${s.section}) · ${s.email} · ${CONFIRM ? 'WILL RESET' : 'dry run (add --confirm)'}`);
  if (!CONFIRM) return;

  const password = makePassword();
  await firebaseAuth.updateUser(s.firebaseUid, { password });
  await userRepo.update(s.id, 'student', { mustChangePassword: true });
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const file = path.join(PRIVATE_DIR, `reset-${ROLL}-${stamp()}.txt`);
  fs.writeFileSync(file, `${s.name} (${ROLL})\nemail:    ${s.email}\npassword: ${password}\n`, { mode: 0o600 });
  console.log(`New temporary password saved to ${path.relative(process.cwd(), file)} (gitignored). Not printed. They must choose their own at next sign-in.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message); process.exit(1); });
