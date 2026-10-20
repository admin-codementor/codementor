# Build plan from the CodeTantra and CampusTrack walkthroughs

**Written:** 2026-10-20 · **Owner:** Srinivas · **Inputs:** `docs/CODETANTRA_REVIEW.md`, `docs/CAMPUSTRACK_REVIEW.md`,
the earlier `docs/COMPETITOR_UX_RESEARCH.md` and the pick-list in `docs/FACULTY_HOD_PERSONA_PLAN.md` §6, and a check of our own
code on 2026-10-20 so that nothing already built is proposed again.

Rules, same as the persona plans: one phase = one PR; every phase has offline tests (`npm run test:pure`) and a browser check;
empty / loading / error states on every screen; the CSV and other private data stay out of this public repo; anything that writes
to the live database is run by Srinivas with a dry run first; each phase gets a dated entry in `docs/PROJECT_LOG.md`.

---

## 1. Correction first

My two review documents (written earlier today) listed Mentor Mapping, Portfolio, Placement, Alumni, Labs, Messages, AI
insights, Department Activity and the department leaderboard as "gaps". **They are not gaps.** They were built in H3 to H11
(PR #40) and are tabs of `/faculty/department` (Overview, Weekly progress, Rankings, Departments, Activity, Mentors, Portfolio,
Placement, Labs, Alumni). The 2026-10-12 walkthrough had already recorded most of what I saw this week. This plan is therefore
only the **difference**: what the two products do that we still do not. `docs/CAMPUSTRACK_REVIEW.md` §3 is corrected to match.

## 2. Already built (do not rebuild)

- HOD department dashboard with funnel, flags, badge ladder, trend, insights, Rankings, Weekly progress, Activity (7/30/90 days),
  Mentors and mentor leaderboard, Portfolio completeness, Placement drives and analytics, Alumni, Labs, Departments leaderboard.
- Student state (`not_started`, `stuck`, `gone_quiet`, `practising`), the badge ladder (same seven tiers), at-risk rule.
- Faculty analytics (Pulse, Cohorts, Problems and MCQs: per-problem funnel, attempts histogram, test-case hotspots), course
  analytics (completed / in progress / not started, unit-wise bars, per-class table), per-student drill-down, exam report with integrity tab.
- Student groups, proctoring, clipboard guard, plagiarism, AI tutor, messages (accept / block / report; unread flag per thread).
- Coding profiles page: Codeforces and LeetCode synced live, HackerRank / CodeChef / GfG stored as links only.
- Activity heat map (faculty analytics, student dashboard); module due dates (`dueAt`).
- This week (PR #42): Python course import tooling, exact-output grading, function driver, Python 3.12, Hints tab, server-saved
  problem timer plus personal timer, runtime / memory comparison graph, problem page redesign.

## 3. Findings and their status

| # | Finding (from which product) | Status in CodeMentor | Phase |
|---|---|---|---|
| F1 | Per-question statistics by group: completed / in progress / not started, average time, best and weakest, compile-failed vs run-failed, time histogram, per-student table (CodeTantra) | Partial: cohort-level per-problem funnel exists; no per-student table, no time, no failure split | 2 |
| F2 | Resume card, "units left", per-unit progress on the learner's course page (CodeTantra) | Missing | 1 |
| F3 | Lessons inside problems: concept text, highlighted terms, picture, then the task (CodeTantra) | Missing (course has objective and hints only) | 1 |
| F4 | Statement polish: copy per sample line, whitespace marker in output diffs, section numbering (CodeTantra) | Partial (copy on examples done; rest missing) | 1 |
| F5 | Course activity report: period filter, per-student time / solved / submissions, CSV (CodeTantra) | Partial (department Activity exists, no course-level report, no time) | 2 |
| F6 | Time spent per student per course, daily trend (CodeTantra) | Data now collected per problem; not shown to faculty | 2 |
| F7 | "Suspicious activity" per course problem (CodeTantra) | Signals exist (clipboard log, similarity); not shown per problem | 2 |
| F8 | "What to look at" panel and funnel widget outside the department page (CampusTrack) | Only on the department page | 2 |
| F9 | Report catalogue: late submissions, reopen requests, user-wise, daily-wise, summary (CodeTantra) | Missing | 3 |
| F10 | Reopen-request flow (student asks, faculty approves) (CodeTantra) | Missing | 3 |
| F11 | Calendar of assignments, assessments, due dates; unit release schedule; exam entry-stop time (CodeTantra) | Partial (`dueAt` only) | 3 |
| F12 | External platform scores combined into one score with per-platform thresholds, flags and a visible formula (CampusTrack) | Missing (profiles only; two platforms live) | 4 |
| F13 | Resume score (ATS), interviews tracked, placement readiness bands (CampusTrack) | Missing (H8 says "not built") | 5 |
| F14 | Mock interview practice, Job-Ready Score arithmetic fix | Missing / known bug | 5 |
| F15 | Unread badge in the navigation, nudges and a weekly digest | Partial (unread flag only) | 6 |
| F16 | Public profile percentile badge (CampusTrack) | Missing | 6 |
| F17 | "Online now" presence (CampusTrack) | Missing (needs heartbeats) | 6 |
| F18 | Environment check page for exam machines (CodeTantra) | Missing | 7 |
| F19 | Several faculty per class (co-teach) (CodeTantra) | Missing | 7 |
| F20 | Code debugger, QR / document scanning for paper exams, role switch (CodeTantra) | Missing | 8 |
| F21 | NBA / NAAC evidence reports, T&P and Admin personas | Missing, next persona phases | 8 |

## 4. Phases

Effort: S = about a day, M = 2 to 4 days, L = a week or more (one person, includes tests and a browser check).

### Phase 0: Land what is built (before anything new)
- Merge #41, then retarget and merge #42; confirm Vercel and Render are green.
- Run the Python course import (draft), faculty reviews it, then `--publish`; one student pass (open, run, submit, hint, graph, timer on a second device).
- Watch Firestore usage for a week (timer writes, student-state reads).
- **Done when:** the course is live and one real student has solved a problem end to end. **Effort:** S plus waiting.

### Phase 1: Make the Python course a real learning experience (F2, F3, F4)
- **Resume card and unit progress** on `/app/courses/[id]`: "Pick up where you left off" (last unvisited / unsolved problem), progress per module, "N problems left". Backend: a small `GET /api/courses/:id/resume` from existing submissions. **M**
- **Lessons inside problems:** optional `lesson` markdown on a problem, shown above the statement with key terms highlighted (`**term**` renders as a chip). The importer takes it from a new CSV column or a separate lessons file. **Needs the course authors to write the teaching text**; build the field and renderer first, fill content as it arrives. **M**
- **Statement polish:** copy button on every sample line, a visible whitespace marker in Expected vs Your output, "2.1.3" numbering from module and position, "Prev / Reset / Next" bar parity. **S**
- **Done when:** a student can leave a course and return to the exact next problem; a lesson problem reads as teach, then practise. **Risk:** content authoring is the long pole.

### Phase 2: Faculty insight on top of the data we now collect (F1, F5, F6, F7, F8)
- **Per-question statistics:** on a problem in a course, a drawer with a class / group picker: totals (completed / in progress / not started), average time, best and weakest performer, compile-failed and run-failed counts, time-spent histogram, flagged students, and a per-student table (status, submissions, failures, time). Backend: aggregate `submissions` by problem plus `problemTimes`. **M**
- **Course activity report:** period filter, groups, tiles (active, suspicious, submissions, average active time), most active groups / students, time by weekday, per-student table with CSV. Reuse the analytics kit. **M**
- **Time on the faculty screens:** time-to-solve and time spent in per-student page, course analytics, and the problem drawer. **S**
- **Suspicious per problem:** surface clipboard events and similarity per problem and per student in the drawer. **S**
- **"What to look at" and funnel widget** in `/faculty/analytics` and course analytics (the logic exists in `studentState.js` and department insights). **S**
- **Done when:** a faculty member can answer "who is stuck on question 14 and for how long" in two clicks. **Risk:** read volume; every aggregate is cached and uses field masks.

### Phase 3: Reports, reopen requests and scheduling (F9, F10, F11)
- **Report catalogue** page: Late submissions, Daily-wise, User-wise, Summary, Group-wise course, each "pick a group or course, then fetch", with CSV. Late = submitted after the module or assignment due date (already stored). **M**
- **Reopen requests:** a student asks to reopen a closed assignment or module with a reason; faculty approves or declines; an audit entry; the student sees the decision. New collection, one notification each way. **M**
- **Calendar:** assignments, exams, module due dates and reminders on one calendar (day / week / month). Unit release dates (a module opens at a date). Exam entry-stop time if not already present. **M**
- **Done when:** a faculty member can list everyone who submitted late this week and reopen one student's access. **Risk:** policy decisions (who may approve, how long a reopen lasts).

### Phase 4: External coding-platform score and flags (F12)
- **Decision first:** which platforms are reliable (Codeforces and LeetCode already; GitHub is easy; HackerRank, CodeChef and GfG have no stable public API, so either stay link-only or add fragile scraping). I recommend the three reliable ones plus our own score.
- **Formula:** normalised per platform with caps so one outside rating cannot dominate (CampusTrack's does), shown in full in a "Formula" dialog.
- **Flags:** red / orange / green per platform and overall, thresholds editable by the HOD per year, "Thresholds" dialog.
- **Where:** student "My coding profiles" shows the score; HOD Rankings and Overview get platform columns and flags; weekly refresh by a scheduled call to a protected endpoint (GitHub Actions cron, free) plus a manual Refresh.
- **Effort:** L. **Risk:** third-party rate limits and layout changes; store snapshots, never block a page on a fetch. **Quota:** one write per student per platform per refresh.

### Phase 5: Placement readiness (F13, F14)
- **Resume check:** a student uploads or pastes a resume; the AI gateway scores it (sections, keywords, length) and explains the fixes; the score is stored. **L**
- **Mock interviews:** AI-led practice with a scorecard; counts toward readiness. **L**
- **Placement readiness bands** on the HOD Placement tab (resume score, interviews, practice, drives). Fix the Job-Ready Score arithmetic found in the accuracy audit first. **M**
- **Risk:** AI cost (rate-limited through the gateway), privacy of resumes (own-department staff only, never in analytics).

### Phase 6: Engagement and communication (F15, F16, F17)
- Unread badge in the navigation; weekly digest and nudges ("you were quiet for 7 days", "3 problems left in Module 4") by email (a free provider) with an opt-out. **M**
- Public profile percentile badge with a Year / College toggle. **S**
- "Online now": only if the college wants it, since it needs a heartbeat every minute (quota). **S, defer**

### Status after Phases 3 to 6 (branch `feat/phases-3-7`)
Built: Phase 3 (reopen, reports, calendar, unit release), Phase 4 (coding score), Phase 5 (resume, mock interview, readiness), Phase 6 (unread badge, in-app reminders, cohort badge).
Where it differs from the plan above: the **resume check is rule-based and pasted as text**, not AI-scored and not uploaded (free, same answer every time, no resume stored);
the **coding score refreshes by a manual HOD button** (20 profiles per click), no weekly cron yet; **reminders are in-app only**, no email digest; the **cohort badge ranks within the student's
year and department** (no Year / College toggle), under the existing "show my score" switch; **unit release is a soft lock** in the UI, the direct URL still opens.
Not built (scope stopped at Phase 6): Phase 7 (environment check, co-faculty), Phase 8, email digest, "online now".

### Phase 7: Exam-day and class tools (F18, F19)
- Environment check page (browser, camera, microphone, fullscreen, network, clock) students run before an exam. **M**
- Co-faculty on a class or group (read for co-faculty, write stays with the owner). **S**

### Phase 8: Later, separate persona phases (F20, F21)
- Debugger (step through code), QR / document scanning for paper exams, T&P and Admin personas, NBA / NAAC evidence reports,
  contests and ratings audit, UTC vs IST for streaks, exam and contest submissions kept out of practice stats.

## 5. Recommended order and why
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Phases 0 to 2 turn the Python course from imported to taught and give faculty the
questions they ask first; they need no new third-party service. Phase 3 is policy-heavy so it benefits from faculty feedback
after Phase 2. Phase 4 and 5 are the largest and depend on decisions (platforms, AI cost). Phase 6 and later are polish and scale.

## 6. Decisions needed from you
1. Who writes the Python lessons (Phase 1), and in what form (a column in the CSV, or a separate document)?
2. Reopen requests: who approves (the course owner, the HOD, either) and for how long does access reopen (Phase 3)?
3. External platforms: which of HackerRank, CodeChef, GfG are worth fragile scraping, or stay link-only (Phase 4)?
4. Thresholds: one college default, or editable per year by the HOD (Phase 4)?
5. Is "online now" wanted, given the write cost (Phase 6)?
6. Do you want email digests at all, and from which sender (Phase 6)?

## 7. Cross-cutting
- **Firestore free quota** is the main constraint (20k writes a day). Every phase states its write cost; aggregates are cached or
  precomputed; nothing reads the whole submissions collection per request.
- **Public repo:** no student data, no solutions, no hidden tests, no credentials, no competitor content copied.
- **Verification:** offline tests for every calculation, browser check as faculty / HOD with a minted session, one real student pass
  after deploy (I cannot sign in as a student).
