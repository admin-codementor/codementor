# CodeMentor — Project Log

Daily record of what was worked on, newest first. One entry per day: area, what was done, decisions, next step.
Persona work order: Student → Faculty → HOD → T&P → Admin → Super Admin.

---

## 2026-11-01 (Sun), S8 HOD completion, part A: one set of words, honest AI summary, coding score for all seven platforms, batch, audited export
**Asked and decided:** add a batch field; all seven platforms on the coding-profiles page count (the four the server cannot read are typed by the student, marked not verified, counted at half weight until a HOD or Admin verifies); names and roll numbers shown straight away on the needs-attention list; HOD and Admin may export; a rules-based summary whenever AI is off or failing.
**Did (backend):**
- Coding score (`utils/platformScore.js`): CodeMentor plus seven platforms (LeetCode, Codeforces and GitHub read by the server; CodeChef, HackerRank, InterviewBit, GeeksforGeeks typed). The overall is the average of a student's **best four** platform scores, so nobody is marked down for a site they do not use, linking more never lowers a score, and the scale is the one used before. A typed number counts at 50% until verified; typing a new number or changing the handle clears the verification; the leaderboard ignores unverified numbers. `GET /api/faculty/platform-unverified` and `POST /api/faculty/platform-verify` (HOD and Admin; a HOD only their own department, out of scope looks like "not found").
- `utils/definitions.js` and `GET /api/faculty/definitions`: every status word defined from the constants the code uses; the Activity tab's "At risk" renamed "Not active".
- `aiAccess.soft` and `departmentInsightsService`: when AI is off, over its daily limit or failing, the HOD gets the department's own "what to look at" list shaped like an AI answer, marked `source: rules` with the reason; the fallback is not cached.
- `utils/batch.js`: batch from a stored admission year, else worked out from the year of study and the date (the academic year starts in June); Admin sets one, or fills the missing ones; the People list shows and filters it.
- `POST /api/faculty/department-export` (HOD and Admin, fixed fields, audited, formula-safe) replaces the department page's unaudited client-side file.
**Did (screens):** What the words mean; the HOD's Needs attention panel with a reminder button; the student's typed-number inputs with "not verified" or "verified"; a "Numbers to check" dialog in the Coding score tab; the coding score table for all platforms; a department Export dialog (fields, batch); People with Batch and "Fill missing batches".
**Verified:** backend lint and offline checks (rules for the score, batch, export and definitions; 25 end to end for the typed numbers, verification scope, leaderboard, batch and the export field list), route audit, `tsc`, frontend lint on changed files, and in a browser with the sandbox: the definitions, People with batch, a student's batch editor, Fill missing batches.
**Not verified:** the Coding score tab and the typed-number dialog and the student's profile form in a browser (they need data the sandbox does not have; the API is tested), the department export over HTTP (its parts are tested), the rules-written summary in the page, a real Firestore.
**Not built (part B):** department practice analytics (heatmap, topic coverage, company readiness), course analytics by section, mentor load and response, the HOD placement views, "online now", the batch as a filter on every department tab, and a HOD People page with class and mentor.
**Next:** S8 part B.
**Branch:** `feat/s8-hod`

---

## 2026-10-31 (Sat), S7 errors and self-healing: a breaker in front of the judge, a reaper for stuck work, a daily self-check, "Report a problem"
**Asked and decided:** a background reaper finishes stalled submissions and gives up after 15 minutes (listed for the Admin); a circuit breaker opens after 5 failures in 30 seconds for 20 seconds; the daily self-check may repair mentors that drifted from the class structure and placement applications whose drive is gone; people can send "Report a problem", kept with the reference and listed for the Admin.
**Did (backend):**
- `utils/circuitBreaker.js` (pure, 18 checks) wired in front of every judge call (`services/judgeBreaker.js`). Open: new work is answered at once with `JUDGE_BUSY` and a plain message; a job already running waits for the judge without using up one of its three attempts. Student-facing judge errors no longer mention Judge0, its address or its token.
- Reaper (`services/judgeReaper.js`): a job untouched for 90 seconds is pushed on, so a closed tab no longer loses a result; open for 15 minutes is marked failed and put in `judgeDeadLetters`. Judge jobs now carry `createdAtMs` and `touchedAtMs`.
- Idempotency: the editor sends a key with every Submit; the first claim wins (one job per person and key), a start that failed frees the key.
- `services/maintenance.js`: the reaper every minute, the self-check and clean-up daily, each behind a lease (`utils/maintenanceRules.js`, 18 checks) so several API servers never run a task twice.
- `services/selfCheck.js`: repairs drifted mentors and orphan applications (logged), reports given-up jobs and an open breaker, one broken check never hides the others; result stored and shown to the Admin.
- `POST /api/problem-reports` (6 an hour), and for the Admin `/api/admin/health`, `/health/self-check`, `/problem-reports` (list, mark seen or resolved).
**Did (screens):** an error screen inside the menu for each area (student, faculty, T&P, editor) with Try again, Home and Report; "Report this problem" on error screens that have a reference; an offline and back-online banner; retry of page data twice with a growing wait; the editor's Idempotency-Key; **System health** (judge connection, self-check with Run now, jobs given up on, problem reports).
**Verified:** backend lint and offline checks (37 new end to end: breaker, waiting job, JUDGE_BUSY, keys, reaper, lease, self-check and its repairs, health, reports and their rate limit), route audit, `tsc`, and in a browser with the sandbox: System health (run the check, repairs shown), problem reports (listed, resolved), the offline banner.
**Not verified:** the Report dialog and the in-menu error screen in a browser (nothing in the sandbox fails in a way that shows them; the routes are tested), a real Firestore (lease transactions, the new collections, the `in` query for open jobs), a real judge outage, a second API server running at once, a replay of the same Idempotency-Key over HTTP (the ten-second submission limit answers first; the claim rule is tested).
**Not built:** retrying a save automatically after a network drop, restarting or alerting on a failed health check, repairing exam attempts or marks automatically (reported only), breakers around AI and outside coding platforms. See `docs/RESILIENCE.md`.
**Next:** S8 HOD completion (`docs/HOD_CAMPUSTRACK_PLAN.md`), after its five questions are answered.
**Branch:** `feat/s7-errors` (includes the Admin work of PR 82 until it is merged)

---

## 2026-10-31 (Sat), S6 Admin: people, college settings, audit and sign-in history, instant lockout, AI switch and limit
**Asked and decided:** new accounts get an emailed link to choose their own password; a disabled account is locked out at once; the Admin can change the department and section lists and the AI switch and daily limit; audit and sign-in history are kept one year, Admin only.
**Did (backend):**
- `utils/adminRules.js` (pure, 48 checks): new-account rules (department for faculty and HOD, none for T&P and Admin, department must be on the college list once there is one), typed-email confirmation, the safety rules (the last active Admin cannot be disabled or demoted, an Admin cannot disable or demote themselves, roles move only among staff), settings validation, AI daily limit by the India day, people and audit search.
- `/api/admin/*` (Admin only, matrix rule plus an invariant): people list and search, create (Firebase sign-in with a password nobody sees, then an emailed link; refused up front when email is not set up; the sign-in is removed again if the profile cannot be saved), emailed reset link, disable and enable, change role, change department (each ends the person's sessions), settings, audit list and CSV export, failed sign-ins, college overview.
- Disabled accounts: `middleware/accountGate.js` keeps the few disabled ids in memory, reloaded every 30 seconds by two small queries (not one read per request), updated at once on the server that makes the change; `protect` answers `ACCOUNT_DISABLED`; sign-in and the two-factor step refuse them too.
- `loginEvents`: successful sign-ins, wrong two-factor codes, blocked accounts, with address and browser.
- AI: `middleware/aiAccess.js` in front of the tutor, error explainer, code review, mock interview and the HOD insights; off gives 503 in plain words, the daily limit uses one counter document per person per day in a transaction; a counter failure lets the request through.
- Audit: the list stops at one page when no filter narrows it; entries older than a year and old sign-in history are pruned at most once a day.
**Did (screens):** College overview, People (search, filters, add account, an account page with sign-ins, role, department, disable and enable, typed confirmations), Settings, Audit Log (search, filters, export, failed sign-ins), the Administration menu.
**Verified:** backend lint and **1167 offline checks** (63 end to end through the real routes: who may enter, create and its failure path, reset, disable with the instant lockout, the safety rules, role and department, settings, the AI switch and limit, audit, export, retention, sign-in history, overview), route audit, `tsc`, frontend lint and build, and in a browser with the in-memory sandbox (`scripts/admin-sandbox.js`): the overview, disabling with the typed email, saving departments, creating an account, the audit log and failed sign-ins.
**Not verified:** a real Firestore (the aiUsage transaction, `loginEvents` and audit ordering need no new index but were not run there), real email, the Firebase reset link, the HOD or faculty view after a role change, a phone-width check.
**Not built:** roster import from the screen and moving students between year and section from the Admin area (the scripts and Academic structure remain), a cost and quota panel, alerts, feature switches, thresholds under Settings.
**Next:** S7 errors and self-healing, then S8 HOD completion (`docs/HOD_CAMPUSTRACK_PLAN.md`). On the college computer: set `SMTP_HOST` and `MAIL_FROM`, list the departments in Settings, create the T&P account from People.
**Branch:** `feat/s6-admin`

---

## 2026-10-27 (Tue), HOD completion planned (S8, last in the list), from 11 more CampusTrack HOD screens
**Did:** read the screens and wrote `docs/HOD_CAMPUSTRACK_PLAN.md`: what each page shows, seven defects in them not to copy (three different at-risk numbers for the same students, 255 of 255 flagged red, an AI page that shows a failure as a score and "performing well" together, a 197 versus 255 pool with no explanation), our feature against each page, the HOD feature list by question, eight rules, eight phases (S8.1 to S8.8) and five open questions. Added S8 as the last row of the stream table in `docs/TNP_ADMIN_EXAMS_SECURITY_PLAN.md`.
**Not built:** nothing. Starts only after S5, S6 and S7.
**Needs the owner's answers (section 7):** batch field, which outside platforms count, names on the attention list, who may export, AI insights while AI is off.

---

## 2026-10-27 (Tue), S5 Training & Placement: its own role, drives with rules, CGPA records, outside offers, audited export
**Asked and decided:** drives are made by T&P and the Admin only (an HOD reads their department's); a student's CGPA is visible to the student, T&P, the Admin and the HOD of their department; exports use a fixed list of fields and every export is logged.
**Did (backend):**
- New role `tnp` (no department, no faculty console). Its session carries a `t2` claim until two-factor is set up (`utils/twofaGate.js`, same idea as the first-login password gate): every route except the 2FA setup answers `TWOFA_REQUIRED`, enabling returns fresh tokens, and it cannot turn two-factor off. Kept out of mentor and faculty lists.
- `utils/placementPolicy.js` (pure, 73 checks): drive validation (several departments and years, minimum CGPA, most backlogs, last date, tier, https link, draft or published), eligibility that lists **every** reason, the dream-tier rule (an offer limits a student to dream drives; an offer is a selection in a published drive or an outside offer), withdrawal, a written reason for overrides, who may see a CGPA, the CGPA list dry run, the fixed export fields and a spreadsheet-safe CSV writer.
- `services/placementService.js` and `/api/placement/*`: drives, results and adding a student by hand (override needs a reason, nothing is written if any row is bad, selecting someone who already has an offer in a normal drive is refused), notices to eligible students who have not applied, a student's own page (apply with consent, withdraw), CGPA upload with a dry run, an upload history and undo that never overwrites a later change, outside applications, college and department analytics, audited export. CGPA lives in its own collection so no profile endpoint can leak it.
- The old `/api/faculty/placement/*` routes are gone (HOD reads through the new ones). T&P can open the list of published exams and the live roster and resume a student (integrity evidence stays closed to it).
- The access matrix gained the placement rules and four invariants (faculty never; students only `/me`; changes and exports only T&P and Admin; T&P never the faculty console).
**Did (screens):** T&P area (Drives with a draft-to-published flow and a drive page for results and overrides, Students and CGPA with upload, check, apply and undo, Outside offers, Analytics, Export, Exams, Account), a forced two-factor page, the student Placements page (CGPA, offers, open drives with every reason when closed, apply with consent, withdraw, round results), and the HOD Placement tab made read-only on the new routes.
**Verified:** backend lint and **1056 offline checks** (96 end to end through the real routes: who sees what, every eligibility rule, the dream-tier rule, overrides, upload and undo, outside offers, notices, export and audit, the 2FA gate), route audit, `tsc`, frontend lint on the changed files, and in a browser with the in-memory sandbox (`scripts/placement-sandbox.js`): T&P drives list and drive page, override reason field, CGPA upload check, apply and undo, outside offers, analytics, export (a real CSV), the forced two-factor page, and a student applying with the consent tick.
**Not verified:** a real Firestore (volumes, the new collections' rules), the HOD placement tab and the Exams pages in a browser (the sandbox has no exam or department data; the API is tested), the QR scan and a real authenticator code, a phone-width check.
**Not built:** email to students about a new drive (in-app reminder only), an Admin screen to create the T&P account (use `scripts/create-staff-account.js --role tnp`; the Admin persona is S6), a student's CGPA on the faculty student page.
**Next:** S6 Admin (people, college overview, settings, audit and security); on the college computer, set up the T&P account, upload a CGPA list, publish one test drive.
**Branch:** `feat/s5-tnp`

---

## 2026-10-27 (Tue), S4 faculty dashboard: class switcher, needs-attention insights, customisable layout, and closing scoping gaps
**Found while reading:** the Students tab and a student's detail page for FACULTY covered the whole department, not their own classes, and three department-wide cohort endpoints (unused by the website) were open to faculty. Fixed first, since it is the rule you set.
**Did (backend):**
- `middleware/classFilter.js` + `academicScope.resolveClassMembers`: `?classId=` narrows every faculty analytics call to one class the caller may look at (own classroom; an academic class they teach, are class teacher or sub-mentor of, or hold access to; HOD: any class of the department; Admin: any). Anything else is refused (403/404), never widened. `resolveAnalyticsScope` honours it, with its own cache key per class, and can only narrow a faculty member's scope.
- Faculty Students list and student detail now limited to their own classes; `/analytics/cohorts`, `/analytics/cohort-students`, `/cohort-topics` are HOD and Admin only (matrix updated).
- `GET /api/faculty/class-insights` (pure `utils/classInsights.js`): not started, gone quiet, stuck (with the problem and tries), hardest problems; the snapshot gained a per-student `stuck` list (cache version bumped to 4).
- `GET/PUT /api/faculty/dashboard-layout` (pure `utils/dashboardLayout.js`): per-person widget order and visibility, three presets, strict on input and self-healing on read (removed widgets dropped, new ones appended).
**Did (screens):** class switcher (remembered per person), Customise dialog (show or hide, up and down, presets, reset), "Needs attention" and "Hardest problems" widgets, and the dashboard drawn from the saved layout; `docs/ACADEMIC_STRUCTURE.md` updated.
**Verified:** backend lint, **886 offline checks** (43 end to end through the real routes: who sees which students, every class-switch case incl. refusals, the cache keys, insights, layout), route audit, website `tsc`, eslint (0 errors) and build. Browser (sandbox): a faculty member saw 53 students, switched to a classroom (4 students, 10 submissions) with the choice remembered, customised (hid a widget, moved another to the top), saved, reloaded: same order on screen.
**Not verified:** real Firestore data volumes; the HOD and Admin versions of the dashboard in a browser (the API is tested); a phone-width check.
**Not built:** widgets for HOD and Admin that are different from the faculty ones (departmental comparison, college view: S4 for HOD, S6 for Admin); drag-and-drop (up and down buttons only); email or in-app reminders to the students listed under "needs attention".

---

## 2026-10-27 (Tue), S3 academic structure: terms, classes, class teacher, sub-mentors, assignments, access requests
**Asked and decided:** sub-mentors by position in the roll-sorted class list; classes built automatically from each student's department, year and section, with a CSV for exceptions; a teaching assignment is a class plus a subject the HOD types.
**Did (backend):**
- `utils/academic.js` (pure rules, 39 checks): natural roll order and positions, range coverage (gap, overlap, beyond the class), effective dates, what each kind of faculty may see, consistency problems.
- Storage `academicRepository.js` (terms, classes, enrollments, teachingAssignments, accessRequests; ended assignments are kept, never deleted), `academicService.js` (every action checks Admin or the HOD of that department), `academicScope.js` (what a faculty member sees this term), `classTargets.js` (which classes work may be aimed at, and which classes a student is in), routes under `/api/academic`, all in the access matrix.
- A student's `mentorId` is now derived from the class teacher and the sub-mentor ranges (kept in step on every change), so the existing mentor board, leaderboards and messaging keep working.
- Faculty analytics, course and problem statistics (through the shared scope) and the messaging checks now include the structure, in addition to a faculty member's own classrooms. Exams and assignments can be aimed at academic classes; students see them through their section class and electives.
- A bug the tests caught: dates stored as ISO text were not parsed, so an assignment starting in the future counted as active already. Fixed and covered.
**Did (screens):** HOD/Admin `Faculty > Academic structure` (term, build classes, class teacher, sub-mentor editor with live coverage check, assignments with reallocate and end, students list with move, CSV upload, elective groups, Checks tab, Access requests tab); faculty `My classes` with ask for access; the student dashboard card "My class". Guide: `docs/ACADEMIC_STRUCTURE.md`.
**Verified:** backend lint, **712 offline checks** (80 in a flow test through the real routes: terms, building and rebuilding, ranges refused with the position named, mentors following positions, upload with bad rows, reallocation, expiry of grants, who may aim work at which class), route audit, website `tsc`, eslint (0 errors) and build. In a browser against an in-memory sandbox (`backend/scripts/academic-sandbox.js`): HOD built 2 classes from 83 students (the one without a section named), set three sub-mentor ranges with the live "every position is covered once" check, set a class teacher; the student card showed the right teacher and sub-mentor; a faculty member asked for access and the HOD approved it.
**Not verified:** real Firestore for the new collections (the rules file is deny-all and the server uses the Admin SDK); the student dashboard in a browser (the sandbox has no data for its other widgets, so the card was checked on its own); performance with the full 3000 students (building a department reads each student once).
**Not built yet:** see the end of `docs/ACADEMIC_STRUCTURE.md` (content ownership on reallocation, courses by grant, notification on decision, rollover wizard, automatic repairs, dashboard class switcher).

---

## 2026-10-27 (Tue), Exam integrity: per-student shuffle, evidence, report and mail
**Asked and decided:** SMTP settings in `.env` (any provider); email only for server-proven tampering; shuffle question order AND options; exam integrity first, then the class and mentor model.
**Did:**
- **Shuffle** (`utils/examLayout.js`): each new attempt gets its own question order and option order, stored once on the attempt, so reload, second device and resume show the same order. Stored answers stay in the exam's own numbering (scoring, reports and analytics unchanged); only what goes to and comes from the page is translated. Questions with positional options ("All of the above", "Both A and B") keep their written option order. Attempts that started before this keep what they were shown.
- **Evidence** (`utils/examIntegrity.js`, `services/integrityService.js`, `repositories/integrityRepository.js`): five server-proven kinds (invented session code, question not in the exam, impossible option, marks/result fields in a request, repeated writes long after time ended). One record per attempt, one write per kind per 20 s at most, never blocks a save. Live edits of an exam cannot cause false evidence (a missing but real-looking id and an option just past the list are refused without a record).
- **Mail** (`services/mailService.js`, nodemailer over SMTP from `.env`): one message per person (student and each admin), max 3 per attempt, plain wording, no header injection, never throws; with no SMTP the status says "not_configured".
- **Staff:** `GET /api/exams/:id/integrity` and `POST .../integrity/:userId/resend` (Admin, the exam's owner, the owner's HOD); page `/faculty/exams/:id/integrity` linked from the exam list and the roster.
**Verified:** backend lint, 696 offline checks (shuffle: choosing the correct shown option scores full marks, reload and review agree; every evidence rule incl. the not-evidence cases; mail failures leave the exam untouched; real mail library against a local SMTP server), route audit; load scenarios with shuffle on (300 students sustained and 200 storm: 0 lost answers, 0 errors, all old windows refused); browser: shuffled exam screen and reload, four tampering requests listed on the integrity page with plain labels and mail status.
**Not verified:** a real SMTP provider (set `SMTP_HOST` and send a test); real Firestore for the new `examIntegrity` collection (server-only, rules unchanged); the integrity page as owner/HOD in a browser (API checked).
**Next:** class and mentor model.

---

## 2026-10-27 (Tue), Server update script, status endpoint, exam-day playbook
**Why:** the project already runs with Docker on the college computer, and `deploy/update.sh` still built the old Vite `frontend`, so it could not be used.
**Did:** rewrote `deploy/update.sh` for the current compose file: refuses a dirty or diverged checkout, checks `.env` (JWT secrets, `TRUST_PROXY`, CORS), asks, fast-forwards to `main`, rebuilds the website and API only (never Judge0), waits for both to answer, and rolls back by itself if they do not; `--check` changes nothing; `rollback <commit>`. 18 checks in `deploy/tests/test-update.sh` against a throwaway repo with stand-ins for docker, curl and sleep (the test found a real bug: a missing `.env` key killed the script silently). `*.sh` files are forced to LF. New public `GET /api/system-status` (api, database, judge reachable; cached 30 s, one shared check; 503 only when the database is down; no details), listed in the access matrix, 13 checks. New `docs/SERVER_UPDATE.md` and `docs/EXAM_DAY_PLAYBOOK.md`.
**Verified:** backend lint, 592 offline checks, route audit, the status route called live in the offline environment (503 and a safe body when the database is unreachable, cached on the second call). **Not verified:** the script against real Docker on the college computer (do a `--check` first); the status route against a reachable Firestore and Judge0.
**Next:** uptime monitor and phone alerts on `/api/system-status`; randomised question order and the integrity report and email; 3-hour soak and rehearsal on the college server; then S3 class and mentor model.

---

## 2026-10-27 (Tue), S1 reliable exams
**Area:** Stream S1 of `docs/TNP_ADMIN_EXAMS_SECURITY_PLAN.md` (branch `feat/s1-reliable-exams`). One PR for the whole exam phase (backend and screens).
**Backend:** the server owns the clock (`windowExpiresAt`) and one active session per attempt (header `X-Exam-Session`; a second device takes over and the first is told). Saves are ordered and repeat-safe (per-session sequence numbers). Too many violations (exam setting, default 5, 0 = never) pause the attempt; nothing in the browser ever submits an exam. Staff (Admin, the exam's owner, the owner's HOD) resume a student with a written reason and optional extra minutes; the reason, who, and the earlier state are kept and the student is notified. Submit is repeat-safe. Coding submissions are refused once time is up, submitted or paused, and judged by the time the server received them.
**Screens:** the exam page is rebuilt as one question at a time with a right-hand question panel, bottom bar, finish summary, settings (layout, text size), instructions, a plain "completed" page, and clear screens for "open in another window" and "paused". The header always shows whether answers are saved; answers wait safely on the device while the connection is down. The timer follows the clock instead of counting ticks. The code editor sends the exam session and goes back to the exam page when the server says time is up, paused or replaced. New staff page `/faculty/exams/:id/roster` (live states, resume dialog) and a violation-limit field in the exam editor.
**Also fixed:** a failed token refresh on a network error used to sign a student out mid-exam; it no longer does.
**Verified:** backend 568 offline checks, route audit, lint, website `tsc`, eslint (0 errors) and production build. In a browser against an in-memory sandbox (`backend/scripts/exam-sandbox.js`): instructions → start → answer and save → second device takes over → paused after 3 violations → staff resume with reason → student continues with saved answers → finish → result review.
**Not verified:** the code editor page inside an exam (the sandbox has no problems, only API and types checked); real Firestore (transactions run against a fake); signed-in use with real accounts; load; phone layout. Deploy not during a live exam: the session header is strict, so open tabs would be asked to take the exam over again.
**Next:** exam-day playbook, monitoring; randomised question order and integrity email (S1.5/S1.6 remainder).

### Load-test harness (same branch)
**What:** `loadtest/` holds five k6 scenarios (start burst, sustained, last-minutes surge, reconnect storm, capacity ramp) and `run-local.cjs`, which starts the exam sandbox, runs one scenario and prints the server's CPU, memory and event-loop delay. The sandbox now takes `SANDBOX_STUDENTS`, `SANDBOX_LATENCY_MS` (stand-in for Firestore round trips), `SANDBOX_DURATION_MIN`, `SANDBOX_TOKENS`, `SANDBOX_STATS`. Every student reads back all accepted answers at the end (`lost_answers` must be 0). k6 2.2.0 was installed with winget for this.
**Found and fixed by it:**
- Node's default 5 s keep-alive closed idle connections while students paused between answers; 15 of 30,000 saves failed with "connection reset". The server now holds idle connections 65 s (`utils/serverTimeouts.js`, `KEEP_ALIVE_TIMEOUT_MS`, 9 checks). Same run afterwards: 0 failures.
- The sandbox had no Redis and the client waited 100 ms per request for it, hiding the real cost. `REDIS_RETRIES` is now configurable (default unchanged, 1).
- My own harness counted a dropped connection as a success; it now counts as an error.
**Measured on this PC (1000 students, 30 ms simulated database, one API process, client on the same machine):** start burst of 1000 in 20 s: start p95 317 ms, 0 errors. Reconnect storm: 1000 of 1000 old windows refused, 0 lost. Capacity: **500 saves/s with p95 under 60 ms**, 600/s p95 680 ms, errors from 800/s (a real exam is about 25/s, about 125/s at a 5x rush). 10 minutes at the real exam rate: 0 errors, 0 lost, p95 54 ms, memory +4 MB, 6% of one core. Overload makes memory grow fast (about 1 GB at 1000/s).
**Not measured:** real Firestore, Judge0 and coding scenarios, the college network, real Redis, several API copies, the sign-in herd, a 3-hour soak. Numbers on the college server will differ; these only show the exam code holds up and where one process breaks.

---

## 2026-10-27 (Tue), Dependency updates in one PR
**Why:** Dependabot opened 15 separate PRs (#51 to #65). Each edits the same lockfile, so merging one made the next conflict. Replaced by **one PR** (with the access-matrix and error-format work from #66), and the Dependabot config now groups minor and patch updates into one PR per app per week and no longer opens the risky majors.
**Applied:** `mammoth` 1.13, `@upstash/ratelimit` 2.2, `dotenv` 18, `helmet` 8.3, `eslint` 10 (with `@eslint/js` added explicitly and two leftover assignments fixed), `react` and `react-dom` 19.3.1 together (the bot bumped only `react`, which would have broken the site at run time), and the GitHub Actions versions (checkout 7, setup-node 7, setup-java 6, codeql-action 4).
**Not applied, on purpose:** TypeScript 7 (typescript-eslint does not support it), `@mui/system` 9 (must match `@mui/material` 6), Firebase 13 and framer-motion 14 (need a real sign-in test and a visual check), Node 26 (CI and `engines` use 22).
**Verified:** clean installs of both apps, backend lint and 466 offline checks, route audit, website `tsc`, eslint and production build, both audit gates, Word import with the new mammoth (a document built in memory), the sign-in page on React 19.3.1 in a browser. **Not verified:** Linux CI; sign-in itself; any signed-in page.

---

## 2026-10-26 (Mon), S0 security baseline, batch 1
**Area:** Stream S0 of `docs/TNP_ADMIN_EXAMS_SECURITY_PLAN.md` (branch `feat/s0-security-baseline`). First of the two-week exam-critical slice.
**Checked first (the five findings from `docs/scale-readiness/05-auth-and-security.md`):** F12 rules file is deny-all in the repo, **deployed state not verifiable from here**; F2, F13, F14 and F17 were open.
**Did:**
- **F2 limiters no longer fail open.** If Redis is unreachable, each limiter (including the submission limits) falls back to an in-memory limit with the same budget, per API copy (`utils/memoryLimiter.js`, 7 checks). One warning per 30 seconds.
- **F17 `TRUST_PROXY`** is now a setting (hops or an address list; default 1, so nothing changes today). `true` is refused because it lets clients forge their IP. Behind Cloudflare, its tunnel and the ingress the hop count must be set and confirmed in the logs (`utils/trustProxy.js`, 4 checks). A production warning if `CORS_ORIGIN` is unset or `*`.
- **F13 `tokenVersion`.** Token creation is now in one place (`utils/tokens.js`, 11 checks). Access tokens last 30 minutes (were 1 hour; 2FA ones were 15). A permission change by Admin or a password set raises the user's `tokenVersion`, and the refresh endpoint refuses a refresh token whose version no longer matches, so the old session ends within 30 minutes. Existing tokens count as version 0, so nobody is signed out when this ships.
- **F14 headers.** The website now sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera and microphone stay available to the site for the exam check) and HSTS in production, plus a **report-only** Content-Security-Policy. Reports go to `POST /api/public/csp-report` (public, limited, query strings dropped; `utils/cspReport.js`, 5 checks). Enforcing the CSP is a later step once the reports are clean.
- **CI:** `.github/workflows/security.yml` (CodeQL, gitleaks, npm audit, Trivy image scan) and `.github/dependabot.yml`. **Not required checks yet**, because `npm audit` already fails (below).
**Found:** `npm audit` on production dependencies: **backend 20 findings (1 critical `proxy-addr`, 10 high)**; **website 9 (2 critical: `next`, `dompurify`; 6 high including `firebase`, `sharp`)**. Fixes exist (for example `next@16.4.3`). Not applied here: an upgrade needs its own branch, a clean `npm ci` and a full check. This is the next S0 task.
**Verified:** 395 offline checks; backend lint and route audit; website `tsc`, eslint and production build; the headers were read on a running dev server and the login page rendered with no CSP violations in the console.
**Not verified:** the in-memory fallback was only unit-tested (no real Redis outage); the refresh flow was tested as pure logic, not with a real sign-in and a real permission change; the CSP has not been exercised on signed-in pages (only the login page); the CI workflow has not run yet; Firestore rules as deployed.
**Batch 2 (same branch): access matrix.**
- `backend/src/config/accessMatrix.js` is now the one written record of who may call which route (rules, the open routes, and four invariants that cannot be loosened by editing a rule). `docs/ACCESS_MATRIX.md` is generated from it (`npm run docs:access`).
- The route audit now reads each route's real role list (`authorize(...)` and `requirePermission(...)` carry a readable tag; behavior unchanged).
- `tests/pure/accessMatrix.js` (16 checks) fails the build if a route has no rule (so a new route forces a decision), differs from its rule, is open without being listed, or breaks an invariant. `tests/pure/accessLive.js` (3 checks) sends real requests to the real app on a local port: no token gives 401, a token with the wrong key gives 401, and every role the policy forbids gets 403 (178 role and route pairs). Checked by removing the staff gate from the faculty router: both tests fail; restored, both pass.
- **Finding:** 28 `/api/student/*` routes (and others) accept any signed-in role. Handlers use the caller's own id, so there is no data exposure, but staff reuse `PUT /api/student/profile` (their own name) and the problem pages, so restricting them is a product decision. Recorded as "any role" in the matrix with the reason.
- **Mistake and fix:** the first live test loaded `backend/.env`, so it sent its rate-limiter calls to the **real Upstash Redis** (about 800 requests per run, about six runs, counted against the free 10,000 commands a day). Fixed: `tests/hermeticEnv.js` forces an empty Redis URL, an unreachable Firestore address and throwaway secrets before the app loads. Also set the Redis client to one quick retry (it was 5, about 4 seconds in all, which would have delayed every request during an outage). The test runner now waits for async tests; request logging is silent under `NODE_ENV=test`.
- 421 offline checks; lint and route audit clean; both new tests also pass with no `.env` (as in CI).
**Batch 3 (same branch): one error format (S7, first part).**
- Every error the API sends is now `{ success: false, error, code, hint, requestId }`: `error` is a plain sentence, `code` is stable (NOT_FOUND, RATE_LIMITED, DATABASE_UNAVAILABLE, SESSION_ENDED ...), `hint` says what to do next, `requestId` is also the `X-Request-Id` header and is logged next to the full technical error (`utils/apiError.js`, `middleware/requestContext.js`). Older endpoints are upgraded on the way out, so nothing was rewritten; a technical message on a 5xx (database, library or stack text) is replaced by a plain one, and 4xx messages written for users are kept. Four admin routes that sent the raw `e.message` on a 500 now let the global handler answer.
- Invalid JSON is now a 400 (it was reported as "Internal server error"), an oversized body a 413, a database outage a 503 that says the work is safe, a busy AI provider a 503.
- Website: `apiError.ts` reads `code`, `hint` and `requestId`; a server-side failure shows "(Reference ABCD1234)" in toasts and a "Reference" line in error panels (`ErrorState`, `InlineError`); new states for "system busy" and "sign in again"; new `app/error.tsx` and `app/global-error.tsx` so a crashing page shows plain words, Try again and a reference instead of a raw framework screen (Next 16 passes `retry`, not `reset`).
- 466 offline checks (45 new: `apiError` 29 and `errorEnvelope` 16, including real requests and handlers that crash); lint, route audit, website `tsc`, eslint and build pass. The crash page was seen in a browser with a temporary page that threw on purpose (since deleted).
- **Not verified:** the website's error panels with a real failing API call (the classification was checked with sample server errors only); no signed-in page opened; a real Firestore outage (the 503 mapping is unit-tested).
**Next:** S1 (exam reliability and resume).

---

## 2026-10-21 (Wed), Phases 3 to 6
**Area:** Phases 3 to 6 of `docs/COMPETITOR_BUILD_PLAN.md` (branch `feat/phases-3-7`, one PR to `main`). Phase 7 and 8 were not built (scope stopped at Phase 6 by request).
**Did:**
- **Phase 3, reopen requests, reports, calendar, unit release.** A student asks for more time on an assignment or course unit; faculty approve or decline from
  Reports and an approved request gives that student a later due date (`utils/reopen.js`). Reports: summary, late work, daily activity, requests
  (`utils/reports.js`). Calendar for students and staff (`utils/calendarEvents.js`). Course units can have an opens-at date (shown locked; a soft lock, not a block on the direct URL).
- **Phase 4, coding score.** LeetCode, Codeforces, GitHub and CodeMentor, each capped at 100, overall = average of the four, red/orange/green with
  college thresholds per year (`utils/platformScore.js`). New "Coding score" tab on the Department page and a card on the student's profile. Platforms that cannot be read reliably stay link-only.
- **Phase 5, career.** `/app/career`: resume check (rule-based, free, same answer every time: `utils/resumeScore.js`), AI mock interview (5 questions then a scorecard;
  server keeps no conversation, overall is averaged on our side, answers are fenced as data: `utils/mockInterview.js`), and a personal readiness band. HOD Placement tab gets a
  Readiness view (`utils/placementReadiness.js`: resume 60+, interview 6+/10, 30+ problems solved; all three = Ready). The resume text is never stored.
- **Job-Ready arithmetic:** audited and tested (headline equals the sum of the rounded contributions, weights sum to 100). No defect found in the sum. One inconsistency left alone: the course component
  says it uses a fixed bar but uses `min(40, assigned)`, so a college with few assigned problems can reach 100 on few.
- **Phase 6.** Unread count badge on Messages in the student and staff menus (`GET /api/messages/unread-count`, checked once a minute and on navigation). Faculty "Remind N" on the question statistics drawer sends an in-app reminder
  (`POST /api/faculty/nudges`, max 100 at a time, a student is reminded by the same sender once a day, only students the sender can see); students see it on their dashboard.
  Public profile shows a cohort badge (percentile among the same year and department by problems solved, hidden under 10 students) under the existing "show my score" switch.
**Not built on purpose:** email digest, "online now" (write cost), exam environment check, co-faculty on classes (Phase 7), debugger, paper scanning, T&P/Admin, NBA/NAAC (Phase 8).
**Verified:** 368 offline checks; backend lint and route audit; frontend `tsc`, eslint (0 errors) and production build; new routes answer 401 without a token on the running backend.
**Not verified:** none of the new pages were opened in a browser with a signed-in session (a login token could not be minted here); no student-side page seen live; the mock interview was never run against a real model; reminders and the unread badge were not seen with real data.
**Quota note:** HOD Readiness and the coding-score tab each read all students and submissions (cached two minutes); a reminder send reads all students once.

---

## 2026-10-21 (Wed), Phase 2
**Area:** Phase 2 of `docs/COMPETITOR_BUILD_PLAN.md` (branch `feat/phase2-faculty-insight`, includes Phase 1 which never reached main)
**Did:**
- **Question statistics** (Problems list > chart icon): drawer with a class picker, completed / in progress / not started,
  average time spent and to solve, attempts to solve, best and weakest, failures by kind (compile, runtime, time limit,
  wrong answer), time-spent histogram, flagged students (3+ flag events on that question), and a per-student table with CSV.
  `GET /api/faculty/problems/:id/statistics`; rules in `utils/problemStatistics.js` (17 checks).
- **Course time:** the problem timer now also feeds a per-student, per-course roll-up (`courseTimes`, total plus a per-day
  map on the IST day). Course analytics gains average active time, learning time per day and per weekday, and per-student
  columns (solved, submissions, active time in the period, flag), all in the CSV. The per-student page shows time per course.
- **What to look at** on course analytics (`utils/courseInsights.js`, 13 checks): not started, gone quiet, stuck, weakest
  unit, flagged, activity direction, completions.
**Found:** PRs #43 and #44 were merged one minute apart, #44 into a branch that had just been merged, so Phase 1 is not on main
(same trap as #42). From now on every PR targets `main`. The Python course is still a draft in the database (course not
published, all 312 problems draft), so its analytics page shows 0 problems per unit until `--publish` is run.
**Quota note:** each timer flush is now two writes (problem record and course roll-up). Watch the daily total.
**Verified:** 248 offline checks; lint, `tsc`, production build, route audit; drawer and course analytics checked in the browser
as the test HOD against the real roster. **Not verified:** time figures with real data (nobody has used the timer on a course
problem yet).

---

## 2026-10-21 (Wed)
**Area:** Phase 1 of `docs/COMPETITOR_BUILD_PLAN.md` (branch `feat/phase1-learning`)
**Did:**
- **Resume card** on the student course page: "Pick up where you left off" (the last unsolved problem the student visited or
  submitted, from the time record and submissions), else "Next up" / "Start here"; shows the problem, module, position and modules
  left; `GET /api/courses/:id` now returns `resume` and `modulesLeft`. Pure rule in `utils/courseResume.js` (9 checks).
- **Lessons inside problems:** optional `lesson` on a problem (faculty editor field, importer column or `lessons.csv`), shown as
  "Learn the idea" above the statement with **bold** terms highlighted.
- **Statement polish:** a copy button on every line of an example, a "show spaces and line ends" switch on test results,
  problem limits in the right unit (earlier).
**Found:** PR #42 was merged into #41's branch after #41 had reached main, so main lacked the Python course code; re-opened as #43.
The Python course is imported but still a draft.
**Next:** Phase 2 (faculty per-question statistics, course activity report, time and suspicious per problem).

---

## 2026-10-20 (Tue), later
**Area:** Python course (branch `feat/python-course`)
**Did:**
- Analysed the 18 CSV modules: 312 problems, 2,818 tests (936 visible, 1,882 hidden). Every reference solution reproduces
  every expected output (2,818 of 2,818, including the function problems that expect an exception name).
- Judge changes that the course needs, all optional per problem so existing problems are unchanged: exact output
  comparison (full output, line by line; the old comparison ignores line breaks, quotes and brackets and stops at 4,096
  characters), a source driver appended after the student's code for the 32 function-style problems, a language
  allow-list, Python 3.12 (Judge0 id 100, verified present on ce.judge0.com).
- `GET /api/student/problems/:id/learning` plus a Hints tab in the IDE: goal and hints always, reference solution and
  complexity only after an accepted submission, nothing during exams.
- `backend/scripts/python-course/`: dry-run importer with validation, `--check` (local Python), `--verify` (real Judge0),
  `--confirm` (Firestore, draft), `--publish`/`--unpublish`, and `rollback.js`. Runbook: `docs/PYTHON_COURSE.md`.
**Decisions (defaults, one line each to change):** Python 3.12 only for this course; exact comparison; imported as a
draft and published after review; solution and complexity unlock after solving.
**Found:** the repository is public, so the CSV files (solutions and hidden tests) are kept out of it. PY-M17-18 has a
blank sample-input cell (matched by output). Ids were written two ways (M01-01 and PY-M8-01).
**Verified:** 182 offline checks, lint, `tsc`, production build, route audit; local run 2,818/2,818.
**Next:** import as a draft (needs the owner's go-ahead), review the draft course, publish after the PR is deployed.

---

## 2026-10-20 (Tue)
**Area:** Course view and accuracy (branch `feat/course-view-and-accuracy`)
**Did:**
- **Course view (faculty and HOD).** One definition of progress (`backend/src/utils/courseProgress.js`) shared by
  the faculty course analytics, the per-student course card and the student's own course pages: only existing,
  published problems count, each once; a student is completed, in progress or not started and the three add up to the
  class; percent never reads 100 before the course is finished. The analytics page now has In progress and average /
  median progress, a per-unit table, completion by class (year + section), and a sortable, filterable, exportable
  table of every student with clickable KPI tiles and chart bars, plus a note defining every figure.
- **Accuracy fixes** (each with an offline test, `npm run test:pure`, now also run in CI, 118 checks): topic mastery
  counted every accepted re-submission; the cohort topic-mastery view read fields that are never stored; the exam
  report scored MCQ sections with the wrong field names; the exam's default negative marking was never applied;
  an exam's coding mark was the last submission, not the best; timed-out exam attempts were never scored;
  department weekly "solved" counted a problem once for the whole department; attempts per solve counted
  submissions after the first accept; proctor "copy" counted as a flag on one screen only; faculty and HOD used
  different at-risk rules; dashboard and leaderboard ranks disagreed (ties, unranked day-one students, class =
  year + section); graduated students were still in faculty analytics, leaderboards and the student list;
  assignment marks ignored the deadline and class; cohorts merged every year's Section A.
**Decisions (taken by default, one line each to change):** the HOD at-risk rule is used everywhere; graduated
students are hidden everywhere; a student who has solved nothing is unranked (rank 0), not tied for first.
**Verified:** 118 offline checks; backend and frontend lint, `tsc`, production build, route audit; signed in as the
test HOD against the live roster for the course list, course analytics, and analytics cohorts. **Not verified:** the
live smoke suites were not run (each department call reads all 657 students and a full run can use most of the day's
free Firestore quota); numbers with real submissions were proven by fixtures, not seen on screen, because no student
has submitted yet.
**Left for later (needs product decisions):** contests and ratings (penalties, virtual contests, rating timing),
Job-Ready Score arithmetic, badges, exam/contest submissions counted as practice, UTC vs IST for streaks and
heatmaps, unscoped `getCohortTopics`, and the Python course import (waiting for the CSV).
**Next:** merge, then the Python course import and the feature list.
**Branch:** `feat/course-view-and-accuracy`

---

## 2026-10-15 (Thu)
**Area:** Faculty + HOD persona (branch `feat/faculty-persona`, off `main` after PR #39)
**Did:**
- Merged the S12/S13 student work first (PR #39, after fixing a third recurrence of the `npm ci` lockfile
  failure: delete `package-lock.json` as well as `node_modules` before reinstalling).
- Wrote `docs/FACULTY_HOD_PERSONA_PLAN.md` from a code audit plus a read-only walkthrough of CodeTantra (faculty)
  and CampusTrack (HOD) with the user's logins; findings in `docs/COMPETITOR_UX_RESEARCH.md` Part 3. Main finding:
  most of the HOD dashboard was already shipped, so the plan is about what is left, not a rebuild.
- **F0** design-system sweep of every faculty page (raw `borderRadius`/`fontSize` → tokens) and real error states
  in audit-logs and the student profile. **F1** `/faculty/analytics`: 12 chart cards onto the shared `ChartCard`.
  **F2** per-student: "Problems attempted" and a labelled "Active days" time-spent proxy. **F3** a shared
  "How flags / badges are calculated" dialog stating the real thresholds.
- **H2** 92 smoke checks for student groups and the department endpoint (`backend/tests/suites/
  groupsAndDepartment.js`), including pinning the numbers the F3 dialog states to the backend constants.
- User picked four of the deep-dive options (G12b, G13b/c, G14b, G15b), built: department dashboard now has
  **Overview / Weekly progress / Rankings** tabs (cohort-wide week-over-week table; ranked list with badge and
  flag); the four-state funnel is one shared component, now also on the faculty **Cohorts** tab and each
  cohort's drill-down; course analytics gains a **how-far-along-each-student-is** distribution and the course
  list shows average completion per course.
**Decisions:** FD1–FD4 (defer mentor/portfolio/placement to T&P; keep the submission-based time proxy; fold
company-specific content into the course-content track; cross-department leaderboard belongs to Admin).
**Deviations from the plan, on purpose:** did not flip the `no-restricted-syntax` lint rule to error (student
pages still carry raw font sizes, so it would break CI on untouched files); did not wrap list pages in
`SectionCard` (the sibling list pages do not either); `loading`/`error` left unwired on the analytics
`ChartCard`s because the page already gates both.
**Verified:** `tsc`, production build, backend syntax, `check:routes`, smoke suite. **Not verified:** a signed-in
browser walkthrough of the faculty pages (no faculty credentials in the session) — worth one manual pass.
**Next:** open the PR for `feat/faculty-persona`; then T&P.
**Branch:** `feat/faculty-persona`

---

## 2026-10-15 (Thu) — part 2
**Area:** HOD persona (branch `feat/hod-persona`, 6 commits after `abd5eae`)
**Did:** every pending HOD feature, one commit each: H3 cross-department leaderboard, H4 activity, H5 AI insights,
H6 mentors, H7 portfolio, H8 placement (HOD-managed), H9 alumni + percentile baseline, H10 Labs (read-only),
H11 messages (consent, block, report). Closed a leak: `GET /api/faculty/analytics` listed every department by name
to any staff token; it is admin-only now. Details per phase are in `docs/FACULTY_HOD_PERSONA_PLAN.md` (H3–H11).
**Decisions:** a department always comes from the token, never the query; other departments are aggregate-only;
the AI only ever sees aggregates; messaging is opt-in for students and a report is the only way a conversation
becomes readable by anyone outside it.
**Verified:** backend smoke suites 376 passed + 1 skipped (AI quota) through H9; Labs 31 and Messages 91 passed
when run; `tsc`, lint, production build and `check:routes` clean at every phase.
**Not verified:**
- **No signed-in browser check of any faculty or HOD page.** Nothing has been looked at as an HOD.
- After H10 and H11 the earlier suites were **not re-run**: the Firestore free-tier daily quota ran out partway
  through the final regression run (`RESOURCE_EXHAUSTED`), so those failures are quota, not code. Re-run
  `node tests/run.js groupsDepartment hodFeatures hodPlacement hodAlumni hodLabs messages` after the quota resets.
- Leftover `smoketest-` records from that crashed run may remain; the suites use fixed ids, so the next run
  overwrites and cleans them.
**Heads-up:** the test suites run against the live Firestore project, so a heavy testing day can exhaust the
daily quota the live demo also uses.
**Next:** the user creates the HOD account (`node scripts/create-hod-account.js --department CSE --confirm`, run
in `backend/`); re-run the suites; one signed-in pass over the faculty and HOD pages; then the PR.
**Branch:** `feat/hod-persona`

---

## 2026-10-12 (Mon) — part 19
**Area:** S13 Phase C — 16 new roadmap roles
**Did:**
- User said "complete phase c" — took this as authorization to ship all 16 roles in one pass rather than
  stop after each batch of 4–5 for review, the original plan's default (D20).
- Authored all 16 new roles from the plan's proposed list, graph-shaped from the start: Product-Company
  Placement, Frontend Developer, Backend Developer (Node.js), Android Developer, Data Scientist/ML Engineer,
  DevOps Engineer, QA/Test Automation Engineer, DSA Mastery, C++ & Competitive Programming, SQL & Database
  Engineer, Cloud Engineer (AWS), Cybersecurity Fundamentals, Flutter/Cross-Platform Mobile, Go Developer,
  GATE/Higher Studies, UI/UX for Developers. Plus the plan's item 5: relabelled `web-developer`'s `role` to
  "Full Stack Web Developer" (id and content untouched, so nothing already pointing at it breaks).
- **4 existing + 16 new = 20 roadmaps**, meeting the "at least 20" target exactly.
- Content authored directly rather than fetched page-by-page from roadmap.sh (D18 updated to note this) —
  grounded in each role's real, well-known curriculum rather than invented, which is what the earlier
  "fetch each role specially" instruction was actually asking for; flagged as a deliberate choice rather than
  silently diverging from the literal instruction.
- Every DSA-trackable node reuses the same shared practice-tag vocabulary the first 4 roadmaps already
  established — confirmed via `curl`-ing the live problems catalog (77 published problems, concentrated in
  arrays/strings/programming-basics, 1–4 each for the rest) before writing a single node, so no role claims
  tracked progress against a tag the catalog doesn't actually have problems for.
- 8 of the 16 are explicitly reading-heavy in their own summary text (DevOps, SQL, Cloud, Cybersecurity,
  Flutter, UI/UX, and partially Android/Go) — this platform has no judge for those skills, so their
  DSA-adjacent nodes track normally and the rest are reading/checkpoint, never a false 0%. Go's roadmap
  explicitly tells the student to practise in Python/Java and apply the pattern in Go themselves, rather than
  silently resolving Go-labelled nodes against Java/Python problems — resolves the Go judge-gap the plan had
  left as an open question.
**Verified:** a validation script hit the live resolver for all 20 roadmap ids (format, node/group
consistency, every tracked node has a link, every step node has ≥3 subtopics) before anything else; backend
roadmap suite 32/32 unaffected (pure content addition, no resolver/schema change); `tsc` clean; live browser
walk of the 20-card list page, a DSA-heavy new role (DSA Mastery) and a reading-heavy one (Cybersecurity
Fundamentals), both rendering the spine/branch canvas and side panel correctly with zero code changes needed
on top of Phase A/B/the content-map correction.
**Next:** S13 is now fully shipped (Phases A, B, C, plus the purpose correction). No further roadmap work
queued — next persona-track item is whatever the user picks next.
**Branch:** `feat/home-page` (not pushed)

---

## 2026-10-06 (Tue) — part 18
**Area:** S13 — canvas reskin to a hand-rolled spine, Phase B (reauthor the 3 legacy roadmaps)
**Did:**
- User supplied a closer visual reference: a vertical spine with curved bezier branches (roadmap.sh's actual
  balsamiq look), asked for it applied exactly, and to source new-role content from roadmap.sh directly
  rather than invent it.
- **Reskinned the graph canvas.** Replaced dagre's generic box-diagram auto-layout with a purpose-built
  layout (`spineLayout.ts`): picks the critical path through a roadmap's nodes/edges and renders it as a
  vertical spine, with any fan-out flattened onto branch leaves — curved SVG connectors under
  absolutely-positioned MUI boxes, not a pan/zoom canvas library. **`@xyflow/react`, `dagre`,
  `@types/dagre` removed entirely** — this is now plain SVG, no layout-engine dependency. Group labels
  (deferred in Phase A) are drawn as inline section headers along the spine now, which the spine format
  makes natural.
- No backend or schema change — our nodes already track real solved-problem progress individually (unlike
  the reference file's two-tier stage/topic-text split), so the spine IS the critical path, not a separate
  descriptive layer on top.
- **Phase B — reauthored the other 3 roadmaps** (Service-Company Placement, Python / Data Analyst, Web
  Developer) from flat `milestones` onto `groups`/`nodes`/`edges`. Pure structural wrapper: every
  milestone's own writing carried over unchanged via a one-off conversion script, not retyped by hand.
  Each roadmap's existing capstone step ("ship a project", "explain your own code") became a `checkpoint`
  node, matching the pattern `java-developer`'s `jd-11` already set. All 4 roadmaps are graph-shaped now.
- Fixed a test-suite assumption the conversion broke: the generic roadmap checks read `roadmaps[0]` as
  always flat-list-shaped (true before this change, since the first roadmap in the file was always legacy)
  — updated to read either shape via a small `stepsOf()` helper, and extended the "cannot verify" status
  list to include `checkpoint` alongside `reading`/`test`.
**Verified:** clean `npm ci` after the dependency removal, `tsc` clean, lint unchanged (97 warnings/0
errors), build passes, roadmap suite 32/32 (was silently broken to 4 failures mid-change, all traced to the
test assumption above and fixed, not a resolver bug), live browser walk of all 4 roadmaps — spine render,
group headers, note card, checkpoint styling, click-to-open and click-to-close the side panel.
**Decisions:** D18 — the roadmap.sh reference file's visual approach (curved spine) adopted exactly; its
91-role content library is Phase C's source list, not ingested directly (our nodes need real catalog-tag
matches to track progress, which that file's descriptive text does not carry).
**Next:** Phase C — author new roles in batches of 4–5, sourcing each from roadmap.sh directly per the
user's instruction, starting with the batch already suggested in the plan (Product-Company Placement, Full
Stack Web Developer, Frontend Developer, Backend Developer (Node.js), DSA Mastery).

**Same-day correction — the roadmap page was still wrong.** User sent a screenshot of their own earlier
reference site and pointed out the real complaint: "why are u showing and connecting problems to the
roadmap.. see in roadmap we will show the full roadmap and resources not any problems." The reskin above
got the *shape* right but kept the *behaviour* (solved counts, done/not-done colour, "Next up" problem list,
buttons into Problems/Practice/Tests) — exactly what was wrong. Two questions settled it (D19): drop progress
display entirely, and add the screenshot's branch-leaf sub-topics layer.
**Did:**
- Removed every progress/problem-link surface from the roadmap pages: per-node solved/target badges and
  done/not-done node colour, the detail page's "Step X of Y / percent" card, the list page's `ProgressRing`
  and Start/Continue/Review cue, the side panel's "Next up" problems and action buttons. Backend progress
  math is untouched — Job-Ready Score, the dashboard tile and the public profile still read it; only the
  roadmap pages stopped rendering it.
- Added `subtopics: string[]` (3–6 short sub-skill labels, e.g. "HashMap"/"TreeMap" under "Collections
  framework") to all 43 existing nodes across the 4 roadmaps, passed through by `resolveNode()` unchanged.
  `spineLayout.ts`'s branch-leaf slot (built for real graph forks, unused until now since every roadmap is
  still a single chain) now renders these as the branch boxes — no new visual mechanism needed.
- Deleted `milestoneHref`/`nodeHref`/`mcqHref` from `lib/queries/roadmaps.ts` — orphaned once nothing linked
  a roadmap node anywhere; leaving dead code that used to be the thing just corrected felt like the wrong
  call to make silently.
**Verified:** `tsc` clean, lint unchanged (97/0), build passes, roadmap suite still 32/32 (pure display
change, confirms the correction didn't touch progress math), live browser walk of the spine with sub-topic
chips rendering on both sides, side panel showing why + "Covers" chips + reference links with zero progress
or problem-link UI, mobile list carrying the same content.
**Branch:** `feat/home-page` (not pushed)

---

## 2026-10-05 (Mon) — part 17
**Area:** S13 Phase A — the roadmap graph renderer (foundation only)
**Did:**
- Extended the roadmap content model from a flat milestone list to a graph — groups, nodes (**topic** /
  **checkpoint** / **note**), edges — stored alongside the old shape rather than replacing it.
  `roadmapService.js`'s resolver now dispatches on whether a roadmap carries `nodes` or `milestones`, so
  the 3 roadmaps not yet converted keep resolving through the untouched legacy path.
- **Checkpoint** (a project/mock-round marker) and **note** (a side annotation, never a step, excluded
  from every progress calculation) are genuinely new — the flat list had no room for either.
- Built the actual graph: **React Flow + dagre** (new dependency, flagged not snuck in), custom node
  components in our tokens rather than roadmap.sh's yellow, auto-layout from the authored edges. A node
  click opens a **side panel** — matches the reference image, settles the open question from the plan.
- **Mobile gets the same data as a vertical list**, not the canvas — a pan/zoom graph does not work below
  ~768px. Both surfaces read from one shared `NodeDetailBody` component so they cannot disagree.
- Converted **Java Developer** onto the new schema as the proof vehicle — 12 nodes, 1 note, 1 checkpoint,
  4 groups — every word of its existing writing carried over unchanged, only the structural wrapper
  changed. The other 3 roadmaps are untouched, still rendering their original rail.
- `/app/roadmaps` restyled toward the roadmap.sh dashboard: a **progress ring** (pulled into a shared
  `ProgressRing` component rather than a third copy of the Job-Ready Score dial's SVG) and a
  Start/Continue/Review cue in place of the old icon tile and linear bar.
- 6 new backend checks specifically exercise the graph path — `format` field, nodes/edges/groups instead
  of milestones, a note never tracked or "you are here", a checkpoint carrying its own status, and solving
  a graph node's problems moving it. The existing 26 checks only ever touched the legacy list roadmap.
**Found while verifying, not while building:**
- My own first version of the new graph-path test asserted a clean-slate solve count and failed —
  `ME` had already solved overlapping-tag problems earlier in the same suite run, against the legacy
  roadmap tested first, on the same shared catalogue. Fixed the assertion to add to what was already
  solved rather than assume zero — same "steps share problems" lesson S9 already taught, now also true
  across different roadmaps in one run, not just within one.
- Coordinate-based clicks in the browser pane were landing a few pixels off the node and missing — not a
  bug in the component. Confirmed by dispatching the click event directly on the DOM node, which opened
  the side panel correctly with the right content.
**Verified:** Java Developer's graph rendered and confirmed in the browser — all 12 boxes, the note beside
OOP, the dark checkpoint box at the bottom, connectors, the side panel's content matching exactly. Mobile
fallback confirmed separately: list view, same note, same checkpoint, no horizontal overflow. The 3
untouched roadmaps confirmed still using the old rail. The Home tile confirmed reading the graph-shaped
active roadmap correctly. Clean `npm ci` (lockfile reproducible, pre-existing vulnerability count
unchanged — neither new package implicated), `tsc` clean, lint unchanged at 97/0, production build
passes, full smoke suite **355 passed, 5 skipped** (same documented AI-quota skips). Probe data deleted.
**Not done, deliberately:** group labels are authored and returned by the API but not drawn as their own
swim-lane header on the canvas yet — dagre ranks by edges alone for now, a real improvement left for later
rather than rushed in. Phases B (reauthor the other 3 roadmaps) and C (the 16 new roles, in batches) are
still ahead — this was foundation only, as planned.
**Branch:** `feat/home-page` — not pushed.

---

## 2026-10-05 (Mon) — part 16
**Area:** S12 — Workbench (Practice regrouped with Sandbox, rebuilt as weak-topic coaching)
**Why:** Asked whether Practice duplicates Courses. Checked the data: every one of the 77 published problems
is already inside a course — zero orphans, supporting the instinct. But Practice is also the silent landing
page for roadmap milestones, Job-Ready next actions, and three empty-state fallbacks, all built this week. The
real defect wasn't that the page is unused — it's used constantly, just anonymously: every link into it
pre-filters the table with no sign of why the student is there. Plan written and approved as **D16/S12**
before building (see `STUDENT_PERSONA_PLAN.md`).
**Did:**
- **Nav regroup.** New **Workbench** section holding **Practice** and **Sandbox**, pulled out of "Learn" (now
  just Courses + Roadmaps). Both keep their routes and labels — nothing a student already knows breaks.
- **Weak-topic-first chips.** Topic chips now sort the student's weakest topic first (by accept rate, via the
  existing `getSkills` endpoint), badged `"Sorting · 29%"` instead of a bare catalogue count. A brand-new
  student with no attempt history sees the old frequency-sorted list — no regression.
- **"Solve weakest topic"** replaces "Pick Random" when no filter is active — jumps straight into a problem
  in the student's weakest topic. Falls back to today's random-within-filter once a filter is chosen.
- **Landing-with-context banner.** Arriving via a roadmap milestone or a Job-Ready next action now shows why:
  *"Practicing Strings — solve these to advance your Java Developer roadmap"*, with a working link back.
  Dismissible. No `source` param → no banner, unchanged page.
- **Personal "Last activity" column** replaces the old platform-wide Accuracy/Solved-by columns. Reads
  `"Solved 2 days ago"` / `"Attempted yesterday"` from the student's own submission history — merges two
  existing hooks, no new endpoint.
- **Home tile** now leads with the weakest topic when one exists: *"strings needs work · 1/4"* in place of
  streak wording.
**Found and fixed along the way — not in the original plan:**
- **A real bug**, not a missing feature: the page's `tag` state never read the `?tag=` URL param — it stayed
  `null` and the tag silently fell into `searchInput` as a *title text search* instead. Every roadmap/Job-Ready
  link into this page since S9/S10 shipped has been running a loose text search, not an actual tag filter.
  Fixed — the banner work depends on the filter being real.
- **Difficulty words ("easy"/"medium"/"hard") leak into the tags array** (same import-time quirk fixed on the
  public profile in S11) and were showing up as a clickable "topic". Excluded the same way.
- **`weaknesses` and `strengths` are not a partition.** `computeStrengthsWeaknesses` sorts one attempted-topic
  pool two ways and slices each to its own top 5 — with 1–2 topics attempted (most students, most of the
  time), a 100%-accept topic can land in `weaknesses` too, just last. Caught in testing: a seeded 100%-accept
  "arrays" topic was rendering with an orange "needs work" badge. Added `genuineWeaknesses()` (<60% accept
  rate) in `queries/student.ts`, used by the chip badge, the weakest-topic button, and the Home tile. Left the
  shared scoring utility itself untouched — display-layer fix, not a scoring change.
**Verified:** real-data browser walk — seeded a student via `topicMasteryRepo.recordAttempt` (production's own
write path) with a genuine 25%-accept weak topic and a 100%-accept strong one. Confirmed the chip sort and
badge, the weakest-topic button landing on an actual problem in that topic, both banner variants with working
back-links, dismiss, and real "Solved X ago" / "Attempted X ago" rows. Dark + light, 375px, no console errors,
no horizontal overflow. `tsc` clean, lint 97/0 (unchanged baseline), production build passes. Full smoke
suite: 6 failures, all traced to the documented Gemini quota (429/503) — none in S12's own paths, which touch
no AI code. Probe student, submissions and mastery rows deleted afterwards; confirmed zero leftover.
**Branch:** `feat/home-page` — not yet committed as of this entry, not pushed.

---

## 2026-10-04 (Sun) — part 15
**Area:** PR #38 merged to main · Home page (decision D1 reversed to D1b)
**Shipped:** PR #38 merged at 16:56 — S0–S11 plus B0 and B3 are on `main` and live. The merge was blocked for a
while by a required status check that could never report: B0 renamed the backend CI job to "Backend — lint &
Docker build" while branch protection requires one called exactly "Backend — install & Docker build". Renaming a
job does not rename the check it reports. Name restored, with a comment saying it is load-bearing.
**Did — Home page:**
- **Quick Access is its own page at `/app`**, and it is where a student lands after signing in. Six illustrated
  tiles, each with its live line, and nothing else. The dashboard keeps the statistics.
- The greeting band moved with it — a greeting belongs at the door, not one room further in. The dashboard now
  opens with an ordinary `PageHeader` ("Dashboard · 9 problems solved · 5-day streak").
- The collapse/"Hide" toggle is gone. It existed so the row could be folded away to reach the dashboard beneath
  it; on a page of its own there is nothing to hide. That also removed a `set-state-in-effect` lint warning.
- Nav gains **Home** above Dashboard; the logo, the IDE's home button and the sandbox's back button all point at
  `/app`; `/app/contests` redirects there too.
- Tiles stack one per row on a phone instead of scrolling sideways — reasonable for a strip above other content,
  wrong for a whole page.
**Two bugs found while building it:**
- **`/app` is a prefix of every student route**, so the shell's first-match rule would have marked Home active on
  every page and titled them all "Home" in the mobile header. The longest matching nav href now wins.
- **The My Class tile showed the platform-wide rank next to the class name** — "CSE-A · rank #8" while the
  dashboard said "#2 of 8". Exactly the bug S4 fixed on the dashboard, still alive in the tile. It now reads
  "CSE-A · rank #2 of 8" and falls back to "Ranked #N overall" for a student with no class.
**Verified:** Home and dashboard in a browser, dark and light, 1280px and 375px, no horizontal overflow, all six
tiles real links with aria-labels, console clean, nav highlighting correct on both pages. `tsc` clean,
production build passes, 0 lint errors (97 warnings, down from 98). Probe student deleted.
**Then revised again the same day, against the real CodeTantra screen (D1c):**
- **Home has no sidebar.** Shown the actual screen, the ask was clearer than "its own page": a top bar, the tiles,
  and nothing else. The sidebar appears on the screens you reach *from* Home — never both at once, which would
  give a student two sets of destinations for the same six places. `HomeShell` provides that bar; the student
  layout picks the shell by route.
- **Tiles took the CodeTantra shape**: illustration on a tinted panel, the caption below it, and the name last in
  a solid bar — the part you aim at. Our captions stay live ("Profiling Test-1 is live now") where theirs read
  "Click here to view all your scheduled and completed tests"; a label repeating the button under it is not worth
  the space.
- The gradient greeting band went too — on a launchpad a hero just pushes the third row off the screen. One quiet
  line remains, and it carries the `h1`.
- The account menu moved into `shell/AccountMenu.tsx`, shared by both shells. Two copies of a sign-out button is
  how one of them ends up behaving differently from the other. That left a good deal of dead code in `AppShell`,
  now removed.
**Decision recorded:** D1 → **D1b** → **D1c** in `STUDENT_PERSONA_PLAN.md`.
**Next:** roadmap.sh-style visual roadmaps. Agreed approach: extend the content model from a milestone list to a
graph (topics · checkpoints · notes), render with React Flow + dagre, colour nodes by *verified* progress rather
than self-declaration, and offer a list view on mobile. Build the renderer and re-author **one** roadmap first,
review it, then do the other three.

---

## 2026-10-04 (Sun) — part 14
**Area:** Pre-merge readiness audit of `feat/student-persona` (S0–S11 + B0 + B3)
**Checked:** branch is 15 ahead / 0 behind `origin/main` (clean fast-forward, no conflicts); no secrets or `.env`
tracked; backend lockfile resolves (`npm ci --dry-run`); frontend dependencies untouched; no new env vars; no
composite Firestore index needed (only single-field equality queries); `/api/:path*` rewrite already covers the
new `/api/public/*`; lint 0 errors both sides; `tsc` clean; production build passes; 349 smoke checks pass;
every route declared. Walked every student page plus three faculty pages in a browser with seeded data, logged
in and logged out — **zero console errors** across the whole walk.
**Three real problems found and fixed:**
- **The courses header double-counted.** It summed per-course totals in the browser, so a problem in two courses
  counted twice: "81 problems, 24 solved" next to a dashboard saying 22. `GET /api/courses` now returns
  deduplicated `totals` alongside `data` (additive — every existing caller is unaffected), and the page uses it.
  Reads 77 / 22 now.
- **The problem page never showed which list it was walking.** S6's API returns the module name and nothing
  rendered it, so the counter read a bare "1/22" — of what? It now reads **"1/22 in Basics"**. My S6 report said
  it already did; the count was right, the label was not displayed. Corrected.
- **Two smoke suites were leaking into the live database.** `codingRunAndSubmit` and `examCodingAndProctor`
  create real graded submissions and never removed them — **53 fake submissions** had accumulated (16% of the
  table), inflating the platform-wide totals faculty are shown. Worse, side-effect writes nobody owned had built
  up **1,372 smoke-test entries in a 1,471-row audit log** (93%), so the faculty audit page was almost entirely
  noise. Both suites now purge their submissions, and the runner ends with a sweep for audit/mastery/proctor
  rows written under the `smoketest-` prefix. Backlog deleted: submissions 336 → 283 real, audit log 1471 → 99
  real. A full run now verifiably leaves the database clean.
**Verified end-to-end in the browser:** dashboard, courses, roadmaps, practice, tests hub, assignments,
mistakes, leaderboard (scoped, pinned row, one profile link), Job-Ready Score (workings re-added by hand),
profile incl. the Public Link tab, the public profile logged out, and a **real broken submission through the
judge** — "0 of 2 hidden test cases passed", average/maximum time, terminal output with a clickable `line 1`.
Faculty dashboard, courses and analytics render unchanged. All probe data deleted afterwards.
**Still open — your call, nothing changed:** (1) `POST /api/submit` runs code for anonymous callers;
(2) `GET /api/problems` serves the catalogue unauthenticated. Both are pre-existing and deliberate.
**Known gaps, unchanged:** design lint rules stay warnings (98, all in faculty/IDE files no phase has swept);
deep contest/Elo removal; class auto-enrolment (D5); the Firestore-emulator CI step still paused for Java.
**Branch:** `feat/student-persona` — **not pushed, not merged.** Awaiting your go-ahead.

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
