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

### F0 — Design-system and error-handling parity (foundation, like Student's S0)

Bring Faculty/HOD pages up to the same bar Student pages already meet.

- Sweep all 26 `(faculty)` pages: replace raw numeric `borderRadius`/`fontSize` with tokens (109 instances),
  adopt `SectionCard`/`PageContainer` on `problems/page.tsx`, `courses/page.tsx`, and any other page still on old
  styling (full list from the audit, not reproduced here — file-by-file during implementation).
  Lint rule from Student's S0 already blocks new raw values; this phase cleans up the pre-existing ones.
- Replace `.catch(() => {})` in `audit-logs/page.tsx` and `students/[id]/page.tsx` with `ErrorState`.
- Migrate `/faculty/analytics` onto the analytics kit (closes the Review_Feedback item 16 gap).

### F1 — Per-student analytics completeness (closes Review_Feedback item 9)

Item 9 asked for: time spent, problems solved/attempted, accuracy, exam performance, course completion — most of
this is already on `/faculty/students/[id]` per Phase 5. Audit exactly which sub-item is still missing or
incomplete (e.g. "time spent" is proxy-only per FD2) and close only the real gaps, not the ones already shipped.

### F2 — Badge/flag transparency

Add a thresholds/formula explainer (CampusTrack pattern, §3 point 6) to wherever the status banner / badge ladder
/ "at-risk" flag is shown to faculty or HOD, so a flag is never unexplained.

### H1 — HOD dashboard polish pass

With the funnel/insights/badge-ladder/trend already built (Phase 7), this is a verification + gap-closing phase,
not new construction: confirm department scoping is correct for a real multi-department dataset, confirm the
badge ladder and thresholds (once F2 lands) apply identically on the HOD view, and close any specific item from
`COMPETITOR_UX_RESEARCH.md`'s mapping table not already covered by §2 above (re-check against current code before
starting — that table predates Phase 7 and is partly stale).

### H2 — Regression coverage backfill (closes Review_Feedback item 23's named gap)

Item 23 names student-groups and department-dashboard endpoints as currently untested. Add smoke-test coverage
for `/api/faculty/groups` CRUD and `/api/faculty/department` to `backend/tests/`.

---

## 6. Explicitly out of scope for this plan

Mentor mapping, portfolio completeness, placement readiness/analytics, alumni, labs, messages (needs T&P role —
own future phase); cross-department leaderboard (Admin phase, FD4); real time-on-platform tracking (FD2, pending
privacy decision); company-specific interview content (FD3, folds into the item-15 content track); Super Admin/
T&P role creation itself (separate persona phases per the locked work order).
