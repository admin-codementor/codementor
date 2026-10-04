# CodeMentor — Project Log

Daily record of what was worked on, newest first. One entry per day: area, what was done, decisions, next step.
Persona work order: Student → Faculty → HOD → T&P → Admin → Super Admin.

---

## 2026-10-04 (Sun) — part 13
**Area:** Student persona — B3 authorization, S10 Job-Ready Score, S11 shareable profile
**Did — B3 (landed first, because S11 opens the first public endpoint):**
- `publicRoute(reason)` + a route audit that walks the mounted Express app. A route mounted without
  `protect` fails silently — it works, for everyone, and looks exactly like one that was meant to. Now a route
  must be guarded or declared, `npm run check:routes` prints the open surface, and a suite fails on anything new.
- **It immediately found 12 open routes.** Checked each: sign-in, 2FA verify and `/health` are correct;
  `/api/problems*` is open by design (documented in the route file, serves titles/tags only, no test cases);
  `/api/submit*` and `/api/submissions` use deliberate optional auth. All 12 now carry a written reason.
  **Two are worth your decision** — see "Open questions" below. Nothing was silently re-architected.
- Express 5 keeps a mount path only inside a compiled matcher, and `protect` is an anonymous arrow with
  `fn.name === ''` — matching on the name reported all 156 routes as unguarded. Fixed by comparing by reference
  and recording mount paths at `app.use` time (`tests/routeAudit.js`).
**Did — S10 Job-Ready Score:**
- A score per target (Service companies · Product companies · your roadmap role) with **the workings shown**:
  each component's own 0–100, its weight, the raw figures, and what would raise it. `/app/placement` is now the
  Job-Ready Score page; the menu entry says "Job-Ready" and the old URL still works.
- "Your next three things", ranked by **weight × gap** so a student is not sent to fix a 5-point component while
  a 35-point one sits at zero.
- "+N this week" is the same computation re-run over the data as it stood seven days ago — no stored snapshot to
  drift, and nothing new to remember to write.
- **Fixed a long-standing bug this exposed:** `placementTracks.js` says "array"/"hashmap" while real problems are
  tagged "arrays"/"hashing", so the literal lookup matched almost nothing and the placement page has been
  under-reporting every student's topics. Topics now carry aliases and match through `tagMatches`.
**Did — S11 shareable verified profile:**
- `/u/<handle>` — off by default, student picks a handle and publishes, unpublishing 404s the link immediately.
  Handles are their own collection so uniqueness is the document id and the public read is a single get.
- **Verified-only (Q-F).** An external account appears only after the student proves it is theirs by putting a
  one-time `CM-XXXXXXXX` code in their Codeforces or LeetCode profile text, which we read back. Platforms we
  cannot read back say so and can never appear. Changing a handle clears its verification.
- No email, phone, roll number or section. The response is assembled field by field rather than by spreading a
  user document and deleting things, so a field added to users later cannot leak. `X-Robots-Tag: noindex` plus
  page metadata, a 30/minute rate limit, and the same 404 for "no such handle" and "not published" so the
  endpoint cannot be used to discover handles.
- Leaderboard names link to a profile only when that student published one.
**Found by checking in a browser, not by tests:**
- The score's components summed to 60 under a headline reading 59 — each contribution was rounded for display
  while the total was computed exactly. On a page whose whole claim is "no black box", that is the one thing it
  cannot do. The total is now the sum of the displayed figures.
- "easy" and "medium" were showing as two of a student's **strongest topics** on the public profile, because
  imported problems are tagged with their own difficulty.
- The publish switch sat in its old position for a second before jumping; now optimistic, and it reverts on
  failure.
- The activity grid opened scrolled to a year ago — the least interesting end of it.
**Verified:** browser walk of the score page (workings expanded and re-added by hand), the public profile logged
out in dark + light at 1280px and 375px with no overflow, the publish/unpublish round trip against the live
endpoint, and the leaderboard link appearing for exactly the one published student. Full suite **349 passed,
5 skipped**; `tsc` clean, production build passes, 0 lint errors. Probe student, its 29 submissions and its
handle all deleted afterwards.
**Open questions for you (B3 found these; I did not change them):**
1. `POST /api/submit` runs code for an **anonymous** caller. Rate-limited by IP, but it spends Judge0 capacity.
   Lock it to signed-in users?
2. `GET /api/problems` serves the whole catalogue (titles, tags, difficulty) to anyone. Deliberate, and nothing
   depends on it — but a college may want its question bank private.
**Branch:** `feat/student-persona` — still not pushed. S0–S11 complete.

---

## 2026-10-04 (Sun) — part 12
**Area:** Student persona — S9 Roadmaps
**Did:**
- **Four career roadmaps** (Q-D): Service-Company Placement, Java Developer, Python / Data Analyst, Web
  Developer. 10–11 milestones each, our own writing, stored as data (`backend/src/data/roadmaps.json`), with
  `GET /api/roadmaps`, `GET /api/roadmaps/:id` and `PUT /api/student/active-roadmap`.
- **Content is matched to the catalog, not hard-wired to it.** A milestone says what it is about ("two
  pointers", "hashing"); the resolver finds this college's matching course modules and tagged problems. So
  progress fills in from work already done — a student with 12 solves opens the placement roadmap at **30%**,
  not 0% — a college that imports its own problems gets working roadmaps for free, and renaming a course cannot
  silently empty a milestone. Targets are capped at what exists, so a thin topic cannot strand a roadmap at 90%.
- **Steps we cannot verify say so.** Reading and test milestones are listed in the path but report `tracked:
  false` rather than 0%, and the UI says why. Claiming to measure whether someone read the Spring docs would
  make the whole number meaningless.
- **Seeded Firestore is optional.** The API serves the bundled JSON when the `roadmaps` collection is empty, so
  a fresh deployment has all four without a seed step; `scripts/seed-roadmaps.js` moves them into Firestore when
  they should become editable.
- Roadmaps added to the Learn menu; the dashboard tile now follows the chosen roadmap
  ("Java Developer · 35%") instead of pointing at Placement, and the Tests tile points at `/app/tests`.
- **Course pages take `?module=`**, so a milestone opens the module it covers and scrolls to it.
- New smoke suite: 26 checks. Full suite **302 passed, 5 skipped** (same rate-limited AI/import skips).
**Found by checking in a browser, not by tests:**
- **The roadmap total double-counted.** "17 of 56 problems" for a student who had solved 12 — steps legitimately
  share problems, so the sum over milestones is a weighting, not a count. The UI now reports the percentage and
  "Step 1 of 9"; per-step counts stay exact. A new `currentStep` field carries the position (derived from where
  the student is, not from how many steps are finished, which is wrong if they go out of order).
- **A bad roadmap URL rendered a permanently blank page.** React Query paused the retry in
  `fetchStatus: "paused"` because its online-manager believed the browser was offline — with
  `navigator.onLine === true`. No data, no error, nothing on screen, forever. Fixed app-wide in `queryClient`:
  `networkMode: "always"`, plus no retry on 4xx. This affected **every** React Query page, not just roadmaps.
- Two wording fixes: a caption pointing "below" at something above it, and a loading skeleton shorter than the
  card it stood in for.
**Verified:** browser walk of all four roadmaps (dark + light, 1280px + 375px, no horizontal overflow), the
follow/unfollow round trip, the module deep link, the 404 path, external links carrying
`rel="noopener noreferrer"`, console clean. `tsc` clean, production build passes, 0 lint errors (99 pre-existing
warnings in untouched files). Probe student and its 12 seeded submissions deleted afterwards.
**Next:** S10 Job-Ready Score, then S11 shareable profile (B3 authorization helper must land before S11).
**Branch:** `feat/student-persona` — still not pushed.

---

## 2026-10-04 (Sun) — part 11
**Area:** Student persona — S8 sweep (partial)
**Did:**
- **Contests are gone from the student experience.** `/app/contests` now redirects to the dashboard; the menu
  entry, dashboard rating card and leaderboard tab went in S1.
- **Three more pages stopped swallowing failures.** Placement and Classes used `.catch(() => {})`, so a failed
  request rendered as "No track data available" / "No classes yet" — a student would read that as *they* have
  nothing, not that the page broke. Both now show the S0 error state with Retry.
**Deliberately NOT done, and why:**
- **Deep contest removal.** Contests touch 15 backend and 12 frontend files, and the Elo rating they feed also
  drives the badge on student profiles, the faculty views and `judgeService`. Ripping that out safely is its own
  piece of work with its own verification, not a footnote at the end of a long session. The student-facing
  removal the user asked for is complete; the machinery is dormant and documented.
- **Flipping the design lint rules from warning to error.** 99 warnings remain across faculty and IDE pages that
  no phase has touched yet. Flipping now would turn a clean build red for files nobody has swept.
- **Moving the remaining `useEffect`+axios pages onto React Query**, and **auto-enrolment for classes** (D5).
  Both are real work still outstanding.
**Verified:** production build passes, `tsc` clean, no lint errors.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 10
**Area:** Student persona — S7 results panel
**Did:**
- **Fixed a wrong number students were being shown.** "X of Y hidden test cases passed" counted Y from the
  results that came back, but ACM scoring stops at the first failure — so a problem with 3 hidden cases that
  failed early reported "0 of 0". The judge now counts shown/hidden **before** judging and returns
  `public_total`/`hidden_total`. Verified live: a failing submission correctly reads **"0 of 3 hidden test cases
  passed"** when only one case ever ran.
- **Errors look like a terminal.** Compile and runtime output was buried inside a collapsed test-case row. It now
  has its own panel: monospaced, dark in both themes, the compiler's own text verbatim, with a heading that says
  what kind of failure it is and a **clickable "line 1"** that jumps the editor to that line. Line numbers are
  parsed server-side (gcc/clang, javac, Python, Java stack frames) so the problem page and exam screen agree.
- Suppressed the duplicate copy of that same output in the test-case row below (verified: the text appears once).
- Success summary now shows the server's average time alongside the maximum.
**Verified live** against the real judge with deliberately broken Python: the backend returned
`{kind: "runtime_error", line: 1, text: "…SyntaxError: invalid syntax"}`, `public_total: 2`, `hidden_total: 3`,
and the page rendered the terminal, the clickable line, and the corrected counts.
**Next:** S8 — sweep, and remove contests.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 9
**Area:** Student persona — S6 problem page
**Did:**
- **Fixed the real cause of "next problem is too hard".** Prev/next called an endpoint that walked **every
  published problem in creation order**, so "next" from problem 2 of a Java module landed on an unrelated problem
  23 of 77. The endpoint now takes a context (`?course=&module=` or `?assignment=`) and walks that list instead.
  Verified: the same problem reads **2/22 "Basics"** with context and 23/77 without, and the arrows keep the
  context as you move.
- **Each control appears once.** Removed the bottom action bar that duplicated Submit, Prev, Next and Reset —
  Run/Submit live in the header, navigation beside them, Reset in the editor toolbar. Verified in the browser:
  Submit 1, Run 1, duplicate Prev/Next 0 (was 2 of each).
- **Logo goes home** (`/app/dashboard`) instead of the problem catalogue, matching every other screen.
- **Title shows difficulty** alongside it, properly aligned and ellipsised.
- **Timer earns its weight when it matters**: under proctoring it's a large amber countdown that stays visible on
  a phone; in ordinary practice it stays a quiet chip — a stopwatch counting up while someone is thinking is
  pressure they didn't ask for.
- **Copy/paste blocking is now silent**, as decided. The banner ("Pasting is turned off here…") is gone; the
  keystroke simply does nothing, and the attempt is still logged for faculty. Verified: dispatching a paste
  produces no banner.
**Next:** S7 — the results panel.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 8
**Area:** Student persona — S5 Tests hub + proctoring as a switch
**Did:**
- **One Tests hub** at `/app/tests` with tabs **Exams | Aptitude | Technical MCQ**, replacing two separate menu
  entries. Aptitude and Technical were already the same `mcqTests` collection split by category, so one panel
  serves both; multi-section Exams keep their own panel. The tab lives in the URL (`?tab=technical`) so it can be
  linked and survives a refresh. `/app/exams` and `/app/aptitude` redirect, so old links keep working.
- **Proctoring is now a switch, not a type.** An assignment's `isExam` flag both marked it "an exam" and turned on
  monitoring. It's now `proctored`, off by default, set by a "Require proctoring" toggle faculty already had.
  Students see a **"Proctored"** chip and a "Start (proctored)" button — an assignment is coursework whether or
  not it's watched; real exams live under Tests.
- **No data migration.** Every reader (`examLock`, `cidrCheck`, analytics, the student and faculty endpoints)
  takes `proctored ?? isExam`, and writes keep both fields. Existing assignments behave exactly as before, and
  there was no risky one-off script against live data.
**Verified in the browser:** hub tabs switch and filter correctly (Aptitude shows verbal/logical/aptitude,
Technical shows only technical), the URL syncs, `/app/aptitude` redirects to the right tab, and the old Exams and
Aptitude menu entries are gone.
**Test note:** fixed a flaw in my own S3 suite — two seeded attempts shared a timestamp, so "the latest attempt"
depended on Firestore's return order and the check failed intermittently. Also hit two environmental failures
while re-running the suite repeatedly: the Gemini free-tier quota (429) and the problem-import rate limiter. Both
are the suite tripping real protections, not regressions; every exam and assignment suite passed throughout.
**Next:** S6 — problem page layout.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 7
**Area:** Student persona — S4 course/module progress + scoped leaderboard
**Did:**
- **Leaderboard is now scoped**: My class / Department / College. A single platform-wide board told a student in a
  class of 60 they were 400th, which is nothing they can act on. "Class" = their own department **and** section.
  The caller's own row is returned separately so it stays pinned even when they're outside the visible page —
  verified with a student ranked last (#8 of 8) still seeing themselves.
- **Dashboard rank follows suit**: shows **Class Rank "#8 of 8 in your class"**, falling back to the overall rank
  when a student has no department/section.
- **Module progress is computed server-side** and returned by both `/api/courses` and `/api/courses/:id`, so the
  list, the course page and the dashboard can't disagree. Each module carries solved/total/percent, due date and a
  status (not started / in progress / done / overdue). The course page's client-side total calculation is gone.
- **Per-module due dates**: faculty can set one via `PATCH /api/faculty/courses/:id/modules/:moduleId`
  (`due_at`, null clears it). The course list shows "1 module overdue" or the next due module; the course page
  shows "Overdue — was due 3 days ago" per module.
- **"Next up"** on the course page jumps to the first unsolved problem, and that module opens by default rather
  than always the first.
- Leaderboard ranking also moved off `listAll()` onto the field-masked read, so it no longer downloads every
  student's source code.
**Test coverage:** new suite (22 checks) that seeds four students across two sections and two departments and
asserts the scoping is real — class 2 ⊂ department 3 ⊂ college 50, ordering by solves, the pinned row, an unknown
scope falling back to college, and that module percent/status agree with their own counts.
**Verified in the browser** (temporary student row + due dates, both removed afterwards): scope switching
(8 in class → 47 in college), the pinned "You" row at #8, "Next up: Basics", "1 module overdue" on the list,
"Overdue — was due 3 days ago" on the module, and "CLASS RANK #8 of 8".
**Full suite: 285 passed, 0 skipped** (was 254).
**Next:** S5 — Tests hub (Exams | Aptitude | MCQ) and assignment proctoring as a faculty switch.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 6
**Area:** Verifying S0–S3 in a real browser, and fixing what it found
**How:** signed in with a throwaway dev token (the same mechanism `tests/harness.js` uses) against the running
dev server, seeded three submissions, checked every page, then deleted the seeded data and the session. No real
account was touched.
**Five real bugs found — none of which the tests or the build caught:**
1. **UTF-8 corruption I had introduced.** Two PowerShell file-splices rewrote `dashboard/page.tsx` and
   `leaderboard/page.tsx` as ANSI, mangling every em dash, middle dot, `×` and `…` — including text students see
   ("Search students…", the `·` separators, the rank placeholder) — and adding a byte-order mark. Repaired both
   files and confirmed no mojibake remains anywhere under `src/`.
2. **Overdue work counted as "due this week."** The Quick Access tile used `deadline - now <= 7 days`, which is
   also true for *past* deadlines, so six overdue assignments read "6 due this week · next overdue". Overdue and
   upcoming are now counted separately, and the wording says "6 assignments overdue".
3. **A live exam was labelled "Overdue."** Due Soon used the exam's *start* time with assignment deadline wording,
   so an exam you could still sit said you'd missed it. It now reads "Live now".
4. **A live exam was buried** beneath five long-overdue assignments, because the list sorted purely by date. Work
   you can still make now sorts ahead of work already missed.
5. **The new-user dashboard still said "Upcoming Assignments"** and used the old assignments-only list, so new
   students saw different wording from everyone else. It now uses the same Due Soon data.
**Verified working end to end:** Quick Access tiles with live data; nav (Contests and My Classes gone, Mistakes
added, Practice reachable); logo → dashboard; Recently Solved showing only the accepted problem; the retry teaser;
Due Soon; Profile "Solved" tab excluding failures; the Mistakes notebook with plain-language verdicts
("Too slow — hit the time limit"), topic chips, Try again, and a note that saves and survives a reload. Dark mode
and 375px both clean, no console errors.
**Lesson:** verification found five user-visible bugs after four phases where `tsc`, lint, a passing build and 254
API checks had all gone green. Browser checks belong in every phase, not at the end.
**Next:** S4 — course → module progress with due dates, and the scoped leaderboard.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 5
**Area:** Student persona — S3 solved-only everywhere + Mistakes notebook
**Did:**
- **Profile → "Submissions" tab is now "Solved".** It was a submission log with Accepted/Failed filters. It now
  lists the problems the student has actually solved (title, difficulty, language, runtime, date), searchable by
  title or topic. Backend: new `GET /api/student/solved`.
- **Problem page → "Submissions" tab is now "My solution"**, showing accepted attempts only. When the problem
  isn't solved it says so plainly instead of listing failures.
- **New Mistakes notebook** (`/app/mistakes`, in the menu under Progress): problems attempted but not yet solved,
  with attempt count, when it was last tried, **what went wrong in plain words** ("Crashed while running", not
  "Runtime Error (SIGSEGV)"), topic chips and a Try again button. Each entry takes a private note
  ("forgot the empty-array case"). Problems leave the list automatically once solved.
  Backend: `GET /api/student/mistakes`, `PUT /api/student/mistakes/:problemId/note`, and a `mistakeNotes` store.
- Dashboard shows a one-line teaser ("3 problems waiting for a retry") linking to the notebook.
- `/app/submissions` still redirects, so old links keep working.
**Why this shape:** the user's rule is that students see correct, final submissions only. Failed attempts aren't
deleted or hidden from faculty — they're moved somewhere there's something to *do* about them.
**Test coverage:** the student suite grew to **28 checks**, including that a note is private (another student
never sees it), an emptied note is removed, and an over-long note is rejected. Full suite **254 passed** (was 240),
5 skipped (AI quota — pre-existing). `tsc`, lint and production build clean.
**Still not verified in a browser.** The pages need a logged-in student and the browser pane has no session. Also
discovered the frontend dev server can only run once per directory — yours is already on port 3000, so the
preview now points there rather than starting a second one.
**Next:** S4 — course → module progress with due dates, and the scoped (class/department/college) leaderboard.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 4
**Area:** Student persona — S2 dashboard body (first phase with backend work)
**Did:**
- **"Recent Submissions" → "Recently Solved."** The dashboard listed the last 5 submissions *including wrong
  answers and errors*. It now lists one row per problem actually solved, newest first, with the accepted attempt
  only (backend: `recentSolved` replaces `recentSubmissions` in `/api/student/dashboard`). Faculty views are
  untouched — they still see every attempt.
- **Fixed a misleading stat.** The card labelled "Class Rank" ranks the student against *every student on the
  platform*, not their class. Relabelled "Overall Rank · Across all students" and made it link to the leaderboard.
  Real class/department scoping comes with S4; until then the label tells the truth.
- **"Due Soon" replaces "Upcoming Assignments"** — assignments and exams in one deadline-sorted list, so "what's
  next" no longer means checking two screens.
- **Problem of the Day now comes from the backend.** It used to fetch the first 50 problems plus the solved list
  and pick in the browser, so the "daily" problem could only ever come from page one. The existing
  `/api/student/daily-challenge` endpoint (previously unused) now also reports whether the student solved it —
  one request instead of two, chosen across the whole catalogue. Deleted the dead client-side picker.
- **Performance fix:** the rank calculation called `listAll()`, downloading **every student's source code** on
  every dashboard load. Switched to the field-masked `listAllForAnalytics()` — same numbers, a fraction of the read.
- **Added backend test coverage** (`tests/suites/studentDashboard.js`, 14 checks). It seeds real submissions and
  asserts the product rule, not just a 200: a problem solved twice appears once, the latest accepted attempt wins,
  an attempted-but-unsolved problem never appears, and no verdict leaks back to the student.
**Verified:** full smoke suite **240 passed** (was 226), 5 skipped (AI quota — pre-existing). `tsc`, lint and
production build clean.
**Not yet verified:** the dashboard rendered in a browser with a logged-in student — still needs a sign-in.
**Deferred to S4:** the class leaderboard snippet, which needs the scoped leaderboard to exist first.
**Next:** S3 — solved-only everywhere (profile + problem page) and the Mistakes notebook.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 3
**Area:** Student persona — S1 Quick Access tiles + navigation
**Did:**
- **Quick Access row on top of the dashboard** — six illustrated tiles (My Learning, Assignments, Tests, Practice,
  My Class, Roadmaps), each with a **live line** rather than CodeTantra's static "Click here": current course and
  percent, what's due this week, the next exam, streak, class and rank. Built from endpoints we already call, so
  no backend work. Collapsible, remembered per browser.
- **Navigation reshuffled** by what the student is doing: Learn (Courses · Practice · Sandbox) / Work (Assignments ·
  Exams · Aptitude) / Progress (Leaderboard · Placement) / AI Tutor. **Practice (`/app/problems`) was previously
  unreachable from the menu** — now it isn't.
- **The logo now links home.** It was inert. Also fixed its own 24px radius bug (`borderRadius: 2` on a 36px tile).
- **Contests removed from the student experience:** menu entry, the dashboard "Contest Rating" card (replaced with
  Courses Completed) and the "By Rating" leaderboard board are gone. The page and backend stay until S8 does a
  dependency check, so no staff tooling breaks today.
- **My Classes** left the menu; the My Class tile links there instead. The join-by-code page deliberately still
  works, because auto-enrolment (D5) isn't built yet — removing it now would strand students who need to join.
- Dashboard failures now use the S0 error classification instead of a hardcoded "check your connection".
**Illustrations — changed from the agreed plan:** unDraw turned out not to fit. There's no reliable way to fetch
them programmatically, and it only recolours **one** accent, leaving dark navy figures that read as a smudge on our
dark theme. Drew six flat SVGs in one visual language using palette variables instead, so they follow light and
dark properly. Swapping in unDraw files later is a drop-in change if preferred.
**Bug found and fixed while verifying:** MUI's `Collapse` kept its height here, so hiding the row left an empty
gap. Replaced with a plain conditional render.
**Verified:** tiles show correct live lines and links; toggle collapses and persists; light and dark both correct;
no horizontal page scroll at 375px (the row scrolls sideways instead); `tsc`, lint and production build clean.
**Not yet verified:** the dashboard and sidebar with a real logged-in student — needs a sign-in.
**Next:** S2 — dashboard body (Recently Solved, real class rank, due-soon). First phase needing backend work.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 2
**Area:** Student persona — S0 design foundations
**Did:**
- **Fixed the corner-radius trap:** added a `radius` token set of CSS strings. A bare number in `sx`
  (`borderRadius: 2`) is multiplied by the theme radius of 12 and renders **24px**, not 8px — the main reason
  corners looked inconsistent across ~20 student-page call sites.
- **Added `layout` and `touchTarget` tokens** (page gutter, section gap, card padding, prose width, 40/48px hit
  sizes) and pointed `AppShell` at them instead of hard-coded values.
- **Built the full state kit:** `DataState` (loading → error → empty → content, in that fixed order, so a failed
  request is never shown as "nothing here"), `classifyApiError` (offline / server / forbidden / notFound / timeout /
  unknown — each with its own wording, and **Retry only when retrying can help**, never on 403/404), `EmptyState`
  variants (first-use / filtered / nothing-assigned), `InlineError` for one failed section, `StaleBanner` for a
  failed refresh, and six content-shaped skeletons.
- **`InteractiveCard`:** one hover / focus / pressed / selected / disabled treatment. MUI's `Card` has no hover
  style at all, which is why every page invented its own. Renders a real link or button, so keyboard works.
- **Lint guards** for the three drift causes: numeric `borderRadius` in `sx`, hard-coded `fontSize`, raw colours.
  Warnings for now (98 existing cases), flipping to errors after the S8 sweep. `theme/` is exempt.
- **`/dev/states` gallery** — every state, light and dark. This is the review surface.
- **Wrote `.claude/skills/codementor-ui/SKILL.md`** (the binding project UI rules, beats the vendored MUI skills)
  and rewrote the matching DESIGN.md sections.
**Two real bugs found and fixed while verifying in the browser:**
- The "timed out" state showed the offline message, because a timeout has no server response and fell through to
  the generic network text.
- `StaleBanner` broke hydration — the server renders "10:02 am" and the browser "10:02 AM".
**Verified:** `tsc` clean, production build passes, no lint errors, gallery renders in light and dark, 403/404
correctly offer no Retry, the interactive card toggles, no horizontal scroll at 375px, no hydration errors.
**Note:** existing pages are not restyled yet — S0 is foundations. Visible change starts at S1.
**Next:** S1 — illustrated Quick Access tiles on the dashboard, new menu, logo → home, Contests removed.
**Branch:** `feat/student-persona`

---

## 2026-10-04 (Sun) — part 1
**Area:** Backend — B0 safety net (first step of the backend upgrade track)
**Did:**
- **Node version mismatch fixed:** Dockerfile built on Node 20 while `package.json` required 22 — now both 22.
- **Startup config check** (`backend/src/config/env.js`): the server now refuses to boot when auth secrets or
  Firebase credentials are missing, and prints a clear warning (not a crash) for degraded config — missing Judge0,
  missing Redis, identical JWT secrets, wide-open CORS in production. Previously only `JWT_SECRET` was checked.
- **Graceful shutdown** (`backend/src/server.js`): SIGTERM/SIGINT now finish in-flight requests before exit, with a
  15s cap, so a Render redeploy no longer kills a student's submission mid-flight. Uncaught exceptions and unhandled
  promise rejections are now logged with a stack instead of vanishing.
- **ESLint added to the backend** (`eslint.config.js`, `npm run lint`): bug-focused rules, not formatting. Found and
  fixed 8 real leftovers (unused imports/vars across seed scripts, `departmentAnalytics`, `topicMasteryRepository`,
  two test suites). Lint is clean.
- **Backend tests wired to run in CI** without touching real data: `firebase.json` adds a Firestore emulator and
  `backend/tests/withEmulator.js` boots the backend against it. It **refuses to run** unless
  `FIRESTORE_EMULATOR_HOST` is set, so the suite can never hit the live database.
- **Security:** `docs/credentials` was NOT gitignored in a public repo — now ignored. (File not opened.)
- Vendored MUI + frontend-design skill guides are now tracked in the repo (gitignore exception) so the style rules
  survive a fresh clone.
**Verified:** clean `npm ci`; lint clean from a clean install; backend boots in emulator mode with no service
account; `/health` responds; the real service-account path still works (no production regression); the test runner
correctly refuses to run without the emulator; `node:22-bookworm-slim` base image exists.
**PAUSED — emulator smoke tests:** the Firestore emulator needs Java, which this machine doesn't have and we chose
not to install. The CI step is committed but gated to **manual run only** (`workflow_dispatch`), so an unverified
step cannot fail a pull request. Normal CI remains lint + Docker build, both verified. SIGTERM shutdown is likewise
unverified (Windows cannot deliver the signal; Render and CI are Linux).
**To resume on the college machine:** install a JRE (17+), run `npx firebase emulators:exec --only firestore
--project codementor-ci "cd backend && npm run test:emulator"`, fix anything it finds, then delete the two
`if: github.event_name == 'workflow_dispatch'` lines in `.github/workflows/ci.yml` so the suite runs on every PR.
**Next:** paused until the move to the college computer. After that: finish B0 verification → B3 (central
permission check) → S0 (frontend design foundations).
**Branch:** `feat/student-persona`

---

## 2026-10-03 (Sat)
**Area:** Student persona — planning
**Did:**
- Agreed to work persona by persona, starting with Student; this log switches to daily entries from today.
- Audited every student page (navigation, dashboard, problem page, design system, loading/error handling).
  Found: dashboard "Class Rank" actually ranks against all students; recent submissions include wrong ones;
  next/prev problem ignores course order; corner radius renders 24px instead of 8px in ~20 places;
  hidden-test-case totals are wrong when a case fails.
- Added official MUI agent skills (styling, theming, Next.js) and Anthropic's frontend-design skill to
  `.claude/skills/` with `THIRD_PARTY_NOTICES.md`.
- Wrote `docs/STUDENT_PERSONA_PLAN.md`: 12 phases (S0–S11) incl. Quick Access tiles, Tests hub,
  problem-page cleanup, terminal-style results, Mistakes notebook, Roadmaps, Job-Ready Score, shareable profile.
**Decisions:** illustrated tiles on top of dashboard (unDraw); accepted-only submissions for students; every exam
proctored, assignments proctoring optional; contests removed; copy/paste blocked silently; module due dates;
leaderboard shows names + rank + profile link; NestJS migration not now.
**Follow-ups answered same day:** classes auto-enrol (option A); clipboard attempts logged for faculty+;
Job-Ready Score on own dashboard + opt-in on public profile; 4 roadmaps (Java, Python/Data, Web, Service placement);
student publishes own profile; only verified external handles shown.
- Audited the backend for a "production-grade" upgrade: no request validation library, no structured logging or
  error tracking, no graceful shutdown, CI doesn't run backend tests, dashboard rank + leaderboard read the entire
  submissions collection on every load. Recommendation: upgrade in place (no rewrite), as a backend track.
**Next:** agree backend track → start S0 (design foundations).
**Branch:** `feat/student-persona`

---

## Before 2026-10-03 (summary, 22 Aug – 1 Oct)

**Late Aug:** Security baseline locked down, CI build checks added, course pages redesigned.

**Early Sep:** Built the full **Exams feature** — faculty can create multi-section exams (coding + MCQ), students take them with proctoring (tab-switch/fullscreen monitoring), results and per-student breakdowns for faculty.

**Mid Sep:** Added faculty **Analytics dashboard** and **At-Risk Students** panel (flags inactive/failing/missed-deadline students). General UI polish and performance pass (app felt faster, loaded quicker).

**23 Sep:** Fixed a login crash bug. Deployment plan finalized — Vercel + Render, ~$0/month.

**30 Sep – 1 Oct (review prep):** Ran a full system health check and found two real issues, both fixed and verified same day:
- A faculty member could see another department's data — now blocked.
- A student could escape a locked exam and solve any problem from the full catalog instead of just the assigned one — now blocked on both the app and the server.
- Also added an automatic keep-alive so the backend never goes to sleep and feels slow for the first visitor.

**Review morning:** Live login broke — traced to a wrong backend address saved on the hosting platform. Fixed and verified working end-to-end with real student data.

**✅ Working link for today: `https://codementor-ten.vercel.app`**

**Still open (not blockers):** a cosmetic "days left" display bug, and an old unusable link (`codementor-sreyas.vercel.app`) that should be retired later.
