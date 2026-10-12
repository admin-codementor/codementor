# Faculty + HOD Persona Plan

**Started:** 2026-10-12 · **Branch:** `feat/faculty-persona` (off `main`, once PR #39 merges) · **Owner:** Srinivas

Third and fourth of six persona plans (Student → **Faculty → HOD** → T&P → Admin → Super Admin). Faculty phases
land first since HOD reuses the faculty shell and most HOD-only work builds on top of it. Daily progress goes in
`docs/PROJECT_LOG.md`, same as the Student persona.

Inputs: `Review_Feedback.md` (HOD/VC review, 2026-10-01), `docs/COMPETITOR_UX_RESEARCH.md` Part 2 (CampusTrack HOD
walkthrough), `docs/UI_REDESIGN_PLAN.md` (Phases 0–9, merged via PR #37 — **a lot of HOD work is already done**,
see §2), `docs/product/faculty-authoring-analytics-plan.md` and `docs/product/analytics-redesign-and-modules-plan.md`
(earlier faculty work), and a 2026-10-12 code audit (file:line citations in §3).

---

## 1. How we work through this plan

Same rules as `docs/STUDENT_PERSONA_PLAN.md` §1: one phase = one PR, reviewed before the next starts; every touched
component handles the full state set (loading/empty/error/populated); no raw hex/numeric radius/fontSize in `sx`;
backend changes get smoke tests; checked in a real browser (golden path, empty data, error, mobile, dark mode);
`docs/PROJECT_LOG.md` gets a dated entry. No data is deleted.

---

## 2. What's already built (don't re-build this)

The `feat/ui-phase0-analytics-kit` branch (merged to `main` via PR #37) already shipped most of what a fresh HOD
audit would otherwise propose:

- **Analytics component kit** (`frontend-next/src/components/analytics/`): KPI tiles w/ sparklines, chart cards
  w/ loading/empty/error states, sortable leaderboards, filter bar, CSV export. Preview at `/dev/analytics-kit`.
- **Faculty per-course analytics** (`/faculty/courses/[id]/analytics`) and **per-student drill-down**
  (`/faculty/students/[id]`: status banner, week-by-week progress, course progress, exam history).
- **Exam report** (`/faculty/exams/[id]/report`): score bands, section performance, per-question accuracy,
  per-student time taken, and an **Integrity tab** (proctor events + code similarity) — this already satisfies
  most of Review_Feedback item 10.
- **HOD department dashboard** (`/faculty/department`, HOD/admin only): student-state funnel with clickable
  drill-down, auto-written "what to look at" insights, section comparison, a badge ladder, an 8-week trend, top
  students, CSV export — this already satisfies most of the CampusTrack-inspired "Phase 7" items in
  `COMPETITOR_UX_RESEARCH.md`'s mapping table (that table is now stale; written before Phase 7 shipped).
- **Custom student groups** (`/faculty/groups`): span sections *and branches*, exams can target a group —
  satisfies Review_Feedback item 6 (Parts A and B) in full.
- **Editor anti-cheat** (Phase 8): copy/paste blocked + logged on exam and course problem pages.
- **Backend role gating**: the original HOD-gets-403-on-non-`/api/faculty/*`-routes bug (`faculty-authoring-
  analytics-plan` memory) is fixed — `facultyStaff = authorize('faculty','admin','hod')` is now used consistently
  (`role.middleware.js:16-21`, verified across `classroom`, `mcq`, `problemImport`, `pdfExport`, `contest`,
  `proctor`, `judgeHealth`, `exam`, `rating` routes). No gaps found in the 2026-10-12 audit.

**So this plan is about what's left, not a from-scratch build.**

---

## 3. Current-state audit (2026-10-12)

**Faculty shell**: `frontend-next/src/app/(faculty)/faculty/layout.tsx:12-38`. `BASE_NAV` (11 items, all roles):
Dashboard, Analytics, Courses, Problems, Question Bank, Classes, Student Groups, MCQ Tests, Exams, Plagiarism,
Judge Health. `DEPARTMENT_NAV` (line 29-31, HOD/admin only): Department. `ADMIN_NAV` (line 35-38): Permissions,
Audit Log. 26 page files total.

**Gaps found, not yet fixed:**

1. **Design-system migration is incomplete.** Faculty pages have **109 raw numeric `borderRadius`/`fontSize`**
   instances in `sx` (vs. ~20/~65 that the Student audit found and then fixed). `problems/page.tsx` and
   `courses/page.tsx` have **zero** `SectionCard`/`PageContainer` usage — still fully on old styling.
   `department/page.tsx` and `analytics/page.tsx` are partially migrated (use the kit, but still carry a few raw
   numeric instances).
2. **`/faculty/analytics` itself was never migrated onto the kit** — confirmed by `Review_Feedback.md:162`
   ("Still not applied to the original `/faculty/analytics` page"). This is the main standalone analytics page
   (distinct from the per-course and department dashboards, which *are* on the kit).
3. **Silent error swallowing remains** in `faculty/audit-logs/page.tsx` and `faculty/students/[id]/page.tsx`
   (`.catch(() => {})`). Zero `ErrorState` usage anywhere in `(faculty)` — the student-side fix for "a failed
   request looks exactly like empty data" was never ported to faculty.
4. **No company-specific interview content** (Review_Feedback item 12) — untouched.
5. **No cross-department leaderboard** — CampusTrack's "Department Leaderboard" screen (highlights "You",
   per-department rank) has no equivalent; we only rank students within a department.
6. **No threshold/formula transparency** for the badge ladder or status flags — CampusTrack publishes the exact
   scoring formula and red/orange/green thresholds behind one click; ours doesn't explain how a flag was set.
7. **Mentor mapping, portfolio completeness, placement funnel, alumni, labs, messages** — all CampusTrack
   features with no equivalent here. Per `docs/UI_REDESIGN_PLAN.md`'s "Deliberately not built" table, these need
   new data models and, for placement, the not-yet-built **T&P role** — out of scope for this plan, tracked
   against the T&P persona phase instead.
8. **Time-on-platform tracking** (Review_Feedback item 22) is an explicit open decision, not a bug — "active
   days" is inferred from submission timestamps everywhere, cross-cutting beyond faculty/HOD.

---

## 4. Decisions (locked 2026-10-12)

| # | Topic | Decision |
|---|---|---|
| FD1 | Scope boundary | **Defer** mentor mapping, portfolio tracking, placement funnel, alumni to the T&P phase — no data model exists, placement needs the not-yet-built T&P role, and the persona order (`docs/PROJECT_LOG.md:4`) already puts T&P right after HOD. |
| FD2 | Time-on-platform tracking | **Keep the submission-based proxy**, labelled clearly everywhere it's shown. Item 22 frames real heartbeat tracking as a privacy decision, not just engineering; revisit once there's real concurrent load to justify the write cost. |
| FD3 | Company-specific interview content (item 12) | **Fold into the item-15 course-content track** (Java/Python/C/DSA) rather than a standalone phase — same authoring pipeline, avoids a one-off format. |
| FD4 | Cross-department leaderboard | **Admin phase**, not this plan — HOD's dashboard is intentionally department-scoped; a cross-department view fits a role that already sees everything. |

---

## 5. Phases

### F0 — Design-system and error-handling parity (foundation, like Student's S0) — done, commit `6365caf`

Brought Faculty/HOD pages up to the same bar Student pages already meet.

- Swept all 26 `(faculty)` pages: replaced raw numeric `borderRadius`/`fontSize` with tokens (109 instances).
  **Correction found during implementation**: `problems/page.tsx`/`courses/page.tsx` were NOT actually
  inconsistent for lacking `SectionCard` — the other gallery-style list pages (`mcq`, `exams`, `classes`) don't
  use it either, so that was never the established pattern this plan assumed. Left as-is.
- Replaced `.catch(() => {})` in `audit-logs/page.tsx` and `students/[id]/page.tsx` with `ErrorState`.
- **Did not** flip the `no-restricted-syntax` lint rule to `"error"` as originally planned — found raw
  `fontSize` still present on already-"done" Student pages too, so Faculty/HOD wasn't actually the last
  unswept persona. Flipping would have broken CI on untouched files.

### F1 — Migrate `/faculty/analytics` onto the analytics kit — done, commit `f12fdd0`

(Closes the Review_Feedback item 16 gap; split out of F0 into its own reviewed PR since it touches a 737-line
page with 9 specialized chart types — a materially different risk profile than a token sweep.)

- 12 chart-wrapping `SectionCard`s → `ChartCard` (built-in title/subtitle/empty states) across the Pulse/
  Cohorts/Problems tabs and the cohort/problem drill-downs. Tables (Top performers, Needs attention, Cohorts,
  Problems struggling) correctly stay on `SectionCard` — `ChartCard` is for one chart's lifecycle, not a table.
- **`KpiTile` needed no migration** — `Panels.tsx` already re-exported it from the shared kit; F0's assumption
  that it needed porting was wrong.
- `loading`/`error` props deliberately left unwired on every `ChartCard` (the page already gates all of that
  behind one page-level skeleton, so both are always `false` by the time a chart renders) — only `empty`/
  `emptyTitle` were real, useful wiring.
- Swept `Panels.tsx`'s own raw tokens too (it sits outside F0's page-only glob, so F0 missed it).

### F2 — Per-student analytics completeness (closes Review_Feedback item 9) — done, commit `6d17635`

Audited `buildStudentProfile()` and the student profile page against item 9's 5 sub-items: 4 were already fully
shipped (accuracy, exam performance, course completion with pending items, problems solved). Two real gaps
closed — both additive, no new data model: **"Problems Attempted"** as its own stat (backend already computed
`attemptedProblemIds`, just never returned its size), and **"Active Days (12 mo)"** as a labelled time-spent
proxy (`activityHeatmap.length`, with a `helper` string stating it counts submission-days, not measured time —
satisfying the "labelled clearly" condition Review_Feedback item 22 put on keeping the proxy instead of building
real tracking).

### F3 — Badge/flag transparency — done, commit `b7b9200`

Found that reasons were already shown inline everywhere a flag appears (never a bare colour) — the real gap was
that the full rule set was never stated together (exact 30%/5-sub/7-day thresholds, the 7 badge percentile
cutoffs). Added a shared `ThresholdsDialog` (info button + dialog, mirrors `studentState.js`/
`departmentAnalytics.js` constants exactly), wired next to the department funnel heading, the badge distribution
card, and a student's status banner.

### H1 — HOD dashboard polish pass

With the funnel/insights/badge-ladder/trend already built (Phase 7), this is a verification + gap-closing phase,
not new construction: confirm department scoping is correct for a real multi-department dataset, confirm the
badge ladder and thresholds (once F3 lands) apply identically on the HOD view, and close any specific item from
`COMPETITOR_UX_RESEARCH.md`'s mapping table not already covered by §2 above (re-check against current code before
starting — that table predates Phase 7 and is partly stale).

### H2 — Regression coverage backfill (closes Review_Feedback item 23's named gap)

Item 23 names student-groups and department-dashboard endpoints as currently untested. Add smoke-test coverage
for `/api/faculty/groups` CRUD and `/api/faculty/department` to `backend/tests/`.

---

## 6. Feature pick-list — from the 2026-10-12 CodeTantra (faculty) + CampusTrack (HOD) walkthrough

Srinivas logged into both live products directly; `docs/COMPETITOR_UX_RESEARCH.md` Parts 2 (CampusTrack HOD) and
3 (CodeTantra Faculty) record everything seen, read-only, no student/staff names retained. This section turns
those findings into **discrete, independent choices** — pick items one at a time as we go, in any order; nothing
here is sequenced or bundled. Each row: what they have, what we have today, and the options.

| # | Feature | They have | We have | Options |
|---|---|---|---|---|
| G1 | **Real time-on-platform tracking** | CodeTantra shows exact per-student time ("2 days 2 hrs") and per-course daily time-spent trend lines — proven to work at real-cohort scale (118+ students/course). | Submission-based proxy only (FD2, locked as "keep for now"). | **(a)** Keep FD2 as locked — this doesn't change the privacy-cost tradeoff, it just proves the engineering is tractable. **(b)** Revisit FD2 now that real-scale feasibility is confirmed elsewhere — build a lightweight heartbeat (e.g. ping while a problem/course page is open, batched not per-second) scoped to course/problem pages only (not sitewide). |
| G2 | **A faculty report catalogue** | 12 distinct report types (Course Progress, Course Progress Time-based, Group-wise Users, Group-wise User Course, Summary, User Submission, User-wise, Late Submissions, Reopen Requests, Daily-wise, plus schedule/user-detail admin tools), picked by course/group/date. | A handful of fixed pages (`/faculty/analytics`, course analytics, department dashboard) — faculty can't choose a report, we chose for them. | **(a)** Leave as-is — our fixed pages already cover the same underlying questions (per F1's kit migration), just not as a pick-a-report menu. **(b)** Add a lightweight "Reports" entry point that's really just deep-links into existing pages with a course/group/date filter pre-applied — cheap, no new backend. **(c)** Build genuinely new report types (e.g. Late Submissions, Reopen Requests) we don't have at all today. |
| G3 | **Platform-wide activity heatmap** | A year-view GitHub-style calendar (all courses combined) on the faculty home/courses landing page. | Nothing at the faculty landing (`faculty/dashboard`) — per-course trend charts only exist inside a course. | **(a)** Skip — department dashboard's 8-week trend already gives a similar "when is activity happening" signal at department scope. **(b)** Add a compact year-heatmap to `faculty/dashboard` scoped to that faculty's own classes/courses. |
| G4 | **Per-unit/topic drill-down mini-dialog** | Clicking a chart icon next to any syllabus unit opens a small "pick a group, Fetch" dialog scoped to just that unit, with its own empty state. | Our per-student page shows per-unit completion inline already (Phase 5); no separate drill-down dialog. | **(a)** Skip — inline is arguably better UX than an extra click-through. **(b)** Add the same modal pattern for cases where the inline view gets too dense (e.g. a course with 15+ units). |
| G5 | **Multi-faculty per class/group** | A CodeTantra group lists several named faculty (co-teach/TA/oversight), not one owner. | `classroom` has a single `facultyId` owner. | **(a)** Skip for now — no reported pain point from this gap. **(b)** Add a `co_faculty` list alongside the existing owner, additive and backward-compatible — read access for co-faculty, write access stays with the owner (or extend to co-faculty too, a sub-choice). |
| G6 | **Report-type: Late Submissions / Reopen Requests** | Two of CodeTantra's dedicated report types. | We have no "late submission" or "reopen request" concept surfaced to faculty at all. | **(a)** Skip. **(b)** Add a simple filtered view on top of existing submission data (late = submitted after assignment due date, already stored) — no new data model needed for "late"; "reopen requests" would need a new concept (a student asking to resubmit after a deadline) we don't have. |
| G7 | **Flag/badge threshold + formula transparency** | CampusTrack publishes exact score formulas and red/orange/green thresholds behind a one-click explainer, per platform (HackerRank, LeetCode, etc.) and per metric. | Already planned as **F3** in this doc (badge/flag transparency) — this confirms the pattern with a concrete example of *how much* detail to publish (exact formula, not just "based on activity"). | Already decided — F3 proceeds as planned, using this as the reference bar for how explicit the explainer should be. |
| G8 | **Student-state funnel, badge ladder, 8-week trend, section comparison** | CampusTrack's richest HOD screens. | **Already shipped** (Phase 7, `/faculty/department`) — confirmed matching on this walkthrough, nothing new to build. | No action — already done. |
| G9 | **Mentor mapping, mentor leaderboard, portfolio completeness, placement funnel, alumni** | Full CampusTrack features. | None. | Already decided (**FD1**) — deferred to the T&P persona phase; no new information from this walkthrough changes that (Course Analytics, Mentor Mapping, Alumni were all still empty/unpopulated for this department even on CampusTrack's own live system). |
| G10 | **Department cross-institution leaderboard** | CampusTrack's "Department Leaderboard" screen. | None. | Already decided (**FD4**) — deferred to Admin phase. |

### G11–G15 — deep dive on request (2026-10-12): per-student, weekly, course, practice, evaluation

Srinivas asked for these five areas specifically, in more depth. Researched against our own code (not just the
competitor walkthroughs) to state precisely what already exists before proposing anything new.

| # | Feature | They have | We have (file:line) | Options |
|---|---|---|---|---|
| G11 | **Per-student analytics** | CodeTantra: completion %, suspicious-activity %, real time spent, per-unit progress. CampusTrack: not opened (privacy). | Already the deepest page in the app: `/faculty/students/[id]/page.tsx` — KPIs, streak, strongest/weakest topic, weekly progress card (G12, see below), **course progress with per-unit breakdown** (`StudentProgressSections.tsx:183-258`), exam history, strengths/weaknesses, learning curve, submission velocity, difficulty progression, verdict mix, topic breakdown, 12-month activity heatmap, linked external coding-platform profiles, contest rating history. | **(a)** Leave as-is — this already meets or exceeds both competitors on breadth. **(b)** Close the two real gaps: no genuine time-spent (same engineering question as **G1**) and no "suspicious activity %" signal at the course-browsing level (we only have exam proctor events, not course-wide copy/paste or tab-switch signals outside exams — would need `useClipboardGuard`'s existing event log, which today only fires on exam/course-problem pages per `docs/UI_REDESIGN_PLAN.md` Phase 8, surfaced as a %). |
| G12 | **Weekly progress** | CampusTrack: a department-wide week switcher with per-student delta + "new this week" portfolio counters (certs/projects/etc., which we don't track — see FD1). | `WeeklyProgressCard` (`StudentProgressSections.tsx:65-116`) — already does the core ask: week picker, solved/submissions/accepted/active-days **with delta vs. previous week**, per *student*. This is department-dashboard-adjacent but scoped per-student, not cohort-wide. | **(a)** Leave as-is at the per-student level — it already matches CampusTrack's actual mechanic (delta per student), just reached via a different entry point (open the student, not a department-wide table). **(b)** Add a **cohort-wide weekly table** (one row per student, sortable by delta) to `/faculty/department` or `/faculty/analytics`, reusing the same `weekly` data already computed per student — this is the CampusTrack-exact "All Students Progress" table we're missing, and the data already exists, just not aggregated into one table. |
| G13 | **Course progress: done/pending, % of course per student** | CampusTrack's Course Analytics was empty on both our walkthroughs (can't compare layout). CodeTantra: Unit Wise Completion stacked bar + Completed/Not-started KPI tiles, per course. | `/faculty/courses/[id]/analytics/page.tsx:135-192` already has this at class scope: **Completed** KPI ("solved every problem"), **Not started** KPI, unit-wise stacked bars (Solved/Partial/Not started per unit, class-wide). The course *list* (`/faculty/courses/page.tsx:86-125`) shows only module/problem counts and publish state — no completion summary at a glance. | **(a)** Leave course-level analytics as-is; it already answers "how many done, how many pending" per course. **(b)** Add a **%-complete distribution** to the course analytics page — today "Completed" is binary (100% only); a histogram of "how far along is each student" (0–25% / 25–50% / 50–75% / 75–100%) would show partial progress, which the binary KPI currently hides. **(c)** Surface a one-line completion summary (e.g. "62% avg. complete · 12/40 done") directly on each course card in the list, so faculty don't have to click in to see it. |
| G14 | **Practice Analytics in depth** | CampusTrack's richest screen (§14 in `COMPETITOR_UX_RESEARCH.md`): 10 KPI tiles incl. a named **student-state funnel** (Practising/Not started/Stuck/Gone quiet, each clickable), active-hours heatmap, effort card, topic/company/sheet coverage, auto-written "what to look at" insights. | `/faculty/analytics/page.tsx` is already close to this breadth across its 3 tabs (Pulse: KPIs, top performers, solved-distribution, effort-vs-success scatter, activity heatmap, activity trend, verdicts, languages; Cohorts: cross-cohort comparison, per-cohort distribution + topic mastery + a flat "needing attention" list; Problems & MCQs: per-problem funnel, attempts-histogram, test-case hotspots). **The exact 4-state funnel (`not_started`/`stuck`/`gone_quiet`/`practising`) already exists as shared backend logic** (`backend/src/utils/studentState.js:23-41`) and powers the department dashboard and the per-student status banner — but it is **not visualized as the CampusTrack-style funnel widget inside `/faculty/analytics`** itself; the Cohorts tab's "needing attention" is a flat list, not a funnel. No auto-written "what to look at" sentences exist outside the department dashboard. | **(a)** Leave as-is — the underlying data is equivalent or richer (item analysis, test-case hotspots are things CampusTrack doesn't have). **(b)** Add the funnel *widget* to the Cohorts tab, reusing `studentState.js` (no new backend logic, just a new chart component plus wiring) — cheapest, highest-visual-impact pick on this list. **(c)** Also port the department dashboard's "what to look at" auto-insight generator down to class/cohort scope. |
| G15 | **Student evaluation** | CampusTrack: Overview + Student Rankings tabs, named badge ladder (Trailblazer→Foundation), year-wise vs. institution-wide percentile toggle, section ranking table. | **Badge ladder already matches exactly** — `backend/src/utils/departmentAnalytics.js:13-30` defines the identical 7-tier ladder (Trailblazer/Champion/…/Foundation) by percentile, shown as a distribution on `/faculty/department`. What's missing: a dedicated **ranked student list** (CampusTrack's "Student Rankings" tab — rank, student, score, badge, medals for top 3) and the **year-wise vs. institution-wide percentile toggle**. | **(a)** Leave as-is — badge *distribution* is shown, just not as a sortable ranked list of individuals. **(b)** Add a "Rankings" tab next to the department dashboard's existing view: a sortable table (rank, student, roll no, section, year, score, badge chip), reusing the same `badgeFor()` computation already run server-side. **(c)** Add the year-wise vs. institution-wide percentile toggle — needs `badgeFor()` to optionally compare within one year cohort instead of the whole scoped set; a small, additive backend change. |

**How to use this table**: bring up a row (or several) whenever you're ready to scope the next phase; we pick the
option together and it becomes a new lettered phase (F3, F4, …) in §5, following the same one-phase-one-PR
discipline as everything else in this plan.

## 7. Explicitly out of scope for this plan

Mentor mapping, portfolio completeness, placement readiness/analytics, alumni, labs, messages (needs T&P role —
own future phase); cross-department leaderboard (Admin phase, FD4); real time-on-platform tracking (FD2, pending
privacy decision); company-specific interview content (FD3, folds into the item-15 content track); Super Admin/
T&P role creation itself (separate persona phases per the locked work order).
