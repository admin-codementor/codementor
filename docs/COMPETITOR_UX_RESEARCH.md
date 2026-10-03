# Competitor UX Research — CodeTantra & CampusTrack (2026-10-01; HOD persona added 2026-10-02)

Consolidated findings from a hands-on walkthrough of CodeTantra (student + faculty logins) and CampusTrack (student login), done in response to review feedback item 13 in [Review_Feedback.md](../Review_Feedback.md). **Part 2 (end of file) covers the CampusTrack HOD persona.** This is a reference document — concrete UI/UX patterns worth reusing, organized by area, not a redesign spec.

---

## 1. Landing / First Impression

- CodeTantra's public landing page sets a quality bar we should match: illustrations, clear visual hierarchy, a polished first impression before the user ever sees a dashboard. → feeds [Review_Feedback.md item 14](../Review_Feedback.md).

## 2. Student Home Dashboard

**CodeTantra (student)**: simple tile-based home — Courses, Tests, Programming Labs, Tools, Help & Support. Clean, minimal, icon-led illustrations per tile. Low information density — intentionally a launcher, not a dashboard.

**CampusTrack (student)**: much richer home dashboard —
- Welcome banner with name + contextual nudge ("Ready to start a new streak today?").
- Profile-completion nudge card with a progress ring and "Open" CTA.
- Three-tile KPI row: **Current Streak** (days + "Streak goal X/30"), **Problems Solved** (X/Y + a circular "platform progress" ring), **Score & Badge** (Year/College toggle, badge tier + progress bar).
- **Exam Performance** module: a trend line chart with separate series for Assessment/Practice/Quiz, paired with four stat tiles — **Average, Pass rate, Strongest (topic), Focus-on (weakest topic)**. The strongest/focus-on callout is a standout pattern we don't have anywhere.
- "Continue Learning" and "Active Labs" cards with friendly empty states ("No active courses — Enroll in a course and pick up where you left off") rather than blank space.
- "Upcoming & Ongoing Events" card with a calendar CTA and a reassuring empty state ("You're all caught up").
- A lightweight "Quick Notes" scratchpad synced to the account.

**Takeaway**: empty states throughout CampusTrack are designed, not default-blank — every zero-data card explains what will appear there and gives a CTA. Worth copying wholesale.

## 3. Exams UI

**CampusTrack Exams page**:
- Top KPI strip: Total Exams / Upcoming / Pending Eval / Passed / Failed / **Success Rate %**, each its own tile with an icon.
- Tabs: Upcoming & Live / Previous Exams / Psychometric.
- Each exam card: title, subject + type tags, status badge (Missed/Completed/etc.), a 4-field grid (Date, Duration, Started, Time Taken), and a "Review Paper" CTA when a reviewable paper is available.
- Filters: search by title, subject dropdown, status dropdown, reset.

**CodeTantra (student)**: simpler — a calendar-driven "Recent Tests" list per date range, each test card showing scheduled start/duration, actual start/end, completion status, and a "See Results" action (locked until faculty opens results).

## 4. Practice / Problem Solving

**CampusTrack Practice Set**:
- "Problem of the Day" banner with difficulty tag and a direct "Solve Now" CTA.
- Trending Problems and Topic-Wise sections, each problem card showing **accuracy %** and **solved count** inline — so a student sees difficulty/popularity signal before opening a problem.
- A side "Rewards Club" panel: Power + Streak counters, a goal bar (X/30), and a **GitHub-style activity heatmap calendar** (with legend: Active / Restored / Today) — turns raw activity logs into an at-a-glance engagement picture.

## 5. "My Journey" / Career Exploration

CampusTrack's "My Journey" page is a career-path discovery screen (Full Stack Developer, Cloud Engineer, Cybersecurity Specialist, DSA, AR/VR, AI & ML — each tagged "Trending" with a one-line description). Not an analytics screen; more a recommendation/motivation surface. Lower priority to copy, but a cheap, high-polish addition if we want a "career path" entry point later.

## 6. Faculty Course Dashboard (CodeTantra)

Per course, under "Courses as Teacher":
- **Statistics strip**: Last 7 Days Active Users, **Users with Suspicious Activity**, Submissions, Completed Users, Not Started Users — each as a `current/total` tile, several with an inline sparkline.
- **Unit Wise Completion**: a stacked bar chart per syllabus unit (Solved / Partial / Not Started), giving an instant view of where the class is stuck.
- Three trend line charts side by side: Submissions, Solved, Time Spent — all over the last 7 days.
- Quick links: "View Enrolled Users," "View More Activity."

**Takeaway**: this single screen answers "is my class on track" at a glance — KPI tiles for the headline numbers, one chart for where students are stuck (unit-wise), and trend lines for direction of travel. That's a layout template worth replicating for our faculty dashboards.

## 7. Enrolled Users / Groups (CodeTantra)

- Students are organized into **Groups** per course — not just one class per course. One course we reviewed had three groups, including a mixed-section group spanning two classes with 100+ students combined.
- Each group view lists Faculty (multiple) and Students (roster with roll number + email), with a card/list view toggle and a search box.
- Per-student row menu: **Block**, **View Details**, **Submission Analysis**.

**Takeaway**: this directly matches [Review_Feedback.md item 6](../Review_Feedback.md) (custom/cross-branch batches) — CodeTantra already proves this is buildable and usable at scale (100+ students, mixed sections).

## 8. Per-Student Analytics ("Submission Analysis")

Opened from a student's row menu inside a course:
- Three headline stats: **Overall Completion %**, **Overall Suspicious Activity %**, **Overall Time Spent** (e.g. "2 days 2 hrs").
- A per-unit list below, each with a completion-% progress bar and an inline bar-chart icon that opens a "Unit Statistics" modal — filterable by group, with a "Fetch" action to render the chart on demand (avoids loading every chart up front).

**Takeaway**: this is close to exactly what [Review_Feedback.md item 9](../Review_Feedback.md) asks for (per-student time spent, accuracy/completion, pending items) and ties the suspicious-activity signal (items 5 & 8) directly into the same per-student view rather than a separate report.

## 9. Course Activity Tab (richest analytics screen found)

- **Period** filter: Yesterday / Last Week / Last Month / Last 6 Months.
- Multi-select **Groups** filter with a "Select All" toggle.
- KPI cards with mini-sparklines: Active Users, Suspicious Activity, Submissions, Average Active Time.
- Two **sortable horizontal bar-chart leaderboards**: "Most Active Groups" and "Most Active Users" (ranked by time spent in minutes), each with a sort toggle icon.

**Takeaway**: the leaderboard pattern (sortable horizontal bars, "most active X") is something our faculty/admin dashboards lack entirely and would directly serve item 9's "effective class-wise view" goal.

## 10. Gaps / Not Yet Verified

- Didn't find a populated **exam-level report with a plagiarism/similarity score** (needed for [item 10](../Review_Feedback.md)) — the courses checked had no completed assessments in the available date range. Needs a follow-up pass on a course with graded exams.
- CampusTrack **faculty-side** analytics not yet reviewed — faculty access to CampusTrack is "coming soon" per the user. Revisit this doc once that's available.
- Custom date-range picker on CodeTantra's Assessments tab was flaky during testing (forward-month navigation didn't register reliably) — not a finding worth acting on, just a note that it blocked a deeper look at historical assessment data.

---

## Overall Takeaway for Our Redesign

A consistent layering shows up across every good screen on both platforms:

**KPI tiles (headline numbers, often with sparklines) → one or two charts showing where the problem is (unit-wise / topic-wise breakdown) → trend lines (direction over time) → sortable leaderboards (who/what needs attention) → per-entity drill-down (student / unit detail).**

Applying this same layering consistently across our Faculty, Admin, T&P, HOD, and Super Admin dashboards — rather than ad-hoc one-off charts — is the single biggest lever for closing our analytics UX gap. This feeds directly into [Review_Feedback.md item 16](../Review_Feedback.md) (unified design system for analytics).

---

# Part 2 — CampusTrack, Department Head (HOD) persona (2026-10-02)

Hands-on, read-only walkthrough of every screen in the HOD sidebar at `siet.campustrack.in/departmentdashboard` (logged in as an AIML-department HOD). Only navigated and viewed: nothing was edited, generated, exported or submitted (the "Generate Insights" and "Export" buttons were deliberately not pressed). Individual student names and roll numbers seen on screen are intentionally **not** recorded here; figures below are department-level aggregates, kept only to show what each screen looks like with real data.

**Shell**: dark left sidebar with 17 entries plus a *My Profile* group (Profile, Support, Report Issue) and Logout; collapsible. Whole persona is a single-page app under one URL, scoped to **one department** (AIML) and always showing the department name and college in the page subtitle. Almost every screen shares a **Batch filter** (e.g. "2024–2028 · 3rd year", "2023–2027 · 4th year" with student counts) and a **Section filter**.

Sidebar order: Coding Analysis · Weekly Progress · Practice Analytics · Course Analytics · Student Evaluation · Actionable Insights · Our Department · Mentor Mapping · Department Activity · Labs · Placement Readiness · Placement Analytics · Messages · Portfolio · Mentor Leaderboard · Department Leaderboard · Alumni.

## 12. Coding Analysis (HOD home: "Department Student Progress")

- Top KPI tiles: Total Students, Avg Overall Score, then a **traffic-light flag system**: students with Red / Orange / Green flags, students with *all* green flags, and total Red / Orange / Green flag counts. Tiles say "Filtering active" and are clickable filters.
- **Batch filter** cards (All batches + each year with student count).
- **Section-wise analytics**: one card per section (and "All Sections"): avg score, students with red/orange/green flags with totals, "all green" count.
- **Student Details table** (50/page, 255 rows): search by roll no/name, Section and Year dropdowns, **Thresholds** and **Formula** explainer buttons, "Detailed Scores" toggle, **Export**. Columns: roll no, flags summary (flag + count), name, section, mentor id, overall score, then one column per external platform: HackerRank, CodeChef, Codeforces, LeetCode, InterviewBit, GFG, GitHub, plus CampusTrack score and a "Power" metric. Missing data shows "No Data" rather than 0. Tip shown: hold Shift to multi-column sort.
- **Thresholds modal** ("Platform Flag Score Distribution", default college thresholds, per-year selectable): each platform has its own Red / Yellow / Green score bands (e.g. LeetCode red < 2000, green ≥ 10000; Codeforces red < 1000, green ≥ 5000; HackerRank red < 500, green ≥ 1500; InterviewBit red < 100, green ≥ 500; GitHub red < 500, green ≥ 2000; CampusTrack red < 50, green ≥ 200).
- **Formula modal** ("Scoring Formula"): overall score = sum of per-platform scores, each with a published formula (CodeChef: problems×2 + (rating−1200)²/10 + contests×50; LeetCode: problems×10 + (rating−1300)²/10 + contests×50; InterviewBit: score/5; GFG: score×10 + problems×5; GitHub: repos×15 + contributions×5; CampusTrack: sum of solved-problem scores).
- **Takeaways**: transparency of the score (thresholds + formula one click away) is a strong trust pattern; the "red/orange/green" language is instantly scannable; aggregates ("255 of 255 have red flags") show how a harsh threshold makes a screen useless, so thresholds need to be tunable.

## 13. Weekly Progress

- Header: "Department Weekly Progress", week switcher (`‹ Week of Sep 21 – Sep 27 ›` with date range) and Refresh.
- KPI strip: Students (with "N active this week"), **Avg Change** (with "x up · y down"), Problems Solved (with contests count), and "new this week" counters for Certificates, Projects, Achievements, Conferences, Journals, Patents.
- **All Students Progress** table: search, status filter, **See Thresholds**, Export. Columns: student, score, **change vs previous week** (green/red arrow with delta), problems (with "+N new"), CampusTrack solved / tried (+new), contests, certs, projects, achievements, conferences, journals.
- **Takeaway**: a *week-over-week delta per student* plus "new this week" for non-coding portfolio items is the HOD's core weekly review loop. We have nothing equivalent.

## 14. Practice Analytics (richest screen)

- Title with college · department · date range; **range chips** Today / 7d / 30d / 90d / 6mo / 12mo / All; "search a student by roll number" (opens that student's full practice history); All batches / All sections filters.
- KPI tiles (10): Students; Problems (bank size with Easy/Medium/Hard split); **Participation %** (of all students); Problems Solved (with delta, "counted once, when first solved"); Per Student (among those practising); **Pass rate** (with delta and submission count); **Practising** (clickable list); **Not started** (clickable, "never solved anything"); **Stuck** ("submitting, nothing solved in 7d"); **Gone quiet** (clickable, "silent 7 days running").
- Charts: **Practice over time** (toggle Solved / Submissions / Students); **Difficulty mix** (problems solved by difficulty, donut); **Where students stand** (on track / gone quiet / not started donut).
- **Active hours** heatmap (day × hour, "busiest Sun around 10p", toggles All submissions / Passed only / Students, timezone shown, row and column totals).
- **Effort** card (Active / Graduated / Both toggle): submissions with pass %, code written (KB and bytes per submission), languages used, problems touched; **submissions-by-language table** (submissions, passed, students, code size, avg size).
- **Problems** table over the whole question bank: filters by difficulty/category/company; columns problem, category, company, difficulty, solved, tried, pass rate (counts unique students platform-wide); paginated.
- **Topic coverage / Company readiness / Coding sheets** progress lists: per topic "x of the y students who started it have solved all of it" plus "n of m problems have at least one solver"; "View all 79 →" drill-down.
- **"What to look at"** auto-generated plain-language insights (e.g. "96% haven't started", "80% of solved problems were Easy, steer towards Medium", "weakest major topic", "least-prepared company set").
- **Batches table**: year, practising (x/y), problems solved, per student; rows click to go deeper.
- Footnotes explain every metric definition (what "solved", "gone quiet", "problems" mean, what is excluded) — a very good habit.
- **Takeaways**: (a) the **student-state funnel** (not started / practising / stuck / gone quiet) is the single most actionable idea for a HOD; (b) every number carries a definition footnote; (c) KPI tiles are links into the list of *who* is behind the number; (d) auto-written "what to look at" sentences turn charts into actions.

## 15. Course Analytics

- "Department Course Analytics": counts of sections · courses · students enrolled, year filter, refresh.
- Currently an empty state ("No course enrollments yet — once your students enroll in courses, analytics will appear here"). Layout beyond the empty state not observable.

## 16. Student Evaluation ("Department Evaluation Dashboard")

- Two tabs: **Overview** and **Student Rankings**; Batch filter; Refresh.
- KPI tiles: Students, Mentors, Sections, **Top Performers %** (with count), **At Risk %** (with count), Avg Score (with "Luminary" count).
- Charts: **Section Performance Comparison** (avg score by section, bar); **Performance Distribution** (Top Performers / Builder / At Risk); **Section-wise Performance Analysis** (top % vs at-risk % per section); **Student Distribution by Badge** with Year-wise vs Institution-wide percentile toggle, using a named badge ladder: Trailblazer, Champion, Achiever, Builder, Explorer, Learner, Foundation, with count and %.
- **Section Overview** table (students, avg score, top %, at-risk %, details) — click a section for detailed analysis.
- **Student Rankings** tab: ranked list with gold/silver/bronze medals, filters (section, badge), search, sort (by score) and an expandable control, columns rank · student · roll no · section · year · score · badge icon, paginated.
- **Takeaways**: a **named badge ladder** (not just numbers) and **top-performers vs at-risk % per section** are directly reusable; "year-wise vs institution-wide" percentile is a nice toggle.

## 17. Actionable Insights

- Single call-to-action screen: "Generate AI Insights — get actionable insights about your department's mentor performance and student progress", with a Batch filter and a **Generate Insights** button. AI-generated on demand (not pressed in this walkthrough, so the output format is unknown).

## 18. Our Department

- Header chips: students count and mentors count. "Students Overview" table with search by name/roll, Export, pagination (6 pages), sortable columns (roll no, name, current year of studying, section), **mentor** column ("Not Assigned"), and a **See More** action per row opening the student's detail.

## 19. Mentor Mapping

- Manage student↔mentor assignments for the department: search by mentor name/faculty id; table of faculty id, mentor name, number of mentees (sortable), action. Empty state "No mentors found" (0 mentors assigned in this department). Mentors are a first-class concept that other screens reuse (mentor filter, mentor column, mentor leaderboard, portfolio-by-mentor).

## 20. Department Activity

- "Who is using the platform, and who isn't": **Students / Faculty** toggle, live "online" counter, range chips Today / 7 / 30 / 90 days.
- KPI tiles: Students, **Active** (last N days), **At-risk** (no activity in last N days). Batch and section filters; All / Active / At-risk tabs; search; **Export CSV**.
- Per-person row: name, roll no · dept · section, "Nd active · N events", **last seen** ("2d ago"), and a status pill (This week / Inactive). Paginated with "Load more".
- Faculty view has the same shape (instructors + mentors); empty here.
- **Takeaway**: login/engagement tracking per person (days active, event count, last seen) is what our "Time spent" gap needs; we currently only have submission-based activity.

## 21. Labs

- "Department Labs": KPI tiles Total Labs, Batches, Unique Students, Unique Mentors, Unique Total Problems; search, level filter, year filter; empty state "No labs assigned to this department yet".

## 22. Placement Readiness

- Header with Refresh; KPI tiles: Students, **Resumes** (count and avg per student), **Interviews** (mock interviews; count and avg), **Excellence %** (students with green flags).
- **Student Performance Distribution**: four flag cards — Excellent Performance / Improving / Needs Attention / Mixed Performance with count, % and progress bar, an alert banner ("High attention required — over 97.6% need attention; consider placement workshops and one-on-one mentoring"), and a "How are flags calculated?" explainer.
- **Performance Summary**: Resume performance (Excellent / Needs improvement / Needs urgent help) and Interview performance (Active practitioners / Limited practice / No practice); **Year-wise performance** (matching resume vs interview flag colours).
- Filters (year, section, mentor) and a **Student Analytics** table: profile avatar, resume flag, interview flag, name, roll no, year, section, mentor, resumes, interviews, **best ATS score**, experience; export, pagination.
- **Takeaway**: placement readiness is built from **resume ATS score + mock-interview activity**, shown as flags, with prescriptive banner text.

## 23. Placement Analytics (5 tabs)

- **Analytics Dashboard**: "Placement Overview" — T&P registered pool, Placed, Not placed, Placement rate; "Breakdown by year of study" with Total, Placed, Not placed, rate, plus **Active engagement %** (students actively applying), **Best section**, **Avg applications per student**, **Conversion rate** (applications → offers); Placement Distribution (placed / in progress / not placed); section-wise bar chart and a detailed section table (total, placed, unplaced, rate).
- **Company Statistics**: filters (year, branch, section, status, search job/company), KPI tiles Job Openings / Companies / Applications / Selected, table of companies → job title with eligibility count, applied, final selections.
- **Overall Report**: choose companies to compare; student × (company/job → Eligibility, Applied, Round 1..n status) matrix; "Export to Excel".
- **Round Analysis**: aggregate performance by interview round type, filters by company/job/year/branch/section; empty state when no rounds exist.
- **Student List**: per-student applied / selected / rejected / in progress counts and placement status with a View action; search, filters, Export.
- **Takeaway**: a complete placement funnel (eligible → applied → rounds → selected) with company-wise and round-wise views.

## 24. Messages

- Chat between users. First visit shows a *Welcome to Messages* consent screen (be respectful; messages may be reviewed by moderators if reported; do not share passwords/OTPs; report/block available) with "I agree & continue". Chat itself not opened (would require accepting terms).

## 25. Portfolio

- Tabs: Overview · Certifications · Projects · Achievements · R&P (research & publications); batch and section filters.
- KPI tiles: Students, **Nothing on record** (count and % of cohort), **All three types** (count).
- **How complete a portfolio is**: single stacked bar split by how many of the three types (certs/projects/achievements) a student has — nothing / one / two / all three — each band clickable to list those students. Explicitly "counted by types, never by a score".
- **Where the gap is**: table ordered worst-first with Sections / Batches / Mentors tabs (students, all-three, nothing, nothing %), export; clicking a row lists students with nothing.
- **Student records**: one row per student with cert/project/achievement counts and a "nothing" tag; sort chips (Most complete, Most certifications, Most projects, Most achievements) and name search; clicking a row opens the student profile.

## 26. Mentor Leaderboard

- Monthly / Overall toggle; KPI tiles Mentors, Avg Score, Top Score, Students; search, export, refresh; ranked mentors (empty: "No mentor has been evaluated yet").

## 27. Department Leaderboard

- Monthly / Overall toggle; KPI tiles Departments, Avg Score, Top Score, Students.
- **Department ranking table across the institution** (rank, department, score, per-week score, students, mentors, change vs previous period, achievements, certificates, projects, R&P, coding score). The HOD's own department is highlighted with a "You" tag and a drill-down arrow; rank medals for top 3.

## 28. Alumni

- "Alumni Overview — historical record and outcome tracking for graduates": KPI tiles Total Alumni, Graduation Span, Placement Outcomes; **Alumni Batches** (click a batch for summary; empty state "cohorts appear once students cross their passing year").
- "Explore Alumni Data" tiles: Coding Leaderboard, Certifications Archive, Projects Portfolio, Achievements, Research & Publications, Placement Outcomes.

## 29. My Profile menu

- Profile · Support · Report Issue. (Profile contents not opened; contains personal data.)

## HOD persona: cross-cutting patterns worth copying

1. **One consistent scope bar** (department + batch/year + section, plus mentor where relevant) on nearly every screen.
2. **Red / orange / green flags** with published thresholds and formulas, so any number can be explained in one click.
3. **Student-state funnel** (Not started → Practising → Stuck → Gone quiet) with each count clickable into the list of students.
4. **Week-over-week change per student** plus "new this week" for non-coding portfolio items.
5. **Auto-written "What to look at" sentences** and prescriptive banners instead of leaving the HOD to interpret charts.
6. **Metric footnotes** that define every figure and say what is excluded.
7. **Named badge ladder** (Foundation → Trailblazer) with year-wise vs institution-wide percentile.
8. **Activity tracking per person** (days active, events, last seen) with Active / At-risk tabs and CSV export.
9. **Portfolio completeness by number of types**, not by score; worst-first gap table by section/batch/mentor.
10. **Placement funnel** (eligible → applied → rounds → selected) plus resume-ATS and mock-interview readiness flags.
11. **Cross-department leaderboard** that highlights "You".
12. **Mentor** as a first-class entity (mapping, per-mentor filter, mentor leaderboard).
13. **Designed empty states** on every screen that has no data yet (Course Analytics, Labs, Mentor Mapping, Alumni, Round Analysis).
14. **Export** (CSV/Excel) on every table.

## HOD persona: mapping to our application (to build)

| CampusTrack HOD feature | Our current state | Candidate phase |
|---|---|---|
| Department scope bar (batch/section/mentor) on all screens | HOD sees faculty console with department scoping only server-side | Phase 7 |
| Student-state funnel + clickable lists (Not started / Practising / Stuck / Gone quiet) | Only an "at-risk" list (idle 14 days, low accuracy) | Phase 7 (extend at-risk) |
| Week switcher with per-student change | None | Phase 7 |
| Flags with thresholds/formula explainers | Risk reasons shown as chips, no thresholds screen | Phase 7 |
| Auto "What to look at" insights | Not present | Phase 7 |
| Badge ladder + top/at-risk per section | Not present (leaderboard rank only) | Phase 7 |
| Department Activity (days active, last seen) | Submission-based only; no login/time tracking | Phase 7 (needs tracking decision) |
| Mentor mapping / mentor leaderboard | No mentor concept | Later, needs backend model |
| Portfolio completeness (certs/projects/achievements) | Not present | Later, needs data model |
| Placement Readiness + Placement Analytics funnel | Student placement page exists; no HOD/T&P analytics | Phase 7 (T&P role) |
| Department leaderboard (cross-department) | Not present | Phase 7 |
| Alumni | Not present | Backlog |
| Labs | Not present (we have classes and assignments) | Backlog |
| Messages | Not present | Backlog |
| AI "Actionable Insights" on demand | We have AI tutor only | Phase 7 candidate |
| Exports on every table | Partial | Phase 9 |

### Gaps of this walkthrough

- "Generate Insights" output and the Messages chat were not opened (they run an action / require accepting terms).
- Course Analytics, Labs, Mentor Leaderboard and Alumni were empty for this department, so only their layout shell is known.
- The per-student profile (reached via See More / row click) was not opened because it shows personal data.
- No plagiarism or exam-report screens exist in the HOD sidebar, so [item 10](../Review_Feedback.md) is still unverified on CampusTrack.
