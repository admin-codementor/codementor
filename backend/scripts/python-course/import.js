#!/usr/bin/env node
// Imports the Python course (18 CSV modules) as a course with its problems and tests.
//
//   node scripts/python-course/import.js --dir <folder with m1.csv .. m18.csv>
//        Dry run: parses and validates everything, prints a report, writes NOTHING, needs no database.
//        --check            also run every reference solution against every test on this machine's Python
//        --verify           also run them on the real Judge0 (Python 3.12). --limit N = first N problems only
//
//   node scripts/python-course/import.js --dir <folder> --confirm --owner-email <faculty/HOD/admin email>
//        Writes the course (as a draft), its 18 modules, every problem (draft) and every test case. Re-runnable:
//        the same question id always lands on the same document. Run scripts/check-firestore.js first.
//
//   node scripts/python-course/import.js --publish      make the course and its problems visible to students
//   node scripts/python-course/import.js --unpublish    hide them again
//
// The CSV folder must stay OUTSIDE the repository (it is public; the files hold every solution and hidden test).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const { loadCourse, summarise, COURSE, COURSE_KEY, moduleDescription } = require('./lib');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const line = (s = '') => console.log(s);

function report(course) {
  const s = summarise(course);
  line(`Modules ${s.modules}, problems ${s.problems}, test cases ${s.tests} (${s.visibleTests} visible, ${s.hiddenTests} hidden)`);
  line(`Difficulty ${JSON.stringify(s.byDifficulty)}   Style ${JSON.stringify(s.byMode)}`);
  line();
  for (const m of course.modules) {
    const c = m.problems.reduce((o, p) => { o[p.data.difficulty] = (o[p.data.difficulty] || 0) + 1; return o; }, {});
    line(`  ${String(m.number).padStart(2)}  ${m.title}  —  ${m.problems.length} problems (${c.easy || 0}e/${c.medium || 0}m/${c.hard || 0}h)`);
  }
  const all = course.modules.flatMap((m) => m.problems);
  const odd = all.filter((p) => !/^(PY-)?M\d\d-\d\d$/.test(p.sourceId));
  line();
  line(`Ids: ${all.length - odd.length} already written as M01-01 or PY-M08-01; ${odd.length} written differently (e.g. ${odd.slice(0, 3).map((p) => p.sourceId).join(', ') || 'none'}). All become py-mNN-NN keys.`);
}

function printIssues(issues) {
  const show = (title, list, max) => {
    line(`${title}: ${list.length}`);
    list.slice(0, max).forEach((i) => line(`   ${i.id}${i.line ? ` (line ${i.line})` : ''}: ${i.msg}`));
    if (list.length > max) line(`   ... and ${list.length - max} more`);
  };
  show('Errors (block the import)', issues.errors, 60);
  show('Notes (handled automatically)', issues.warnings, 40);
}

async function setPublished(published) {
  const { db } = require('../../src/config/firestore');
  const courseRepo = require('../../src/repositories/courseRepository');
  const { bumpVersion } = require('../../src/utils/cache');
  const snap = await db.collection('problems').where('importKey', '==', COURSE_KEY).get();
  if (snap.empty) throw new Error('No imported Python-course problems found. Run the import with --confirm first.');
  const course = await courseRepo.getById(COURSE.id);
  if (!course) throw new Error('The Python course document does not exist. Run the import with --confirm first.');
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    batch.set(d.ref, { status: published ? 'published' : 'draft' }, { merge: true });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  await courseRepo.update(COURSE.id, { isPublished: published });
  await bumpVersion('courses');
  line(`${published ? 'Published' : 'Unpublished'}: the course and ${snap.size} problems.`);
}

async function writeAll(course, ownerEmail) {
  const userRepo = require('../../src/repositories/userRepository');
  const problemRepo = require('../../src/repositories/problemRepository');
  const courseRepo = require('../../src/repositories/courseRepository');
  const { bumpVersion } = require('../../src/utils/cache');

  const owner = await userRepo.getByEmail(ownerEmail);
  if (!owner || !['faculty', 'hod', 'admin'].includes(owner.role)) throw new Error(`${ownerEmail} is not a faculty, HOD or admin account.`);
  line(`Owner: ${owner.name || ownerEmail} (${owner.role})`);

  const existingCourse = await courseRepo.getById(COURSE.id);
  let done = 0;
  const total = summarise(course).problems;
  for (const m of course.modules) {
    for (const p of m.problems) {
      const existing = await problemRepo.getById(p.id);
      // A re-run refreshes the content but never changes whether students can see it.
      await problemRepo.upsert(p.id, { ...p.data, createdBy: existing?.createdBy || owner.id, status: existing?.status || 'draft' }, p.testCases);
      if (++done % 25 === 0 || done === total) line(`  problems written: ${done}/${total}`);
    }
  }
  await courseRepo.upsert(COURSE.id, {
    title: COURSE.title, description: COURSE.description, sortOrder: existingCourse?.sortOrder ?? 0,
    isPublished: existingCourse?.isPublished ?? false, createdBy: existingCourse?.createdBy || owner.id, importKey: COURSE_KEY,
  });
  for (const m of course.modules) {
    await courseRepo.upsertModule(COURSE.id, m.id, {
      title: m.title, description: moduleDescription(m), problemIds: m.problems.map((p) => p.id), sortOrder: m.number - 1,
    });
  }
  await bumpVersion('courses');
  line(`Done: course "${COURSE.title}" with ${course.modules.length} modules and ${total} problems (${existingCourse?.isPublished ? 'published' : 'draft'}).`);
}

(async () => {
  if (flag('publish') || flag('unpublish')) { await setPublished(flag('publish')); process.exit(0); }

  const dir = value('dir');
  if (!dir) { console.error('Give the folder with the CSV files: --dir <folder>   (see the top of this file)'); process.exit(2); }

  const course = loadCourse(dir);
  report(course);
  line();
  printIssues(course.issues);
  if (course.issues.errors.length) { line('\nStopped: fix the errors above first. Nothing was written.'); process.exit(1); }

  let problems = course.modules.flatMap((m) => m.problems);
  const limit = Number(value('limit')) || 0;
  if (limit) problems = problems.slice(0, limit);

  if (flag('check')) {
    const { localCheck } = require('./localCheck');
    line(`\nRunning every reference solution against every test locally (${problems.length} problems) ...`);
    const r = await localCheck(problems, { onProgress: (d, t) => line(`  ${d}/${t}`) });
    line(`Local Python ${r.python.version}: ${r.passed}/${r.total} tests match.`);
    r.failures.slice(0, 30).forEach((f) => line(`   FAIL ${f.id} test ${f.test}${f.hidden ? ' (hidden)' : ''}: ${f.why}  expected=${JSON.stringify(f.expected)} got=${JSON.stringify(f.got)}`));
    if (r.failures.length) process.exit(1);
  }

  if (flag('verify')) {
    const { verifyOnJudge } = require('./verify');
    line(`\nRunning every reference solution on the real Judge0 at ${process.env.JUDGE0_URL || 'http://localhost:2358'} (Python 3.12) ...`);
    const r = await verifyOnJudge(problems, { onProgress: (d, t) => { if (d % 200 === 0 || d === t) line(`  ${d}/${t}`); } });
    line(`Judge0: ${r.passed}/${r.total} tests Accepted. Slowest test: ${r.slowest.time}s (${r.slowest.id}).`);
    r.failures.slice(0, 30).forEach((f) => line(`   FAIL ${f.id} test ${f.test}${f.hidden ? ' (hidden)' : ''}: ${f.why}  expected=${JSON.stringify(f.expected)} got=${JSON.stringify(f.got)}`));
    if (r.failures.length) process.exit(1);
  }

  if (flag('confirm')) {
    const owner = value('owner-email');
    if (!owner) { console.error('--confirm needs --owner-email <the faculty/HOD/admin account that will own the course>'); process.exit(2); }
    line('\nWriting to Firestore ...');
    await writeAll(course, owner);
  } else {
    line('\nDry run: nothing was written. Add --confirm --owner-email <email> to import.');
  }
  process.exit(0);
})().catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
