// Shared display metadata for third-party coding platforms (coding_profiles table),
// used by both the student's self-service editor and read-only faculty views.
export const CODING_PLATFORM_META: Record<string, { label: string; live: boolean; placeholder: string; unit?: string }> = {
  codeforces: { label: "Codeforces", live: true, placeholder: "tourist" },
  leetcode: { label: "LeetCode", live: true, placeholder: "your-username" },
  github: { label: "GitHub", live: true, placeholder: "your-username" },
  codechef: { label: "CodeChef", live: false, placeholder: "username", unit: "problems solved" },
  hackerrank: { label: "HackerRank", live: false, placeholder: "profile id", unit: "problems solved" },
  interviewbit: { label: "InterviewBit", live: false, placeholder: "username", unit: "score" },
  gfg: { label: "GeeksforGeeks", live: false, placeholder: "username", unit: "problems solved" },
};
export const CODING_PLATFORM_ORDER = ["leetcode", "codeforces", "codechef", "hackerrank", "interviewbit", "gfg", "github"];
