// Career roadmaps — the ordered milestones a student works through for a role.
//
// Content lives in two places on purpose. `src/data/roadmaps.json` ships with
// the application and is the fallback, so a fresh deployment has all four
// roadmaps the moment it boots, with no seed step to forget. The `roadmaps`
// Firestore collection, when it has rows, wins — that is what `scripts/
// seed-roadmaps.js` writes, and what a future faculty authoring screen will
// edit. Nothing here resolves a student's progress; that is roadmapService's
// job, because progress depends on the problem catalog and cannot be cached
// alongside the content.
const { db } = require('../config/firestore');
const bundled = require('../data/roadmaps.json');

const col = () => db.collection('roadmaps');

const sorted = (rows) => [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

/** The roadmaps that ship in the repository, in file order. */
function listBundled() {
  return bundled.roadmaps.map((r, i) => ({ sortOrder: i, ...r }));
}

async function listAll() {
  let snap;
  try {
    snap = await col().get();
  } catch (err) {
    // A missing collection reads as empty rather than throwing, so this is a
    // real connection or permission failure. The bundled content is still
    // correct, and a roadmap no student can open is worse than a stale one.
    console.error('roadmapRepository.listAll falling back to bundled content:', err.message);
    return listBundled();
  }
  if (snap.empty) return listBundled();
  return sorted(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

async function getById(id) {
  const all = await listAll();
  return all.find((r) => r.id === id) || null;
}

/** Used by the seed script; not reachable from any route. */
async function upsert(roadmap) {
  const { id, ...rest } = roadmap;
  await col().doc(id).set(rest, { merge: false });
  return { id, ...rest };
}

module.exports = { listAll, getById, listBundled, upsert };
