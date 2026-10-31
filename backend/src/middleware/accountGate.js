// Locks a disabled account out of the API quickly, without a database read on every request.
//
// The ids of disabled accounts are held in memory (a few at most) and reloaded every 30 seconds by ONE small query per collection, however many
// people are signed in. `protect` asks `isDisabled(id)`, which is a set lookup. When an Admin disables someone on this process the set is
// updated at once; on other processes it catches up within 30 seconds. If a reload fails the old set stays, so a database blip never
// unlocks anyone and never locks everyone out.
const userRepo = require('../repositories/userRepository');

const REFRESH_MS = 30_000;
let disabled = new Set();
let timer = null;

async function refresh() {
  try {
    disabled = new Set(await userRepo.listDisabledIds());
  } catch (e) {
    console.error('[accountGate] could not reload disabled accounts, keeping the last list:', String(e?.message || e).slice(0, 120));
  }
}

/** Load now and keep reloading. Called by the server, not by the app, so tests and scripts never start a timer. */
function start() {
  if (timer) return;
  void refresh();
  timer = setInterval(refresh, REFRESH_MS);
  timer.unref?.();
}
function stop() { if (timer) clearInterval(timer); timer = null; }

const isDisabled = (id) => disabled.has(String(id));
/** Called by the Admin service the moment an account is disabled or enabled on this process. */
function mark(id, off) { const next = new Set(disabled); if (off) next.add(String(id)); else next.delete(String(id)); disabled = next; }
/** For tests. */
function reset(ids = []) { disabled = new Set(ids.map(String)); }

module.exports = { start, stop, refresh, isDisabled, mark, reset, REFRESH_MS };
