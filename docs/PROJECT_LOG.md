# CodeMentor — Project Log

Daily record of what was worked on, newest first. One entry per day: area, what was done, decisions, next step.
Persona work order: Student → Faculty → HOD → T&P → Admin → Super Admin.

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
