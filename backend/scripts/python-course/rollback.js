#!/usr/bin/env node
// Removes everything the Python-course import created: the course, its modules, every imported problem and
// its test cases. Dry run by default.
//
//   node scripts/python-course/rollback.js              shows what would be removed
//   node scripts/python-course/rollback.js --confirm    removes it
//
// Refuses to run if any student has already submitted to one of these problems (that would orphan their
// history and progress); add --force only if you are certain.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
const { db } = require('../../src/config/firestore');
const courseRepo = require('../../src/repositories/courseRepository');
const problemRepo = require('../../src/repositories/problemRepository');
const { bumpVersion } = require('../../src/utils/cache');
const { COURSE, COURSE_KEY } = require('./lib');

const confirm = process.argv.includes('--confirm');
const force = process.argv.includes('--force');

(async () => {
  const snap = await db.collection('problems').where('importKey', '==', COURSE_KEY).get();
  const ids = snap.docs.map((d) => d.id);
  const course = await courseRepo.getById(COURSE.id);
  console.log(`Found ${ids.length} imported problems${course ? ' and the course' : ', no course document'}.`);

  let withSubmissions = 0;
  for (let i = 0; i < ids.length; i += 30) {
    const s = await db.collection('submissions').where('problemId', 'in', ids.slice(i, i + 30)).limit(1).get();
    if (!s.empty) withSubmissions++;
  }
  if (withSubmissions && !force) {
    console.log('Stopped: students have already submitted to these problems. Nothing was removed (use --force only if you are certain).');
    process.exit(1);
  }
  if (!confirm) { console.log('Dry run: nothing removed. Add --confirm to remove.'); process.exit(0); }

  for (const id of ids) await problemRepo.remove(id);
  if (course) {
    const mods = await courseRepo.getModules(COURSE.id);
    for (const m of mods) await courseRepo.deleteModule(COURSE.id, m.id);
    await db.collection('courses').doc(COURSE.id).delete();
  }
  await bumpVersion('courses');
  console.log(`Removed ${ids.length} problems${course ? ' and the course with its modules' : ''}.`);
  process.exit(0);
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
