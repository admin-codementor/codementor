/**
 * API response shapes for the (unchanged) CodeMentor backend. These mirror the
 * existing Express controllers; they document the contract the UI consumes.
 */

export type Role = "student" | "faculty" | "hod" | "admin";

export interface User {
  id: string | number;
  name: string;
  email: string;
  role: Role;
  department?: string;
  section?: string;
  year?: number;
  roll_no?: string;
}

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface Problem {
  id: string | number;
  title: string;
  difficulty: Difficulty | string;
  /** Acceptance rate as a percentage (0–100). May be named differently per endpoint. */
  acceptance?: number;
  acceptance_rate?: number;
  tags?: string[];
  is_solved?: boolean;
}

/** `GET /api/problems` returns either an array or `{ problems, total }`. */
export type ProblemsResponse = Problem[] | { problems: Problem[]; total: number };

export interface Submission {
  id: string | number;
  problem_id: string | number;
  problem_title?: string;
  verdict: string;
  language: string;
  runtime?: number | null;
  memory?: number | null;
  submitted_at: string;
}

export interface LeaderboardEntry {
  id: string | number;
  rank: number;
  name: string;
  rating?: number;
  department?: string;
  section?: string;
  score?: number;
  solvedCount?: number;
  totalSubmissions?: number;
}

export interface LoginResponse {
  success: boolean;
  twofa_required?: boolean;
  user_id?: string | number;
  accessToken?: string;
  refreshToken?: string;
  user?: User;
}

export interface AuthSuccess {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: User;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalSubs: number;
  acRate: number;
  problemsSolved: number;
  streak: number;
  rank: number;
  rating: number;
}

export interface HeatmapDay {
  date: string;  // "YYYY-MM-DD"
  count: number;
}

export interface TopicMastery {
  topic: string;
  mastery: number;  // 0–100
}

export interface DashboardRecentSubmission {
  verdict: string;
  language: string;
  created_at: string;
  problem_title: string;
  problem_id: string | number;
}

export interface DashboardData {
  stats: DashboardStats;
  languages: Array<{ language: string; count: number }>;
  heatmap: HeatmapDay[];
  topics: TopicMastery[];
  recentSubmissions: DashboardRecentSubmission[];
}

// ── Assignments ───────────────────────────────────────────────────────────────

export interface AssignmentProblem {
  id: string | number;
  title: string;
  difficulty: string;
  is_solved: boolean;
}

export interface Assignment {
  id: string | number;
  title: string;
  deadline: string;
  isExam: boolean;
  total: number;
  solved: number;
  problems: AssignmentProblem[];
}

// ── Problem detail ───────────────────────────────────────────────────────────

export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface ProblemDetail {
  id: string | number;
  title: string;
  description: string;        // raw markdown
  difficulty: string;         // "easy" | "medium" | "hard"
  tags: string[];
  time_limit: number;         // ms
  memory_limit: number;       // MB
  examples: ProblemExample[];
  stubs: Record<string, string>; // Judge0 language_id -> starter code
  editorial: string | null;
  editorial_visible_at: string | null;
  editorial_unlocked: boolean;
}

export interface AdjacentProblems {
  prev: string | number | null;
  next: string | number | null;
  position: number;
  total: number;
}

// ── Verdict / submissions ─────────────────────────────────────────────────────

export interface TestCaseResult {
  status: { id: number; description: string };
  time: number;           // seconds
  memory: number;         // KB
  stdout: string;
  stderr: string;
  compile_output: string;
  message: string;
  passed: boolean;
  tc_score: number;
  is_public: boolean;
  input: string | null;
  expected: string | null;
}

export interface VerdictResult {
  submission_id: string;
  verdict: { id: number; description: string };
  time: number;
  memory: number;
  score: number | null;
  max_score: number | null;
  scoring_mode: "acm" | "oi";
  passed_count: number;
  total_count: number;
  custom_run?: boolean;
  test_case_results: TestCaseResult[];
}

export interface VerdictPayload {
  success: boolean;
  state: "completed" | "failed";
  result?: VerdictResult;
  error?: string;
  code?: number;
}

export interface ProblemHistoryEntry {
  id: number;
  verdict: string;
  language: number;     // Judge0 language id
  runtime: number;      // ms
  memory: number;       // MB
  submitted_at: string;
}

// ── Recommendations ───────────────────────────────────────────────────────────

export interface RecommendedProblem {
  id: string | number;
  title: string;
  difficulty: string;
  tags?: string[];
  acceptance_rate?: number;
}

// ── Courses / modules ──
export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  moduleCount: number;
  problemCount: number;
  solvedCount: number;
}

export interface CourseModuleProblem {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
  is_solved: boolean;
}

export interface CourseModule {
  id: string;
  title: string;
  problems: CourseModuleProblem[];
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  modules: CourseModule[];
}
