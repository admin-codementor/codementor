// Change the email an account signs in with (for example: a test HOD becomes the real HOD).
// The account, its history and its id stay the same; only the email changes, at Firebase and on the profile.
//
//   node scripts/change-account-email.js --from hod.test@codementor.test --to real.name@sreyas.ac.in           dry run
//   node scripts/change-account-email.js --from ... --to ... [--name "Real Name"] [--real] --confirm
//
// --real  clears the "test account" marker. --name sets the display name too.
// The new address needs a real mailbox for "forgot password" emails to arrive. The password is unchanged.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const FROM = (opt('from') || '').trim().toLowerCase();
const TO = (opt('to') || '').trim().toLowerCase();
const NAME = opt('name');
const REAL = args.includes('--real');
const CONFIRM = args.includes('--confirm');

async function main() {
  if (!FROM || !TO) { console.error('Give --from <current email> and --to <new email>.'); process.exit(2); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(TO)) { console.error(`"${TO}" does not look like an email address.`); process.exit(2); }
  if (FROM === TO) { console.error('The two emails are the same.'); process.exit(2); }

  const { firebaseAuth } = require('../src/config/firebaseAdmin');
  const userRepo = require('../src/repositories/userRepository');

  const profile = await userRepo.getByEmail(FROM);
  if (!profile) { console.error(`No profile has the email ${FROM}.`); process.exit(1); }
  if (!profile.firebaseUid) { console.error('That profile has no sign-in linked to it, so there is nothing to change at Firebase.'); process.exit(1); }
  if (await userRepo.getByEmail(TO)) { console.error(`${TO} already belongs to another profile.`); process.exit(1); }
  if (await firebaseAuth.getUserByEmail(TO).catch(() => null)) { console.error(`${TO} already has a sign-in.`); process.exit(1); }

  console.log(`${profile.role} "${profile.name}" (${profile.department ?? 'no department'}): ${FROM} -> ${TO}${NAME ? ` · name "${NAME}"` : ''}${REAL ? ' · no longer a test account' : ''}`);
  if (!CONFIRM) { console.log('Dry run only: nothing was changed. Add --confirm to apply.'); return; }

  await firebaseAuth.updateUser(profile.firebaseUid, { email: TO, emailVerified: false, ...(NAME ? { displayName: NAME } : {}) });
  try {
    await userRepo.update(profile.id, profile.role, { email: TO, ...(NAME ? { name: NAME } : {}), ...(REAL ? { isTestAccount: false } : {}) });
  } catch (e) {
    // Keep the two in step: put the sign-in back if the profile could not be saved.
    await firebaseAuth.updateUser(profile.firebaseUid, { email: FROM }).catch(() => {});
    throw e;
  }
  console.log('Done. Sign in with the new email and the same password.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message); process.exit(1); });
