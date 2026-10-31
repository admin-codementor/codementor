# HOD completion plan (S8), from the CampusTrack HOD screens

**Status (2026-11-01): part A built, part B not started.** Written 2026-10-27 from 14 CampusTrack HOD screenshots shared by the owner; it is the last stream, started after S5, S6 and S7 were merged. The owner answered the five questions on 2026-11-01 (section 7).

| Phase | State |
|---|---|
| S8.1 Definitions and honesty | **Built**: the "What the words mean" page generated from the code's own constants; "At risk" on the Activity tab is now "Not active" (it meant something else from "needs attention"); the AI summary falls back to a rules-written one whenever AI is off, over its limit or failing, clearly marked, never a fake score. |
| S8.2 Needs-attention and People | **Partly built**: the department Overview has the Needs attention list (names and roll numbers, one reminder button); the People page (Admin) has the batch. A HOD-facing People page with class and mentor is not built. |
| S8.7 Coding score | **Built**: all seven platforms count (best four make the score; the four we cannot read are typed by the student, count at half until a HOD or Admin verifies); an audited department export for HOD and Admin. |
| Batch (owner's answer 1) | **Built**: stored admission year, worked out from the year of study when not stored; shown and filterable in People and in the export; "Fill missing batches". It is **not yet a filter on every department tab**. |
| S8.3 Practice analytics, S8.4 Course analytics by section, S8.5 Mentor load, S8.6 Placement views for the HOD, S8.8 Online now | **Not started (part B)**. |

Read with `docs/CAMPUSTRACK_REVIEW.md` (the earlier walk-through of the same product, 2026-10-20) and `docs/FACULTY_HOD_PERSONA_PLAN.md` (the HOD work already built: H1 to H11). This file does not repeat them; it adds what these new screens, which have real data in them, show.

Student names and roll numbers seen in the screenshots are not recorded here.

---

## 1. What the screens show (11 pages, one department of 255 students)

| Screen | What it does, as seen |
|---|---|
| **Coding Analysis** (home) | Tiles (students, average overall score, students with red and orange flags, total red and orange flags), a batch filter, section cards (average, red, orange), then a student table with flags, section, mentor, overall score and one column per outside platform (HackerRank, CodeChef and so on, "No Data" when not linked). Search, section and year filters, Thresholds, Formula, Detailed Scores, Export. |
| **Weekly Progress** | Week navigator; tiles (active students, average change, problems solved, certificates, projects, achievements, conferences, journals); one table per student with score, change, problems, contests, certificates and so on; weekly trend line, performance distribution, top improvers. |
| **Practice Analytics** | Period switch (today to all time), batch and section filters, search one student. Tiles: students, problem bank, participation, solved, per student, pass rate, practising, not started, stuck, gone quiet. Then: practice over time, difficulty mix, "where students stand", an **active-hours heatmap** (weekday by hour), effort (submissions, code written, languages), a problem table, topic coverage, company readiness, coding sheets, a "what to look at" panel, and a table by batch. Long footnotes explain every figure. |
| **Course Analytics** | Per course, by section. Empty here ("No course enrollments yet"). |
| **Student Evaluation** | Tiles (students, mentors, sections, top performers %, at-risk %, average score); section comparison; performance distribution (top, builder, at risk); top versus at-risk by section; a **badge ladder** by percentile, year-wise or institution-wide; a section table. |
| **Actionable Insights** | Batch filter and "Generate Insights" (AI). The generated page shows a score ring, severity, mentor and student counts, at-risk and improvement rates, "strategic recommendations". |
| **Our Department** | Students and Mentors toggle, search, sort, page, Export, "See More" per student. |
| **Mentor Mapping** | Mentors with mentees and assign actions (empty: no mentors). |
| **Department Activity** | Online now; Students and Faculty; today to 90 days; active versus at-risk; a person list with active days, events and last seen; Export CSV. |
| **Placement Analytics** | Registered pool, placed, not placed, rate; a year picker; engagement, best section, average applications, conversion; distribution and section charts; tabs for companies, overall report, rounds and student list. |
| **Portfolio** | How complete portfolios are (nothing, one, two, three types), where the gap is by section, batch and mentor, and a student record table. |

## 2. What is wrong in their screens (do not copy)

These are visible in the screenshots and are the reason a HOD would stop trusting the numbers.

1. **Three different "at risk" numbers for the same 255 students**: 63.5% (162) on Student Evaluation, 170 on Department Activity, 75.9% on Insights. No page says which definition it uses.
2. **Everyone is "red".** 255 of 255 students carry a red flag and the total is 2015, because flags are per outside platform and most students have not linked any. A flag that is true for everyone tells the HOD nothing.
3. **The average hides the spread.** Overall average 396 while sections average 128, 768 and 312; a few very large scores dominate (the weekly table shows 21,095 beside many zeros).
4. **The AI insights page contradicts itself.** The AI call failed ("temporarily unavailable"), yet it shows a score of 0 marked CRITICAL, an at-risk rate of 75.9%, and, in the same page, "Department performing well, no critical issues". A failure must look like a failure, never like a result.
5. **Numbers that disagree between pages**: 255 students on most pages, 197 "registered" on Placement Analytics. The reason is not said.
6. **Admitted staleness.** Practice Analytics says some practice "is not yet counted" and the summary "refreshes every few minutes", while participation shows 0% beside 11 problems solved.
7. **Broken details**: section chart axis labels unreadable on Placement Analytics, a single-colour pie with no numbers, a Course Analytics empty state that blames a year filter, zero mentors with no first step offered.

What they do well and we should match or beat: the **active-hours heatmap**, **stuck** and **gone quiet** as first-class numbers, **topic coverage** and **company readiness**, the **"where the gap is"** worst-first tables, a **weekly change** column, **Thresholds** and **Formula** buttons that show how a score is made, and one-click person drill-down from every list.

## 3. What we have today, against each screen

Checked by reading the department page (`/faculty/department`) and the routes; "verify" marks something I did not open in code.

| CampusTrack screen | CodeMentor today | Gap |
|---|---|---|
| Coding Analysis | **Coding score** tab: one 0 to 100 score from CodeMentor, LeetCode, Codeforces and GitHub, a visible formula, per-year thresholds, red, orange, green. | Platforms CampusTrack reads (HackerRank, CodeChef, GfG, InterviewBit) are links only. Flags use a pair of thresholds per year; check that not everyone ends up red (see 5.1). Export is not audited. |
| Weekly Progress | **Weekly progress** tab. | Verify it has change versus last week, top improvers and a trend. No certificates, conferences, journals columns (we have portfolio instead). |
| Practice Analytics | The faculty **class insights** (not started, quiet, stuck, hardest problems) and course analytics. | No department-level page with period switch, **active-hours heatmap**, topic coverage, company readiness, problem table with solve rates. This is the largest gap. |
| Course Analytics | Per-course analytics (`/faculty/courses/[id]/analytics`). | No department roll-up by section. |
| Student Evaluation | **Overview and Rankings** tabs: funnel, badge ladder, section comparison. | One definition of top, builder and at risk, shown everywhere (5.1). |
| Actionable Insights | **AI department insights** (`departmentInsightsService`). | Honest failure state, a rules-based fallback, and the same at-risk definition (5.4). |
| Our Department | Overview student list; **Academic structure** (S3) gives classes, class teacher, sub-mentors. | A single "People" page for the HOD: students and staff together, with the class model. |
| Mentor Mapping | **Mentors** tab; mentors are now derived from the S3 structure (class teacher, sub-mentor ranges). | Mentor board and S3 need one story: who is the mentor, how a HOD changes it. |
| Department Activity | **Activity** tab. | No "online now". |
| Placement Analytics | **Placement** tab (HOD, read-only) and the T&P analytics (S5). | Add year picker, company, round and student views to the HOD tab; show where the pool number comes from. |
| Portfolio | **Portfolio** tab. | Already close; check the three-types completeness view. |
| Mentor and Department Leaderboards, Labs, Alumni, Messages | All built (H3 to H11). | None planned. |
| Batch filter ("2023-2027, 4th year") | We filter by year of study and section. | **No batch (admission year) field is stored** (verify). Decide whether to add one (question 1). |

## 4. What a HOD needs from CodeMentor (the feature list)

Grouped by the question the HOD is trying to answer. Each item says whether we have it.

**A. "Who needs me today?"**
- One **Needs attention** list for the department, with a reason and a next step per student (not started, gone quiet, stuck, failing, missed deadline, no mentor). Faculty already get this per class (S4); the HOD gets it for the department. *Partial.*
- A **definitions page** that every screen links to: what at risk, top, active, placed mean. *Missing.*

**B. "How is the department doing, and is it getting better?"**
- Department home: students, active, at risk, placed, trend over eight weeks, section comparison, each number with the date it was computed. *Have most; unify definitions.*
- **Weekly progress** with change versus last week and top improvers. *Have; verify.*
- **Practice analytics** for the department: period switch, **active-hours heatmap**, effort, difficulty mix, problem solve rates, **topic coverage**, company readiness, by-batch table. *Missing.*
- **Course analytics** rolled up by section. *Missing.*

**C. "Who are my students and who looks after them?"**
- People page: students with class, mentor, last active, coding score; staff with load. *Partial (S3 gives the data).*
- Mentor mapping, mentor leaderboard, **mentor load and response** (messages answered, mentees active). *Mapping and leaderboard have; load and response missing.*

**D. "Are they employable?"**
- Placement readiness, placement analytics, portfolio gaps. *Have; add year picker and company, round and student drill-down (S5 data).*
- **Resume and interview** signals feeding readiness. *Have (resume check and mock interview).*

**E. "What should I do about it?"**
- **AI insights** that never present a failure as a finding, with a rules-based summary when AI is off or down. *Partial.*
- **Reminder** to chosen students straight from any list (faculty have it on the dashboard). *Partial.*
- **Exports** that are audited and use a fixed field list, as in S5. *Missing for HOD.*

**F. "Run my department."**
- Academic structure, access-request approvals, exam oversight and resume, reported-message review. *Have (S3, S1, H11).*

## 5. Rules for this work (learned from section 2)

1. **One definition of every status**, in one pure module, used by every screen and by the AI prompt. The definitions page is generated from the same constants, as the coding-score formula already is.
2. **A flag must discriminate.** Before shipping any red, orange, green rule, run it on real department data: if more than about 60% of students land in one colour, the rule is wrong, not the students.
3. **Every figure shows its freshness** ("computed 14:05") and, where cached, why it can lag. No number may be shown as zero when the data failed to load; show an error.
4. **Pools are named.** "255 students" versus "197 registered" must say why (for example, only final-year students are in the placement pool).
5. **The failure of a helper (AI, an outside platform) is shown as that failure**, in the place of the result, with a retry.
6. **Scoped by the server**: department for an HOD, never by a client filter; every list endpoint is covered by the access matrix and a test.
7. **First step on every empty page** (no mentors: "Assign class teachers in Academic structure").
8. Same gate as every stream: offline tests, lint, route audit, build, a browser check with data, and an honest "not verified" list.

## 6. Phases (when it starts; one PR each, in this order)

| Phase | What | Size | Needs |
|---|---|---|---|
| **S8.1** Definitions and honesty | One pure module for at risk, top, active, placed; the definitions page; freshness stamps; the AI failure state and a rules-based fallback; fix any page that disagrees with the module. | M | S3, S4 |
| **S8.2** Department needs-attention and People | The HOD list with reasons and next steps, reminders, the People page (students and staff, class, mentor, last active). | L | S8.1 |
| **S8.3** Practice analytics (department) | Period switch, heatmap, stuck and quiet, effort, problem solve rates, topic coverage, company readiness, by-year table. Reads a nightly roll-up, never raw submissions per request. | XL | S8.1, S2 caching |
| **S8.4** Course analytics by section and weekly progress completion | Roll-up by section; change, top improvers, trend. | M | S8.1 |
| **S8.5** Mentor load and response | Mentees active, messages answered, load per mentor; ties to the S3 sub-mentor ranges. | M | S3 |
| **S8.6** Placement views for the HOD | Year picker; companies, rounds and students from S5 data; clear pool names. | S | S5 |
| **S8.7** Coding-score review | Check flags against real data (rule 2), add platforms only if their numbers can be read reliably, audited export. | M | S8.1 |
| **S8.8** "Online now" and activity polish | Presence with a short window; activity events explained; load more. | S | S2 |

Not planned: copying the unscaled platform formulas, student rankings that put a name on every red flag by default, a messaging consent screen (ours exists in another form).

## 7. Questions (answered 2026-11-01)

**Owner's answers:** (1) yes, add a batch field; (2) all seven platforms on the coding-profiles page count, with the four we cannot read typed by the student, marked not verified, and counted at half until verified; (3) names and roll numbers straight away; (4) HOD and Admin may export; (5) a rules-based summary whenever AI is off or failing.

1. **Batch:** add a batch (admission or graduation year, such as 2023 to 2027) to every student and filter by it, or keep year of study and section? CampusTrack uses batch everywhere.
2. **Which outside platforms** must count in the coding score? Today: CodeMentor, LeetCode, Codeforces, GitHub. HackerRank, CodeChef and GfG cannot be read reliably.
3. **Should the HOD see individual student names on the "needs attention" list by default,** or aggregate first and drill down?
4. **Who may export** department data, and which fields? (S5 chose a fixed list with an audit entry for T&P.)
5. **Is AI insight wanted** while the AI service is off or limited, or should this page be rules-based only until it is switched on?
