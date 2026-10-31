// Background upkeep rules (utils/maintenanceRules.js): the reaper's plan, the one-server-at-a-time lease, the self-check roll-up, orphans.
const M = require('../../src/utils/maintenanceRules');

const NOW = 10_000_000;
const job = (id, createdAgoS, touchedAgoS, extra = {}) => ({ id, phase: 'tests', createdAtMs: NOW - createdAgoS * 1000, touchedAtMs: NOW - touchedAgoS * 1000, ...extra });

module.exports = function (s) {
  // ── the reaper's plan ──
  const plan = M.planReap([
    job('fresh', 5, 5), job('polling', 200, 20), job('stuck', 300, 120), job('stuckOlder', 600, 400), job('ancient', 1000, 10),
    job('done', 5000, 5000, { phase: 'done' }), { id: 'noClock', phase: 'single' },
  ], NOW);
  s.check('a job open for more than 15 minutes is given up on, even if it was touched a moment ago', plan.giveUp.length === 1 && plan.giveUp[0].id === 'ancient' && plan.giveUp[0].ageMs === 1_000_000);
  s.check('a job nobody has touched for 90 seconds is pushed on, the one waiting longest first', plan.advance.join() === 'stuckOlder,stuck');
  s.check('a job that is being polled, a new one, a finished one and one with no clock are left alone', plan.left === 3 && !plan.advance.includes('polling') && !plan.advance.includes('fresh') && !plan.giveUp.some((g) => g.id === 'done' || g.id === 'noClock'));
  s.check('exactly 90 seconds counts as stale, 89 does not', M.planReap([job('a', 100, 90)], NOW).advance.length === 1 && M.planReap([job('a', 100, 89)], NOW).advance.length === 0);
  s.check('at most 20 are pushed on in one round, the rest wait for the next', (() => { const many = Array.from({ length: 35 }, (_, i) => job(`j${i}`, 300, 100 + i)); const r = M.planReap(many, NOW); return r.advance.length === 20 && r.left === 15 && r.advance[0] === 'j34'; })());
  s.check('Firestore timestamps are read when the plain numbers are missing', M.planReap([{ id: 'x', phase: 'single', createdAt: { toMillis: () => NOW - 2_000_000 } }], NOW).giveUp.length === 1);
  s.check('an empty or missing list gives an empty plan', M.planReap([], NOW).advance.length === 0 && M.planReap(undefined, NOW).left === 0);
  s.check('the limits can be changed', M.planReap([job('a', 100, 30)], NOW, { staleMs: 20_000 }).advance.length === 1 && M.planReap([job('a', 100, 30)], NOW, { maxAgeMs: 60_000 }).giveUp.length === 1);

  // ── the lease ──
  const rule = { everyMs: 60_000, ttlMs: 55_000 };
  s.check('with no lease stored the first server takes it and stamps when', (() => { const r = M.decideLease(null, 'A', NOW, rule); return r.take && r.next.owner === 'A' && r.next.lastRunMs === NOW && r.next.untilMs === NOW + 55_000; })());
  s.check('another server cannot take a lease that is still held', M.decideLease({ owner: 'A', untilMs: NOW + 10_000, lastRunMs: NOW - 50_000 }, 'B', NOW, rule).reason === 'held');
  s.check('a lease whose time is up can be taken by anyone', M.decideLease({ owner: 'A', untilMs: NOW - 1, lastRunMs: NOW - 120_000 }, 'B', NOW, rule).take === true);
  s.check('a task is not run again before its interval, even if nobody holds it', M.decideLease({ owner: 'A', untilMs: 0, lastRunMs: NOW - 30_000 }, 'B', NOW, rule).reason === 'too_soon');
  s.check('the interval is exact: 60 seconds after the last run is allowed', M.decideLease({ owner: 'A', untilMs: 0, lastRunMs: NOW - 60_000 }, 'B', NOW, rule).take === true);
  s.check('the holder itself is not blocked by its own lease (when the interval allows)', M.decideLease({ owner: 'A', untilMs: NOW + 5000, lastRunMs: NOW - 61_000 }, 'A', NOW, rule).take === true);

  // ── roll-up ──
  s.check('the worst result wins: error, then warn, then repaired, then ok', M.rollUp([{ status: 'ok' }, { status: 'repaired' }]) === 'repaired' && M.rollUp([{ status: 'repaired' }, { status: 'warn' }, { status: 'ok' }]) === 'warn' && M.rollUp([{ status: 'warn' }, { status: 'error' }]) === 'error' && M.rollUp([{ status: 'ok' }]) === 'ok');
  s.check('no results is ok, and an unknown word is ignored', M.rollUp([]) === 'ok' && M.rollUp(undefined) === 'ok' && M.rollUp([{ status: 'weird' }]) === 'ok');

  // ── orphans ──
  const apps = [{ driveId: 'd1', studentId: 's1' }, { driveId: 'gone', studentId: 's2' }, { driveId: 'gone', studentId: 's3' }, { driveId: 'd2', studentId: 's4' }, null, { studentId: 'x' }];
  const orphans = M.findOrphanApplications(apps, [{ id: 'd1' }, { id: 'd2' }]);
  s.check('applications whose drive no longer exists are found, and only those', orphans.length === 2 && orphans.every((o) => o.driveId === 'gone') && orphans.map((o) => o.studentId).join() === 's2,s3');
  s.check('with every drive present nothing is an orphan, and bad rows do not crash it', M.findOrphanApplications(apps.slice(0, 1), [{ id: 'd1' }]).length === 0 && M.findOrphanApplications(undefined, undefined).length === 0);
};
