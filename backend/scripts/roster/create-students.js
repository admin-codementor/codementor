// Step 3: create the real student accounts from the final credentials CSV
// (the one make-passwords.js wrote). For each row: a Firebase sign-in with the CSV password
// and a student profile that forces a password change at first login.
//
//   node scripts/roster/create-students.js --csv <file>                  dry run (default): writes nothing
//   node scripts/roster/create-students.js --csv <file> --limit 3 --confirm   create just the first 3 (a trial)
//   node scripts/roster/create-students.js --csv <file> --confirm        create everyone
//
// Safe to re-run: a student whose profile already exists is skipped; a sign-in that exists
// without a profile (an interrupted earlier run) gets its password set to the CSV value and a
// profile created. Passwords are never printed or logged. Department is fixed to CSE(AIML)
// so it matches the HOD and faculty accounts exactly.
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { PRIVATE_DIR, DEPARTMENT, parseCsv, fromRoll, rowProblems, stamp } = require('../lib/roster-utils');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const CSV = opt('csv');
const CONFIRM = args.includes('--confirm');
const LIMIT = opt('limit') ? Number(opt('limit')) : null;
const CONCURRENCY = 4;

async function main() {
  if (!CSV) { console.error('Give --csv <credentials file>.'); process.exit(2); }
  if (LIMIT !== null && !(Number.isInteger(LIMIT) && LIMIT > 0)) { console.error('--limit must be a positive whole number.'); process.exit(2); }
  const all = parseCsv(fs.readFileSync(CSV, 'utf8'));
  if (all.length === 0) { console.error('The CSV has no rows.'); process.exit(1); }

  const problems = all.map((r, i) => ({ i, r, p: rowProblems(r) })).filter((x) => x.p.length);
  if (problems.length) {
    console.error(`${problems.length} row(s) are not usable, for example row ${problems[0].i + 2}: ${problems[0].p.join(', ')}. Nothing was created.`);
    process.exit(1);
  }
  if (new Set(all.map((r) => r.Rollno)).size !== all.length || new Set(all.map((r) => r.email)).size !== all.length) {
    console.error('The CSV has duplicate roll numbers or emails. Nothing was created.');
    process.exit(1);
  }
  const rows = LIMIT ? all.slice(0, LIMIT) : all;

  const { firebaseAuth } = require('../../src/config/firebaseAdmin');
  const userRepo = require('../../src/repositories/userRepository');

  console.log(`CSV: ${path.basename(CSV)} · ${all.length} students${LIMIT ? ` (first ${rows.length} only)` : ''} · department ${DEPARTMENT}`);
  console.log(CONFIRM ? 'Mode: CREATE' : 'Mode: dry run (nothing is written)');

  // Sign-ins do not use the Firestore quota but profiles do, so a full quota would leave sign-ins with no
  // profile. Prove Firestore can be read AND written before anything is created.
  if (CONFIRM) {
    const { db } = require('../../src/config/firestore');
    try {
      await db.collection('students').limit(1).get();
      const ping = db.collection('_preflight').doc('roster-import');
      await ping.set({ at: new Date() });
      await ping.delete();
    } catch (e) {
      console.error(`Firestore is not available right now (${e.message.split(':').slice(0, 2).join(':')}). Nothing was created.`);
      if (/RESOURCE_EXHAUSTED/.test(e.message)) console.error('The free daily quota is used up. It resets at midnight Pacific time (about 1:00 pm IST). Try again after that.');
      process.exit(1);
    }
  }

  const stats = { created: 0, resumed: 0, skipped: 0, failed: 0, wouldCreate: 0, signInExists: 0 };
  let stopped = false; // set when the quota runs out mid-run: stop instead of failing every remaining row
  const log = [];
  const note = (kind, r, extra = '') => log.push(`${new Date().toISOString()} ${kind} ${r.Rollno} ${r.Name}${extra ? ` (${extra})` : ''}`);

  async function one(r) {
    try {
      const existing = await firebaseAuth.getUserByEmail(r.email).catch((e) => (e.code === 'auth/user-not-found' ? null : Promise.reject(e)));
      if (!CONFIRM) {
        if (existing) { stats.signInExists += 1; note('dry-run: sign-in already exists', r); } else { stats.wouldCreate += 1; }
        return;
      }
      if (existing) {
        const profile = await userRepo.getByFirebaseUid(existing.uid);
        if (profile) { stats.skipped += 1; note('skipped (profile exists)', r); return; }
        await firebaseAuth.updateUser(existing.uid, { password: r.Password, displayName: r.Name });
        await writeProfile(r, existing.uid);
        stats.resumed += 1; note('resumed (sign-in existed, profile added)', r);
        return;
      }
      const created = await firebaseAuth.createUser({ email: r.email, password: r.Password, displayName: r.Name });
      try {
        await writeProfile(r, created.uid);
      } catch (e) {
        // Do not leave a sign-in with no profile behind.
        await firebaseAuth.deleteUser(created.uid).catch(() => {});
        throw e;
      }
      stats.created += 1; note('created', r);
    } catch (e) {
      if (/RESOURCE_EXHAUSTED/.test(e.message)) { stopped = true; note('STOPPED (quota)', r); return; }
      stats.failed += 1; note('FAILED', r, e.message);
      console.error(`  failed: ${r.Rollno} ${r.Name}: ${e.message}`);
    }
  }

  async function writeProfile(r, uid) {
    await userRepo.create(uuidv4(), {
      name: r.Name, email: r.email, role: 'student',
      department: DEPARTMENT, section: r.Section, year: Number(r.Year), rollNo: r.Rollno,
      ...fromRoll(r.Rollno),
      firebaseUid: uid, rating: 1200, totpSecret: null, totpEnabled: false,
      mustChangePassword: true, lastLoginAt: null, source: 'roster-2026',
    });
  }

  // A few at a time: gentle on the Firebase Auth rate limits and easy to stop with Ctrl+C and resume.
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < rows.length && !stopped) {
      const r = rows[next++];
      await one(r);
      done += 1;
      if (done % 50 === 0) console.log(`  ${done}/${rows.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const logFile = path.join(PRIVATE_DIR, `import-${CONFIRM ? 'run' : 'dry'}-${stamp()}.log`);
  fs.writeFileSync(logFile, `${log.join('\n')}\n`, 'utf8');

  if (!CONFIRM) {
    console.log(`\nWould create: ${stats.wouldCreate}. Sign-in already exists: ${stats.signInExists}.`);
    console.log('Dry run only. Add --confirm to create (add --limit 3 first for a small trial).');
  } else {
    console.log(`\nCreated: ${stats.created}. Resumed: ${stats.resumed}. Skipped (already done): ${stats.skipped}. Failed: ${stats.failed}.`);
  }
  console.log(`Log (no passwords): ${path.relative(process.cwd(), logFile)}`);
  if (stopped || stats.failed) { if (stats.failed) console.error('Some students failed. Run the same command again: it only does what is missing.'); process.exit(1); }
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message); process.exit(1); });
