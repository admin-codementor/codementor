# Real-student onboarding runbook

How the CSE(AIML) roll list becomes real accounts. Every file with names, roll numbers or passwords lives in
`docs/private-credentials/` (gitignored). Never commit it, never paste its contents into chat.

All commands run in `backend/`. Every script that writes is a **dry run unless you add `--confirm`**.

## 0. One-time settings

| Where | Setting | Why |
|---|---|---|
| Backend env (and Render) | `FIREBASE_WEB_API_KEY` = the value of `NEXT_PUBLIC_FIREBASE_API_KEY` | Lets the server refuse "new password = the temporary password". Without it that one check is skipped; everything else works. |
| Backend env | `ALLOW_SELF_SIGNUP` unset | Self sign-up is closed: a sign-in with no pre-created account gets "No account exists for this email". Set `true` to reopen. |
| Frontend env | `NEXT_PUBLIC_ALLOW_SELF_SIGNUP` unset | `/register` shows "accounts are created for you". Set `true` to show the form again. |

## 1. Build the roster (no database)

```bash
pdftotext -raw "<roll list>.pdf" roll-list.txt
node scripts/roster/build-roster.js --text roll-list.txt --out ../docs/private-credentials/roster-draft.csv
```

Prints students per section, the serial-number cross-check and the rows needing review. Fix anything it lists by
editing `roster-draft.csv` (clear the `review` cell once a row is confirmed).

To list roll numbers that the PDF skips (students you may need to add), run:

```bash
node scripts/roster/missing-rolls.js --in ../docs/private-credentials/roster-draft.csv
```

It writes `missing-students-<date>.csv` with a blank `student_name` column for the department to fill in.

## 2. Passwords and the final CSV (no database)

```bash
node scripts/roster/make-passwords.js --in ../docs/private-credentials/roster-draft.csv --accept-flagged --split
```

Writes `students-cseaiml-<date>.csv` (`sno, Year, Section, Name, Rollno, email, Password`) and one sheet per class.
**This file is the only copy of the passwords**; the script refuses to overwrite it. Hand each class teacher their
sheet, then delete the files.

## 3. Accounts (live Firebase and Firestore)

First check that Firestore is usable (the free daily quota resets at midnight Pacific, about 1:00 pm IST). The account
scripts also check this themselves and stop before changing anything, but this is quicker:

```bash
node scripts/check-firestore.js
```

```bash
node scripts/create-staff-account.js --role hod            # dry run, then add --confirm
node scripts/create-staff-account.js --role faculty
node scripts/roster/create-students.js --csv ../docs/private-credentials/students-cseaiml-<date>.csv                    # dry run
node scripts/roster/create-students.js --csv ... --limit 3 --confirm      # a small trial
node scripts/roster/create-students.js --csv ... --confirm                # everyone
```

Re-running is safe: it only does what is missing. Students get `department: "CSE(AIML)"`, `mustChangePassword: true`.
The test HOD and faculty use `hod.test@codementor.test` and `faculty.test@codementor.test`; their passwords are
written to `docs/private-credentials/`.

## 4. First sign-in (what a student sees)

Sign in with `<rollno>@sreyas.ac.in` and the temporary password → the app sends them to **Choose your password**
→ every other page and API call is refused until they do (the server enforces it, not just the page) → they land on
their dashboard.

## 5. Later

- Make a test account real: `node scripts/change-account-email.js --from hod.test@codementor.test ... --to <real email> --name "<Name>" --real --confirm`
  (same account and history; the new address needs a real mailbox for "forgot password" emails).
- A student locked out: `node scripts/reset-student-password.js --roll 25VE1A6601 --confirm` (new temporary
  password in `docs/private-credentials/`, forced change again).
- Delete the old demo students first, if not done: `scripts/delete-all-students.js` (dry run, backup, then
  `--confirm-project`).

## Known limits

- The CSV holds the only copy of the temporary passwords. Lose it and use the reset script per student.
- Without `FIREBASE_WEB_API_KEY` a student could keep the temporary password by choosing it again.
- A student's `year` is a number set now; it does not advance by itself each June (a promotion script is future work).
- Seven students are in a year list with an older roll prefix (repeaters); their emails follow their own roll number.
