// A student's batch: the years they study in, as one label such as "2023-2027". Pure: the clock is passed in.
//
// The batch is stored as the ADMISSION YEAR (`admissionYear`, for example 2023). When none is stored it is worked out from the year of
// study and today's date: the academic year starts in June, so in November 2026 a 4th-year student started in 2023 and a 2nd-year in 2025.
// A stored admission year always wins, because a student who repeated a year no longer fits the working-out.

const PROGRAMME_YEARS = 4;
const ACADEMIC_YEAR_STARTS_MONTH = 5; // June (0 is January)

/** The calendar year the current academic year began in. */
function academicYearStart(nowMs) {
  const d = new Date(nowMs);
  return d.getUTCMonth() >= ACADEMIC_YEAR_STARTS_MONTH ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

const validAdmission = (v) => Number.isInteger(v) && v >= 2000 && v <= 2100;

/** The admission year from the year of study and the date, or null when the year of study is not known. */
function deriveAdmissionYear(yearOfStudy, nowMs) {
  const y = Number(yearOfStudy);
  if (!Number.isInteger(y) || y < 1 || y > 6) return null;
  return academicYearStart(nowMs) - (y - 1);
}

const label = (admission, span = PROGRAMME_YEARS) => `${admission}-${admission + span}`;

/** @returns {{admissionYear: number|null, label: string|null, derived: boolean}} */
function batchOf(student, nowMs) {
  const stored = Number(student?.admissionYear);
  if (validAdmission(stored)) return { admissionYear: stored, label: label(stored), derived: false };
  const d = deriveAdmissionYear(student?.year, nowMs);
  return d == null ? { admissionYear: null, label: null, derived: false } : { admissionYear: d, label: label(d), derived: true };
}

/** What an Admin may type: a whole year from 2000 to 2100. @returns {{error: string} | {value: number}} */
function validateAdmissionYear(input) {
  const n = typeof input === 'string' ? Number(input.trim()) : Number(input);
  if (input === '' || input == null || !validAdmission(n)) return { error: 'Enter the year the student joined, such as 2023.' };
  return { value: n };
}

/** The batches present among some students, newest batch first, each with how many students. */
function batchesOf(students, nowMs) {
  const counts = new Map();
  for (const s of students) { const b = batchOf(s, nowMs).label; if (b) counts.set(b, (counts.get(b) || 0) + 1); }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.name.localeCompare(a.name));
}

/** Students with no stored admission year but a known year of study: what "fill the missing batches" would change. */
function missingBatch(students) {
  return students.filter((s) => !validAdmission(Number(s?.admissionYear)));
}

module.exports = { PROGRAMME_YEARS, academicYearStart, deriveAdmissionYear, batchOf, validateAdmissionYear, batchesOf, missingBatch, validAdmission };
