# Student Persona Plan

**Started:** 2026-10-03 · **Branch:** `feat/student-persona` (from `main` after PR #37) · **Owner:** Srinivas

This is the first of six persona plans (Student → Faculty → HOD → T&P → Admin → Super Admin). Each persona is
taken to "real-world ready" before the next one starts. Daily progress is recorded in `docs/PROJECT_LOG.md`.

Inputs: HOD/VC review (`Review_Feedback.md`), competitor research (`docs/COMPETITOR_UX_RESEARCH.md`),
the earlier redesign (`docs/UI_REDESIGN_PLAN.md`), the CodeTantra student home screenshot, and a code audit
of every student page done on 2026-10-03 (findings quoted inline below with file references).

---

## 1. How we work through this plan

- **One phase = one pull request.** Each phase is reviewed and approved by Srinivas before the next starts.
- **Definition of done for every phase:**
  1. Every new or touched component handles the full state set in [Appendix A](#appendix-a--component-state-catalogue).
  2. No raw hex colours, numeric `fontSize`, or numeric `borderRadius` in `sx` (enforced by lint from S0 onward).
  3. Backend changes have smoke tests in `backend/tests/` (Review item 23), and the full suite passes.
  4. Checked in a real browser: golden path, empty data, error (backend stopped), mobile width, dark mode.
  5. Any `frontend-next` dependency change passes a clean `npm ci` locally before push.
  6. `docs/PROJECT_LOG.md` gets a dated entry.
- **No data is deleted.** Removing a feature (e.g. Contests) means removing UI and routes; Firestore documents stay.

---

## 2. Decisions already made (2026-10-03)

| # | Topic | Decision |
|---|---|---|
| D1 | Illustrated home | Illustrated **Quick Access** tiles sit **at the top of the existing dashboard** (not a separate page). |
| D2 | Illustrations | unDraw, recoloured to our brand primary. Stored locally as SVGs. |
| D3 | Style guidance | Use official MUI agent skills + Material 3 spacing rules + our own project skill (see S0). |
| D4 | Submissions | Students see **only accepted, final** submissions. No wrong / error submissions anywhere on the student side. |
| D5 | Classes | **Option A for now:** auto-enrol by department/year/section; remove "My Classes" page; class shown in the My Class tile. Revisit merging with groups in the Faculty phase. |
| D6 | Assessments | **Every Exam is always proctored.** "Proctored-exam assignments" as a separate type go away. Normal Assignments are **unproctored by default**; faculty (or higher) can switch proctoring on per assignment. |
| D7 | Contests | Remove from the student experience; remove the code if nothing else depends on it. |
| D8 | Copy/paste | Keep blocking as the default, **silently** — no banner/message to the student. |
| D9 | Course due dates | Add a due date per module (faculty sets it). |
| D10 | Leaderboard | Show **names, rank, and a link to the student's profile** (shareable profile comes in S11). |
| D11 | Roadmaps | Start with **4 roles**; expand later. |
| D12 | Flagship feature | **Job-Ready Score**, tied to the shareable profile and external platform records. |
| D13 | Git | New branch from `main`. |
| D14 | Log | `docs/PROJECT_LOG.md`, dated daily entries, newest first. |
| D15 | New features | Add **Shareable verified profile** and **Mistakes notebook**. |

## 3. Answered follow-ups (2026-10-03)

| # | Question | Answer |
|---|---|---|
| Q-A | What happens to **Classes**? | Option A for now (see D5, Appendix C). |
| Q-B | Copy/paste blocked silently — still logged? | **Yes.** Logged and visible to faculty and higher roles; never shown to the student. |
| Q-C | Job-Ready Score visibility | **Both:** always on the student's own dashboard; on the public profile only if the student switches it on. |
| Q-D | First 4 roadmap roles | **Java Developer · Python / Data Analyst · Web Developer · Service-Company Placement.** |
| Q-E | Who makes a profile public? | **The student**, by themselves. (T&P hide-control can be added in the T&P phase.) |
| Q-F | External handles | **Verified only:** an external platform is shown on the profile only after the ownership check passes. |
| — | NestJS | Not now (Appendix D). Backend upgrade handled as a separate track — see `docs/BACKEND_UPGRADE_PLAN.md` once agreed. |

---

## 4. Target student navigation

**Today** (`frontend-next/src/app/(student)/app/layout.tsx:9-21`):
Dashboard · *Practice:* Sandbox, Courses, Contests, Assignments, Aptitude, Exams · *Progress:* Leaderboard, My Classes · *Career:* Placement · *Assistant:* AI Tutor. Logo does not link anywhere (`AppShell.tsx:129-148`).

**Target:**

```
Logo → /app/dashboard (everywhere, including the problem page)

Dashboard            ← Quick Access tiles on top, analytics below
Learn
  Courses            ← course → module progress, due dates
  Practice           ← problem catalogue (today /app/problems, currently not in the menu)
  Sandbox
Work
  Assignments        ← coding assignments; "Proctored" chip only when faculty switched it on
  Tests              ← one hub: Exams | Aptitude | Technical MCQ
Grow
  Roadmaps           ← S9
  Mistakes notebook  ← S3
  Leaderboard        ← scoped: My class / Department / College
  Placement          ← becomes Job-Ready Score in S10
AI Tutor
(avatar menu) Profile · Public profile link (S11) · Sign out
```

Removed from the menu: **Contests** (D7), **My Classes** (pending Q-A; information moves to the "My Class" tile).

---

## Phase S0 — Design foundations (style system + state kit)

**Goal:** fix the root causes of "bad spacing, corners, hover, alignment" once, in the theme, so every later phase
inherits it instead of hand-tuning each page.

**What the audit found**
- `borderRadius: 2` in `sx` renders **24px**, not 8px, because MUI multiplies numeric `sx` radius by
  `shape.borderRadius` (12). Used ~20 times on student pages (e.g. `ai-tutor/page.tsx:86`, `contests/page.tsx:548`,
  `aptitude/page.tsx:284`). This is the main reason corners look inconsistent.
- `MuiCard` has **no hover/focus/pressed override** (`theme.ts:195-204`); every page invents its own.
- Student pages: 506 `sx` blocks, 117 lines with raw pixel values, 65 raw `fontSize` numbers (10–20px spread)
  instead of typography variants.
- `DESIGN.md` has no radius, elevation, typography or duration rules — those exist only in `tokens.ts`.
- State handling: `ErrorState` used in only 11 files; ~24 pages fetch with `useEffect` and `.catch(() => {})`,
  so a failed request looks exactly like "no data".

**Work**
1. **Skills (done 2026-10-03):** vendored MUI's official `material-ui-styling`, `material-ui-theming`,
   `material-ui-nextjs` (MIT) and Anthropic's `frontend-design` (Apache 2.0) into `.claude/skills/`, with
   `THIRD_PARTY_NOTICES.md`. Note: MUI's skills target v9; we are on v6.5.
2. **Write our own `.claude/skills/codementor-ui/SKILL.md`** — the binding project rules: tokens below, which
   primitive to use for what, the state catalogue, copywriting rules, and "project rules beat third-party skills".
   Every future persona (Faculty, HOD, …) is built with it.
3. **Token rules** (Material 3 + MUI 8px unit), written into `DESIGN.md` and the theme:

   | Token | Value | Use |
   |---|---|---|
   | Spacing unit | 8px (`theme.spacing(1)`), 4px only for icon/text gaps | all padding/gaps via `p`, `gap`, `m` |
   | Page gutter | 16px mobile (<600), 24px tablet+, 32px ≥1200 | `PageContainer` |
   | Card padding | 16px compact, 24px default | `SectionCard` |
   | Gap between sections | 24px | page `Stack spacing={3}` |
   | Gap inside a card | 8 / 12 / 16px | |
   | Radius | 4 inputs · 8 chips/small · 12 cards · 16 large cards/tiles · 28 dialogs · full pills | named, never numeric `sx` |
   | Touch target | ≥ 40px desktop, 48px on touch | buttons, icon buttons, rows |
   | Elevation | 0 at rest; hover = outline colour + 1 level; never stacked shadows | |
   | Motion | 100ms press · 150ms hover · 200ms fade (already in `tokens.ts`) | |
   | Type | M3 scale only; no numeric `fontSize` | |

4. **Theme work (`src/theme/theme.ts`, `tokens.ts`):**
   - Named radius helpers (`radius.sm` etc.) and a `Card` variant `interactive` with hover (outline + tint),
     `:focus-visible` ring, pressed scale, `aria-selected`/selected state, disabled state.
   - Align `interactiveSurfaceSx` from `DESIGN.md` with the new variant (one source of truth).
5. **Layout primitives (`src/components/ui/`):** `PageContainer`, `PageHeader` (title, subtitle, actions,
   breadcrumbs), `SectionCard` (title, action, body, states), `StatTile`, `ListRow`, `Toolbar`. Pages compose
   these instead of raw `Box sx`.
6. **State kit:** `DataState` wrapper around a React Query result (`isLoading`, `isError`, `isFetching`, empty,
   partial), typed error kinds (offline / server / forbidden / not-found / timeout) from `lib/apiError.ts`,
   `EmptyState` variants (first-use / filtered / nothing-assigned) with optional unDraw illustration,
   `InlineError` for section-level failures, `StaleBanner`, and a shared skeleton set.
7. **`/dev/states` gallery page** showing every state of every primitive, light and dark — the review surface for
   Srinivas and the HOD.
8. **Lint guard:** ESLint rule (custom `no-restricted-syntax`) failing on numeric `borderRadius`, numeric
   `fontSize`, and hex/rgb literals inside `sx` in `src/app/**`. Starts as error for new files, warning for old,
   flipped to error after S8.

**Out of scope:** restyling existing pages (each phase restyles the pages it touches; S8 sweeps the rest).

**Acceptance:** `/dev/states` renders every state; lint runs in CI; `codementor-ui` skill exists and is referenced
from `frontend-next/CLAUDE.md`.

**Size:** M (frontend only).

---

## Phase S1 — Quick Access tiles + navigation

**Goal:** the CodeTantra-style illustrated entry point the HOD asked for, on top of the dashboard, with
**live information** on each tile (CodeTantra's tiles only say "Click here").

**Quick Access row (top of `/app/dashboard`)** — 6 tiles, unDraw illustration (recoloured), title, one live line,
whole tile clickable (`Card variant="interactive"`):

| Tile | Live line example | Goes to |
|---|---|---|
| My Learning | "Java · 62% · next: Module 4" | `/app/courses` (or the in-progress course) |
| Assignments | "2 due this week" / "All caught up" | `/app/assignments` |
| Tests | "Exam Fri 10:00" / "No tests scheduled" | `/app/tests` |
| Practice | "5-day streak · Problem of the Day" | `/app/problems` |
| My Class | "CSE-A · Rank 7 of 64" | class panel (depends on Q-A) |
| Roadmaps | "Java Developer · 30%" (placeholder "Start a roadmap" until S9) | `/app/roadmaps` |

- Desktop: 3×2 grid, tiles ~180px tall. Tablet: 2 columns. Mobile: horizontal scroll row.
- Each tile has loading (skeleton line), error (tile still clickable, live line hidden), and empty copy.
- "Collapse quick access" toggle remembered per user (localStorage, safe-wrapped) for students who prefer the
  analytics view.
- Illustrations: 6 SVGs in `public/illustrations/`, colour set by CSS variable so dark mode works.

**Navigation**
- New menu per §4. Logo links to `/app/dashboard` (`AppShell.tsx:129-148`).
- Contests: menu item, dashboard "Contest Rating" card, leaderboard "By Rating" tab removed from UI. `/app/contests`
  redirects to dashboard. (Backend removal in S8.)
- `/app/tests` route created (content in S5); `/app/exams` and `/app/aptitude` redirect into its tabs.
- My Classes per Q-A.

**Backend:** a single `GET /api/student/quick-access` returning the six live lines (cached per student, 60s), so
the row costs one request.

**Acceptance:** tiles render with real data, each state verified, mobile scroll works, logo goes home.
**Size:** M.

---

## Phase S2 — Dashboard body

**Goal:** the analytics half of the dashboard shows what matters and nothing that misleads.

**Audit findings to fix**
- "Recent Submissions" shows the last 5 submissions **including wrong/error ones**
  (`student.controller.js:141-146`, no verdict filter).
- "Class Rank" is **not a class rank** — it ranks against every student in the system (`student.controller.js:100-112`).
- "Contest Rating" card (removed in S1).
- Secondary dashboard requests silently become `[]` on failure (`lib/queries/student.ts:20-40`).

**New layout (below Quick Access)**
1. **Stat row:** Problems solved · Streak (vs goal) · Class rank (real, see S4) · Courses completed.
2. **Continue learning:** current course with overall ring + current module bar + "Next problem" button.
3. **Due soon:** assignments and tests due in the next 7 days, one list, sorted by deadline.
4. **Recently solved:** last 5 problems solved — one row per problem, final accepted submission only
   (title, topic, language, solved date, "View code").
5. **Problem of the Day** (moved to use the existing unused `/api/student/daily-challenge` instead of picking on the
   client from the first 50 problems).
6. **Leaderboard snippet:** top 5 of my class + my own row pinned.
7. **Performance** (existing strongest/focus-on block), **Topic mastery**, **Activity heatmap** — kept, restyled.
8. **Mistakes notebook teaser:** "3 problems waiting for a retry" → S3 page.

Each section is a `SectionCard` with its own loading/error so one failing request never blanks the page (partial
state).

**Backend:** `recentSubmissions` replaced by `recentSolved` (latest accepted per problem, deduplicated).
**Acceptance:** no wrong submission visible anywhere on the dashboard; rank label matches its scope.
**Size:** M.

---

## Phase S3 — "Solved only" everywhere + Mistakes notebook

**Goal:** apply D4 consistently and give failed attempts a useful home.

**Solved-only (D4)**
- Profile → Submissions tab (`components/profile/ProfileSubmissions.tsx`, `GET /api/submissions?scope=…`) becomes
  **Solved problems**: one row per problem, final accepted submission, filter by topic/difficulty/language,
  "View code".
- Problem page → Submissions tab (`problems/[id]/page.tsx:1209-1312`) becomes **My solution**: the accepted
  submission(s) for this problem only, with code view and "Load into editor".
- `/app/submissions` redirect updated.
- Faculty views are **unchanged** — they still see every attempt for analytics and integrity.

**Mistakes notebook (new)** — `/app/mistakes`
- Lists problems the student attempted but has **not yet solved**: problem, topic, attempts count, last tried,
  what went wrong last time in plain words ("Wrong answer on a hidden case", "Time limit", "Compile error"),
  and a **Retry** button.
- A problem leaves the list automatically once solved (with a small "Cleared!" moment on the dashboard).
- Optional private note per problem ("forgot the empty-array case") — stored per student.
- Shows the student's own wrong code only inside the problem page when they choose "See my last attempt", so
  wrong submissions are never listed as a feed (respects D4 while keeping learning value).

**Backend**
- `GET /api/student/solved` — latest accepted submission per problem (paged).
- `GET /api/student/mistakes` — problems with ≥1 attempt and 0 accepted, with last verdict + count.
- `PUT /api/student/mistakes/:problemId/note`.
- Index check on `submissions (userId, verdict, createdAt)`; smoke tests for all three.

**Acceptance:** no student screen lists a failed submission as history; notebook updates after solving.
**Size:** M.

---

## Phase S4 — Course progress + scoped leaderboard

**Goal:** clear "where am I, what's next, what's due" for every course, and a leaderboard that means something.

**Course progress**
- Today per-module % is only computed in the browser on the course page (`courses/[id]/page.tsx:76-78`); courses
  have **no due dates**.
- Backend `GET /api/courses/:id` returns per-module `solved/total/percent`, `dueAt`, `status`
  (not started / in progress / done / overdue) and the next unsolved problem.
- **Faculty side (small, D9):** module editor gets an optional due date.
- Courses list: one card per course — overall ring, module mini-bars, "Due: Module 3 in 2 days", Continue button.
- Course page: module accordion with progress bar, due chip, problem list with ✓, "Next up" pinned at the top.
- New **My Progress** view (tab on Courses): every course → modules → totals, plus overall progress across courses.

**Leaderboard (D10)**
- Tabs: **My class · My department · College**. Today both boards are global and "By Rating" includes non-students
  (`rating.controller.js:203-225`).
- Columns: rank, name, department/section, problems solved, streak, profile link (activates in S11).
- My own row pinned at top when outside the visible page.
- Backend: `GET /api/student/leaderboard?scope=class|department|college` with server-side scoping, cached 120s;
  dashboard "Class rank" uses the same source.

**Acceptance:** module % identical on course list, course page and dashboard; rank labels match scope.
**Size:** M–L (touches backend + small faculty change).

---

## Phase S5 — Tests hub + Assignments

**Goal:** one place for timed assessments; Assignments stay separate and simple (D6).

**Today:** three "test" concepts in three collections — exam-flagged assignments (`assignments.isExam`, which also
drives `middleware/examLock.js` and `middleware/cidrCheck.js`), multi-section `exams`, and `mcqTests`
(aptitude/technical/verbal/logical via `category`).

**Tests hub — `/app/tests`**
- Tabs: **Exams | Aptitude | Technical MCQ** (MCQ tabs are filters over `mcqTests.category`; verbal/logical fold
  into Aptitude unless we decide otherwise).
- Shared KPI strip: Upcoming · Completed · Missed · Average score.
- One card design for all: title, type, window/date, duration, sections, status chip (Upcoming / Live / Completed /
  Missed / Locked), primary action (Start / Resume / View result / Opens in 2h).
- Exams are always proctored — no "proctored" toggle shown, just a "Proctored" note on the instructions screen.

**Assignments — `/app/assignments`**
- Only coding assignments. `isExam` is replaced by `proctoring.enabled` (default **off**). When on, the card shows a
  "Proctored" chip and the problem page enables fullscreen/tab-switch monitoring as today.
- **Faculty side (small):** assignment editor gets a "Require proctoring" switch; migration script maps existing
  `isExam: true` → `proctoring.enabled: true` (dry-run first, reviewed before any write).
- `examLock.js` / `cidrCheck.js` read the new field (with the old one as fallback until migration is confirmed).

**Acceptance:** student sees one Tests entry; no assignment calls itself an "Exam"; proctoring follows the switch.
**Size:** L (backend middleware + faculty editor + migration).

---

## Phase S6 — Problem page: layout and navigation

**Goal:** a clean, single-purpose solving screen.

**Audit findings**
- Submit, Prev/Next and Reset each appear **twice** (header `problems/[id]/page.tsx:492-572`; bottom bar
  `1653-1701`; Reset also `1403-1407`).
- Logo goes to `/app/problems`, not home (`481-485`).
- **Next/Prev ignores course and assignment order** — `GET /api/problems/:id/adjacent` walks *all* published
  problems by `createdAt` (`problems.controller.js:61-89`). This is why navigation feels random.
- Title is `body2 noWrap` squeezed between arrows and timer (`535-542`); the timer is a small chip hidden on mobile.
- Clipboard banner messages ("Pasting is turned off here…", `hooks/useClipboardGuard.ts:80-83`).

**New header (left → right)**
`Logo (→ dashboard)` · `☰ Problem list` · breadcrumb `Java › Module 3 › Reverse a String` + difficulty chip ·
*(spacer)* · **Timer** · `Run` · `Submit` · AI Tutor · avatar.

- **Problem list drawer:** opens from the left; lists problems of the *current context* (course module, assignment,
  or filtered catalogue) with solved ✓ / attempted • marks, current one highlighted; click to switch. Small ‹ ›
  arrows beside the list button + keyboard `Alt+←/→`.
- **Context-aware next:** `GET /api/problems/:id/adjacent?context=module:<id>|assignment:<id>|catalog` returns
  the ordered list and position. Problem links from courses/assignments pass the context in the URL.
- **Single action area:** Run/Submit only in the header; bottom action bar removed; Reset only in the editor
  toolbar (with confirm).
- **Timer:** practice = quiet stopwatch that can be hidden; exam/proctored = prominent countdown that turns amber
  at 10 min and red at 2 min, visible on mobile.
- **Copy/paste (D8):** keep blocking, remove all banner messages; logging per Q-B.
- In an exam, the drawer shows only that exam's coding questions; logo stays hidden.

**Acceptance:** each control appears once; next problem follows the module; works at 1280px and on a tablet.
**Size:** M–L.

---

## Phase S7 — Run/Submit results, terminal style

**Goal:** results that read like a real terminal and a real judge.

**Audit findings**
- Errors are shown inside a collapsed test-case row as an "Error" box (`problems/[id]/page.tsx:288-294`); line
  numbers are parsed client-side only for editor squiggles (`72-109`).
- "X of Y hidden passed" is computed from the returned rows, but ACM mode stops at the first failure
  (`judgeService.js:245`), so the hidden **total is wrong** whenever something fails.
- Output panel is capped at 260px (`1521`); memory not shown in the summary.

**Design**
- **Errors (compile / syntax / runtime / TLE / MLE):** a terminal panel — monospace, dark surface in both themes,
  error text in red, exactly as the compiler printed it. A header line in plain words
  ("Compilation error · line 12" / "Runtime error: ArrayIndexOutOfBounds · line 8"). Each `line N` is clickable
  and jumps the editor to that line.
- **Wrong answer:** first failing visible case shown as Input / Expected / Your output with the differing line
  highlighted; hidden case says which number failed without revealing data.
- **Success:**
  ```
  Average time   0.004 s (4.00 ms)
  Maximum time   0.006 s (6.00 ms)
  Memory         12.4 MB
  2 of 2 shown test cases passed
  4 of 4 hidden test cases passed
  ```
  followed by a table per visible test: `Test | Time | Expected output | Actual output | ✓`.
- Output panel becomes a resizable split with the editor (drag handle, remembered size).

**Backend:** `finalize` in `judgeService.js` returns explicit `public_total`, `public_passed`, `hidden_total`,
`hidden_passed`, `avg_time`, plus `error: { kind, line, message }` where we can extract it (parsing moves
server-side so the exam and practice views agree). Smoke tests for each verdict type.

**Acceptance:** compile error, runtime error, TLE, wrong answer and accepted each verified in Java, Python, C, C++.
**Size:** M.

---

## Phase S8 — Sweep and cleanup

**Goal:** no student page left on the old patterns.

- Move remaining `useEffect`+axios student pages to React Query + `DataState` (leaderboard, placement, classes,
  aptitude, assignments, profile, ai-tutor …).
- Restyle every remaining student page with S0 primitives; flip the lint rule to error.
- **Contests removal (D7):** dependency check across `contest.routes.js`, `rating.routes.js`,
  `submissions.routes.js`, profile rating display, seed scripts; remove routes, controllers, frontend page and
  tests that only exist for contests. Firestore data is left in place.
- Classes changes per Q-A.

**Acceptance:** lint clean as error; every student page shows correct error state with the backend stopped.
**Size:** M.

---

## Phase S9 — Roadmaps

**Goal:** a motivating "where do I start / what next" path per career role, simpler than roadmap.sh.

- 4 roadmaps (Q-D). Each is a vertical path of 8–12 **milestones**; each milestone links to our own courses,
  modules and problem sets (and optional external reading links).
- Progress fills automatically from what the student has already solved — nobody starts at 0% if they've done work.
- Roadmap page: role summary, "you are here" marker, current milestone expanded with the next 3 tasks,
  completed milestones collapsed with ✓.
- Student picks one **active roadmap**; it feeds the Quick Access tile and (S10) the Job-Ready Score.
- Content is our own writing (roadmap.sh content has licence limits; we use it only as inspiration).
- Stored as data (`roadmaps` collection + JSON seed), so faculty/T&P can author more later without code.

**Backend:** `GET /api/roadmaps`, `GET /api/roadmaps/:id` (with my progress), `PUT /api/student/active-roadmap`.
**Size:** L (content authoring is the bigger part).

---

## Phase S10 — Job-Ready Score (flagship)

**Goal:** the one reason students open CodeMentor on their own — "how ready am I for placements, and what do I
do today?"

- A score 0–100 per target (Service companies · Product companies · active roadmap role).
- Inputs, all from data we already have or build in this plan: problems solved by topic and difficulty, recent
  consistency (streak/active days), aptitude test scores, roadmap progress, course completion, and linked
  external platforms (Codeforces/LeetCode live sync already exists; HackerRank/CodeChef/GFG are links only).
- Formula is **shown to the student** (no black box): each component, its weight, and what raises it.
- Always paired with **"Your next 3 things to do"** (e.g. "Solve 2 medium array problems", "Take Aptitude Test 4").
- Weekly change ("+6 this week") to give momentum.
- Replaces/extends today's `/app/placement` page (readiness per track already exists in `config/placementTracks.js`).
- Visibility per Q-C. This is the data T&P will use in their persona phase (shortlisting, placement funnel).

**Size:** M–L.

---

## Phase S11 — Shareable verified profile

**Goal:** a public link a student can put on a resume/LinkedIn that recruiters trust because the data comes from
our judge, not self-reported.

- URL `/u/<handle>`; student switches it on (Q-E); off by default.
- Shows: name, college, department, year; verified stats from our judge (problems solved by topic/difficulty,
  accepted-only list), courses completed, active roadmap and progress, Job-Ready Score (if shown), activity
  heatmap, linked external platforms with their synced stats.
- **Verified** badge only for data we judged ourselves, and for external handles after ownership proof (Q-F, e.g.
  student puts a one-time code in their Codeforces/LeetCode bio).
- Privacy: no email, phone or roll number; student can unpublish anytime; `noindex` by default; rate-limited
  public endpoint.
- Leaderboard names (S4) link here.

**Backend:** public read-only `GET /api/public/profile/:handle`, handle reservation, publish toggle, ownership
check endpoints. Security review before release (it's the first public data endpoint).
**Size:** L.

---

## Suggested order and rough size

| Phase | Size | Depends on |
|---|---|---|
| S0 Design foundations | M | — |
| S1 Quick Access + navigation | M | S0, Q-A |
| S2 Dashboard body | M | S1 |
| S3 Solved-only + Mistakes notebook | M | S0 |
| S4 Course progress + leaderboard | M–L | S0 |
| S5 Tests hub + Assignments | L | S1 |
| S6 Problem page layout | M–L | S0, Q-B |
| S7 Results terminal | M | S6 |
| S8 Sweep + contests removal | M | S1–S7 |
| S9 Roadmaps | L | S4, Q-D |
| S10 Job-Ready Score | M–L | S9, Q-C |
| S11 Shareable profile | L | S10, Q-E, Q-F |

S3/S4 can run in either order; S6–S7 can move earlier if the problem page is the most urgent complaint.

---

## Appendix A — Component state catalogue

Every data-bound component must define what it shows in each applicable state.

**Data states**
| State | Meaning | Pattern |
|---|---|---|
| Initial loading | first fetch, nothing cached | skeleton shaped like the content (never a centred spinner) |
| Background refresh | cached data shown, refetching | thin progress line on the card, content stays |
| Success | data present | normal render |
| Empty – first use | user hasn't started | illustration + one action ("Start your first course") |
| Empty – filtered | filters/search returned nothing | "No results for …" + Clear filters |
| Empty – nothing assigned | depends on faculty | neutral message, no action |
| Partial | some sections failed | only the failed section shows `InlineError` + Retry |
| Error – offline | no network | "You're offline" + auto-retry when back |
| Error – server (5xx) | backend failed | plain message + Retry |
| Error – forbidden (403) | no access | "You don't have access to this" + Back |
| Error – not found (404) | missing item | "This problem no longer exists" + link to list |
| Error – timeout | slow backend / judge | "Taking longer than usual" + Retry |
| Stale | showing cached data after failure | small "Showing saved data from 10:42" note |

**Process states**
| State | Example |
|---|---|
| Submitting / saving | button spinner + disabled, label "Saving…" |
| In progress (multi-step) | judging: Queued → Compiling → Running 3/6 → Done |
| Optimistic | note saved instantly, rolled back on error with toast |
| Success confirmation | toast "Saved" / inline ✓ |
| Locked / not yet open | "Opens Fri 10:00" with countdown |
| Deadline passed / closed | greyed card, "Closed" chip, view-only |
| Completed | ✓ chip, "View result" |
| Validation error | inline under the field, never a toast |

**Interaction states** (theme-level, every clickable element)
default · hover · focus-visible (keyboard ring) · pressed · selected/active · disabled · dragging (where relevant).

---

## Appendix B — References

- MUI agent skills (MIT): https://github.com/mui/material-ui/tree/master/skills
- Anthropic `frontend-design` skill (Apache 2.0): https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Material 3 spacing: https://m3.material.io/styles/spacing/overview (8dp scale, 4dp for small elements)
- Material 3 layout: https://m3.material.io/foundations/layout/understanding-layout/overview
- unDraw illustrations (free, no attribution, recolourable): https://undraw.co

---

## Appendix C — What Classes do today

A **class** (`classrooms` collection, join by code via `POST /api/classrooms/join`) currently does three things:

1. **Decides which assignments a student sees** — `visibleAssignmentsFor` (`student.controller.js:15-27`). An
   assignment with no classes attached is visible to everyone.
2. **Decides which exams a student sees** — `visibleExamsFor` (`exam.controller.js:115-130`), together with groups.
3. **Scopes faculty analytics** — class dashboards, at-risk students, per-course analytics.

It does **not** control courses, MCQ/aptitude tests or contests. **Groups** (`studentGroups`, faculty-made, can
mix branches) are invisible to students and only used for exam targeting.

So classes matter to faculty (targeting and analytics), but students get nothing from managing them — they only
type a join code once. Student records already contain `department`, `section`, `year` and `rollNo`
(`userRepository.js:2`), which makes automatic enrolment possible.

**Options**
- **A (recommended for now):** keep classes, auto-enrol students by department/year/section (or faculty CSV of roll
  numbers). Remove "My Classes" page; show class + groups ("batches") read-only in the My Class tile. Join code kept
  only as a fallback.
- **B (cleaner, later):** merge classes and groups into one "Batch" concept (a section is just one kind of batch).
  Touches faculty targeting and analytics → decide during the Faculty persona phase.
- **C:** keep today's behaviour, just move the join box into the My Class tile.

---

## Appendix D — NestJS (asked 2026-10-03)

Position unchanged from `Review_Feedback.md` item 18: **don't migrate now.** It's 100–160 hours for a
behaviour-preserving move with no visible change for students, while this plan is all visible change. The security
benefit (authorization that can't be skipped) is available in hours via item 20's central authorization helper +
CI check — do that instead, ideally before S11 adds the first public endpoint. Revisit NestJS when there is a second
backend developer or after T&P/Super Admin roles make the permission model significantly larger.
