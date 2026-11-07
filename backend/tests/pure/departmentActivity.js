// Department activity (utils/departmentActivity.js): who was seen, and the "seen in the last 5 minutes" count.
const { buildActivity } = require('../../src/utils/departmentActivity');

const NOW = Date.parse('2026-11-01T12:00:00Z');
const MIN = 60000;

module.exports = function (s) {
  const people = [{ id: 'a', name: 'A', lastLoginAt: NOW - 2 * MIN }, { id: 'b', name: 'B', lastLoginAt: NOW - 20 * MIN }, { id: 'c', name: 'C' }];
  const r = buildActivity({ people, submissions: [{ userId: 'b', submittedAt: NOW - 1 * MIN }], days: 7, now: NOW });
  s.check('seen in the last 5 minutes counts a login or a submission, not older ones, not people never seen', r.totals.seen_last_5_min === 2);
  s.check('the other totals are unchanged: two active, one not', r.totals.people === 3 && r.totals.active === 2 && r.totals.at_risk === 1);
  s.check('exactly 5 minutes ago still counts; 5 minutes and a second does not', buildActivity({ people: [{ id: 'x', lastLoginAt: NOW - 5 * MIN }, { id: 'y', lastLoginAt: NOW - 5 * MIN - 1000 }], days: 7, now: NOW }).totals.seen_last_5_min === 1);
  s.check('nobody gives zero, not an error', buildActivity({ people: [], days: 7, now: NOW }).totals.seen_last_5_min === 0);
};
