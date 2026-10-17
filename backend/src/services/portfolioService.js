// Department portfolio completeness for the HOD. Scope comes from the token;
// filters (section / year / mentor) only ever narrow it.
const { cached, getVersion } = require('../utils/cache');
const userRepo = require('../repositories/userRepository');
const portfolioRepo = require('../repositories/portfolioRepository');
const { scopeDept } = require('../middleware/role.middleware');
const { buildPortfolioOverview } = require('../utils/portfolio');
const { activeStudents } = require('../utils/students');

const TTL_SECONDS = 60;
const VERSION = 2;

async function compute({ dept, section, year, mentor }) {
  const [studentsMap, staffMap, items] = await Promise.all([
    userRepo.getMapByRole('student'), userRepo.getMapByRole('faculty'), portfolioRepo.listAll(),
  ]);
  const students = activeStudents([...studentsMap.values()])
    .filter((s) => dept === null || (s.department || null) === dept)
    .filter((s) => !section || (s.section || null) === section)
    .filter((s) => !year || String(s.year ?? '') === String(year))
    .filter((s) => !mentor || (mentor === 'none' ? !s.mentorId : s.mentorId === mentor))
    .map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo, section: s.section, year: s.year, mentorId: s.mentorId || null }));
  const mentorNames = new Map([...staffMap.values()].map((u) => [u.id, u.name]));
  return { ...buildPortfolioOverview({ students, items, mentorNames }), scope: { department: dept } };
}

exports.getOverview = async (req, { section, year, mentor }) => {
  const dept = scopeDept(req);
  const mv = await getVersion('mentors');
  const key = `portfolio:overview:v${VERSION}:m${mv}:${dept ?? 'all'}:${section || 'all'}:${year || 'all'}:${mentor || 'all'}`;
  return cached(key, TTL_SECONDS, () => compute({ dept, section, year, mentor }));
};
