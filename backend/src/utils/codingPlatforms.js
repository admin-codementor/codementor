// Fetchers for external competitive-programming profiles.
// Codeforces  → official public REST API (reliable).
// LeetCode    → public GraphQL endpoint (unofficial but stable).
// Others      → stored as a profile link only (no reliable public API).

// Platforms we live-sync vs. store-only.
const LIVE_PLATFORMS = ['codeforces', 'leetcode'];
const LINK_PLATFORMS = ['hackerrank', 'codechef', 'gfg'];
const ALL_PLATFORMS = [...LIVE_PLATFORMS, ...LINK_PLATFORMS];

// fetch with a hard timeout so a slow/unreachable platform never hangs a sync.
async function fetchJSON(url, opts = {}, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Codeforces: rating + max rating from user.info; distinct solved from user.status.
async function fetchCodeforces(handle) {
  const info = await fetchJSON(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
  if (info.status !== 'OK' || !info.result?.length) throw new Error('Codeforces handle not found');
  const u = info.result[0];

  let solved = 0;
  try {
    const status = await fetchJSON(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100000`);
    if (status.status === 'OK') {
      const ok = new Set();
      for (const sub of status.result) {
        if (sub.verdict === 'OK' && sub.problem) {
          ok.add(`${sub.problem.contestId || 'x'}-${sub.problem.index || sub.problem.name}`);
        }
      }
      solved = ok.size;
    }
  } catch { /* keep rating even if status fetch fails */ }

  return {
    solved,
    rating: Number.isInteger(u.rating) ? u.rating : null,
    max_rating: Number.isInteger(u.maxRating) ? u.maxRating : null,
    extra: { rank: u.rank || null, maxRank: u.maxRank || null },
  };
}

// LeetCode: total solved + global ranking via GraphQL.
async function fetchLeetCode(handle) {
  const query = `query u($username:String!){ matchedUser(username:$username){ submitStatsGlobal{ acSubmissionNum{ difficulty count } } profile{ ranking } } }`;
  const data = await fetchJSON('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
    body: JSON.stringify({ query, variables: { username: handle } }),
  });
  const mu = data?.data?.matchedUser;
  if (!mu) throw new Error('LeetCode username not found');
  const all = (mu.submitStatsGlobal?.acSubmissionNum || []).find(x => x.difficulty === 'All');
  return {
    solved: all ? all.count : 0,
    rating: null,
    max_rating: null,
    extra: { ranking: mu.profile?.ranking ?? null },
  };
}

/**
 * The free text on a platform profile, for proving the account is the
 * student's: they paste a one-time code into a field only the account owner can
 * edit, and we read it back.
 *
 * Several fields are joined rather than one being picked, because which of them
 * a student finds and edits varies — Codeforces calls it "First name" and
 * "Organization", LeetCode calls it "Summary". Any of them is proof.
 */
async function fetchProfileText(platform, handle) {
  if (platform === 'codeforces') {
    const info = await fetchJSON(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
    if (info.status !== 'OK' || !info.result?.length) throw new Error('Codeforces handle not found');
    const u = info.result[0];
    return [u.firstName, u.lastName, u.organization].filter(Boolean).join(' ');
  }

  if (platform === 'leetcode') {
    const query = `query u($username:String!){ matchedUser(username:$username){ profile{ realName aboutMe } } }`;
    const data = await fetchJSON('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com' },
      body: JSON.stringify({ query, variables: { username: handle } }),
    });
    const profile = data?.data?.matchedUser?.profile;
    if (!profile) throw new Error('LeetCode username not found');
    return [profile.realName, profile.aboutMe].filter(Boolean).join(' ');
  }

  throw new Error('This platform cannot be verified automatically');
}

/** Where to paste the code, so the instruction on screen matches the site. */
const VERIFY_FIELD = {
  codeforces: 'your Codeforces profile — the "First name" or "Organization" field under Settings → Social',
  leetcode: 'your LeetCode profile — the "Summary" field under Edit Profile',
};

// Dispatch. Returns stats or throws (caller records sync_status='error').
async function fetchPlatform(platform, handle) {
  if (platform === 'codeforces') return fetchCodeforces(handle);
  if (platform === 'leetcode') return fetchLeetCode(handle);
  throw new Error('Platform is link-only (no live sync)');
}

module.exports = { LIVE_PLATFORMS, LINK_PLATFORMS, ALL_PLATFORMS, fetchPlatform, fetchProfileText, VERIFY_FIELD };
