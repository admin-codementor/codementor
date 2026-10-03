# Review Feedback — Faculty/HOD Review Session (2026-10-01)

This document consolidates feedback received during today's review session. Each item below is a requirement or concern to be researched and addressed. **No implementation has been done yet — this is a refined requirements list only.**

---

## 1. Concurrency — Support 200 Simultaneous Submissions

The platform must remain stable and responsive when at least 200 students submit code (e.g., during an exam) at the same time. It should not crash or degrade under this load.

- The system should scale compute resources dynamically in response to load — i.e., as the number of concurrent submissions/queued jobs increases, additional CPU/worker capacity should be provisioned automatically, rather than running on a fixed, static allocation.
- Research and document: what autoscaling techniques, architectures, and frameworks (e.g., horizontal pod autoscaling, job queues with worker pools, serverless execution) are appropriate for a code-execution workload like this.

**Research note (2026-10-03) — language choice for the execution path**: looked into whether the judge/execution layer should move off Node to Go or Rust for performance under load. Finding: our Node code (`judgeService.js`, `judge0Run.js`) never runs untrusted code itself — it's a thin HTTP client plus a polling/retry state machine around Judge0, which already does the actual sandboxing (via `isolate`, written in C) as its own isolated service. That part of the orchestration is I/O-bound, which is Node's strength, not a weakness. Per `docs/scale-readiness/09-judge0-capacity.md`, the real ceiling at 200 concurrent submissions is Judge0's own CPU time (e.g., ~2.6s per Java compile), not the Node layer around it — so rewriting the orchestration in Go/Rust would not move that ceiling. **Decision: do not introduce a second language for this now.** Revisit only if a real load test (item 19 below) shows the Node orchestration layer itself — not Judge0 — is the bottleneck. A narrower, legitimate future use of Go would be a dedicated low-memory worker fleet for burst autoscaling, which is a cost optimization, not a capability we're missing.

## 2. Concurrency — Support 1000 Simultaneous Users

This is a higher-priority, harder target: the platform must not crash when 1000 students are using it concurrently (browsing, coding, submitting).

- Research and provide a concrete technical recommendation covering:
  - Scaling techniques (horizontal vs. vertical scaling, load balancing, queueing/backpressure, caching)
  - Architecture patterns suited to this scale (e.g., decoupled execution workers, message queues, stateless API layers)
  - Candidate frameworks/tools
  - Hardware/infrastructure requirements (CPU, memory, instance types/tiers) to sustain this load

## 3. Server & Cloud Infrastructure Requirements

Document the server and cloud access/requirements needed to support the project at its current and target scale — i.e., what hosting tier, compute, storage, and network resources are actually required, and what we currently have vs. what's missing.

## 4. Cloud Cost Optimization via Traffic-Aware Auto-Scaling

Resource usage (servers, CPU, API tokens/calls) should scale with actual traffic patterns, not run at a constant provisioned level, in order to control cloud costs.

- **Example pattern**: Usage is lower on weekends (Saturday, Sunday) and higher on weekdays (Monday–Friday), with peak login/usage activity midweek.
- The infrastructure should detect and adapt to these traffic patterns automatically — scaling down during low-usage periods (e.g., weekends, off-hours) and scaling up ahead of/during high-usage periods — to minimize idle cost while still meeting demand.

## 5. AI-Assisted Detection of Test-Case Gaming / Low-Effort Solutions

**Problem**: In the current grading flow (as experienced with CodeTantra-style hidden test cases), students can sometimes pass hidden test cases using trivial, unrelated logic (e.g., hardcoded if/else chains or loops that don't actually solve the stated problem) rather than a genuine, correct solution — and this gets evaluated as a pass.

**Requirement**: Integrate an AI-based check into the evaluation pipeline that:

- Analyzes submitted code against the actual problem statement (not just whether test cases pass)
- Detects when a submission appears to be "gaming" the test cases (e.g., hardcoding expected outputs, irrelevant logic that happens to satisfy visible/hidden cases) rather than implementing a real solution
- Flags such submissions and surfaces a warning — to the student and/or faculty — rather than silently accepting the pass

## 6. Customizable Student Grouping / Badging for Exams, and Cross-Branch Batches

**Part A — Custom student groups/badges**: Currently, exams are assigned to specific classes only, with no finer-grained customization. Faculty and higher authorities (HOD, admin, etc.) should be able to:

- Create custom badges/groups of students based on performance or other criteria (e.g., "Top Performers," "Medium," "Needs Improvement")
- Assign exams, content, or other features to these custom groups rather than only to whole classes
- Have this be flexible/extensible for future grouping criteria beyond just performance tiers

**Part B — Mixed-branch batches**: Add support for creating a "batch" of students drawn from multiple branches/departments (not just one class), to support use cases like placement drives and department-wide/company-wide tests that span branches.

## 7. Security Hardening — Production-Grade Architecture

This is a high-priority item. Since the platform integrates third-party APIs (e.g., Claude/Anthropic) and handles student/academic data, it needs security practices in line with real-world production applications.

**Research and recommend an approach covering**:

- Kubernetes (container orchestration and isolation)
- Networking (segmentation, ingress/egress controls)
- API Gateways (centralized auth, rate limiting, request validation)
- Encryption (at rest and in transit)
- RBAC (Role-Based Access Control) for the multi-persona user model (see item 11)
- Secrets Management (not storing API keys/credentials in code or plaintext config)
- Network Policies (restricting pod/service-to-service traffic)
- Pod Security Standards (for container workload hardening)

**Deliverable**: A researched recommendation of which of these (and any other relevant practices) are best suited to this project's scale and risk profile, along with an implementation plan, required frameworks/tools, and hardware/infra implications.

## 8. Anti-Cheating Controls in the Coding Editor

- Detect and flag/warn when a student appears to be using an external AI tool to generate their solution during problem-solving.
- Disable copy/paste functionality within the in-browser code editor on the problem-solving page, to reduce the risk of pasting in AI-generated or externally sourced code.

**Status (2026-10-02)**: the copy/paste blocking half of this is built — see `docs/UI_REDESIGN_PLAN.md` Phase 8. Paste/copy/cut are blocked (with a visible message and a logged proctor event) on the exam screen and the course problem-solving page; the Sandbox is deliberately left unrestricted, since it's meant for free experimentation. The AI-tool-detection half is still open.

## 9. Per-Student Analytics for Faculty

Faculty need an effective, detailed analytics view for each individual student (not just class-level aggregates), including at minimum:

- Time spent on the platform
- Problems solved / attempted
- Accuracy (correct vs. incorrect submission rate)
- Exam performance overview
- Course completion status and pending items

This should be presented in a clear, class-wise and per-student breakdown that faculty can use to understand each student's engagement and progress.

## 10. Exam-Level Analytics and Plagiarism Reports

For every exam, admins and higher authorities should be able to view, from the dashboard:

- A detailed plagiarism report (code similarity across submissions)
- Detailed exam-level analytics (score distribution, performance breakdown, completion rates, time taken, etc.)

## 11. Multi-Persona Access, Navigation, and UX Consistency

The platform has a multi-level user hierarchy:

**Super Admin → Admin → T&P (Training & Placement) → HOD → Faculty → Students**

Each persona has its own login and permission scope. Requirement: ensure that access control, navigation, and UI/UX are accurate, consistent, and well-designed across all of these roles — i.e., each persona sees the right data/actions for their role, with clear and effective navigation tailored to their responsibilities.

## 12. Company-Specific Interview Prep Content in Courses

Add company-specific interview preparation content to courses, covering both:

- Coding/technical interview questions specific to target companies
- Aptitude questions specific to target companies

## 13. Benchmark Against CodeTantra and CampusTrack — Fix Analytics UI/UX

Go through CodeTantra (student + faculty access) and CampusTrack (student access now, faculty access coming soon) end-to-end and understand every feature they offer, with particular focus on their **analytics views**.

- Our current analytics UI/UX is weak and needs a redesign — identify what makes their analytics views effective (layout, visualizations, clarity, information density, navigation) and bring those best practices into our platform.
- Deliverable: a comparison of their analytics UX vs. ours, concrete gaps, and a redesign direction for our analytics screens (faculty and admin views).

**Initial findings (student-side only, 2026-10-01)**:

- *CodeTantra*: the test student account had no enrolled courses/labs and unopened test results, so little could be observed on the student side. Faculty-side analytics (where the real dashboards likely are) still needs review — requires faculty credentials.
- *CampusTrack*: notably stronger patterns worth adopting —
  - Dashboard **Exam Performance** module: a trend chart (separate series for Assessment/Practice/Quiz) paired with 4 stat tiles — Average, Pass rate, **Strongest topic**, **Focus-on (weakest) topic**. We currently have nothing like the strongest/focus-on callouts.
  - **Exams page**: a top KPI strip (Total / Upcoming / Pending Eval / Passed / Failed / Success Rate) with Upcoming/Previous/Psychometric tabs; each exam card shows date, duration, started time, time taken, and a "Review Paper" action.
  - **Practice Set**: per-problem cards show accuracy % and solved count inline; topic-wise grouping; a Rewards/Power/Streak panel with a GitHub-style activity calendar heatmap.
    **Faculty-side findings (CodeTantra, 2026-10-01)**:
- *Course Dashboard* (per course, as teacher): a top KPI strip — Last 7 Days Active Users, **Users with Suspicious Activity**, Submissions, Completed Users, Not Started Users — each as a `current/total` tile, several with a tiny inline sparkline. Below: a **Unit Wise Completion** stacked bar chart (Solved / Partial / Not Started per unit) plus three trend line charts (Submissions, Solved, Time Spent) over the last 7 days.
- *Enrolled Users*: students are organized into **Groups** per course (e.g. a group spanning two sections, "A&B," with 100+ students) — this is effectively the cross-branch/mixed-batch capability called for in item 6, already proven out on CodeTantra's side.
- *Per-student "Submission Analysis"* (reachable from each student's row menu): **Overall Completion %**, **Overall Suspicious Activity %**, and **Overall Time Spent**, followed by a per-unit list with completion-% progress bars and a drill-down chart per unit (filterable by group). This is very close to the per-student view requested in item 9 (time spent, accuracy/completion, pending items) and the plagiarism/suspicious-activity signal requested in items 5, 8, and 10.
- *Course Activity tab* (richest view found): a **Period** filter (Yesterday / Last Week / Last Month / Last 6 Months), multi-select **Groups** filter, KPI cards with sparklines (Active Users, Suspicious Activity, Submissions, Average Active Time), and two sortable horizontal bar-chart leaderboards — **Most Active Groups** and **Most Active Users** (ranked by time spent).
- Didn't yet find a populated **exam-level report with a plagiarism score** (item 10) — the courses checked had no completed assessments in the available date range; worth a follow-up pass once a course with graded exams is located.

**Comparison read so far**: CodeTantra's faculty analytics are already structurally close to what item 9/10 is asking for (per-student completion/time/suspicious-activity, group-level leaderboards, trend charts) — our gap is less about *inventing* new analytics and more about reaching this same density/clarity: KPI-tile summary → trend charts → sortable group/user leaderboards → per-student drill-down, consistently applied across our faculty and admin dashboards. CampusTrack's student-side strength (the Average/Pass-rate/Strongest/Focus-on callout, per-problem accuracy inline, activity-streak calendar) is complementary and worth folding in on the student-facing side.

**Next step**: still need CampusTrack faculty access (coming soon per the user) to complete that side of the comparison, and a CodeTantra course with completed/graded exams to review the plagiarism report format.

## 14. Landing Page Matching CodeTantra's Quality Bar

Build a proper public-facing home/landing page, matching the quality bar set by CodeTantra's landing page (illustrations, clear visual hierarchy, polished first impression) — shown first, before the user lands on their dashboard after login.

**Status (2026-10-02)**: built — see `docs/UI_REDESIGN_PLAN.md` Phase 1. Public landing at `/` for logged-out visitors (hero, feature sections, role cards, how-it-works); logged-in users skip straight to their dashboard.

## 15. Real, Complete Course Content for Java, Python, C, and DSA

We need genuinely complete, production-quality courses for the core subjects students actually need: **Java, Python, C, and DSA**.

- Each course needs real problems with: full problem description, input/output format and examples, constraints, hidden + visible test cases, and explanations/solutions — not placeholder content.
- Source this content by researching and drawing inspiration from existing platforms (CodeTantra, CampusTrack, and other established coding-practice platforms), then build out our own original course material and problem sets modeled on that structure and quality bar.
- *Note*: content should be our own original authoring, not copied/scraped verbatim from these platforms — their problem banks are proprietary content, so directly extracting and reusing their exact problems/test cases would be a licensing and ToS risk. The research should inform structure, coverage, and quality, not produce a direct copy.
- Deliverable: a real, launch-ready problem bank per subject (not a handful of samples), each problem fully specified and test-case-complete.

## 16. Unified, High-Quality Design System for All Analytics/Dashboard Screens

Faculty, Admin, T&P, HOD, and Super Admin analytics views all need to be rebuilt on a single, well-chosen UI foundation.

- Research and choose the best-suited UI framework/component/charting library for this (considering our stack) so that every analytics screen across all these personas is smooth, consistent, clean, and professional — not generic "AI slop" or mismatched ad-hoc dashboards.
- Deliverable: a recommended design system/framework choice, plus a consistent layout pattern (see item 13's findings — KPI tiles → trend charts → leaderboards → drill-down) to apply uniformly across every persona's analytics screens.

**Status (2026-10-02)**: a shared analytics component kit (KPI tiles with sparklines, chart cards with loading/empty/error states, sortable leaderboards, a period/group filter bar, CSV export) was built on top of our existing MUI/Nivo stack rather than adopting a new framework — see `docs/UI_REDESIGN_PLAN.md` Phase 0, previewable at `/dev/analytics-kit`. It's now applied to the student dashboard, the faculty per-course dashboard, the exam report, and the new HOD department dashboard (Phases 3–7). Still not applied to the original `/faculty/analytics` page or to a future Admin/T&P view — see item 21 below for the Super Admin/T&P gap specifically.

## 17. End-to-End Browser Testing

Everything we test automatically today (`backend/tests/`, 226 checks) talks directly to the API — it never opens a real browser, so nothing verifies that a page actually renders correctly, that a button really does what it claims, or that a full user journey (log in → solve a problem → submit → see the result) works end to end in the UI.

- **Research note**: compared Selenium against Playwright for this stack. Selenium is the older, more manual WebDriver standard; Playwright is built with Node/TypeScript and Next.js-style apps specifically in mind, auto-waits for elements instead of needing manual sleeps (less flaky), and has a gentler setup. **Recommendation: Playwright over Selenium** for this project, unless there's a specific reason (existing team Selenium experience, an existing Selenium Grid) to prefer it.
- Known sharp edges to design around: the Monaco code editor is not a plain `<textarea>` and needs targeted selectors; the clipboard-blocking feature (item 8) is hard to test faithfully in headless mode because real OS clipboard access is restricted there — that piece is better covered by a focused script-level check than a full browser E2E test.
- **Deliverable**: a Playwright test suite covering the core journeys per role (student solves and submits a problem, takes a proctored exam; faculty authors a problem/exam and views a report; HOD views the department dashboard), wired into CI so a broken UI flow fails a pull request before it reaches students.

## 18. Backend Framework: Evaluate Moving From Express to NestJS

Our backend (Express 5, ~13,900 lines across 20 controllers) is structurally sound but relies on every route remembering to call the right authorization/validation checks itself — which is exactly the shape of bug that produced the real vulnerability documented in `docs/scale-readiness/05-auth-and-security.md` §5.0 (a student could sign up and self-select the "faculty" role, gaining access to hidden test cases, before it was caught and fixed on 2026-08-09).

- **What NestJS would actually buy us**: it does not make the app secure by itself, but it makes authorization structural rather than optional — a route literally cannot skip a Guard the way a hand-written controller can skip calling a permission check. It also gives typed request validation (replacing today's hand-written `if (!title.trim() || ...)` blocks repeated per endpoint) and a clearer module boundary as the codebase grows.
- **Cost, estimated against this specific codebase**: a behavior-preserving migration (keep JavaScript, wrap the existing 20 controllers and 19 repositories, turn the 8 middleware files into Guards) is roughly **100–160 hours of focused work** — our existing 226 API-level smoke tests would double as the safety net, and the Next.js frontend needs no changes since route paths and responses stay the same. A full idiomatic adoption (+ converting to TypeScript, + typed DTOs replacing manual validation everywhere) is a materially larger second project on top of that, roughly **200–300+ hours**.
- **Recommendation**: don't treat this as the security fix. The actual vulnerability class is fixable in hours with a small, consistently-enforced authorization helper and a CI check that a new sensitive route must call it — see item 20 below. Treat a NestJS migration as a separate, deliberate architecture decision once there's time/team capacity to justify 100+ hours of refactor on a system that currently works.

## 19. Code-Execution Sandbox: Confirm Judge0 Is Not a Shared Public Instance

Our backend's `.env.example` supports pointing `JUDGE0_URL` at either our own Judge0 instance or the public shared one at `ce.judge0.com`. These are not equivalent from a security standpoint: a shared public judge gives us no control over what else is sharing that sandbox, no SLA, and no audit trail if something there is compromised — and this is the system that runs every student's code and holds every hidden test case.

- **Action needed**: confirm which `JUDGE0_URL` is actually live in production today, and if it's the public instance, treat moving to our own dedicated, network-isolated Judge0 host as a priority ahead of the next exam window — not a someday item under item 7's broader "Security Hardening" research.
- This is narrower and more urgent than item 7: it's a one-line config fact to check, not a multi-week architecture project.

## 20. Centralize Authorization Enforcement (closes the gap behind item 11's RBAC ask, and the §5.0 vulnerability class)

Authorization today is correct, but enforced per-controller by hand (`canSeeDepartment`, `scopeDept`, `requirePermission`, each called individually inside route handlers). That pattern is exactly what let the role self-assignment bug (item 18 above, and `docs/scale-readiness/05-auth-and-security.md` §5.0) through: the check wasn't wrong anywhere it existed, it just didn't exist somewhere it needed to.

- **Deliverable**: a single, consistently-named authorization helper that every sensitive route must call, paired with an automated check (a CI test or a lint rule) that fails the build if a new mutating route is added without it. This gets most of the structural benefit described in item 18's NestJS Guards, in hours rather than months, and is worth doing regardless of the NestJS decision.
- Pair this with a one-time audit of the `faculty` collection for any account that shouldn't be there (the specific follow-up action `docs/scale-readiness/05-auth-and-security.md` left open), and a basic alert on new faculty-role writes going forward.

## 21. Super Admin and T&P Roles — Still Not Built

The platform currently has four roles end-to-end: Student, Faculty, HOD, Admin. **Super Admin and Training & Placement (T&P) do not exist** — not as backend roles, not as database fields, not as UI. This was raised in item 11's multi-persona list and is a known, deliberately deferred gap (see `docs/UI_REDESIGN_PLAN.md`'s "Deliberately not built" section) — HOD-level dashboards (department funnel, flags, groups) were prioritized first since they needed no new role, only correct scoping of the existing `hod` role.

- Adding T&P specifically also depends on item 23 below, since a placement funnel has nothing to show without placement data.
- **Deliverable**: a decision on whether Super Admin is actually a distinct role from Admin for our scale (many platforms this size don't need the split), and a scoped plan for T&P (new role + permission rules + the placement-funnel screens already sketched in `docs/COMPETITOR_UX_RESEARCH.md` Part 2).

## 22. Time-on-Platform Tracking — Decision Needed

Several analytics asks (item 9's "time spent," CampusTrack's HOD "days active / last seen" view) assume we know how long a student was actually using the platform. **We don't track this at all today** — every "activity" figure we show is inferred from submission timestamps (e.g., "active days" = days with at least one submission), which undercounts anyone reading, thinking, or using the AI tutor without submitting.

- Real tracking means a heartbeat ping from the browser while a page is open, stored per student per day — which adds a steady stream of writes at scale (1000 concurrent users pinging every minute is real load, see items 1–2) and raises a genuine privacy question (how granular, how long retained, who can see it) that's a product decision, not just an engineering one.
- **Deliverable**: a decision on whether real time-tracking is worth building given the cost/privacy tradeoff, or whether the submission-based proxy we use today is accepted as "good enough" and labelled clearly as such everywhere it's shown (which is what we do today).

## 23. Automated Regression Coverage for New Features

As analytics and groups features get built (items 6, 9, 10, 13, 16), each one needs its own automated test coverage added to `backend/tests/`, the same way the existing 226 checks cover exams, roles, and plagiarism. A feature that works when manually checked once and has no regression test will silently break the next time something nearby changes — this already happened once during this work (a group-targeting field was dropped from the exam-update endpoint and only caught because the full test suite was re-run before calling anything finished).

- **Deliverable**: a standing rule that no feature is considered done until it has smoke-test coverage in the same suite, plus a backfill pass for the student-groups and department-dashboard endpoints that currently have none.
