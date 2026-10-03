# UI Redesign Plan: phase by phase

Sources: [Review_Feedback.md](../Review_Feedback.md) and [COMPETITOR_UX_RESEARCH.md](COMPETITOR_UX_RESEARCH.md) (CodeTantra, CampusTrack student view, CampusTrack HOD view).
Working rule: one phase at a time, reviewed before the next starts. Last updated 2026-10-02.

All finished phases are on branch `feat/ui-phase0-analytics-kit`, **not yet committed or pushed**.

## Status at a glance

| # | Phase | Status |
|---|---|---|
| 0 | Analytics component kit | Done |
| 1 | Public landing page | Done |
| 2 | Roles and navigation fixes | Done |
| 3 | Student dashboard, practice and exams | Done |
| 4 | Faculty per-course class dashboard | Done |
| 5 | Per-student drill-down | Done |
| 6 | Exam report and integrity signals | Done |
| 7 | HOD department dashboard + student groups | Done (T&P and Super Admin deliberately out of scope) |
| 8 | Editor anti-cheat | Done |
| 9 | Polish: exports, mobile, light mode | Done |

All phases are on branch `feat/ui-phase0-analytics-kit`, **not yet committed or pushed**.

## What each phase shipped

- **0**: `src/components/analytics/` (KpiTile, InsightTile, ChartCard, KpiRow/ChartRow, Leaderboard, StackedBars, TrendLines, FilterBar, StatusFlag, ExportButton). Preview at `/dev/analytics-kit`. Rules in `frontend-next/DESIGN.md`.
- **1**: `/` landing page for logged-out visitors.
- **2**: HOD routing fix, grouped staff menu, admin-only URL guards, role labels.
- **3**: Problem of the Day, streak goal, Strongest/Focus-on, exam average; problems page accuracy + solved-by columns and topic chips; exams page KPI strip and status tabs. Backend: `GET /api/problems` returns `acceptance` and `solved_count`.
- **4**: `/faculty/courses/[id]/analytics` — KPI strip, unit-wise completion, trends, leaderboards, flagged dialog. Backend: `GET /api/faculty/courses/:id/analytics`.
- **5**: `/faculty/students/[id]` gains a traffic-light status banner with reasons, a week-by-week progress card with a week picker, course progress with per-unit breakdown, and exam history with time taken. Backend: `buildStudentProfile` returns `status`, `weekly`, `courses`, `exams`, `examSummary`. Shared rules in `backend/src/utils/studentState.js`.
- **6**: `/faculty/exams/[id]/report` — Overview (score bands, section performance), Questions & problems (accuracy, lowest first), Students (score, %, time taken), Integrity (proctor events + code similarity). Backend: `GET /api/exams/:id/results` extended with per-section scores, derived time taken, score bands and integrity signals; `proctorEventRepository.listByExam`.
- **7**: `/faculty/department` (HOD and admin only) — student-state funnel with clickable drill-down, written "what to look at" insights, section comparison, badge ladder, 8-week trend, top students, CSV export. `/faculty/groups` — custom groups that span sections and branches, which exams can be targeted at. Backend: `GET /api/faculty/department`, full CRUD under `/api/faculty/groups`, exam targeting extended with `groupIds`.
- **8**: `useClipboardGuard` blocks copy/cut/paste in the course problem-solving editor and during exams, logs each attempt as a proctor event, and shows the student why. The sandbox is deliberately unrestricted.
- **9**: CSV export on the department, exam report and at-risk tables; mobile and light-mode pass on the new screens.

## Deliberately not built

| Item | Why |
|---|---|
| T&P and Super Admin roles | Your decision in this run: HOD screens only. Needs a backend role, DB change and permission rules. |
| Real time-on-platform tracking | Not tracked. Dashboards show active days (days with a submission) and say so. Needs a tracking design and a privacy decision. |
| Mentors, portfolio, alumni, labs, messages | CampusTrack has them; no data model here, and not in the review feedback. |
| Exam pass mark / pass rate | Exams have no pass mark; needs a faculty-set field. |
| Plagiarism scoped to an exam | JPlag runs per assignment. The exam report matches stored pairs by participant and labels them platform-wide. |

## Separate track (not UI): Review_Feedback items

Scaling to 200 concurrent submissions and 1000 users (items 1 to 4), security hardening (7), AI test-case-gaming detection (5), company-specific interview content (12), and full Java / Python / C / DSA problem banks (15). Not scheduled here; plan separately.
