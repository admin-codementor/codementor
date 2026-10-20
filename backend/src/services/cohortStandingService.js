// A student's standing among their own year and department: the same percentile and badge names the department analytics use
// (utils/departmentAnalytics.badgeFor), measured on distinct problems solved. Built once for every cohort and cached, so a
// public profile view costs a cache hit, not a read of every submission.
const { cached } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const submissionRepo = require('../repositories/submissionRepository');
const { standingFrom, MIN_COHORT } = require('../utils/cohortStanding');
const { activeStudents } = require('../utils/students');

const TTL = 600;
const VERSION = 1;
const keyOf = (s) => `${s.department ?? ''}|${s.year ?? ''}`;

async function table() {
  return cached(`cohort-solved:v${VERSION}`, TTL, async () => {
    const [students, submissions] = await Promise.all([userRepo.getMapByRole('student'), submissionRepo.listAllForAnalytics()]);
    const solved = new Map();
    for (const s of submissions) {
      if (s.verdict !== 'Accepted' || !s.userId) continue;
      const set = solved.get(s.userId) || new Set();
      set.add(s.problemId);
      solved.set(s.userId, set);
    }
    const cohorts = {};
    for (const st of activeStudents([...students.values()])) {
      (cohorts[keyOf(st)] ||= []).push(solved.get(st.id)?.size ?? 0);
    }
    return cohorts;
  });
}

/** @returns {Promise<{percentile:number, badge:string, cohortSize:number, solved:number}|null>} */
exports.standingFor = async (student, solvedCount) => {
  if (!student || student.graduated === true) return null;
  const cohort = (await table())[keyOf(student)];
  const s = cohort ? standingFrom(solvedCount, cohort) : null;
  return s ? { ...s, solved: solvedCount } : null;
};

exports.standingFrom = standingFrom;
exports.MIN_COHORT = MIN_COHORT;
