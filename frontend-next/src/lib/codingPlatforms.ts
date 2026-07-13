// Shared display metadata for third-party coding platforms (coding_profiles table),
// used by both the student's self-service editor and read-only faculty views.
export const CODING_PLATFORM_META: Record<string, { label: string; live: boolean; placeholder: string }> = {
  codeforces: { label: "Codeforces", live: true, placeholder: "tourist" },
  leetcode: { label: "LeetCode", live: true, placeholder: "your-username" },
  hackerrank: { label: "HackerRank", live: false, placeholder: "profile id" },
  codechef: { label: "CodeChef", live: false, placeholder: "username" },
  gfg: { label: "GeeksforGeeks", live: false, placeholder: "username" },
};
export const CODING_PLATFORM_ORDER = ["codeforces", "leetcode", "hackerrank", "codechef", "gfg"];
