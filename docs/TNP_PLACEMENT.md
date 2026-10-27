# Training & Placement: how it works and how to run it

For the Training & Placement (T&P) office, the Admin, HODs and whoever looks after the server.

## Who can do what

| | T&P | Admin | HOD | Student | Faculty |
|---|---|---|---|---|---|
| Make, publish, change, delete drives | yes | yes | no, reads | no | no |
| See drives | all | all | own department's published ones | own department's published ones | no |
| Mark results, add a student by hand | yes | yes | no | no | no |
| Upload CGPA and backlogs, undo an upload | yes | yes | no | no | no |
| See a student's CGPA and backlogs | yes | yes | own department's students | only their own | **no** |
| Record applications made outside the portal | yes | yes | read | sees their own | no |
| Export students | yes (audited) | yes (audited) | no | no | no |
| Resume a student cut off in an exam | yes | yes | yes (own department's exams) | no | owner |

T&P is its own role (`tnp`). It has no department, no access to the faculty console, and **must set up two-factor sign-in** before it can use anything: its session is held back until it does, and it cannot turn two-factor off afterwards.

## Creating the T&P account (Admin or the person with server access)

```bash
node scripts/create-staff-account.js --role tnp --email placement@yourcollege.edu --name "Name"
node scripts/create-staff-account.js --role tnp --email placement@yourcollege.edu --name "Name" --confirm
```

The first line is a dry run. The password is written to `docs/private-credentials/` (never printed, never committed). At the first sign-in the account is sent to a page to set up an authenticator app.

## The rules, in one place

A drive says who may apply: **departments** (one or several), **years**, a **minimum CGPA**, a **most backlogs allowed**, a **last date**, and a **tier**.

- A student with **no CGPA on record** cannot apply to a drive that has a CGPA rule, and is told so (not silently treated as passing). Same for backlogs.
- A student **with an offer** may apply only to **dream** drives. An offer is: selected in any published drive, or an offer recorded as made outside the portal.
- Nobody applies to a **draft** (students cannot see it), a **closed** drive, or after the **last date**. A date with no time means the end of that day in India.
- A student sees **every** reason why they cannot apply, in plain words, never another student's marks.
- A student must tick the **consent** box (their name, roll number, department, email, CGPA and coding score may be shared with the company) every time they apply.
- A student can **withdraw** while the application is still "Applied" and before the last date. After that, only the office can remove it.
- The office can add a student who does not meet the rules, but **must write a reason** (10 to 300 characters). It is kept with the application and written to the audit log. A draft or closed drive cannot be overridden: publish or reopen it first.
- Marking a student **Selected** in a normal drive is refused if they already hold an offer from elsewhere.

## CGPA and backlogs

*Students and CGPA > Upload CGPA.* A CSV with a **Roll number** column and a **CGPA** and/or **Backlogs** column (header names such as `Roll No`, `Register No`, `Arrears` are understood).

1. **Check the file.** Nothing is saved. Each row is shown as new, changed, unchanged or with a problem (unknown roll number, CGPA over 10, a roll number listed twice, and so on). The row number is the line in your file.
2. **Apply.** The good rows are saved. A row that leaves CGPA or backlogs empty keeps what is stored.
3. **Undo** any earlier upload from the list below. It puts back what the upload replaced. A record that a *later* upload has since changed is left as it is, and counted.

The marks are kept apart from the student profile, so no profile screen or student list can show them.

## Export

*Export.* Choose the fields from a fixed list (name, roll number, department, year, section, email, CGPA, backlogs, coding score), then the students (whole college, a department, a year, or only the applicants of one drive). **Every export is written to the audit log** with who made it, the fields and how many students. Cells that a spreadsheet would run as a formula (starting with `=`, `+`, `-`, `@`) are neutralised.

## Other things the office does

- **Tell eligible students**: on a drive, sends an in-app reminder to every student who can apply and has not yet. It skips students who are not eligible, who already applied, or who have an offer (unless it is a dream drive).
- **Outside applications**: *Outside offers* records a company the student applied to on their own. An offer here counts as placed in the analytics, but is listed separately from drives, and it locks the student to dream drives.
- **Analytics**: the whole college or one department, with the funnel, companies, rounds and students. Offers made outside the portal are counted as placed.
- **Exams**: published exams, their live roster, and *Resume* for a student who was cut off. A reason is required and kept on the attempt. The office cannot see the integrity report.

## For the server

- Routes are under `/api/placement/*` (see `docs/ACCESS_MATRIX.md`). The old `/api/faculty/placement/*` routes are gone: an HOD now reads the same data through the new routes.
- Collections: `placementDrives`, `placementApplications` (id `driveId_studentId`), `placementRecords` (one per student), `placementRecordBatches`, `placementOutside`. All access is through the server; the Firestore rules should deny direct reads of `placementRecords`.
- The student list and the CGPA records are kept in the API process for 20 to 30 seconds, because every office screen needs all of them (about 3000 database reads each). After an upload the CGPA copy is cleared at once.
- Rules live in `backend/src/utils/placementPolicy.js` (pure) with `backend/tests/pure/placementPolicy.js` (73 checks) and `placementFlow.js` (96 checks through the real routes).
- Try it in a browser with no real data: `SANDBOX_OUT=<folder> PORT=3001 node scripts/placement-sandbox.js`, then paste a sign-in snippet from the folder into the browser console.
