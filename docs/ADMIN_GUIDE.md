# Admin guide: people, settings, audit and security

For the college Admin and whoever looks after the server. The menu is under **Administration** in the staff console.

## What the Admin can do

| Screen | What it is for |
|---|---|
| **College overview** | Students and staff counts, who signed in this week, sign-ins in the last day, wrong two-factor codes and blocked sign-ins, whether email and AI are on, and a short list of things that need attention (email not set up, T&P or Admin without two-factor, many wrong codes, no departments listed). |
| **People** | Search every account (staff and students) by name, email or roll number; filter by role, department and status. Open a staff account to send a new set-password link, change role, change department, disable or enable it, and see its recent sign-ins. |
| **Settings** | The list of departments and sections, and the AI switch and daily limit per person. Every change is written to the audit log as old to new. |
| **Audit Log** | Who did what and when: search, filter by action, person and date, export as CSV. A second tab lists wrong two-factor codes and sign-ins refused because the account is disabled. |
| **Permissions** | The existing page for each faculty member's permissions. |
| **Placements** | The Training & Placement screens (the Admin can do everything T&P can). |

## Adding a staff account

*People > Add staff account.* Enter name, email, role (faculty, HOD, Training & Placement, Admin) and, for faculty and HOD, the department. The person is emailed a link to **choose their own password**.

- You never see a password and you never see the link. This is deliberate: a link that sets someone's password would let you sign in as them. There is no "sign in as" anywhere in the system.
- **Email must be set up on the server** (`SMTP_HOST` and `MAIL_FROM` in `.env`). If it is not, creating an account is refused with a message saying so, and nothing is created. `scripts/create-staff-account.js` still works for a first account.
- Making someone an **Admin** needs their email typed a second time.
- Training & Placement accounts must set up two-factor sign-in at their first sign-in.
- Once departments are listed in Settings, faculty and HOD accounts must use one of them. A typo cannot start a new department.

## Disabling, role changes

- **Disable** and **change role** need the account's email typed in full. They affect **one account at a time**; there is no bulk version.
- A disabled account is locked out **within seconds** (the API keeps a short in-memory list of disabled accounts, refreshed every 30 seconds from one small query; the Admin's own server updates it at once). Its sessions are ended, and it cannot sign in until enabled. Nothing it made is deleted.
- A role change ends the person's sessions, so the new role and menu apply at the next sign-in. Roles move only within staff: a student never becomes staff.
- **Safety rules:** the last active Admin cannot be disabled or given another role; an Admin cannot disable or change the role of themselves (ask another Admin).
- Students are not managed here; their department manages them (roster, year and section, academic structure).

## AI switch and limit

*Settings > AI help.* Off stops the AI tutor, code review, mock interview and the HOD department insights for everyone, with a plain message. The daily limit counts each person's AI questions per day (the day ends at midnight India time); Admins are never limited. If the counter cannot be read the request is let through and the problem is logged: a database blip should not take AI away from a class. (Faculty tools that generate test cases and import problems are controlled by the faculty permissions and are not covered by this switch.)

## Audit log and sign-in history

- Entries are kept **one year**. Older entries, and older sign-in history, are removed automatically, at most once a day, when the Admin opens the log.
- The list shows the newest matching entries and stops as soon as it has enough, so opening it costs one page of reads. A search that matches little looks through up to 5000 recent entries; narrow by date to go further back. The export takes up to 5000 matching entries and is itself logged.
- Sign-in history records successful sign-ins, wrong two-factor codes and blocked (disabled) accounts, with the address and browser. A wrong **password** is checked by Firebase and is not recorded here.

## For the server

- Routes: `/api/admin/*`, Admin only (matrix rule and invariant in `backend/src/config/accessMatrix.js`).
- New collections: `collegeSettings` (`main`, `maintenance`), `loginEvents`, `aiUsage` (one document per person per day).
- The people list is held in the API process for 20 seconds (it is about 3000 reads), settings for 30 seconds.
- Rules are pure functions in `backend/src/utils/adminRules.js` (48 checks); `backend/tests/pure/adminFlow.js` drives the real routes (63 checks).
- Try it with no real data: `SANDBOX_OUT=<folder> PORT=3001 node scripts/admin-sandbox.js`, then paste a sign-in snippet into the browser console.

## Not built in S6

- **Roster import from the screen** (dry run, backup, rollback) and **moving students between year and section** from the Admin area. The roster scripts in `backend/scripts/roster/` still do the import, and HODs and the Admin can already move a student between classes in *Academic structure*.
- A college **cost and quota** panel, and **alerts** by email or phone when something fails (see `docs/EXAM_DAY_PLAYBOOK.md` for monitoring).
- **Feature switches** for whole areas (the owner chose only departments and sections, and the AI switch).
- **Coding-score thresholds** stay where they are (HOD and Admin, in the Coding score tab).
