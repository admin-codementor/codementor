// Which students count as part of a department's current cohort.
//
// A graduated student (an alumnus) keeps their account and their history, but
// leaves the active views: funnel, rankings, mentor load, portfolio gaps and the
// placement pool should describe the people still studying. Graduation is set by
// the HOD and is reversible. Alumni have their own view.
const isActive = (student) => student?.graduated !== true;
const activeStudents = (students) => students.filter(isActive);

// A class is a section WITHIN a year. "Section A" exists in every year, so grouping by section alone merges
// different classes (2nd-year A and 4th-year A) into one row. Label by year and section; a student with no
// year falls back to the plain section name.
const classLabel = (year, section) => {
  if (!section) return 'No section';
  return year ? `Year ${year} · ${section}` : `Section ${section}`;
};
// Sort key: by year, then section ("No section" last).
const classOrder = (year, section) => `${section ? '0' : '1'}|${String(year ?? 99).padStart(2, '0')}|${section || ''}`;

module.exports = { isActive, activeStudents, classLabel, classOrder };
