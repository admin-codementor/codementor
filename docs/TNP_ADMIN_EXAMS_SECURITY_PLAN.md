# Plan: T&P and Admin personas, faculty model, exams, security and scale

**Status: plan only. Nothing in this document is built.** Written 2026-10-26 after the owner's answers and the code review below.
Nothing is decided until the "Open questions" at the end are answered; where I had to pick a default I say so.

Order of personas (locked): Student, Faculty, HOD, **T&P, Admin**. Super Admin is not built; Admin is the top role.

---

## 0. Decisions already made by the owner

| # | Decision |
|---|---|
| D-1 | T&P is the **college-wide placement cell**: new role `tnp`, sees placement data for all departments, no teaching data. |
| D-2 | Admin owns **people management, college-wide overview, college settings, audit and security**. |
| D-3 | No Super Admin. Admin is the top role. |
| D-4 | Eligibility = department, year, **CGPA, backlogs**, uploaded by T&P / Admin from college records (CSV, dry run first). |
| D-5 | Students **see eligible drives and apply in-app**. A drive may also carry an **outside link** (company form, WhatsApp). Outside applications are optional for T&P to record afterwards; analytics label them "recorded by T&P". |
| D-6 | HOD is **view-only on drives** once T&P exists. |
| D-7 | **One-offer policy: dream-tier only.** A placed student may apply again only to drives marked dream tier. |
| D-8 | T&P can **override eligibility** for one student, with a written reason, audited. |
| D-9 | T&P sees **scores but never code, answers or messages**. |
| D-10 | **2FA is mandatory** for Admin and T&P. |
| D-11 | Faculty data is **class-scoped and term-based**: HOD allocates classes each semester; faculty see only their classes; new courses/assignments/tests only for classes they are assigned. |
| D-12 | Each class has a **class teacher (mentor)** and **sub-mentors for roll-number ranges** (for example 1 to 24, 25 to 48). Students see both. |
| D-13 | Faculty get **no default courses**. Courses are owned by Admin; faculty reach data and courses by **request** to HOD or Admin. |
| D-14 | Faculty dashboard is **dynamic by selected class** and customizable. |
| D-15 | An exam attempt that was cut off (network, browser, device) can be **resumed for one student** by an authorised person. |
| D-16 | Targets: **500 to 1000 students writing and running code at once**, **3000 users logged in at once** with only a few crashes tolerated. |
| D-17 | Cheating through the browser console or tampering must not work, and must be **reported with the reason** to the student and the Admin. |
| D-18 | **Timeline:** the next large exam is within 2 weeks; the owner wants everything built in the plan's order, fast. (See section 15 for what I can honestly finish in 2 weeks.) |
| D-19 | **Hosting:** not decided. The owner will give the **college a written requirement** (what is needed to run without crashing); build everything now and scale in parallel. I produce that requirement document (S2.0). |
| D-20 | **Integrity email:** automatic **only for hard evidence** (tampered or replayed requests). Soft signals (tab switch, fullscreen) go to the exam owner first. |
| D-21 | **Who may resume an attempt:** Admin, the exam's owner faculty, and the department HOD; each resume needs a written reason and is audited. A T&P coordinator only if named later. |
| D-22 | **Violations:** warn, flag, **lock after N** (N set per exam). Nothing auto-submits before the server deadline. |
| D-23 | **Second device:** the new device **takes over**; the first is told; logged as a possible flag. |
| D-24 | **Email:** a free transactional service sending from a college address. |
| D-25 | **No human security reviewer is available.** Exams recur, so the exam engine is built as **one reusable, hardened module**, and its security is checked by an **automated attack-test suite that runs on every change** (section 4, item 12). I will state clearly that no human review was done. |
| D-26 | **Faculty dashboard:** class switcher plus show, hide and reorder widgets, saved per user. |
| D-27 | **Faculty access after a class assignment ends:** none, unless granted by HOD or Admin. |
| D-28 | **Pilot** of the class and mentor model: **CSE (AIML)**. |
| D-30 | **Students use any network** (home Wi-Fi, mobile data, hotspot). The app must be light and resilient (section S2.8); IP address is never used as evidence of cheating. |
| D-29 | **No rented cloud.** Run on the **college's own hardware** with **Kubernetes (K3s)** for automatic scaling and load balancing. |

---

## 1. What the code does today (facts, read from the repo on 2026-10-26)

- **Roles.** `student`, `faculty`, `hod`, `admin`. Staff share the `faculty` collection with a `role` field (`userRepository.js`). No `tnp`.
- **Classes.** Faculty create classrooms with a join code (`classroomRepository.js`). A class has members, **no term, no sub-mentor, no HOD allocation**. A student has a single `mentorId`.
- **Placement.** Drives belong to **one department** and are managed by HOD and admin. Eligibility is by **year only**. Students never see drives.
- **Exams.** The window and duration are enforced on the **server**; a resumed attempt keeps its original clock; expiry auto-submits on the server (`exam.controller.js`).
  But **leaving fullscreen for longer than a grace period auto-submits from the browser** (`useProctor.ts`), and proctor events (tab switch, paste, devtools, fullscreen) are **reported by the browser itself**, so a tampered client can simply not report them.
- **Exam lock.** The AI tutor is blocked while a student is in an exam (`examLock.js`), with an explicit and an implicit layer.
- **Security baseline** (from `docs/scale-readiness/05-auth-and-security.md`): Firebase handles passwords; refresh re-reads permissions; sandbox isolates code with the network off; audit log exists; input validation on the submit path. Open findings listed there: F12 verify Firestore rules, F2 fail-closed limiters, F17 `trust proxy`, F13 shorter refresh and `tokenVersion`, F14 enable CSP. **I have not re-verified which are done; that is the first task of S0.**
- **Hosting now:** Vercel (frontend), Render free tier (backend), the **public Judge0** (`ce.judge0.com`). The scale programme (`docs/scale-readiness`) assumes a persistent backend and a 16-core college server for the 1000-user design peak.
- **CI today:** backend install and Docker build, frontend lint and build, Vercel preview. No security scanning, no load test in CI.

---

## 2. Honest framing

1. **Nothing is unhackable.** The achievable goal is: cheating and tampering are **hard, detected, attributed and reported**, and a compromised student browser can never change a score, a deadline or another student's data. The one rule that delivers this: **the server is the only authority.** The browser is a display and an input device; it is never trusted.
2. **"Built with AI, so it gets hacked."** The real risk is *unreviewed* code, and that applies equally to human code. What reduces it: automated scanning on every PR, a written threat model for each risky feature, tests for every access rule, a human or independent review of the exam, auth and judge paths, and no unreviewed dependencies. S0 is built around that. I will not claim it is "secure"; I will claim what was tested and what was not.
3. **1000 simultaneous code runs is not possible on the current setup.** The public Judge0 and a free Render instance cannot do it. It needs the college server as in the scale programme (D-29: no rented cloud). The plan is gated on that decision (question 2).
4. **Browser console cheating.** A student can always open devtools. We cannot stop that; we make it **useless** (nothing valuable to change: scores, timers, answers and test cases are server-side) and **visible** (signed requests, anomaly rules, integrity log).

---

## 3. Work streams and order

| Stream | What | Size | Depends on |
|---|---|---|---|
| **S0** Security and DevOps baseline | scanning, access-matrix tests, headers, backups, staging, open findings | L | none; **first** |
| **S1** Exams: reliability, integrity, new screen, resume | server-authoritative attempts, autosave, resume, redesign, integrity reports | XL | S0 (partly parallel) |
| **S2** Scale and load | infra, queue, caching, load tests, monitoring, exam-day playbook | XL | infra decision; S0 staging |
| **S3** Academic structure | terms, classes, mentors, sub-mentors, faculty scoping, access requests, rollover | XL | S0 |
| **S4** Faculty dashboards | class switcher, dynamic and customizable | L | S3 |
| **S5** T&P persona | role, drives, eligibility, student Placements page, exports | XL | S0, S3 (students per term) |
| **S6** Admin persona | people, overview, settings, audit and security | XL | S0, S3 |
| **S7** Errors and self-healing | error envelope, friendly messages, retries, auto-repair | M, cross-cutting | starts in S0 |

**Proposed order** (changes with the answers to questions 1 and 2):
A. S0 + S7 foundations, S1.1 to S1.3 (reliable attempts and resume), because the next real exam is the biggest risk.
B. S3 data model and faculty scoping, then S4.
C. S1.4 to S1.6 (exam screen, integrity engine) together with S2 (scale work and load tests).
D. S5 T&P.
E. S6 Admin.

Each stream ends with the usual gate: offline tests, lint, route audit, build, a browser check, and an honest "not verified" list.

---

## 4. S0: Security and DevOps baseline

**Goal:** every later feature lands on a pipeline that blocks insecure changes, and access rules are written once and tested.

1. **Close the known findings** F12, F2, F17, F13, F14. First step: verify each (today's state is unknown to me).
2. **One access matrix as the single source of truth** (`backend/src/config/accessMatrix.js`): role × area × action, scoped by own / class / department / all. It drives (a) the route middleware, (b) a generated test that asserts a **403 for every role that should not have access on every route**, (c) the docs table. Adding a route without an entry fails CI (extends the existing route audit).
3. **CI gates** (GitHub Actions, free tier): lint, offline tests, route audit, **CodeQL** (SAST), **Semgrep** rules for Express and Next, **npm audit** and **Dependabot**, **gitleaks** (secrets), **Trivy** (Docker image), **OWASP ZAP baseline** against staging. Branch protection: a PR needs green checks and a review.
4. **Input validation** with a schema library (zod) on every mutating endpoint; one error envelope (see S7).
5. **Hardening:** `helmet` headers, strict CSP (F14), HSTS, CORS allowlist, cookies/tokens as the review recommends, `trust proxy` verified, Cloudflare (free) in front for TLS, WAF rules, bot and DDoS protection and caching.
6. **Accounts:** 2FA mandatory for Admin and T&P (the `twofa` code exists), recommended for HOD; `tokenVersion` so a role change or deactivation logs the person out within minutes; short sessions for Admin and T&P.
7. **Audit log:** append-only, every Admin and T&P write records who, what, how many and before and after; alert on any new staff-role account; Admin cannot delete audit rows.
8. **Staging environment** separate from production (separate Firebase project, separate secrets). Deploys go to staging first.
9. **Backups:** scheduled Firestore export plus a **restore drill** (a backup nobody has restored is not a backup). Backup runs before any bulk import or rollover.
10. **Dependency policy:** no new package without checking it exists, its age and weekly downloads (guards against fabricated package names); lockfile always committed; pin versions.
11. **Threat model** per risky feature (exam attempt, resume, CSV upload, role change, export) in one page each: assets, attackers, abuse cases, controls, tests.
12. **Automated attack tests instead of a human reviewer (D-25).** The exam engine is one reusable module with a single entry point for every exam type, so it is hardened once and reused. A suite of **adversarial tests** runs in CI on every change and in the exam-day pre-flight, and tries exactly what a student could try in the browser console: change the timer, replay or edit a save, submit twice, submit after the deadline, read another student's attempt, call a faculty route, read the answer key, skip the second-device rule, send an oversized or malformed payload, forge the attempt token, and race two submits. Each must be **rejected, logged and (for hard evidence) reported**. Together with CodeQL, Semgrep and the dependency and secret scans this is the substitute for a person; it is **not equal to one**, and every report will say so. This is not "testing again and again by hand": it is written once and re-runs by itself, so a later change cannot quietly reopen a hole.

---

## 5. S1: Exams

### 5.1 Server-authoritative attempts
- The attempt lives on the server: `serverStart`, `serverDeadline`, state `in_progress | submitted | auto_submitted | reopened`.
- **Autosave:** answers are sent every few seconds and on change with a **sequence number**; the server keeps the latest. Leaving, crashing or closing the browser therefore **loses nothing**.
- **Scoring only on the server.** Verify that no endpoint ever returns correct answers or hidden test cases before submission (a test for this).
- **Signed attempt token** (HMAC, bound to user, exam and session) on every exam request; replayed or altered requests are rejected and logged.
- **One active session per attempt.** A second device either takes over (the first is told) or is refused. *(question 8)*
- **Randomised** question and option order per student, seeded on the server. Per-student question variants are optional later.
- **Idempotent submit:** pressing submit twice, or retrying after a timeout, never double-submits or double-scores.

### 5.2 Disconnect and violation policy
- Today: leaving fullscreen past a grace period **auto-submits from the browser**. That is the source of the unwanted warnings and of accidental submissions.
- Proposed: **the clock keeps running on the server; only the server deadline submits.** Leaving fullscreen shows one calm, short notice, logs an event, and offers one-click return. Violation thresholds are **per exam**: warn, flag for review, optional lock. A lock pauses the student until the exam owner or Admin decides (so a false alarm costs minutes, not the exam).
- Exact thresholds and what happens at each step: *(question 6)*.

### 5.3 Resume a cut-off attempt (D-15)
- An authorised person opens the exam's live roster, picks the student, gives a **reason**, and chooses the extra time (capped).
- The attempt reopens **with the saved answers**, the student is told, a one-time reopen token is issued, and the attempt is marked "resumed" in reports and analytics.
- Everything is audited (who, why, how long). Limits: a maximum number of reopens per attempt; a reopen after the window needs Admin.
- Who may do it: *(question 5)*.

### 5.4 New exam screen
- Reference: CodeTantra exam screen (the owner offered screenshots; `docs/CODETANTRA_REVIEW.md` has my earlier view-only notes).
- Flow: **pre-exam check** (browser, fullscreen, network, clock; this is the old "environment check") then **start**, **questions** with a palette, **review and submit** summary, **receipt** ("submitted at 10:42:15, answers saved").
- Rules for the screen: one timer, one **saved** indicator, one **connection** indicator, **at most one message at a time**, calm wording, no stacked warnings, big touch targets, keyboard friendly, works on a low-end laptop and a 5 Mbps line.
- The design pass uses the existing `codementor-ui` rules and is shown to you as a layout for approval before it is built.

### 5.5 Integrity engine and reporting (D-17)
- **Signals:** tampered or replayed requests (hard evidence), impossible timings (solved in 2 seconds), identical or near-identical code (JPlag exists), devtools / paste / tab / fullscreen events (soft evidence), submitting after the deadline. **A changing IP address is NOT a signal** (D-30): students use any Wi-Fi, mobile data or hotspot, and mobile addresses change constantly. Two different devices at once is handled by the second-device takeover rule (D-23), not by IP.
- Each flag stores **what, when and the evidence**. Hard evidence and soft signals are kept apart.
- **Reporting by email** to the student and the Admin with the reason. My recommendation: send automatically only for **hard evidence**; soft signals go to the exam owner for review first, because an automatic accusation based on a flaky network is a false accusation. *(question 4)*
- Students get an **appeal** path (a short form to the exam owner), and every decision is logged.

### 5.6 Resilience for students
- Local draft backup in the browser (IndexedDB) in case the network drops; automatic retry with backoff; "your work is safe" message on reconnect; queue-position message when the judge is busy (never a bare error).

---

## 6. S2: Scale and load (D-16)

**S2.0 College requirement document (D-19).** A written, numbers-first request for the college IT team: CPU, RAM, disk, network (bandwidth per student, firewall and port rules, no inbound access needs), uptime and backup expectations, power and a fallback, and what we will and will not run. Built from `docs/scale-readiness/20-server-request.md` and `docs/INFRA_REQUIREMENTS_GUIDE.md`, updated with the exam-day load and the security controls in this plan. **Deliverable within the first days**, so the college can start approvals while the build proceeds.

**Targets (proposed, to be confirmed):** 1000 students running code at the same moment with a verdict in ≤ 20 seconds at the peak; MCQ exams with 1000 concurrent and no judge load; 3000 logged in with graceful slowdown; API p95 under 500 ms; the exam page loads in under 3 seconds on 5 Mbps.

1. **Execution:** Judge0 on dedicated workers sized per `09-judge0-capacity.md`; callbacks instead of polling; a per-user in-flight cap; queue position shown; never the public Judge0 for exams.
2. **API:** a persistent Node service behind a load balancer with at least two instances, health checks and automatic restart; Redis for cache and rate limits; the read-amplification fixes (PR-01); pagination; denormalised counters; Firestore **Blaze plan** (the free read cap would end an exam in minutes) or the Postgres move (decision D8).
3. **Frontend and bandwidth:** CDN, code splitting, Monaco self-hosted and cached, a **byte budget** for the exam page, compression, cache headers. We **measure** bytes per student session instead of guessing.
4. **Load testing:** k6 scenarios S1 to S4 from `06-load-model.md` against staging; pass criteria written first; a 3-hour **soak** test; **chaos tests** (kill an instance, slow the judge, slow Firestore).
5. **Observability:** Sentry (errors), Grafana Cloud or Prometheus (metrics), an uptime monitor, an **exam-day dashboard**, alerts to email and a chat app, a status page.
6. **Exam-day playbook:** pre-flight checklist, deploy freeze, warm-up, named roles, rollback steps, a "degraded mode" (if the judge is down the MCQ section continues and coding submissions queue).

### S2.7 Elastic capacity on Kubernetes (D-29)

- **Platform:** **K3s** (a lightweight, single-binary Kubernetes) on the college hardware. All manifests live in git (Helm charts) and CI applies them, so the cluster can be rebuilt from the repo.
- **API:** a Deployment with a **Horizontal Pod Autoscaler** (CPU and request latency), minimum 2 copies, maximum set by the server's cores. **Judge0 workers:** a Deployment scaled by **KEDA** on the queue length. Because the machines are fixed, new copies start in **seconds**, so reactive scaling is fast enough; we still **pre-warm** from the exam schedule (raise the minimum 30 minutes before an exam from its student count and language mix, lower it after the end time).
- **The ceiling is the hardware.** "Beast mode" can use every core the college gives and no more. When the cores are all busy the **queue** absorbs the peak (the 20-second verdict design); beyond that, verdicts slow down but nothing is dropped. More headroom only comes from more college machines joining the cluster.
- **Quiet times:** pods scale down and the cores are free for other people's work. The electricity saving on a physical server is small; the benefit is shared use and no waste.
- **One machine is one point of failure.** Kubernetes restarts crashed pods but cannot survive a dead machine. We ask the college for **two machines** (section 3 of the college document); with one, we accept restart-only recovery and say so.
- **Judge0 on Kubernetes is the technical risk.** Its sandbox needs privileged containers and is known to need the older cgroup v1 on the host (or specific kernel settings). **First task of S2: a one-day spike** proving Judge0 runs correctly on K3s on the college's operating system before anything else depends on it. **Fallback:** Docker Compose on the same host with the same images.
- **Operations burden (honest):** Kubernetes adds moving parts for one maintainer. Mitigation: K3s with a minimal set (ingress, metrics, KEDA, Prometheus and Grafana), everything declarative, a written runbook, and a **recovery rehearsal** (rebuild the cluster from git) before the first graded exam.
- **Guard rails:** resource requests and limits on every pod, a maximum on every scaler, pod disruption budgets, and an alarm if capacity stays high after an exam ends.
- **Efficiency first:** fewer database reads and caching come before scaling, because scaling a wasteful path only wastes more.
- **Verified how:** the load test includes scale-up and scale-down runs and a killed-node test; the pre-warm is tested against a scheduled dummy exam before it is trusted.

### S2.8 Works on any student network (D-30)

- **Weight budget:** first load about 3 MB (then cached); about 100 KB per student per minute while working; compressed responses; every page usable on about a 1 Mbps hotspot. We measure bytes per page and fail CI if a page grows past its budget.
- **Resilience:** answers saved on the device first (IndexedDB), then synced; automatic retry with backoff; idempotent submits; a clear "reconnecting / your work is safe" state; no work lost when the network drops or changes.
- **No IP-based rules** for fairness: the exam IP restriction is optional and only for lab-based tests the college chooses to run on its own network.
- **Public reach:** the platform is reachable from any network through Cloudflare (outbound-only tunnel from the college), with rate limits and attack protection on.
- **Tested how:** the load test and the browser checks include a throttled-network run (about 1 Mbps with packet loss) and a network-switch run (Wi-Fi to mobile data in the middle of an exam).

---

## 7. S3: Academic structure (terms, classes, mentors, faculty scoping)

### 7.1 Data model (new; history is never overwritten)
- `terms`: academic year, semester, start and end dates, status `planned | active | closed`.
- `classes` (per term): department, year, section, **class teacher (mentor)**.
- `enrollments` (`termId_studentId`): which class a student is in for that term. History stays per term.
- `subMentors`: class, mentor, **roll-number range** (from, to). A validator checks that the ranges **cover every student in the class exactly once**, with no gaps or overlaps.
- `teachingAssignments`: term, class, faculty, subject, **effective from and to**. A reallocation **ends** the old row and **creates** a new one; nothing is deleted.
- `accessGrants` and `accessRequests`: faculty request more data, a course, or another class; HOD (or Admin across departments) approves or declines, optionally with an expiry; audited; the faculty member is notified.

### 7.2 Rules
- A faculty member sees a student only if the student is enrolled **this term** in a class where the faculty has an **active** teaching assignment, or is that class's teacher or sub-mentor, or holds an approved grant.
- Faculty can create **assignments, tests and courses only for classes they are assigned**. Content belongs to the class; on reallocation the content stays with the class and **ownership moves** to the new faculty (HOD decides; Admin can force).
- Faculty see **no courses by default**. Courses are Admin-owned; access is by grant to a class.
- The student's dashboard shows **class, class teacher, sub-mentor**, with a message button that follows the existing messaging rules (the "teaches or mentors" check is rebuilt on the new model).

### 7.3 Semester rollover and mid-term changes
- A **rollover wizard** (HOD for the department, Admin for all): create the next term, promote students (year + 1, section mapping), graduate the final year, carry forward or reset teaching assignments, **dry run first, backup, one-click rollback**.
- Mid-term reallocation uses **effective dates**, so reports for earlier weeks still point at the right faculty.

### 7.4 Edge cases the design must survive (each gets a test)
- A student in two classes (electives); one faculty teaching two subjects in one class; a class merged or split mid-term; a student detained, transferred or dropped; a faculty member leaving (bulk reassign); an absent mentor (temporary cover); roll-number ranges with gaps; overlapping terms; IST day boundaries.
- A **consistency report** (Admin and HOD) lists any student without a class, a class without a teacher, or a range that does not cover its students, and offers one-click repairs for the simple cases.

### 7.5 Migration from today
- Existing classrooms and `mentorId` are mapped into a first "current term". The self-join code can stay for ad hoc groups. *(question 10)*

---

## 8. S4: Faculty dashboards (D-14)

- A **class switcher** (remembers the last choice, supports "all my classes"); every widget recomputes from the selected class and term.
- Faculty analytics are **class-scoped and actionable** (who has not started, who is stuck, which question is hard, who to remind), not college rankings. HOD sees department comparison and trends; Admin sees college and system; T&P sees placement.
- **Customizable:** per-user saved layout (show, hide, reorder widgets) plus presets; stored on the user's profile; resets cleanly if a widget is removed in a later release. Depth of customization: *(question 9)*.
- Cached per class for two minutes; no full-college reads on a faculty page.

---

## 9. S5: T&P persona

- **Role `tnp`**, created by Admin only, 2FA required, no department. Own menu and `/api/placement/*` routes; HOD and Admin keep read access.
- **Drives:** multi-department and multi-year, **tier** (normal, dream), eligibility (department, year, minimum CGPA, maximum backlogs), apply deadline, rounds, optional **outside link**, draft then published.
- **CGPA and backlog upload:** CSV by roll number, validation, **dry run**, rollback, audit.
- **Student "Placements" page:** eligible drives, one-click apply, status per round, offers; a clear "why am I not eligible" message that never reveals other students' marks; a consent line before apply.
- **Policy engine** (pure and tested): eligibility, dream-tier rule, deadline, override with reason, withdrawal.
- **Outside applications:** T&P may paste roll numbers or upload a list; analytics show "recorded by T&P" separately.
- **Analytics (college-wide):** the existing placement analytics and readiness bands extended across departments; exports are **audited** and list the exact fields; spreadsheet-formula neutralisation.
- **Notices:** a new or changed drive notifies eligible students through the in-app reminder system.
- **Exam resume:** a T&P coordinator may resume an attempt only if question 5 says so.

---

## 10. S6: Admin persona

- **People:** create, deactivate and re-activate accounts; assign roles (faculty, HOD, T&P); reset by emailed link (never see a password); roster import from the UI (dry run, backup, rollback); move students between year and section.
- **Overview:** one college dashboard (students, activity, course completion, placement summary, system health, quota and cost).
- **College settings:** departments and sections, terms, coding-score thresholds, AI on/off and limits, feature switches; each change logged old to new.
- **Audit and security:** searchable and exportable audit log, login history, locked accounts, an "elevated access" review page, alerts.
- **Safety rules:** last Admin cannot be removed; Admin cannot demote themselves; **no impersonation**; destructive actions need a typed confirmation and are never bulk.

---

## 11. S7: Errors and self-healing

- **One error shape** everywhere: `{ code, message (plain words for the user), hint (what to do), requestId }`. The screen shows the message and a short reference ("quote 4F2A9C if you contact support").
- **Client:** error boundaries per page, friendly full-page states, offline and reconnect banner, automatic retry with backoff, "Report a problem" button that attaches the request id and page.
- **Server:** idempotency keys, timeouts and a **circuit breaker** around Judge0, a **reaper** that re-queues stuck judge jobs, a dead-letter list for jobs that fail repeatedly, health checks with automatic restart.
- **Scheduled self-checks:** the consistency report from S3 plus counters that should add up; simple repairs are applied automatically and logged, anything else is reported.
- **Principle:** nothing the user did is lost without them being told, and nothing fails with a raw stack trace or a bare "failed".

---

## 12. Tools (free or low cost first)

| Purpose | Tools |
|---|---|
| CI and code security | GitHub Actions, CodeQL, Semgrep, Dependabot, npm audit, gitleaks, Trivy, OWASP ZAP |
| Tests | existing offline suite, Playwright (end-to-end), k6 (load), a generated access-matrix test |
| Edge and network | Cloudflare (TLS, WAF, DDoS, cache), Nginx or HAProxy load balancer |
| Runtime | K3s (Kubernetes), Helm, KEDA, Redis, Judge0 workers; Docker Compose as the fallback |
| Observability | Sentry, Grafana Cloud or Prometheus, uptime monitor, structured logs with request ids |
| Backups | scheduled Firestore export (or `pg_dump` after the Postgres move), restore drill |
| Email | provider TBD (question 3) |
| Secrets | GitHub secrets and an env manager, rotation runbook |

---

## 13. What I cannot guarantee

- That no one can ever cheat or break in. I can guarantee a tested list of controls and an honest list of what was not tested.
- That 1000 simultaneous coding runs work without the college server.
- That the new access model is error-free for every real timetable without a pilot on one department first. I propose a **pilot with one department and one term** before the whole college.
- Anything I have not opened in a signed-in browser. I cannot create a test login on my own, so I will ask you for a test account per role (including `tnp`) before each check.

---

## 14. Questions: answered and still open

**Answered** (recorded in section 0): timeline (D-18), hosting approach (D-19), integrity email (D-20), who resumes (D-21), violation policy (D-22), second device (D-23), email service (D-24), review (D-25), dashboard (D-26), old-term access (D-27), pilot department (D-28).

**Still open (defaults apply unless you say otherwise):**
1. Keep self-join codes for ad hoc groups after HOD allocation exists? (default: yes, but they carry no faculty data scope)
2. The exam screen reference: please share the CodeTantra exam screenshots (start page, question page, submit page).
3. Test accounts: one test login per role (student, faculty, HOD, T&P, Admin) for staging, so I can verify in a browser.
4. Section 15: confirm the two-week slice.

---

## 15. What fits in two weeks (honest)

Doing every stream in two weeks would put unverified code in front of an exam, which is the opposite of what you want. What I recommend for the **first two weeks** is the exam-critical slice; everything else follows in the plan's order straight after.

| Days | Work |
|---|---|
| 1 to 3 | S0 core: verify and close F12, F2, F17, F13, F14; access-matrix test for existing roles; CI scanners (CodeQL, gitleaks, npm audit, Trivy); security headers; basic error envelope (S7). **S2.0 college requirement document** drafted. |
| 3 to 8 | S1.1 to S1.3: server-authoritative attempts, autosave, idempotent submit, second-device takeover, violation policy (warn, flag, lock after N), **resume feature**, student-side resilience. Adversarial attack-test suite for the exam module. |
| 8 to 11 | S1.4 and S1.5: new exam screen (needs the CodeTantra screenshots), integrity report, email for hard evidence. |
| 11 to 14 | k6 load-test harness and a first run on staging, exam-day playbook, monitoring and alerts, a dry run with a small group. |

**Directly after the exam** (in this order): S3 class and mentor model with the CSE (AIML) pilot, S4 faculty dashboards, S5 T&P, S6 Admin, S2 scale work as the college server arrives. S7 runs through all of them.

Why S3 to S6 are not in the two weeks: the class model touches every faculty screen and every access rule, so it needs a pilot and a test per edge case; rushing it is where "errors and issues" come from.
