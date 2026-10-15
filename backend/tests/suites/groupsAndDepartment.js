// Student groups (cross-branch batches) and the HOD department dashboard.
//
// Review feedback item 23 named both as shipped without regression coverage.
// Two kinds of check live here:
//   1. Pure checks against the flag/badge rules and the department aggregator
//      (no network, fixed clock) — including that the numbers the UI's "How flags
//      are calculated" dialog states (7 days, 30%, 5 submissions, the badge
//      ladder) are the numbers the backend really uses, so the dialog cannot
//      silently drift from the rules it explains.
//   2. API checks for role gating, scoping, validation and cleanup.
const { tokenFor, userId, get, post, patch, del, Suite, purge } = require('../harness');
const {
  flagFor, studentState, QUIET_DAYS, LOW_ACCURACY_PCT, MIN_SUBS_FOR_ACCURACY, DAY_MS,
} = require('../../src/utils/studentState');
const { buildDepartmentAnalytics, BADGES } = require('../../src/utils/departmentAnalytics');

const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);

function pureChecks(s) {
  // ── The rules the UI dialog states ─────────────────────────────────────────
  s.check('flag rule: quiet after 7 days', QUIET_DAYS === 7, `QUIET_DAYS=${QUIET_DAYS}`);
  s.check('flag rule: low accuracy below 30%', LOW_ACCURACY_PCT === 30, `LOW_ACCURACY_PCT=${LOW_ACCURACY_PCT}`);
  s.check('flag rule: accuracy needs 5+ submissions', MIN_SUBS_FOR_ACCURACY === 5, `MIN=${MIN_SUBS_FOR_ACCURACY}`);
  s.check(
    'badge ladder cut-offs are 97/90/80/60/40/20/0',
    BADGES.map((b) => b.minPercentile).join(',') === '97,90,80,60,40,20,0',
    BADGES.map((b) => `${b.name}:${b.minPercentile}`).join(' '),
  );
  s.check(
    'badge ladder is ordered highest first with Foundation last',
    BADGES[0].name === 'Trailblazer' && BADGES[BADGES.length - 1].name === 'Foundation',
  );

  // ── Boundaries, with a fixed clock ─────────────────────────────────────────
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);
  const active = (daysAgo, extra = {}) => ({
    subs: 10, solved: 4, acRate: 60, lastActiveMs: now - daysAgo * DAY_MS, ...extra,
  });

  s.check('state: never submitted → not_started', studentState({ subs: 0, solved: 0, lastActiveMs: 0 }, now) === 'not_started');
  s.check('state: submitted today, nothing solved → stuck', studentState(active(0, { solved: 0 }), now) === 'stuck');
  s.check('state: submitted today and solving → practising', studentState(active(0), now) === 'practising');
  s.check('state: exactly 7 days ago still counts as active', studentState(active(7), now) === 'practising');
  s.check('state: just over 7 days → gone_quiet', studentState(active(7, { lastActiveMs: now - 7 * DAY_MS - 1 }), now) === 'gone_quiet');
  s.check('state: quiet beats stuck (old submissions, nothing solved)', studentState(active(20, { solved: 0 }), now) === 'gone_quiet');

  const healthy = flagFor(active(1), now);
  s.check('flag: active and solving → green with no reasons', healthy.flag === 'green' && healthy.reasons.length === 0);
  s.check('flag: never started → red', flagFor({ subs: 0, solved: 0, acRate: 0, lastActiveMs: 0 }, now).flag === 'red');

  const quiet = flagFor(active(12), now);
  s.check('flag: one concern (quiet) → orange', quiet.flag === 'orange', JSON.stringify(quiet));
  s.check('flag: quiet reason names the number of days', quiet.reasons.some((r) => r.includes('12 days')), quiet.reasons.join(' | '));

  s.check('flag: stuck is always red', flagFor(active(0, { solved: 0 }), now).flag === 'red');
  s.check(
    'flag: two concerns (quiet + low accuracy) → red',
    flagFor(active(12, { acRate: 10 }), now).flag === 'red',
  );

  s.check('accuracy: 29% with 5 submissions is flagged', flagFor(active(1, { subs: 5, acRate: 29 }), now).reasons.length === 1);
  s.check('accuracy: exactly 30% is not flagged', flagFor(active(1, { subs: 5, acRate: 30 }), now).reasons.length === 0);
  s.check('accuracy: 10% with only 4 submissions is not flagged', flagFor(active(1, { subs: 4, acRate: 10 }), now).reasons.length === 0);

  // ── The aggregator: parts must sum to the whole ────────────────────────────
  const mk = (id, section, year) => ({ id, name: `S ${id}`, rollNo: id, department: 'CSE', section, year });
  const sub = (userId_, problemId, verdict, daysAgo) => ({
    userId: userId_, problemId, verdict, submittedAt: new Date(now - daysAgo * DAY_MS),
  });
  const students = [mk('a', 'A', 3), mk('b', 'A', 3), mk('c', 'B', 3), mk('d', 'B', 3), mk('e', 'B', 2), mk('f', 'B', 2)];
  const submissions = [
    // a: practising (solves 3 distinct problems, recent)
    sub('a', 'p1', 'Accepted', 1), sub('a', 'p2', 'Accepted', 1), sub('a', 'p3', 'Accepted', 2),
    // b: stuck (recent, never accepted)
    sub('b', 'p1', 'Wrong Answer', 1), sub('b', 'p1', 'Wrong Answer', 2),
    // c: gone quiet (solved something long ago)
    sub('c', 'p1', 'Accepted', 30),
    // d: practising, 1 solved
    sub('d', 'p2', 'Accepted', 3),
    // e, f: never submitted
  ];
  const r = buildDepartmentAnalytics({ students, submissions, now });

  s.check('aggregator: funnel counts sum to the cohort size', sum(r.funnel, 'count') === students.length, r.funnel.map((f) => `${f.key}=${f.count}`).join(' '));
  s.check('aggregator: flag counts sum to the cohort size', r.flags.red + r.flags.orange + r.flags.green === students.length, JSON.stringify(r.flags));
  s.check('aggregator: badge counts sum to the cohort size', sum(r.badges, 'count') === students.length, r.badges.map((b) => `${b.name}=${b.count}`).join(' '));
  s.check('aggregator: section student counts sum to the cohort size', sum(r.sections, 'students') === students.length);
  s.check('aggregator: funnel buckets are the expected people',
    r.funnel.find((f) => f.key === 'practising').count === 2
    && r.funnel.find((f) => f.key === 'stuck').count === 1
    && r.funnel.find((f) => f.key === 'gone_quiet').count === 1
    && r.funnel.find((f) => f.key === 'not_started').count === 2,
    r.funnel.map((f) => `${f.key}=${f.count}`).join(' '));
  s.check('aggregator: the top solver earns a higher badge than a non-starter',
    r.students.find((x) => x.id === 'a').percentile > r.students.find((x) => x.id === 'e').percentile);
  s.check('aggregator: an empty cohort does not throw and reports zero',
    (() => { try { return buildDepartmentAnalytics({ students: [], submissions: [], now }).funnel.every((f) => f.count === 0); } catch { return false; } })());
}

module.exports = async function groupsAndDepartmentSuite() {
  const s = new Suite('Student groups & department dashboard');
  const owners = new Set();

  s.onCleanup(async () => {
    await purge('studentGroups', 'createdBy', [...owners]);
  }, 'probe student groups');

  pureChecks(s);

  // ── Department dashboard: who may open it ──────────────────────────────────
  const DEPT = '/api/faculty/department';
  const hod = tokenFor('dept-hod', 'hod');
  const admin = tokenFor('dept-admin', 'admin');

  s.check('department: unauthenticated → 401', (await get(DEPT)).status === 401);
  s.check('department: student → 403', (await get(DEPT, tokenFor('dept-student', 'student'))).status === 403);
  s.check('department: faculty → 403 (HOD/admin only)', (await get(DEPT, tokenFor('dept-faculty', 'faculty'))).status === 403);

  const hodRes = await get(DEPT, hod);
  s.check('department: HOD → 200', hodRes.status === 200, `status ${hodRes.status}`);
  const d = hodRes.body?.data;
  if (d) {
    s.check('department: HOD sees only their own department', d.scope.department === 'CSE', String(d.scope.department));
    s.check('department: funnel sums to the student total', sum(d.funnel, 'count') === d.totals.students);
    s.check('department: flags sum to the student total', d.flags.red + d.flags.orange + d.flags.green === d.totals.students);
    s.check('department: badges sum to the student total', sum(d.badges, 'count') === d.totals.students);
    s.check('department: carries the 7-bucket badge ladder', d.badges.length === BADGES.length);
  }

  // The department comes from the token, never the query string.
  const spoof = await get(`${DEPT}?department=ECE`, hod);
  s.check('department: a ?department= override is ignored', spoof.status === 200 && spoof.body?.data?.scope?.department === 'CSE',
    String(spoof.body?.data?.scope?.department));

  const otherHod = await get(DEPT, tokenFor('dept-hod2', 'hod', { department: 'ECE' }));
  s.check('department: an ECE HOD is scoped to ECE', otherHod.body?.data?.scope?.department === 'ECE', String(otherHod.body?.data?.scope?.department));

  const adminRes = await get(DEPT, admin);
  s.check('department: admin → 200, unscoped', adminRes.status === 200 && adminRes.body?.data?.scope?.department === null,
    `status ${adminRes.status}`);

  const filtered = await get(`${DEPT}?section=__no_such_section__`, hod);
  s.check('department: an unmatched section filter yields an empty view, not an error',
    filtered.status === 200 && filtered.body?.data?.totals?.students === 0, `status ${filtered.status}`);

  // ── Groups: gating ─────────────────────────────────────────────────────────
  const G = '/api/faculty/groups';
  const owner = tokenFor('grp-owner', 'faculty');
  owners.add(userId('grp-owner'));
  owners.add(userId('grp-hod'));
  owners.add(userId('grp-admin'));

  s.check('groups: unauthenticated list → 401', (await get(G)).status === 401);
  s.check('groups: student list → 403', (await get(G, tokenFor('grp-student', 'student'))).status === 403);
  s.check('groups: student create → 403', (await post(G, tokenFor('grp-student', 'student'), { name: 'x' })).status === 403);

  const noPerm = tokenFor('grp-noperm', 'faculty', { permissions: { manage_students: false, manage_problems: true } });
  s.check('groups: faculty without manage_students cannot create', (await post(G, noPerm, { name: 'SMOKE denied' })).status === 403);
  s.check('groups: …but can still list (read-only)', (await get(G, noPerm)).status === 200);

  // ── Groups: validation ─────────────────────────────────────────────────────
  s.check('groups: a name is required', (await post(G, owner, { name: '   ' })).status === 400);
  s.check('groups: a 121-character name is rejected', (await post(G, owner, { name: 'x'.repeat(121) })).status === 400);
  const bogus = await post(G, owner, { name: 'SMOKE bogus members', student_ids: ['no-such-student'] });
  s.check('groups: students you cannot manage are rejected, not silently dropped', bogus.status === 400, `status ${bogus.status}`);
  const tooMany = await post(G, owner, { name: 'SMOKE too many', student_ids: Array.from({ length: 2001 }, (_, i) => `x${i}`) });
  s.check('groups: more than 2000 members is rejected', tooMany.status === 400, `status ${tooMany.status}`);

  // ── Groups: full lifecycle as the owner ────────────────────────────────────
  const created = await post(G, owner, { name: '  SMOKE batch  ', description: 'cross-branch probe' });
  s.check('groups: owner creates a group', created.status === 201, `status ${created.status}`);
  const gid = created.body?.data?.id;
  if (!gid) {
    s.skip('groups: lifecycle checks', 'group creation failed, so there is nothing to exercise');
    return s;
  }
  s.check('groups: name is trimmed', created.body.data.name === 'SMOKE batch', created.body.data.name);
  s.check('groups: a new group starts empty', created.body.data.student_count === 0);
  s.check('groups: the creator is recorded as owner', created.body.data.created_by === userId('grp-owner'));

  const list = await get(G, owner);
  const listed = (list.body?.data || []).find((g) => g.id === gid);
  s.check('groups: owner sees it in their list, editable', !!listed && listed.can_edit === true);

  const one = await get(`${G}/${gid}`, owner);
  s.check('groups: owner can open it with a member list', one.status === 200 && Array.isArray(one.body?.data?.members));

  const renamed = await patch(`${G}/${gid}`, owner, { name: 'SMOKE batch renamed', description: 'updated' });
  s.check('groups: owner renames it', renamed.status === 200 && renamed.body?.data?.name === 'SMOKE batch renamed', `status ${renamed.status}`);
  s.check('groups: update keeps the description it was given', renamed.body?.data?.description === 'updated');
  s.check('groups: an empty rename is rejected', (await patch(`${G}/${gid}`, owner, { name: '' })).status === 400);
  s.check('groups: updating members with an unmanageable id is rejected',
    (await patch(`${G}/${gid}`, owner, { student_ids: ['no-such-student'] })).status === 400);

  // ── Groups: someone else's group ───────────────────────────────────────────
  const stranger = tokenFor('grp-stranger', 'faculty');
  owners.add(userId('grp-stranger'));
  s.check('groups: another faculty member cannot edit it', (await patch(`${G}/${gid}`, stranger, { name: 'hijack' })).status === 403);
  s.check('groups: another faculty member cannot delete it', (await del(`${G}/${gid}`, stranger)).status === 403);

  // The group must be untouched after those refused attempts.
  const intact = await get(`${G}/${gid}`, owner);
  s.check('groups: refused edits left it unchanged', intact.body?.data?.name === 'SMOKE batch renamed');

  const adminEdit = await patch(`${G}/${gid}`, admin, { description: 'admin touched' });
  s.check('groups: admin can edit any group', adminEdit.status === 200, `status ${adminEdit.status}`);

  s.check('groups: opening an unknown group → 404', (await get(`${G}/no-such-group`, owner)).status === 404);
  s.check('groups: updating an unknown group → 404', (await patch(`${G}/no-such-group`, owner, { name: 'x' })).status === 404);
  s.check('groups: deleting an unknown group → 404', (await del(`${G}/no-such-group`, owner)).status === 404);

  // ── Groups: delete ─────────────────────────────────────────────────────────
  const removed = await del(`${G}/${gid}`, owner);
  s.check('groups: owner deletes it', removed.status === 200, `status ${removed.status}`);
  s.check('groups: it is gone afterwards', (await get(`${G}/${gid}`, owner)).status === 404);
  const after = await get(G, owner);
  s.check('groups: it no longer appears in the list', !(after.body?.data || []).some((g) => g.id === gid));

  // ── Candidates ─────────────────────────────────────────────────────────────
  const candidates = await get('/api/faculty/groups-candidates', owner);
  s.check('groups: candidates endpoint answers for faculty', candidates.status === 200 && Array.isArray(candidates.body?.data), `status ${candidates.status}`);
  s.check('groups: candidates are closed to students', (await get('/api/faculty/groups-candidates', tokenFor('grp-student', 'student'))).status === 403);

  return s;
};
