# Analytics Redesign & Problem Modules — Update Plan

> Scope: simplify faculty/HOD/VC analytics into something readable at a glance, fix the two
> live UX bugs reported alongside it, and stand up a real "practice modules" catalogue for
> students. Follow-on to [`faculty-authoring-analytics-plan.md`](faculty-authoring-analytics-plan.md)
> (PR-2), which built the analytics data layer and 29-chart drill-down this plan now trims down.
> Status: **plan — decisions locked in §4, nothing implemented yet.**

---

## 0. Why this plan exists

PR-2 (2026-08-12) rebuilt faculty analytics from two bar charts into a genuine four-level
drill-down (overview → cohort → problem → MCQ item) backed by one cached snapshot. It is
functionally the most sophisticated part of the product. Two days later the feedback was:
*"it feels extreme and cluttered, like something dangerous, not easy to understand."*

Both things are true at once. The engineering underneath is sound — this plan does not
rebuild the data layer. It restructures the **presentation** (progressive disclosure instead
of one continuously-scrolling page, plain-language labels instead of "box plot"/"item
analysis"/"discrimination index"), fixes two real UI bugs found alongside it, and scopes the
HOD's other standing ask — a practice-problem catalogue organized into modules — which was
flagged back in the scale-readiness programme as **R4** ("problem catalogue needs building,
60–200h") and never scheduled.

---

## 1. What I verified in the code first

| # | Area | Finding | Evidence |
|---|---|---|---|
| **F1** | Analytics — duplicated | Two independent analytics implementations coexist. The faculty nav links to the new drill-down page; a Dashboard tab literally labeled "Analytics" (never removed when the new page shipped) renders an older, separate implementation against a different endpoint. | New page: `frontend-next/src/app/(faculty)/faculty/analytics/page.tsx` → `/api/faculty/analytics/overview`. Old tab: `frontend-next/src/app/(faculty)/faculty/dashboard/page.tsx:793,925-1038` → `/api/faculty/analytics` |
| **F2** | Analytics — clutter | Confirmed, not perception. The Overview level alone renders 11 stacked sections (4 KPI tiles, 2 side-by-side charts, a heatmap, a trend line, a box-plot table, 2 more bar charts, a table, an MCQ scatter panel) on one unbroken ~2500px page, no tabs or collapsing, with unexplained statistical terms in the UI copy. | `faculty/analytics/page.tsx:176-358` |
| **F3** | Create Class — "disabled" | Not a bug. The button is correctly gated on the required "Class name" field being empty; the loading flag always resets via `.finally()`. It *looks* broken because there's no inline hint explaining why it's greyed out. | `frontend-next/src/app/(faculty)/faculty/classes/page.tsx:170,197` |
| **F4** | HOD backend access | Confirmed still intact from the PR-2 fix — not a regression. | `backend/src/routes/classroom.routes.js:11`, `backend/src/middleware/role.middleware.js:21` (`facultyStaff = authorize('faculty','admin','hod')`) |
| **F5** | Problem modules — half-built and split across two databases | A student-facing Courses feature already exists end-to-end: browse page, detail page, `GET /api/courses`, `GET /api/courses/:id`, and a Firestore `courses`/`modules` schema whose own code comment says *"Firestore only — nothing else references these tables."* But the **only seed script that ever populated course data** (`backend/src/scripts/seedCourses.js`) writes to **Postgres** (`courses`, `course_modules`, `module_problems` tables in the Judge0 database), which the Firestore-reading API can never see. Net effect: the feature works, but the live app has always shown it empty — this is almost certainly *why* it reads as "we don't have modules yet." | `backend/src/repositories/courseRepository.js:1-3`, `backend/src/scripts/seedCourses.js:15-70`, `backend/src/controllers/courses.controller.js`, `frontend-next/src/app/(student)/app/courses/page.tsx` |
| **F6** | Problem modules — no faculty authoring | Confirmed zero faculty-facing UI or write routes for courses/modules. `courses.routes.js` is read-only (student `GET` only); `courseRepository.js` has `create`/`addModule` functions but nothing calls them outside the (wrong-database) seed script. | `backend/src/routes/courses.routes.js`, `backend/src/repositories/courseRepository.js:30-40` |

**Root-cause summary:** F1–F4 are UI-layer issues (dead code + missing hint), not access-control
regressions — cheap to fix. F5 is the interesting one: the modules feature isn't really
"not built," it's built and disconnected from its own data.

---

## 2. Workstreams

### WS-A — Analytics: cut the clutter, keep the depth · ~4–5 days

Per your checklist picks (§4), almost everything stays — the fix is **information
architecture and language**, not deleting panels. Concretely:

1. **Kill the duplicate.** Remove the old "Analytics" tab and its endpoint call from
   `faculty/dashboard/page.tsx` entirely; the standalone `/faculty/analytics` page is the one
   source of truth. Retire the now-unused `/api/faculty/analytics` endpoint (or redirect it to
   the same snapshot as `/overview`, whichever is cheaper) so nothing can grow back into it.
2. **Progressive disclosure instead of one long page.** Restructure the Overview level into
   tabs/accordions matching the four audiences already in the data (Pulse · Cohort comparison ·
   Assignment/problem drill-down · Student triage) so a viewer sees one focused screen at a
   time, not 11 sections at once. This is a layout change on top of data that already exists —
   no new endpoints needed for this part.
3. **Plain-language pass.** Rename/relabel the pieces the checklist flagged as jargon-heavy:
   "box plot" cut entirely (your pick); "item analysis" → "question quality"; "discrimination
   index" gets a one-line plain-English subtitle ("flags questions that don't tell strong and
   weak students apart"); funnel/heatmap keep their names but get a one-line "what this answers"
   caption, matching the pattern PR-2 already used for the histogram.
4. **Role-scoped, same layout (your decision).** VC/HOD get the identical dashboard scoped to
   department/institution; faculty get it scoped to their own classes — reusing the existing
   `scopeDepartment`/`scopeDept` helpers from the PR-1 role work, not a second UI.
5. **Create Class hint (F3).** Add inline helper text under the Class name field ("Enter a name
   to create the class") so the disabled state reads as "waiting for input," not "broken."

Panels confirmed in scope from your picks: KPI trend row, score distribution histogram,
activity heatmap, submissions trend, cohort comparison table, topic mastery radar,
hardest-problems table, effort-vs-success scatter, at-risk board, student profile/timeline,
time-to-first-AC distribution, funnel, per-test-case heatmap, MCQ difficulty/discrimination
scatter, verdict/language bars. Only the box-plot view is cut.

### WS-B — Problem Modules: a real practice catalogue · ~7–10 days

This is the net-new work, scoped as **free-browsing modules** (your decision) — a curated
catalogue students enter in any order, not a gated/sequential course.

1. **Fix the data-store split (F5).** Retire `seedCourses.js`'s Postgres tables; write a
   Firestore-native seeder that populates `courses`/`modules` through
   `courseRepository.create`/`addModule` — the same store the live API already reads. This
   alone makes the existing (already-built) student Courses page show real content.
2. **Faculty authoring for modules.** New `facultyStaff`-gated routes: create/edit a module
   (title, description, ordered problem list), reusing the **question bank** picker built in
   PR-2 (`/faculty/bank`) so faculty select from problems that already exist rather than
   retyping. A "publish" toggle mirrors the draft/published pattern already used for problems.
3. **Curating the catalogue itself — this is the actual HOD ask.** "Search and fetch the best
   problems" means the module contents need real editorial work, not just plumbing:
   - Reuse the ~77+ existing problems, tagged into the module structure the abandoned seed
     script already sketched (Arrays, Strings, Hashing, Two Pointers, Trees, Graphs, DP, etc.)
     — that tag→module mapping logic is salvageable even though its target database isn't.
   - Where the catalogue is thin for a topic, this is exactly scale-readiness risk **R4**
     (problem catalogue needs building, 60–200 hours) — flagging here rather than
     silently absorbing it into this estimate, since it's a large, separate content effort
     (see §5, open question).
4. **Student-side polish.** The browse/detail pages already exist and mostly work once §B.1
   ships; add a "continue where you left off" affordance and per-module progress (already
   computed as `solvedCount`/`problemCount` in `getCourseById`), and surface modules from the
   student dashboard, not just a standalone `/app/courses` route.

### WS-C — Verification · ~1–2 days

- Role × dashboard matrix: VC/HOD/faculty each see the analytics scope they should and nothing
  more (department-wide vs. own-classes).
- Regression check: old `/api/faculty/analytics` callers (if any remain) don't 404 silently.
- Module CRUD smoke test + the existing 77-problem regression guard extended to modules
  (creating/publishing a module doesn't touch problem visibility).
- Browser pass as HOD and as faculty: Create Class shows the hint and succeeds; analytics
  appears exactly once in the nav; a module is created, published, and visible to a student.

---

## 3. Sequencing

| Phase | Contents | Effort | Deployable? |
|---|---|---|---|
| **P1** | WS-A.1–.2 (kill duplicate, restructure layout) + WS-A.5 (Create Class hint) | 2 d | ✅ yes — fixes both reported bugs immediately |
| **P2** | WS-A.3–.4 (plain-language pass, role-scoped views) | 2–3 d | ✅ yes |
| **P3** | WS-B.1–.2 (fix data-store split, faculty module authoring) | 4–5 d | ✅ yes |
| **P4** | WS-B.3–.4 (catalogue curation, student polish) | 3–5 d + R4 content effort (open, §5) | ✅ yes |
| **P5** | WS-C verification | 1–2 d | — |

**Total ≈ 12–17 working days** for the engineering, **not counting** the open-ended R4
problem-sourcing effort in WS-B.3.

---

## 4. Locked decisions (agreed 2026-08-14)

| # | Decision | Resolution |
|---|---|---|
| **D1** | Bug-fix timing | Fold F1–F3 into this plan (P1) rather than a separate hotfix — one coordinated change. |
| **D2** | Modules structure | **Free browsing.** No prerequisite/unlock system; a module is a curated, any-order collection. |
| **D3** | Analytics audience | **Same layout, scoped data.** One dashboard design; VC/HOD see department/institution scope, faculty see their own classes. |
| **D4** | Analytics content | Keep nearly everything (see checklist in WS-A) — the fix is layout/language, not deletion. Only the box-plot view is cut. |

---

## 5. Open question for you

**WS-B.3 (catalogue curation) has no fixed size.** "Search and fetch the best problems and
build modules" is editorial work — deciding which topics need more problems, sourcing/writing
them, and tagging them well — not something with a clean engineering estimate. Before I scope
it further: do you want P3–P4 to ship the **authoring tooling only** (faculty can build and
publish modules from problems that already exist), with the actual content-gap-filling
(writing/importing more problems per topic) tracked as its own follow-on effort sized against
R4 separately? That's my recommendation — it keeps this plan's estimate honest instead of
silently absorbing an open-ended content task into a code timeline.

---

## 6. Explicitly out of scope

- Sequential/gated course progression (deferred — D2 chose free browsing; revisit if the HOD
  later asks for prerequisites).
- Company-specific problem sets (`seedCourses.js` sketches TCS/Amazon/Google-style modules with
  almost no real content behind them — same R4 gap, larger, not started here).
- Any change to the analytics data layer/snapshot service itself — PR-2's caching and rollup
  design stands; this plan only changes what's rendered and how it's organized.
