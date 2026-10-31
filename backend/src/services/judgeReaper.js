// Finishes judging work that nobody is waiting for any more, and gives up cleanly on work that cannot finish.
//
// Judging is a series of small steps, each taken when the student's browser asks "how is it going?" (judgeService.pollJudging). If the
// student closes the tab, or their connection drops, nothing asks, and the submission would never be recorded. The reaper asks on their
// behalf: a job that has not moved for 90 seconds is pushed one step; a job that is still open after 15 minutes is marked failed with a
// plain message, and kept in the dead-letter list for the Admin. Nothing is dropped without a trace.
const judgeJobRepo = require('../repositories/judgeJobRepository');
const judgeService = require('./judgeService');
const { planReap } = require('../utils/maintenanceRules');

const GAVE_UP = 'Checking your code took too long and was stopped. Your code is safe in the editor. Please submit it again, and tell your faculty if it keeps happening.';

/** One round. @returns {{advanced: number, gaveUp: number, left: number, errors: number}} */
async function reapOnce({ now = Date.now() } = {}) {
  const jobs = await judgeJobRepo.listOpen();
  const plan = planReap(jobs, now);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  let errors = 0;

  for (const g of plan.giveUp) {
    try {
      const j = byId.get(g.id);
      await judgeJobRepo.update(g.id, { phase: 'done', result: { success: false, state: 'failed', error: GAVE_UP } });
      await judgeJobRepo.addDeadLetter(g.id, { reason: 'open too long', ageMs: g.ageMs, attempts: j?.attempts || 0, phase: j?.phase || null, userId: j?.job?.user_id || null, problemId: j?.job?.problem_id || null, examId: j?.job?.exam_id || null });
    } catch (e) { errors += 1; console.error('reaper could not give up on a job:', String(e?.message || e).slice(0, 100)); }
  }
  for (const id of plan.advance) {
    try { await judgeService.pollJudging(id); } catch (e) { errors += 1; console.error('reaper could not advance a job:', String(e?.message || e).slice(0, 100)); }
  }
  return { advanced: plan.advance.length, gaveUp: plan.giveUp.length, left: plan.left, errors };
}

module.exports = { reapOnce, GAVE_UP };
