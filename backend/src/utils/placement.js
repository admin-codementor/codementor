// Placement drives and applications, HOD-managed. Pure: validation, eligibility and
// the analytics roll-up take plain objects, so every rule is checkable against fixtures.
//
// A drive belongs to one department (the HOD's); its eligible pool is that
// department's students, optionally limited to some years. An application is one
// student's progress through one drive: a status plus a pass/fail per round.
// The module is deliberately not tied to any role name, so a future
// Training & Placement role can reuse it unchanged.

const APP_STATUSES = ['applied', 'shortlisted', 'selected', 'rejected'];
const ROUND_RESULTS = ['passed', 'failed'];
const DRIVE_STATUSES = ['open', 'closed'];
const MAX_ROUNDS = 8;
const MAX_UPDATES = 500;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function realDate(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  // Round trip: V8 rolls 2026-02-31 over to March, so a parse alone accepts impossible dates.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/** @returns {{error: string} | {drive: {company, role, date, ctc, eligibleYears, rounds, status}}} */
function validateDrive(input) {
  if (!input || typeof input !== 'object') return { error: 'Nothing to save.' };

  const company = clean(input.company);
  if (company.length < 2 || company.length > 80) return { error: 'A company name of 2 to 80 characters is required.' };

  const role = clean(input.role);
  if (role.length > 80) return { error: 'Role can be at most 80 characters.' };

  let date = null;
  if (input.date != null && clean(input.date) !== '') {
    date = clean(input.date);
    if (!realDate(date)) return { error: 'Date must be a real date like 2026-11-20.' };
  }

  const ctc = clean(input.ctc);
  if (ctc.length > 40) return { error: 'Package can be at most 40 characters.' };

  let eligibleYears = [];
  if (input.eligible_years != null) {
    if (!Array.isArray(input.eligible_years)) return { error: 'Eligible years must be a list.' };
    eligibleYears = [...new Set(input.eligible_years.map(Number))];
    if (eligibleYears.some((y) => !Number.isInteger(y) || y < 1 || y > 6)) return { error: 'Eligible years must be whole numbers from 1 to 6.' };
    eligibleYears.sort((a, b) => a - b);
  }

  let rounds = [];
  if (input.rounds != null) {
    if (!Array.isArray(input.rounds)) return { error: 'Rounds must be a list.' };
    rounds = input.rounds.map(clean).filter(Boolean);
    if (rounds.length > MAX_ROUNDS) return { error: `A drive can have at most ${MAX_ROUNDS} rounds.` };
    if (rounds.some((r) => r.length > 40)) return { error: 'A round name can be at most 40 characters.' };
    if (new Set(rounds.map((r) => r.toLowerCase())).size !== rounds.length) return { error: 'Round names must be different from each other.' };
  }

  const status = input.status == null ? 'open' : String(input.status);
  if (!DRIVE_STATUSES.includes(status)) return { error: `Status must be one of: ${DRIVE_STATUSES.join(', ')}.` };

  return { drive: { company, role, date, ctc, eligibleYears, rounds, status } };
}

/** Whether a student is in a drive's pool: one of its departments, and an allowed year when years are listed. (CGPA, backlogs, the deadline and
 *  the dream-tier rule are checked by placementPolicy.evaluate; this is only who the drive is for.) */
function isEligible(student, drive) {
  const departments = Array.isArray(drive.departments) && drive.departments.length ? drive.departments : drive.department ? [drive.department] : [];
  if (!departments.includes(student.department || null)) return false;
  const years = drive.eligibleYears || [];
  return years.length === 0 || years.includes(Number(student.year));
}

/**
 * One student's update against one drive.
 * @param {{status: string|null, round_results?: object}} update   a null status clears the application
 * @returns {{error: string} | {clear: true} | {value: {status, roundResults}}}
 */
function validateApplicationUpdate(update, drive) {
  if (!update || typeof update !== 'object') return { error: 'Invalid update.' };
  if (update.status == null || update.status === '') return { clear: true };
  const status = String(update.status);
  if (!APP_STATUSES.includes(status)) return { error: `Status must be one of: ${APP_STATUSES.join(', ')}.` };

  const given = update.round_results && typeof update.round_results === 'object' ? update.round_results : {};
  const roundResults = {};
  for (const [round, result] of Object.entries(given)) {
    if (!(drive.rounds || []).includes(round)) return { error: `"${round}" is not a round of this drive.` };
    if (!ROUND_RESULTS.includes(result)) return { error: `A round result must be one of: ${ROUND_RESULTS.join(', ')}.` };
    roundResults[round] = result;
  }
  if (status === 'selected' && Object.values(roundResults).includes('failed')) {
    return { error: 'A student with a failed round cannot be marked selected.' };
  }
  return { value: { status, roundResults } };
}

module.exports = {
  APP_STATUSES, ROUND_RESULTS, DRIVE_STATUSES, MAX_ROUNDS, MAX_UPDATES,
  validateDrive, isEligible, validateApplicationUpdate,
};
