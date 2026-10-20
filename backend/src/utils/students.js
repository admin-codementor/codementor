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

// The value a student is grouped under on a cohort dimension (department, year or section). Always a string, so a
// year stored as a number matches the "2" the browser sends back, and a section is grouped WITH its year ("Year 2 · A").
const cohortValue = (student, dim) => {
  if (dim === 'section') return student?.section ? classLabel(student.year, student.section) : 'Unassigned';
  const v = student?.[dim];
  return v == null || v === '' ? 'Unassigned' : String(v);
};

module.exports = { isActive, activeStudents, classLabel, classOrder, cohortValue };
