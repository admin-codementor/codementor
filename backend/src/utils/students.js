// Which students count as part of a department's current cohort.
//
// A graduated student (an alumnus) keeps their account and their history, but
// leaves the active views: funnel, rankings, mentor load, portfolio gaps and the
// placement pool should describe the people still studying. Graduation is set by
// the HOD and is reversible. Alumni have their own view.
const isActive = (student) => student?.graduated !== true;
const activeStudents = (students) => students.filter(isActive);

module.exports = { isActive, activeStudents };
