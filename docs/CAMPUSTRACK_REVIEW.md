# CampusTrack review (department / HOD view) and what CodeMentor should learn from it

Walked through on 2026-10-20, signed in as a department-level user, **view only**: pages, tabs, dialogs and filters were opened.
Nothing was created, edited, generated, exported or accepted. No student names or scores are recorded here.

Not opened (would change data, use a quota or accept terms): Export / Export CSV buttons, "Generate Insights" (AI call),
the Messages consent screen ("I agree & continue"), My Profile > Profile / Support / Report Issue, any student profile beyond the
first card, the Student Rankings tab. Only the HOD role was seen; student and mentor views were not.

## 1. Map of the product (sidebar, top to bottom)

| Page | What it shows |
|---|---|
| **Coding Analysis** (home) | Tiles: total students, average overall score, students with red / orange / green flags, all-green students, total flags by colour. A batch filter (year). Section-wise cards (average score, flag counts per section). A student table with flags summary, section, mentor, **overall score and one column per external platform** (HackerRank, CodeChef, Codeforces, LeetCode, InterviewBit, GeeksforGeeks, GitHub, CampusTrack itself, "Power"). Buttons: **Thresholds** (red / yellow / green score bands per platform, filter by year), **Formula** (the scoring formula per platform, shown in full), **Detailed Scores**, **Export**. Shift-click sorts by several columns. |
| **Weekly Progress** | Week navigator. Tiles: students, average change, problems solved, certificates, projects, achievements, conferences, journals, patents (each "new this week"). Table: score, change vs last week, problems (new this week), CampusTrack tried, contests, certificates, projects, achievements, conferences, journals, patents, and a status of improving / stable / declining. Weekly trend chart, performance distribution, **Top improvers this week**. |
| **Practice Analytics** | Period switch (today, 7d, 30d, 90d, 6m, 12m, all), batch and section filters, a student search that opens one student's practice history. Tiles: students, problem bank size by difficulty, participation, problems solved (with change vs previous period), per student, pass rate, practising, not started, **stuck** (submitting, nothing solved), **gone quiet** (silent 7 days). Charts: practice over time, difficulty mix, "where students stand". An **active-hours heat map** (day by hour). **Effort**: submissions, code written (KB), languages, problems touched, a submissions-by-language table. A question-bank table with category, company, difficulty, solved, tried, pass rate. **Topic coverage, company readiness, coding sheets** (DSA Lite, DSA Core, TCS NQT) as progress bars. A **"What to look at"** panel of plain-language findings and a batch table. Footnotes explain exactly how every number is counted. |
| **Course Analytics** | Per-course analytics by section (empty here: no enrolments). |
| **Student Evaluation** | Overview and Student Rankings tabs. Tiles: students, mentors, sections, **top performers %**, **at-risk %**, average score. Section comparison chart, performance distribution (Top performer / Builder / At risk), per-section top-vs-at-risk, and a **badge ladder** by percentile (Trailblazer, Champion, Achiever, Builder, Explorer, Learner, Foundation) year-wise or institution-wide. |
| **Actionable Insights** | A batch filter and a "Generate Insights" button that asks AI for advice on mentor performance and student progress. |
| **Our Department** | Student and mentor counts, searchable and sortable student list (roll no, name, year, section, mentor) with **See More** and Export. |
| **Mentor Mapping** | Mentors with their mentees, search, assign actions. |
| **Department Activity** | Who is online now; Students / Faculty switch; Today / 7 / 30 / 90 days; active vs at-risk (no activity); batch and section filters; All / Active / At-risk; a person list with active days, number of events, last seen and a status badge; search; Export CSV. |
| **Labs** | Labs assigned to the department with batches, students, mentors and problems (empty here). |
| **Placement Readiness** | Students, resumes, interviews, excellence; a flag-based distribution with an alert ("over 97% need attention"), a "how are flags calculated" explainer, resume quality and practice flags, year-wise performance, filters (year, section, mentor), a student table with resume score. |
| **Placement Analytics** | Registered, active, placed, not placed, placement rate, active engagement, best section, average applications, conversion rate; placement distribution, section-wise chart and table. |
| **Messages** | A consent screen first (respect, messages may be reviewed on report, no passwords or OTPs; report or block anyone). |
| **Portfolio** | Certifications, projects, achievements, research and publications per student; "how complete a portfolio is" (none / one type / two / all three); where the gap is, by section, batch and mentor. |
| **Mentor Leaderboard** | Monthly or overall mentor ranking with export (empty here: no mentors assigned). |
| **Department Leaderboard** | All departments of the college ranked by score, score per week, students, mentors, change, achievements, certifications, projects, research, coding. |
| **Alumni** | Alumni by batch and six drill-downs: coding leaderboard, certifications, projects, achievements, research, placement outcomes. |
| **My Profile** | Profile, Support, Report Issue. |

**Student public profile** (opened once, dark theme): banner, name, roll no, branch / year / section, college, a **percentile
badge** with a Year / College toggle ("refreshes daily"), then Experience, Performance, Certifications, Achievements, Research and Publications.

## 2. How their score works (shown to HODs in full)
Overall score = sum of per-platform scores. HackerRank is taken directly; CodeChef = problems x 2 + (rating - 1200)^2 / 10 +
contests x 50; Codeforces uses 800 instead of 1200; LeetCode = problems x 10 + (rating - 1300)^2 / 10 + contests x 50;
InterviewBit = score / 5; GfG = score x 10 + problems x 5; GitHub = repos x 15 + contributions x 5; CampusTrack = the sum of
solved-problem scores. Flag bands are per platform (for example LeetCode red below 2,000, yellow 2,000 to 10,000, green above).
Observation: a student with a high rating on one outside platform dominates the total, and the formulas are unevenly scaled
(one LeetCode problem is worth five CodeChef problems).

## 3. What this means for CodeMentor

**Correction (2026-10-20):** an earlier version of this section listed Mentor Mapping, Portfolio, Placement, Alumni, Labs,
Messages, AI insights, Department Activity and the department leaderboard as gaps. They are already built (H3 to H11, tabs of
`/faculty/department`), and so are the flags, the badge ladder, the funnel states and the weekly progress view.

What CampusTrack has that we still do not (details and phases in `docs/COMPETITOR_BUILD_PLAN.md`):
1. One combined **external platform score** with per-platform thresholds, red / orange / green flags and a visible formula
   (we sync Codeforces and LeetCode only and show no combined score or flags).
2. **Resume score and interview tracking** feeding placement readiness bands.
3. **"Online now"** presence, an unread badge in the navigation, and a public-profile percentile badge.
4. The "What to look at" panel and the funnel widget on the faculty analytics pages (we have them on the department page only).

**Do not copy:** the unscaled platform formulas (one outside rating can dominate the total, one LeetCode problem is worth five
CodeChef problems), and an alert that says 97% of students "need attention" without saying what to do.

## 4. Open items (not verified)
- Student and mentor views, the Student Rankings tab, Detailed Scores, and every Export were not opened.
- Whether the AI insights are useful, and how messaging behaves after the consent screen, are unknown.
- How CampusTrack fetches outside-platform scores (and how often) is not visible from this view.
