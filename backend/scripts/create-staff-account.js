// Create a loginable HOD or faculty account: a Firebase sign-in plus the profile in `faculty`.
// Replaces create-hod-account.js (which wrote to a path that is a file on this machine).
//
//   node scripts/create-staff-account.js --role hod                      dry run (default)
//   node scripts/create-staff-account.js --role hod --confirm
//   node scripts/create-staff-account.js --role faculty --email a@b.c --name "A B" --confirm
//   node scripts/create-staff-account.js --role tnp --email placement@college.edu --name "T&P Officer" --confirm   (no department; must set up 2FA at first sign-in)
//
// Defaults: department CSE(AIML); email hod.test@codementor.test / faculty.test@codementor.test (a fake domain,
// so it can never reach a real mailbox); marked isTestAccount. Make it a real person later with
// scripts/change-account-email.js. The password goes to docs/private-credentials/ and is never printed.
// An existing sign-in is reused and its password left alone; an existing profile with a different role aborts.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PRIVATE_DIR, DEPARTMENT: DEFAULT_DEPT, makePassword, stamp } = require('./lib/roster-utils');

const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const ROLE = opt('role');
const CONFIRM = args.includes('--confirm');

async function main() {
  if (!['hod', 'faculty', 'tnp'].includes(ROLE)) { console.error('Give --role hod, --role faculty or --role tnp.'); process.exit(2); }
  // The Training & Placement office belongs to the whole college, so it has no department.
  const DEPARTMENT = ROLE === 'tnp' ? null : opt('department', DEFAULT_DEPT);
  const EMAIL = opt('email', `${ROLE}.test@codementor.test`).trim().toLowerCase();
  const NAME = opt('name', ROLE === 'hod' ? `HOD (test) ${DEPARTMENT}` : ROLE === 'tnp' ? 'Training & Placement (test)' : `Faculty (test) ${DEPARTMENT}`);
  console.log(`${ROLE} account: ${EMAIL} · ${ROLE === 'tnp' ? 'whole college' : `department ${DEPARTMENT}`} · ${CONFIRM ? 'WILL WRITE' : 'dry run (add --confirm to create)'}`);

  const { firebaseAuth } = require('../src/config/firebaseAdmin');
  const userRepo = require('../src/repositories/userRepository');

  const existingAuth = await firebaseAuth.getUserByEmail(EMAIL).catch(() => null);
  console.log(`  sign-in: ${existingAuth ? 'exists (password left untouched)' : 'will be created'}`);
  if (!CONFIRM) { console.log('Dry run only: nothing was written.'); return; }

  const existingProfile = await userRepo.getByEmail(EMAIL);
  if (existingProfile && existingProfile.role !== ROLE) {
    console.error(`A profile for ${EMAIL} already exists with role "${existingProfile.role}". Refusing to touch it.`);
    process.exit(1);
  }

  let uid; let password = null; let createdHere = false;
  if (existingAuth) uid = existingAuth.uid;
  else {
    password = `${makePassword(12)}!`;
    uid = (await firebaseAuth.createUser({ email: EMAIL, password, displayName: NAME, emailVerified: false })).uid;
    createdHere = true;
  }

  try {
    await userRepo.update(uid, ROLE, {
      name: NAME, email: EMAIL, role: ROLE, department: DEPARTMENT, permissions: {},
      firebaseUid: uid, totpSecret: null, totpEnabled: false, rating: 1200, isTestAccount: true,
      createdAt: existingProfile?.createdAt ?? new Date(), lastLoginAt: existingProfile?.lastLoginAt ?? null,
    });
  } catch (e) {
    // Do not leave a sign-in with no profile behind (for example when the Firestore quota is used up).
    if (createdHere) await firebaseAuth.deleteUser(uid).catch(() => {});
    throw e;
  }
  console.log(`Wrote faculty/${uid} (role ${ROLE}, ${ROLE === 'tnp' ? 'no department' : `department ${DEPARTMENT}`}).`);

  if (password) {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    const file = path.join(PRIVATE_DIR, `${ROLE}-test-account-${stamp()}.txt`);
    fs.writeFileSync(file, `${ROLE} test account (${ROLE === 'tnp' ? 'whole college' : `department ${DEPARTMENT}`})\nemail:    ${EMAIL}\npassword: ${password}\nuid:      ${uid}\n\nMake it real later: node scripts/change-account-email.js --from ${EMAIL} --to <real email> --name "<Name>" --real --confirm\n`, { mode: 0o600 });
    console.log(`Credentials saved to ${path.relative(process.cwd(), file)} (gitignored). Not printed.`);
  } else console.log('No new password was generated because the sign-in already existed.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message); process.exit(1); });
