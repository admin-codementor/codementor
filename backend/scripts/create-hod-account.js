// Create a loginable HOD (department head) account: Firebase Auth user plus the
// Firestore profile doc in `faculty` (role "hod", doc id = Firebase UID), the same
// shape create-admin-account.js writes.
//
//   node scripts/create-hod-account.js --department CSE            # dry run, writes nothing
//   node scripts/create-hod-account.js --department CSE --confirm  # really creates it
//
// Optional: --email, --name. Idempotent: an existing Firebase user is reused and
// its password is never changed; an existing profile with a different role aborts.
//
// The generated password is written to docs/credentials/ (gitignored) and is
// deliberately NOT printed, so it cannot end up in a terminal log or a chat.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const DEPARTMENT = opt('department', null);
const EMAIL = opt('email', DEPARTMENT ? `hod.${DEPARTMENT.toLowerCase()}.test@sreyas.ac.in` : null);
const NAME = opt('name', DEPARTMENT ? `HOD (test) ${DEPARTMENT}` : null);
const CONFIRM = flag('confirm');
const CRED_FILE = path.join(__dirname, '../../docs/credentials', `hod-${(DEPARTMENT || 'x').toLowerCase()}-test-account.txt`);

async function main() {
  if (!DEPARTMENT) {
    console.error('A --department is required (e.g. --department CSE).');
    process.exit(2);
  }
  console.log(`HOD account: ${EMAIL} · department ${DEPARTMENT} · ${CONFIRM ? 'WILL WRITE' : 'dry run (add --confirm to create)'}`);

  const { firebaseAuth } = require('../src/config/firebaseAdmin');
  const userRepo = require('../src/repositories/userRepository');

  const existingProfile = await userRepo.getByEmail(EMAIL);
  if (existingProfile && existingProfile.role !== 'hod') {
    console.error(`A profile for ${EMAIL} already exists with role "${existingProfile.role}". Refusing to touch it.`);
    process.exit(1);
  }
  const existingAuth = await firebaseAuth.getUserByEmail(EMAIL).catch(() => null);
  console.log(`  Firebase user: ${existingAuth ? 'exists (password left untouched)' : 'will be created'}`);
  console.log(`  Firestore profile: ${existingProfile ? 'exists (will be updated)' : 'will be created'}`);

  if (!CONFIRM) {
    console.log('Dry run only — nothing was written.');
    return;
  }

  let uid;
  let password = null;
  if (existingAuth) {
    uid = existingAuth.uid;
  } else {
    // 18 random bytes → 24 url-safe chars, plus a suffix so every complexity rule is met.
    password = `${crypto.randomBytes(18).toString('base64url')}Aa1!`;
    const created = await firebaseAuth.createUser({
      email: EMAIL, password, displayName: NAME, emailVerified: true,
    });
    uid = created.uid;
  }

  await userRepo.update(uid, 'hod', {
    name: NAME,
    email: EMAIL,
    role: 'hod',
    department: DEPARTMENT,
    permissions: {},
    firebaseUid: uid,
    totpSecret: null,
    totpEnabled: false,
    rating: 1200,
    isTestAccount: true,
    createdAt: existingProfile?.createdAt ?? new Date(),
    lastLoginAt: existingProfile?.lastLoginAt ?? null,
  });
  console.log(`Wrote faculty/${uid} (role hod, department ${DEPARTMENT}).`);

  if (password) {
    fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true });
    fs.writeFileSync(
      CRED_FILE,
      `HOD test account (department ${DEPARTMENT})\nemail:    ${EMAIL}\npassword: ${password}\nuid:      ${uid}\n\nTest account created by backend/scripts/create-hod-account.js. Delete the Firebase user and the faculty/${uid} doc when done.\n`,
      { mode: 0o600 },
    );
    console.log(`Credentials saved to ${path.relative(process.cwd(), CRED_FILE)} (gitignored). Not printed.`);
  } else {
    console.log('No new password was generated because the Firebase user already existed.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('Failed:', e.message); process.exit(1); });
