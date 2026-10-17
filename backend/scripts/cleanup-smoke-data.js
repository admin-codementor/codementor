// Remove the throwaway records the smoke-test suites create (ids starting "smoketest-", or a document
// marked isSmokeTest) that a crashed test run could not clean up. Real data is never matched.
//
//   node scripts/cleanup-smoke-data.js             dry run (default): lists counts per collection, writes nothing
//   node scripts/cleanup-smoke-data.js --confirm   deletes them
//
// A record counts as test data only if its document id starts with "smoketest-" OR it carries
// isSmokeTest: true. Message threads are matched through their participants' ids.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { db } = require('../src/config/firestore');

const CONFIRM = process.argv.includes('--confirm');
const PREFIX = 'smoketest-';

// Top-level collections the suites write to.
const COLLECTIONS = [
  'faculty', 'students', 'classrooms', 'assignments', 'submissions', 'studentGroups', 'placementDrives',
  'placementApplications', 'portfolioItems', 'exams', 'mcqTests', 'topicMastery', 'codingProfiles', 'proctorEvents',
];

const isSmoke = (id, data) => id.startsWith(PREFIX) || data?.isSmokeTest === true ||
  ['userId', 'studentId', 'facultyId'].some((f) => typeof data?.[f] === 'string' && data[f].startsWith(PREFIX));

async function main() {
  console.log(`Project: ${db.projectId ?? 'codementor'} · ${CONFIRM ? 'DELETE' : 'dry run (nothing is written)'}`);
  const refs = []; // { label, ref }
  const counts = {};
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    for (const d of snap.docs) {
      if (!isSmoke(d.id, d.data())) continue;
      refs.push(d.ref);
      counts[col] = (counts[col] || 0) + 1;
      // A smoke class's member list and an exam's sections/attempts live in subcollections.
      for (const sub of await d.ref.listCollections()) {
        const inner = await sub.get();
        inner.docs.forEach((x) => { refs.push(x.ref); counts[`${col}/*/${sub.id}`] = (counts[`${col}/*/${sub.id}`] || 0) + 1; });
      }
    }
  }
  const threads = await db.collection('messageThreads').get();
  for (const t of threads.docs) {
    if (!(t.data().participants || []).some((p) => String(p).startsWith(PREFIX))) continue;
    for (const m of (await t.ref.collection('messages').get()).docs) { refs.push(m.ref); counts['messageThreads/*/messages'] = (counts['messageThreads/*/messages'] || 0) + 1; }
    refs.push(t.ref); counts.messageThreads = (counts.messageThreads || 0) + 1;
  }
  const audit = await db.collection('auditLogs').get();
  for (const a of audit.docs) {
    if (String(a.data().userId || '').startsWith(PREFIX)) { refs.push(a.ref); counts.auditLogs = (counts.auditLogs || 0) + 1; }
  }

  if (refs.length === 0) { console.log('No leftover test records found.'); return; }
  Object.entries(counts).forEach(([k, n]) => console.log(`  ${k.padEnd(34)} ${n}`));
  console.log(`  total ${refs.length}`);
  if (!CONFIRM) { console.log('\nDry run only. Add --confirm to delete them.'); return; }

  const writer = db.bulkWriter();
  refs.forEach((r) => writer.delete(r));
  await writer.close();
  console.log(`\nDeleted ${refs.length} test records.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('Failed:', e.message); process.exit(1); });
