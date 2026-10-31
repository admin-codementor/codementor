// The daily self-check: look for things that should add up, put right the safe ones, and report the rest. Every repair is logged with how many.
//
// What it may repair by itself (decided by the owner): a student's mentor that is out of step with the class structure, and placement
// applications that point at a drive which no longer exists. Everything else is only reported.
const judgeJobRepo = require('../repositories/judgeJobRepository');
const maintenanceRepo = require('../repositories/maintenanceRepository');
const placementRepo = require('../repositories/placementRepository');
const academic = require('./academicService');
const { breaker } = require('./judgeBreaker');
const { findOrphanApplications, rollUp } = require('../utils/maintenanceRules');

const DAY = 86400000;

/** Runs one check and turns anything it throws into an "error" result, so one broken check never hides the others. */
async function guarded(key, label, fn) {
  try { return { key, label, ...(await fn()) }; } catch (e) {
    console.error(`self-check "${key}" failed:`, String(e?.message || e).slice(0, 120));
    return { key, label, status: 'error', found: 0, repaired: 0, detail: 'This check could not run. See the server log.' };
  }
}

const CHECKS = [
  ['judge_jobs', 'Code judging', async () => {
    const dead = await judgeJobRepo.listDeadLetters(Date.now() - DAY);
    return dead.length
      ? { status: 'warn', found: dead.length, repaired: 0, detail: `${dead.length} submission${dead.length === 1 ? '' : 's'} could not be checked in the last day and were given up on. A student may need to submit again.` }
      : { status: 'ok', found: 0, repaired: 0, detail: 'No judging was given up on in the last day.' };
  }],
  ['judge_breaker', 'Code judge connection', async () => {
    const b = breaker.snapshot();
    return b.state === 'closed'
      ? { status: 'ok', found: 0, repaired: 0, detail: 'The judge is answering.' }
      : { status: 'warn', found: 1, repaired: 0, detail: 'The judge has been failing, so new work is being held back for a few seconds at a time. See Judge Health.' };
  }],
  ['mentors', 'Mentors match the class structure', async () => {
    const r = await academic.syncActiveTerm();
    return r.mentorsUpdated || r.positions
      ? { status: 'repaired', found: r.mentorsUpdated + r.positions, repaired: r.mentorsUpdated + r.positions, detail: `Put right ${r.mentorsUpdated} mentor${r.mentorsUpdated === 1 ? '' : 's'} and ${r.positions} class position${r.positions === 1 ? '' : 's'} across ${r.classes} classes.` }
      : { status: 'ok', found: 0, repaired: 0, detail: `Checked ${r.classes} classes. Everything matches.` };
  }],
  ['placement_orphans', 'Placement applications have a drive', async () => {
    const [apps, drives] = await Promise.all([placementRepo.listAllApplications(), placementRepo.listDrives()]);
    const orphans = findOrphanApplications(apps, drives);
    for (const o of orphans) await placementRepo.removeApplication(o.driveId, o.studentId);
    return orphans.length
      ? { status: 'repaired', found: orphans.length, repaired: orphans.length, detail: `Removed ${orphans.length} application${orphans.length === 1 ? '' : 's'} whose drive no longer exists.` }
      : { status: 'ok', found: 0, repaired: 0, detail: 'Every application belongs to a drive.' };
  }],
];

/** Runs every check, saves the result and returns it. */
async function runAll({ now = Date.now() } = {}) {
  const results = [];
  for (const [key, label, fn] of CHECKS) results.push(await guarded(key, label, fn));
  const out = { at_ms: now, status: rollUp(results), results };
  try { await maintenanceRepo.saveSelfCheck(out); } catch (e) { console.error('could not save the self-check result:', String(e?.message || e).slice(0, 100)); }
  const repaired = results.reduce((n, r) => n + (r.repaired || 0), 0);
  if (repaired) console.log(`[self-check] repaired ${repaired}: ${results.filter((r) => r.repaired).map((r) => `${r.key}=${r.repaired}`).join(', ')}`);
  return out;
}

const last = () => maintenanceRepo.getSelfCheck();

module.exports = { runAll, last, CHECKS };
