# CodeTantra review (faculty view) and what CodeMentor should learn from it

Walked through on 2026-10-20, signed in with a faculty account, **view only**: pages, tabs, filters and dialogs were opened;
nothing was created, edited, submitted, deleted or downloaded. No student data is recorded here.

Scope limits: this was the faculty role only. Not opened (could change data, start an attempt or download a file): quizzes and
test taking, Evaluations, Quick Test Creator's Create, New Class, any Download button, Run/Submit/Debug in the editor, the
"Get started with AI" prompt, profile and password pages, role switch. Report pages that need "Fetch Reports" were opened up to
the selector only.

## 1. Map of the product

**Top bar:** Home, Labs, Tests, Users & Groups, Reports, account menu (Update Profile, Change Password), role switch
(Member / Faculty), Support, Logout. A floating "Blocked Users" button on Home.

**Home tiles:** Courses, Tests, Programming Labs, Tools, Help & Support.

| Area | What is there |
|---|---|
| **Courses** | An activity calendar across the top (a heat map by day, with a legend). A list of "Courses as Teacher" and "Enrolled Courses" with search, sort, and card/list toggle. |
| **Course page tabs** | Dashboard, Enrolled Users, Contents, Calendar, Assessments, Syllabus, Lab, Activity. |
| **Course Dashboard** | Quick links; tiles for last-7-day active users, users with suspicious activity, submissions, completed users, not-started users; charts for unit-wise completion (solved / partial / not started per unit), submissions per day, solved per day, and time spent in the course per day. |
| **Enrolled Users** | Groups as cards (students shown as avatar stacks, assigned faculty beside them), a search box (Ctrl+K), a Blocked Users list. |
| **Contents** | Left tree of units (colour-coded by type) with search (Ctrl+K). A progress gauge, "units left", a **Resume** card ("pick up where you left off"), then each unit with its own progress bar and an analytics icon. Three levels: unit, topic, question. |
| **Question statistics (faculty)** | Per question: pick a group (and optionally users), then see total / in progress / average time / completed / not started, the most and least effective performer, a time-spent histogram, a suspicious-activity donut, and a table per student: status, suspicious yes/no, submissions, compilation failed, execution failed, time spent, with page size and paging. |
| **Calendar** | Grid or list; day, week, month; filters for Classes, Assignments, Assessments, Meetings, Reminders; a "New Class" button. |
| **Assessments** | Ongoing and upcoming (with a date range), and Completed. |
| **Syllabus** | The unit list with "Show contents". |
| **Lab** | A lab linked to the course, with a group picker and a link to the lab report. |
| **Activity** | Period filter (yesterday, week, month, 6 months), group chips, tiles (active users, suspicious activity, submissions, average active time), most active groups and users, learners' time by weekday, and a per-student table (completion %, suspicious %, time spent, solved, submissions, total solved) with Download, Show/Hide Columns, search and page size. |
| **Tests** | Quick Test Creator (start, end and *entry stop* time, template, groups, name), scheduled tests with results, self-assessment results, group test report, and Evaluations (answer-script marking), Take Test, See Results. |
| **Reports** | Course Progress (and a time-based one), Group-wise Users, Group-wise User Course, Summary, User Submission, User-wise, Late Submissions, Reopen Requests, Manage Course Schedule, Edit User Details, Daily-wise (a date, then attempted questions, active faculty, average learning time, active tests, accessed courses). Almost all are "pick a group or course, then fetch". |
| **Tools** | Environment Check, Calculator, QR Scanner, Document Scanner. |
| **Security** | The portal asks for browser location permission and shows a blocking explanation if it is denied; screen-sharing with support or students is built in. |

## 2. The problem-solving screen (the part students live in)

- **Left:** a numbered title ("2.1.1 ..."), a small timer chip, and icon tools: font size, dark mode, notes, a toggle, copy link, collapse.
  The statement highlights key terms and type words (string, integer), has Input Format and Output Format sections, and a collapsible
  **Sample Test Cases** block where **every input line and the expected output has its own copy button**.
- **Right:** an in-browser coding environment with a file **Explorer** (several files), the editor with visible whitespace dots,
  a **Run** (play) button, a green **Submit** button, a **Debugger** side panel ("click on debug to view debug results"), and
  bottom tabs for **Terminal** and **Test cases** (results appear after Submit).
- **Bottom bar:** Prev, Reset, Submit, Next. A "Setting up environment..." loader appears first (several seconds).
- **Teaching is inside the problems.** Early questions open with a short explanation, highlighted vocabulary and an annotated
  picture of the editor, then the task. Learn and practise are one flow, not a lesson tab plus a problem tab.
- The timer on the screen counts only while the environment is active.

## 3. What this means for CodeMentor

What we already match or beat (after this week): server-side per-problem time, runtime and memory against other students (they
show time and attempts, not runtime), hints and reference solution, exact-output grading, course progress with completed / in
progress / not started, proctoring flags, AI tutor.

**Gaps worth closing, in order of value to a college** (the phased plan is `docs/COMPETITOR_BUILD_PLAN.md`; a heat map and department-level activity already exist in our faculty analytics):
1. **Per-question statistics for faculty** (we already have a cohort-level per-problem funnel and test-case hotspots; what is missing is the per-student table, time and the compile-failed vs run-failed split) (group filter, completed / in progress / not started, average time, best and weakest
   performer, compile-failed vs run-failed counts, time-spent histogram, flagged students). Highest value, cheap: we already store
   submissions, verdicts and now time.
2. **Resume card and unit-level progress on the student's course page** ("pick up where you left off", progress per unit, units left).
3. **Activity report for faculty** with period filter, per-student table (completion, time, solved, submissions) and a CSV
   download, plus a heat-map calendar of daily activity.
4. **Lessons inside problems** (concept text, highlighted terms, picture, then the task). Our course import has objective and hints
   but no teaching text; the Python course authors could add it.
5. **Statement polish:** copy button on every sample line, visible whitespace marker in output diffs, key-term highlighting,
   section numbering ("2.1.1"), Prev/Reset/Next bar.
6. **Debugger** (step through code). Larger; defer.
7. **Scheduling:** course calendar (classes, assignments, assessments, reminders), unit release schedule, entry-stop time for tests,
   late-submission and reopen-request reports. Mid size; the reopen-request flow is a real classroom need.
8. **Exam-day tools:** environment check page for lab machines, QR and document scanning for written papers and their
   evaluation. Only if the college runs paper exams.
9. **Reports catalogue:** summary, user-wise, daily-wise, group-wise; mostly saved views on data we already hold.

**Things they do that we should not copy:** the report pages are plain "select, then fetch" forms with no default view, the
environment takes seconds to start, the layout is dense and the sample test panel is collapsed by default.

## 4. Open items (not verified)
- Quizzes, test taking, evaluations and the student-side learner view were not opened.
- Whether Run shows output inline, how the Debugger behaves and what the Test cases tab looks like after a Submit were not tested.
- Download buttons and "Fetch Reports" outputs were not triggered.

## 5. Side effects on the reviewed account
Opening two questions registered a few minutes of time and set the "Resume" card to the last question opened. Nothing else changed.
