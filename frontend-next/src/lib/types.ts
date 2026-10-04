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
  acceptance?: number | null;
  acceptance_rate?: number;
  /** Distinct students who have solved it. */
  solved_count?: number;
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
  /** Position across every student on the platform. */
  rank: number;
  totalStudents: number;
  /** Position within the student's own department+section; 0 when they have none. */
  classRank: number;
  classSize: number;
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

/**
 * One problem the student has solved — the accepted submission only.
 *
 * Replaces the old recent-submissions list: wrong answers and errors are not a
 * history worth scrolling. Unsolved attempts live in the retry list instead,
 * and faculty still see every attempt in their own views.
 */
export interface DashboardSolvedProblem {
  language: string;
  runtime: number | null;
  solved_at: string;
  problem_title: string;
  problem_id: string | number;
  difficulty: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  languages: Array<{ language: string; count: number }>;
  heatmap: HeatmapDay[];
  topics: TopicMastery[];
  recentSolved: DashboardSolvedProblem[];
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
  /**
   * Shown/hidden splits counted before judging. The results array stops at the
   * first failure under ACM scoring, so it cannot be used to count cases that
   * never ran.
   */
  public_total?: number;
  public_passed?: number;
  hidden_total?: number;
  hidden_passed?: number;
  /** Mean runtime in seconds across the cases that ran. */
  avg_time?: number | null;
  /** The first real failure, already parsed, or null when nothing failed. */
  error?: JudgeError | null;
  custom_run?: boolean;
  sample_only?: boolean;
  test_case_results: TestCaseResult[];
}

export type JudgeErrorKind =
  | "compile_error"
  | "runtime_error"
  | "time_limit"
  | "memory_limit"
  | "wrong_answer";

export interface JudgeError {
  kind: JudgeErrorKind;
  /** Line in the student's source, where the compiler or runtime named one. */
  line: number | null;
  /** The compiler's or runtime's own output, shown verbatim. */
  text: string | null;
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
/** Where a module stands for this student. Computed server-side so every screen agrees. */
export type ModuleStatus = "empty" | "not_started" | "in_progress" | "done" | "overdue";

export interface ModuleProgress {
  id: string;
  title: string;
  total: number;
  solved: number;
  percent: number;
  dueAt: string | null;
  status: ModuleStatus;
}

export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  moduleCount: number;
  problemCount: number;
  solvedCount: number;
  modules: ModuleProgress[];
  nextModule: { id: string; title: string } | null;
  nextDue: { id: string; title: string; dueAt: string } | null;
  overdueCount: number;
}

export interface CourseModuleProblem {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
  is_solved: boolean;
}

export interface CourseModule extends ModuleProgress {
  description: string | null;
  problems: CourseModuleProblem[];
  nextProblemId: string | null;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  problemCount: number;
  solvedCount: number;
  percent: number;
  nextUp: { moduleId: string; moduleTitle: string; problemId: string | null } | null;
  modules: CourseModule[];
}
