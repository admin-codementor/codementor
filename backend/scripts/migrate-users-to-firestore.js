// One-time / idempotent migration: create Firestore `students` / `faculty`
// documents for the app's basic-user-info fields, sourced from Postgres +
// Firebase Auth. Safe to re-run (uses set-with-merge, keyed by the existing
// Postgres `users.id`).
//
// Usage: node scripts/migrate-users-to-firestore.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { v4: uuidv4 } = require('uuid');

const db = require('../src/config/db');
const { firebaseAuth } = require('../src/config/firebaseAdmin');
const userRepo = require('../src/repositories/userRepository');

// Remove the empty placeholder docs (`{}`) that pre-existed in these
// collections before this migration — they carry no data.
async function cleanupPlaceholders() {
  const { db: fsdb } = require('../src/config/firestore');
  for (const col of ['students', 'faculty']) {
    const snap = await fsdb.collection(col).get();
    for (const doc of snap.docs) {
      if (Object.keys(doc.data()).length === 0) {
        console.log(`Removing empty placeholder doc ${col}/${doc.id}`);
        await doc.ref.delete();
      }
    }
  }
}

async function migrateExistingUser(email) {
  const { rows } = await db.query(
    `SELECT id, name, email, role, department, section, year, roll_no,
            permissions, firebase_uid, created_at, last_login_at
       FROM users WHERE email = $1`,
    [email]
  );
  if (!rows.length) return null;
  const u = rows[0];

  const data = {
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department || null,
    section: u.section || null,
    year: u.year || null,
    rollNo: u.roll_no || null,
    firebaseUid: u.firebase_uid,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at || null,
    ...(u.role === 'faculty' || u.role === 'hod' || u.role === 'admin'
      ? { permissions: u.permissions || {} }
      : {}),
  };

  await userRepo.update(u.id, u.role, data);
  console.log(`Migrated existing ${u.role} ${email} -> ${userRepo.collectionFor(u.role)}/${u.id}`);
  return u.id;
}

// Creates a brand-new faculty account end-to-end: Firebase Auth user +
// Postgres FK-stub row + Firestore profile doc.
async function createFacultyAccount(email, name) {
  const existingAuth = await firebaseAuth.getUserByEmail(email).catch(() => null);

  let uid;
  let generatedPassword = null;
  if (existingAuth) {
    uid = existingAuth.uid;
    console.log(`Firebase Auth user already exists for ${email} (${uid})`);
  } else {
    generatedPassword = 'Fac-' + Math.random().toString(36).slice(2, 10) + '!9';
    const created = await firebaseAuth.createUser({ email, password: generatedPassword, displayName: name });
    uid = created.uid;
    console.log(`Created Firebase Auth user for ${email} (${uid})`);
  }

  // Already migrated?
  const { rows: pgRows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  let id;
  if (pgRows.length) {
    id = pgRows[0].id;
    await db.query('UPDATE users SET firebase_uid = $1 WHERE id = $2', [uid, id]);
  } else {
    id = uuidv4();
    await db.query(
      `INSERT INTO users (id, name, email, role, firebase_uid) VALUES ($1,$2,$3,$4,$5)`,
      [id, name, email, 'faculty', uid]
    );
    console.log(`Inserted Postgres FK-stub row for ${email} (${id})`);
  }

  await userRepo.update(id, 'faculty', {
    name,
    email,
    role: 'faculty',
    department: null,
    permissions: {},
    firebaseUid: uid,
    createdAt: new Date(),
    lastLoginAt: null,
  });
  console.log(`Wrote faculty/${id} Firestore doc for ${email}`);

  return { id, uid, generatedPassword };
}

async function main() {
  await cleanupPlaceholders();

  await migrateExistingUser('test@sreyas.ac.in');

  const facultyResult = await createFacultyAccount('test-faculty@sreyas.ac.in', 'Test Faculty');
  if (facultyResult.generatedPassword) {
    console.log('\n=== NEW FACULTY ACCOUNT CREDENTIALS (share once, then rotate) ===');
    console.log('email:   ', 'test-faculty@sreyas.ac.in');
    console.log('password:', facultyResult.generatedPassword);
    console.log('==================================================================\n');
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
