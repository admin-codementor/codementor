# CodeMentor — Project Log

Daily record of what was worked on, newest first. One entry per day: area, what was done, decisions, next step.
Persona work order: Student → Faculty → HOD → T&P → Admin → Super Admin.

---

## 2026-10-04 (Sun)
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
- **Backend tests can now run in CI** without touching real data: `firebase.json` adds a Firestore emulator, and
  `backend/tests/withEmulator.js` boots the backend against it. It **refuses to run** unless
  `FIRESTORE_EMULATOR_HOST` is set, so the suite can never hit the live database. CI now runs lint + smoke tests
  + Docker build (previously install + Docker build only).
- **Security:** `docs/credentials` was NOT gitignored in a public repo — now ignored. (File not opened.)
**Verified:** clean `npm ci`; lint clean; backend boots in emulator mode with no service account; `/health` responds;
the test runner correctly refuses to run without the emulator.
**Not yet verified:** the full smoke suite against a live emulator (needs Java, which isn't installed on this
machine) and SIGTERM shutdown (Windows can't deliver it; Render/CI are Linux).
**Next:** finish B0 verification, then B3 (central permission check), then S0.
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
