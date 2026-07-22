// One-off: copy the last Postgres-owned user fields (rating, totp_secret,
// totp_enabled) into Firestore before Phase G cuts those reads over. Purely
// additive/idempotent — safe to re-run.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pg = require('../src/config/db');
const userRepo = require('../src/repositories/userRepository');

async function main() {
  const { rows } = await pg.query('SELECT id, role, rating, totp_secret, totp_enabled FROM users');
  for (const u of rows) {
    await userRepo.update(u.id, u.role, {
      rating: u.rating ?? 1200,
      totpSecret: u.totp_secret ?? null,
      totpEnabled: u.totp_enabled === true,
    });
  }
  console.log(`Backfilled rating/totp fields for ${rows.length} users`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
