// Starts the background upkeep inside the API process: the judge reaper every minute, and once a day the self-check and the clean-up of old
// submit keys and finished judge jobs. Several API servers can run at once: each task takes a lease first (utils/maintenanceRules.js
// decideLease), so only one server does a task in any interval, and a task is never run more often than its interval.
//
// Switch it all off with MAINTENANCE=off (for a second process that should only serve requests).
const os = require('os');
const crypto = require('crypto');
const maintenanceRepo = require('../repositories/maintenanceRepository');
const judgeJobRepo = require('../repositories/judgeJobRepository');
const judgeReaper = require('./judgeReaper');
const selfCheck = require('./selfCheck');
const { MINUTE } = require('../utils/maintenanceRules');

const OWNER = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
const DAY = 24 * 60 * MINUTE;

const TASKS = [
  { name: 'judge-reaper', everyMs: MINUTE, ttlMs: 55_000, run: () => judgeReaper.reapOnce() },
  { name: 'self-check', everyMs: DAY, ttlMs: 10 * MINUTE, run: () => selfCheck.runAll() },
  { name: 'housekeeping', everyMs: DAY, ttlMs: 10 * MINUTE, run: () => judgeJobRepo.pruneOld(Date.now() - DAY, Date.now() - 7 * DAY) },
];

/** Runs a task if this server wins its lease. Never throws: a failing task is logged and tried again at its next interval. */
async function tryRun(task, now = Date.now()) {
  try {
    const v = await maintenanceRepo.takeLease(task.name, OWNER, now, { everyMs: task.everyMs, ttlMs: task.ttlMs });
    if (!v.take) return { ran: false, reason: v.reason };
    try { return { ran: true, result: await task.run() }; } finally { await maintenanceRepo.releaseLease(task.name, OWNER).catch(() => {}); }
  } catch (e) {
    console.error(`maintenance task "${task.name}" failed:`, String(e?.message || e).slice(0, 120));
    return { ran: false, reason: 'error' };
  }
}

let timer = null;
function start() {
  if (timer || process.env.MAINTENANCE === 'off') return;
  const tick = () => { for (const t of TASKS) void tryRun(t); };
  setTimeout(tick, 15_000).unref?.(); // not in the first seconds of a start, while the server is warming up
  timer = setInterval(tick, MINUTE);
  timer.unref?.();
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, tryRun, TASKS, OWNER };
