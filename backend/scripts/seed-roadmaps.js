// Copies the roadmaps that ship in src/data/roadmaps.json into the Firestore
// `roadmaps` collection. Optional: with an empty collection the API already
// serves the bundled file. Run this when you want the content to become
// editable in the database — after that, the collection wins and edits to the
// JSON file no longer show up.
//
//   node scripts/seed-roadmaps.js
//
// Safe to re-run: each roadmap is written by its own id.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const roadmapRepo = require('../src/repositories/roadmapRepository');

async function main() {
  const bundled = roadmapRepo.listBundled();
  for (const roadmap of bundled) {
    await roadmapRepo.upsert(roadmap);
    console.log(`  ${roadmap.id} — ${roadmap.milestones.length} milestones`);
  }
  console.log(`Wrote ${bundled.length} roadmaps to Firestore.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
