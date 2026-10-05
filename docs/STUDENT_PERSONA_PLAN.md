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
| D1 | Illustrated home | ~~Tiles at the top of the dashboard~~ → **revised 2026-10-04 (D1b)**. |
| D1b | Illustrated home | Illustrated **Quick Access** tiles are their own **Home page at `/app`**, which is where a student lands after signing in. The dashboard keeps the statistics and nothing else. Reversed after seeing D1 built: the tiles competed with the numbers below them and made one page do two jobs. |
| D1c | Illustrated home | **No sidebar on Home** — a top bar, the six tiles, nothing else; the sidebar belongs to the screens reached from it, and the two are never shown together. Tiles follow CodeTantra's shape: illustration on a tinted panel, caption, then the name in a solid bar. Settled against the real screen rather than a description of it. |
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
| D16 | Practice vs. Courses | Not merged. Practice keeps its own identity — self-directed, weak-topic-aware — regrouped under a new **Workbench** section with Sandbox. Courses stays faculty-sequenced order. See S12. |
| D17 | Assignments vs. Practice | Not merged. Different governance — faculty-set deadline/grading vs self-directed, no deadline. A cross-link (a chip on a Practice row when it's also an active assignment) considered but not built. |

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

Home                 ← the six Quick Access tiles, the landing page (D1b)
Dashboard            ← statistics, deadlines, rank
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

## Backend track (runs alongside the persona phases)

Agreed 2026-10-03: upgrade the existing Express backend in place; **no NestJS rewrite** (Appendix D). Order:
**B0** safety net → **B3** central authorization → then B1/B2/B4/B5 folded into whichever persona phase touches
that code. Standing rule: any persona phase touching a backend route brings it up to standard (input validation,
central permission check, no full-collection reads, smoke-test coverage).

**B0 status (2026-10-04): landed, partly verified, emulator step paused.**
- Done and verified: backend ESLint (`npm run lint`, clean), startup configuration checks
  (`backend/src/config/env.js`), graceful shutdown on SIGTERM/SIGINT plus crash logging
  (`backend/src/server.js`), Dockerfile aligned to Node 22, `docs/credentials` gitignored.
- Done, **not yet verified**: running the smoke suite in CI against a Firestore emulator
  (`firebase.json`, `backend/tests/withEmulator.js`). The emulator needs Java, unavailable on the current
  machine, so the CI step is gated to manual (`workflow_dispatch`) and normal CI is unaffected.
- **Resume on the college machine:** install a JRE 17+, run the emulator suite locally, then remove the two
  `if: github.event_name == 'workflow_dispatch'` guards in `.github/workflows/ci.yml`.

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

**Goal:** the CodeTantra-style illustrated entry point the HOD asked for — built on the dashboard first, moved
to its own page at `/app` by D1b. Still with
**live information** on each tile (CodeTantra's tiles only say "Click here").

**Quick Access tiles (now the Home page, `/app`)** — 6 tiles, unDraw illustration (recoloured), title, one live line,
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
- ~~"Collapse quick access" toggle~~ — removed with D1b. It existed so the row could be hidden to reach the
  dashboard beneath it; on a page of its own there is nothing to hide, and the dashboard is one click away.
- *(superseded)* The toggle was remembered per user (localStorage, safe-wrapped) for students who preferred the
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
| S12 Workbench (Practice rework) | S | S10 (reuses `getSkills`), D16 |
| S13 Visual roadmaps + 20 roles | XL (new renderer + ~500+ nodes of writing, batched) | S9, D17, new dependency |

S3/S4 can run in either order; S6–S7 can move earlier if the problem page is the most urgent complaint.

---

## Phase S12 — Workbench (Practice becomes weak-topic coaching, grouped with Sandbox)

**Origin:** 2026-10-05 conversation. Started as "is Practice redundant with Courses?" — checked the real
data and found **every one of the 77 published problems is already inside a course (zero orphans)**, which
supports the instinct. But Practice is also the silent landing page for three other flows that already exist
and were built this week:

- Roadmap milestones link to `/app/problems?tag=<topic>` ("solve these to advance")
- Job-Ready Score's "next actions" link to `/app/problems?tag=<topic>` ("worth N points")
- Course and Mistakes empty-states point here as the "go find something to solve" fallback

So the page isn't unused — it's used constantly, just **anonymously**: every one of those links silently
pre-filters the table and the page gives no sign of why the student is there or what finishing it does for
them. That's the actual defect, not the page's existence.

**Decision: D16.** Practice is not folded into Courses. It keeps its own page and identity, regrouped under a
new **Workbench** nav section alongside **Sandbox** (names settled in conversation — "Workbench" umbrella,
"Practice" and "Sandbox" as the two children, unchanged labels for both so nothing a student already knows
breaks). Courses stays the place for faculty-sequenced order; Practice becomes the place for
**self-directed, weakness-aware** solving — two different jobs, not one duplicated.

### What changes

**1. Nav regrouping (frontend only, no backend change)**
- New section `"Workbench"` in `NAV_ITEMS` (`frontend-next/src/app/(student)/app/layout.tsx`), containing
  `Practice` (`/app/problems`, unchanged route) and `Sandbox` (`/app/sandbox`, unchanged route).
- Both currently sit under `"Learn"` next to Courses and Roadmaps — pulling them out leaves Learn as
  Courses + Roadmaps, which reads cleanly as "structured learning."
- No route changes, so no redirects needed and no link elsewhere in the app breaks.

**2. Practice page: weak-topics-first instead of catalogue-frequency**
- Today the topic chips are the **12 most common tags across the whole catalogue** — frequency, same for
  every student, disconnected from their own performance.
- Reuse `GET /api/student/skills` (`topicMasteryRepo` → `computeStrengthsWeaknesses`, already built, already
  gates on 3+ attempts per topic to avoid noise on thin data) to sort/badge topic chips by the student's own
  weakest-first, with their accept-rate shown (`"Sorting · 2/7 (29%)"` instead of a bare catalogue count).
- **Fallback for a new student with no mastery data** (the 3-attempt gate means weeks 1–2 have nothing): keep
  today's frequency-sorted chips until mastery data exists, so the page is never empty of guidance.

**3. Landing-with-context banner**
- When the page loads with `?tag=` (or in future `?source=roadmap:<id>` / `?source=jobready:<target>`) from
  an external link, show a one-line banner above the table: *"Practicing Sorting — finish this to advance
  your Java Developer roadmap"* or *"Practicing Sorting — worth 15 points on your Job-Ready Score"*, with a
  link back to where they came from.
- Requires the two link-producing call sites (`frontend-next/src/lib/queries/roadmaps.ts`'s `milestoneHref`,
  and the `nextActions` hrefs in `backend/src/services/jobReadinessService.js`) to add a `source` param to the
  URL they already build. Small, additive change at both call sites.
- No `source` param present → no banner, today's plain page. Nothing breaks for a cold nav click.

**4. Personal stats replace global stats in the table**
- `Accuracy` and `Solved` columns currently come from `problemStatsService` — platform-wide (what % of
  *everyone's* submissions were accepted). Says nothing about this student.
- Replace with the student's own signal: **Status** column already shows solved/unsolved (keep it); add
  **last attempted** (relative time, from their own submissions) where they have one, blank otherwise. Drop
  the global Accuracy/Solved columns — they belong on a faculty analytics view, not here.

**5. "Pick Random" → "Solve my weakest topic"**
- Today's button picks uniformly at random from whatever's currently filtered — no connection to anything.
- Replace with a button that, when no filter is active, jumps straight to a problem in the student's weakest
  topic (same source as the new chip sort); when a filter *is* active, keep today's random-within-filter
  behaviour, since that's still useful once a topic is chosen.
- Needs no new endpoint — `useSkillsQuery` already exists in `frontend-next/src/lib/queries/student.ts`.

**6. Quick Access tile**
- The "Practice" tile on Home (`QuickAccessGrid.tsx`) keeps its name and art; only its live line changes
  from streak-only wording to lead with the weakest topic when one exists:
  *"Sorting needs work · 2/7 solved"* in place of *"5-day streak · keep it going"* when a weakness is known,
  falling back to the existing streak copy otherwise.

### Explicitly not touched by S12
- The underlying problem catalogue, search, difficulty filter, and `/api/problems` route — all stay as-is.
- Sandbox itself — grouped differently, behaviour unchanged.
- The "Browse all problems" button on the empty/loaded Courses page — still points at `/app/problems` and
  still makes sense; Practice remains a legitimate destination, just a differently-purposed one.

### Size & sequencing
Mostly frontend (nav config, one page rework, two small backend-adjacent URL-param additions — no new
backend endpoints). Estimated **S** (one sitting): reuses `getSkills` and `useSkillsQuery`, which already
exist; the only genuinely new work is the context banner and the chip/button re-sort.

Suggested build order: (1) nav regroup — zero risk, ships alone if needed; (2) weak-topic chip sort + weakest-
topic button, using existing `useSkillsQuery`; (3) personal stats column swap; (4) context banner + the two
call-site `source` param additions, last because it touches files outside the Practice page itself.

**Shipped 2026-10-05**, on `feat/home-page`, all six items built in the suggested order. "Last activity"
(item 4) ended up sourced from two existing hooks already in `queries/student.ts` — `useSolvedHistoryQuery`
(solved_at) and `useMistakesQuery` (last_attempt_at) — merged into one per-problem map, so no new endpoint was
needed there either. Three things turned up during the build that weren't in the plan above:

- **A real bug, not just a missing feature.** `tag` state never actually read the `?tag=` URL param — it
  always initialised to `null`, and `searchInput` silently absorbed the tag string as free-text *search*
  instead. Every roadmap/Job-Ready link into this page has therefore been running a title-text search for the
  topic name, not an actual tag filter, since S9/S10 shipped. Fixed as part of this phase, since the banner
  work depends on the tag filter being real.
- **Difficulty words leak into the tags array** (an import-time data quirk also fixed on the public profile
  in S11) and were briefly showing up as a clickable "topic" — e.g. `easy (28)`. Excluded from the chip list
  the same way as S11.
- **`weaknesses` and `strengths` are not a partition** — `computeStrengthsWeaknesses` sorts the same attempted-
  topic pool two ways and slices each to its own top 5. With only 1–2 topics attempted (a new student, almost
  always), a 100%-accept topic can appear in `weaknesses` too, just last. Added a `genuineWeaknesses()` filter
  (`<60%` accept rate) in `queries/student.ts` so the "needs work" badge, the weakest-topic button and the
  Home tile line never flag a topic the student is actually good at. The underlying scoring utility
  (`backend/src/utils/topicScores.js`, shared by Skills/Job-Ready) was left alone — this is a display-layer
  fix, not a scoring-logic change, and out of scope here.

Verified: real-data browser walk (weak/strong topic seeded via `topicMasteryRepo.recordAttempt`, matching
production's own write path) confirmed the chip sort, the weakest-topic button landing on a real problem in
that topic, both banner variants (roadmap + Job-Ready) with working back-links, the dismiss control, and
"Solved 2 days ago" / "Attempted yesterday" rendering from real submission history — dark + light, 375px, no
console errors. `tsc` clean, 0 new lint warnings (97 baseline, unchanged), production build passes. Full smoke
suite: all failures traced to the documented Gemini free-tier quota (429/503), none in S12's own code paths.

---

## Phase S13 — Visual roadmaps (roadmap.sh-style graph) + 20 roles

**Origin:** 2026-10-05 conversation, continued. Two reference images shared: roadmap.sh's node-graph view
(yellow topic boxes, black checkpoint boxes, white annotation notes, connected by lines, grouped into
tracks) and roadmap.sh's `/dashboard` (a grid of role cards with progress). Ask: rebuild both screens to
that visual language, and grow the roster from 4 roles to **at least 20**.

**D17 (confirmed this session):** Assignments and Practice stay separate pages — different governance
(faculty-set deadline + grading vs self-directed, no deadline), not just a presentation overlap. Revisit
later only as a cross-link: a chip on a Practice row when that problem is also part of an active
assignment, not a merged list. Not built yet — parked.

**Also raised, not yet decided:** renaming "Tests" (the exam/aptitude/MCQ hub) to reduce collision with
"test" meaning test cases. Proposed "Assessments". **Not confirmed** — the conversation moved to roadmaps
before this was settled. Revisit separately; nothing renamed yet.

### Why this is a bigger lift than S9, and the honest constraint underneath it

S9 shipped 4 roadmaps as flat milestone lists — about 45 items of original writing, reusing an existing
visual pattern (a vertical rail of dots, the same shape Mistakes/dashboards already used). This ask is two
compounding changes at once: a content model that didn't exist (a *graph* — nodes, edges, groups — not a
list) and a renderer that doesn't exist (pan/zoom node-and-line canvas), **times five** the role count.

The platform's one real asset is that progress on a node is *verified* — solved against Judge0, not
self-ticked like roadmap.sh. That only works for nodes resolvable to judged coding problems. The catalogue
today is **77 problems across 21 topic tags — straight DSA**, nothing that could ever be judged for Cloud,
DevOps, SQL, Cybersecurity, UI/UX, or Android specifically (this is a code-execution platform, not a
cloud-config or design grader). So the 20-role list below is split honestly into two kinds of roadmap:

- **Code-judgeable roles** (12 of the 20): most nodes resolve to real tracked problems, same verified-
  progress story as today's 4.
  **Reading/checklist roles** (8 of the 20): coding nodes where they exist (most roles have *some* DSA/
  scripting component), everything else is an honest `reading`/`checkpoint` node with no fake percentage —
  the same "untracked, not 0%" rule S9 already established for non-code steps, just applied to more of a
  roadmap at once for these 8.

Stating this now rather than after 20 roadmaps are written, because it changes what "progress" means on a
third of the roster — worth deciding on purpose, not discovering after the fact.

### 1. Content model — JSON schema extended from a list to a graph

Backward-compatible extension, not a replacement: a purely linear roadmap is just a graph with one group
and a straight chain of edges, so the 4 existing roadmaps' *writing* (title/why/practice/reading per step)
carries over unchanged — only the structural wrapper changes, in Phase B below.

```jsonc
{
  "id": "java-developer",
  "role": "Java Developer",
  "tagline": "...",
  "summary": "...",
  "forWho": "...",
  "groups": [                                   // vertical/horizontal tracks, like roadmap.sh's swimlanes
    { "id": "foundations", "label": "Foundations" },
    { "id": "core", "label": "Core Java" }
  ],
  "nodes": [
    { "id": "n1", "type": "topic", "group": "foundations", "title": "Java syntax & basics",
      "why": "...", "practice": { "modules": ["basics"], "tags": ["programming basics"], "count": 12 } },
    { "id": "n2", "type": "checkpoint", "group": "foundations", "title": "Build: 10 small programs",
      "why": "..." },
    { "id": "n3", "type": "note", "attachTo": "n4",
      "text": "Skip this if you already know OOP from C++." },
    { "id": "n4", "type": "topic", "group": "core", "title": "Object-oriented programming", "mcq": ["technical"] }
  ],
  "edges": [{ "from": "n1", "to": "n2" }, { "from": "n2", "to": "n4" }]
}
```

- Three node types, matching the reference image exactly: **topic** (resolves to practice, same matcher as
  today), **checkpoint** (a project/milestone marker, untracked), **note** (a side annotation, no progress,
  points at the node it comments on).
- **No true OR-branch routing in v1.** roadmap.sh's own branches are mostly "pick a backend language" —
  moot here, since that choice is already *which roadmap* a student follows (Java Developer vs a future
  Backend Developer roadmap), not a fork inside one roadmap. Groups give the visual "multiple tracks" look
  without the engineering cost of real branch-aware progress logic. Flagged as a decision, not slipped in
  silently — say if you actually want in-roadmap branching and it changes the resolver's shape.
- `roadmapService.js`'s matcher (`poolFor`, `tagMatches`, `moduleMatches`) does not change in kind — it
  already resolves one step against the catalogue by tag/module. It generalises from "per milestone" to
  "per node," which is the same function running more times, not a rewrite.

### 2. Renderer — a real dependency addition

Nothing in the current stack draws a node-and-line graph. Needs **`@xyflow/react`** (React Flow) for the
canvas, nodes, pan/zoom, edges, plus **`dagre`** for automatic top-to-bottom layout from the groups/edges
above — hand-building either is its own multi-week project, and both are the standard choice for exactly
this (roadmap.sh itself is hand-rolled SVG, which is why its source is thousands of lines per roadmap; a
layout library is the difference between that and a maintainable one).

This is a **new frontend dependency** — per standing practice, a clean `npm ci` runs locally before it's
pushed, and it's called out here rather than added quietly.

- Custom node components in our tokens/palette, not roadmap.sh's yellow (same "recoloured to our brand"
  rule as the unDraw illustrations, D2).
- Node click → a **side panel** (matching the reference exactly), not a straight jump to the module: shows
  why/progress/next-problems/reading, with the jump-to-module or jump-to-Practice action inside it. This
  settles the open question from the earlier round.
- **Mobile gets the list view, not the graph.** A pan/zoom canvas does not work below ~768px — this was
  already the plan (S9/S12 era decision), restated here: same data, rendered as today's vertical rail on a
  phone, the graph only on a wide enough screen.

### 3. The roadmap list page → roadmap.sh's `/dashboard` card grid

`/app/roadmaps` becomes a grid of role cards — icon, role, one-line tagline, a progress ring or bar,
"Continue" wording when a student has started one — grouped the way roadmap.sh's own directory is:
**Role-based** and **Skill/Domain-based**, as two labelled sections on the same page rather than a flat
list of 20, so the page stays scannable.

### 4. Proposed 20 roles — grounded in this college's placement reality, not a generic list

Kept the 4 that already exist; added 16, chosen for what an Indian engineering college's recruiters
actually ask for, not roadmap.sh's general software-industry list. Marked **[reading-heavy]** where the
catalogue genuinely can't verify progress by code execution.

**Role-based (12)**
1. Service-Company Placement *(have)*
2. **Product-Company Placement** *(new)* — harder DSA, intro system design, behavioural rounds; the
   counterpart to #1 for TCS/Infosys-tier vs Amazon/Flipkart-tier drives.
3. Java Developer *(have)*
4. Python / Data Analyst *(have)*
5. **Full Stack Web Developer** *(rework of today's "Web Developer")* — explicit MERN-ish path.
6. **Frontend Developer** *(new, split out)* — today's Web Developer roadmap is full-stack-leaning; this
   is the narrower, faster path some students specifically ask for.
7. **Backend Developer (Node.js)** *(new)* — Java Developer already covers the Java-specific backend path;
   this is the JS-stack equivalent.
8. **Android Developer** *(new)* **[reading-heavy]** — Kotlin/Android SDK has no code-judge equivalent
   here; DSA nodes stay tracked, the Android-specific ones are reading/checkpoint.
9. **Data Scientist / ML Engineer** *(new)* — Python nodes tracked, ML-library nodes reading-based.
10. **DevOps Engineer** *(new)* **[reading-heavy]**
11. **QA / Test Automation Engineer** *(new)* — scripting nodes trackable, tooling nodes reading-based.
12. **DSA Mastery / Technical Interview Prep** *(new)* — language-agnostic, pure problem-solving track for
    any branch, the "I don't know what role yet, just make me interview-ready" option.

**Skill/Domain-based (8)**
13. **C++ & Competitive Programming** *(new)* — large existing culture in Indian CS depts, distinct from
    "Service-Company Placement"'s breadth-first approach.
14. **SQL & Database Engineer** *(new)* **[reading-heavy]** — no SQL judge on this platform yet.
15. **Cloud Engineer (AWS fundamentals)** *(new)* **[reading-heavy]**
16. **Cybersecurity Fundamentals** *(new)* **[reading-heavy]**
17. **Flutter / Cross-Platform Mobile** *(new)* **[reading-heavy]**
18. **Go Developer** *(new)* **[reading-heavy, confirmed]** — checked `submissions.routes.js`:
    `ALLOWED_LANGUAGE_IDS` does not include Go (id 60), even though `languages.ts` has a label for it. A
    student cannot submit Go today, so this roadmap's DSA nodes would need to route through Python/Java/
    C++ instead ("practice the algorithm in a language you can submit, apply it in Go yourself") rather
    than claim tracked Go progress that doesn't exist. Worth enabling Go server-side separately if this
    roadmap matters enough — a small, unrelated backend change, not part of this plan.
19. **GATE / Higher Studies** *(new)* — reuses the `GATE / Higher Studies` track **already defined** in
    `backend/src/config/placementTracks.js` for the Job-Ready Score; mostly algorithms/complexity/core CS,
    genuinely DSA-trackable.
20. **UI/UX for Developers** *(new)* **[reading-heavy]**

This list is a proposal, not a commitment — the easiest, cheapest point to change it is now, before any
node is written. Swap, drop, or reorder before Phase C starts.

### 5. Sequencing — foundation once, content in reviewable batches

Authoring ~20 roadmaps at 25–35 nodes each in one pass repeats the exact mistake the original S9 plan
explicitly avoided ("build one, review, then do the rest") — at 5× the roster the cost of a template being
wrong before anyone looks at it is also 5×.

| Phase | What | Why this order |
|---|---|---|
| **A — Foundation** | Graph JSON schema; `roadmapService.js` generalised to per-node; React Flow + dagre renderer with the 3 node types; side panel; mobile list fallback; `/app/roadmaps` restyled to the card-grid dashboard. | Built once, proven against real (already-approved) content next — not new content on an unproven renderer. |
| **B — Reauthor the 4 existing roadmaps** onto the new schema | Mechanical restructure of already-written content into nodes/groups/edges — the writing doesn't change, the wrapper does. | Lowest-risk way to see the real renderer against real data before committing to 16 more. **Stop here for review.** |
| **C — Author the 16 new roles, in batches of 4–5** | Each batch reviewed before the next starts. | Same lesson S9 already taught: a wrong template costs less caught at batch 1 than at batch 4. |

Suggested first batch for Phase C (highest placement demand, most code-judgeable, lowest risk): Product-
Company Placement, Full Stack Web Developer, Frontend Developer, Backend Developer (Node.js), DSA Mastery.

### Open for you to confirm before Phase A starts
1. The 20-role list above — keep as proposed, or swap any entries first.
2. No in-roadmap branching (groups only) — confirmed approach, flag if you actually want real forks.
3. Side panel on node click (not straight-to-module) — confirmed approach from the earlier open question.
4. New dependency: React Flow (`@xyflow/react`) + `dagre` — flagging, not really optional given the ask.
5. ~~Go/Judge0 language support~~ — checked: Go is not enabled server-side today. Either accept the Go
   roadmap as reading-plus-borrowed-practice (above), or enable Go in `ALLOWED_LANGUAGE_IDS` first as a
   small separate backend change. Your call, not blocking the rest of S13.

**Phase A — shipped 2026-10-06.** Schema, resolver, graph canvas (3 node types, side panel), mobile list
fallback, and the list page restyled toward the roadmap.sh dashboard look (progress ring, Start/Continue/
Review). One roadmap (Java Developer) converted as the proof vehicle; the other 3 legacy roadmaps and the
16 new roles are still ahead in Phases B and C. Two decisions settled during the build, both matching what
was proposed above: groups-only (no real branch routing), side panel on click. Group labels are authored
and returned by the API but not yet drawn as their own swim-lane header on the canvas — dagre ranks by
edges alone for now; a real visual improvement, deliberately deferred rather than rushed into this pass.
New dependency landed: `@xyflow/react` + `dagre` (pre-existing vulnerability count unchanged — checked
against `main` before and after, neither of the two new packages is implicated).

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
