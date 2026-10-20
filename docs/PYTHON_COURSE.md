# Python course: how it works and how to run it

The Python course is 18 modules, 312 problems and about 2,800 test cases, imported from 18 CSV files. This page is the
runbook: what the platform does differently for this course, and the exact commands.

> **The CSV files must never be committed.** This repository is public, and the files hold every reference solution
> and every hidden test case. Keep them in a folder outside the repo (for example `Downloads/pythoncourse`) and point the
> scripts at it with `--dir`.

## What is different about these problems

| Setting (per problem) | Python course value | Why |
|---|---|---|
| `languages` | `[100]` (Python 3.12 only) | The course was written and verified against one Python version. Judge0 id 100 is 3.12.5. |
| `comparison` | `exact` | The course teaches formatting. Exact mode compares the whole output line by line and forgives only CRLF, trailing spaces and trailing blank lines. The default (loose) mode ignores line breaks, quotes, commas and brackets and looks only at the first 4,096 characters. |
| `harness` | a driver, for the 32 function-style problems | Modules 6 and 10 ask for a function, not a program. The judge appends a small driver after the student's code: each input line is the argument list of one call, the output is `repr(result)` or the exception's class name. Appended after the student's code so error line numbers stay theirs. |
| `hints`, `objective`, `complexity`, `referenceSolution` | from the CSV | Shown in the **Hints** tab of the problem screen. Hints open one at a time. The reference solution and the complexity unlock only after the student's own accepted submission; faculty, HOD and admin always see them. Hidden during exams and proctored assignments. |
| `tags` | `python` and the module name | Drives the per-topic mastery and the course analytics. |

Everything above is optional on a problem. Problems without these fields behave exactly as before.

## Lessons (optional teaching text)

A problem can carry a `lesson` (markdown, up to 8,000 characters) that students read above the statement: **the idea first, then
the task**. Words in `**bold**` are highlighted as key terms. Two ways to supply it:

- a `lesson` column added to a module CSV, or
- a separate `lessons.csv` in the same folder with two columns, `question_id` and `lesson` (any id form works: `M01-01`, `PY-M8-01`).

Re-running the import keeps a lesson that is not in the files, so lessons typed in the faculty editor (Problems > edit > Lesson)
are not wiped. The dry run reports a lesson whose question id is not in any module file.

## Ids

CSV ids are `M01-01` in modules 1 to 7 and `PY-M8-01` / `PY-M08-01` in modules 8 to 18. All become the key `py-m08-01`,
and the document id is a UUID derived from that key, so running the import twice updates the same documents instead of
duplicating them. The original id is kept in `importId`.

## Commands (run from `backend/`)

1. **Dry run** (writes nothing, needs no database). Prints counts, ids that were normalised and every data note:

   ```bash
   node scripts/python-course/import.js --dir "C:/path/to/pythoncourse"
   ```

2. **Check the data against itself** on your machine's Python (about 15 seconds):

   ```bash
   node scripts/python-course/import.js --dir "C:/path/to/pythoncourse" --check
   ```

3. **Check it on the real Judge0** (Python 3.12). Takes 30 to 60 minutes on the public Judge0 and uses no Firestore quota.
   Add `--limit 10` to try the first 10 problems only:

   ```bash
   node scripts/python-course/import.js --dir "C:/path/to/pythoncourse" --verify
   ```

4. **Import** as a draft (students cannot see it). First run `node scripts/check-firestore.js`:

   ```bash
   node scripts/python-course/import.js --dir "C:/path/to/pythoncourse" --confirm --owner-email admin@sreyas.ac.in
   ```

   Safe to re-run after a CSV fix. A re-run refreshes the content and never changes whether students can see it.

5. **Review as faculty**, then **publish** (flips the course and all its problems), or hide it again:

   ```bash
   node scripts/python-course/import.js --publish
   node scripts/python-course/import.js --unpublish
   ```

6. **Remove everything** the import created (refuses if a student has already submitted to one of the problems):

   ```bash
   node scripts/python-course/rollback.js --confirm
   ```

## Data notes found in the files (handled automatically, reported by the dry run)

- `PY-M17-18` has a blank "sample input 2" cell although its output is filled in; the importer matches it to the test with
  that output.
- `M01-03` and `M01-13` print without reading any input, so their tests have an empty stdin; that works.
- Every reference solution reproduces every expected output (2,818 of 2,818), including the function problems that expect an
  exception name such as `TypeError`.

## Known limits

- Time and space complexity are shown as text from the CSV. They are not machine-checked.
- Python's 6-second CPU limit (2 seconds x 3, the usual Python multiplier) applies to every test.
- Editing the course's problems in the faculty editor works, but a later re-import overwrites those edits with the CSV.
