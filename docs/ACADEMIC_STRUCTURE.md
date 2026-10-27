# Academic structure: how a semester is set up

For Admins and HODs. A faculty member sees students only through this structure (plus the join-code classrooms they made themselves), and each student sees their class, class teacher and sub-mentor.

## Words

- **Term**: one semester of one academic year. Exactly one term is **active**.
- **Class**: the students of one department, year and section for one term. An **elective group** is a hand-made group across sections.
- **Position**: a student's number, from 1, in the class list sorted by roll number (21CS2 comes before 21CS10).
- **Class teacher**: looks after the whole class.
- **Sub-mentor**: looks after the students at positions *from* to *to* (for example 1 to 24, then 25 to 48).
- **Assignment**: a faculty member teaches a subject to a class from one date until another. Ended, never deleted.

## Each semester (Admin, then each HOD)

1. **Admin:** Faculty > Academic structure > *New term*, then *Make this the active term* when the semester begins. Making one active closes the previous one.
2. **HOD, for their department:** *Build classes from students*. Classes are made from each student's department, year and section. Students already placed are not moved, so it is safe to press it again (for example after new students are added).
3. Students with no year or section are listed by name. Fix their profile, or use *Place students from a list* (a CSV or pasted lines: `rollNo,year,section`). Each row is checked on its own; the good ones are applied and the rest come back with the reason.
4. Name a **class teacher** for each class.
5. Set the **sub-mentors**: *Sub-mentors* on the class, one range per sub-mentor. *Split evenly (24 each)* fills them in. The ranges must cover every position from 1 to the class size exactly once; the screen tells you what is missing or doubled, and the server refuses a set that does not fit.
6. **Assign subjects**: *Assign a subject* gives a faculty member a subject in a class from a date. *Reallocate* ends the old assignment and starts the new one at the same moment; earlier work stays with the earlier teacher.
7. Open the **Checks** tab: it lists students in no class, classes with no class teacher, ranges that no longer cover the class, empty classes, and staff who are gone.

## Mid-semester changes

- A student moves section: *Students* on the class, *Move to*. Positions and each student's mentor are recalculated. If the class size changes, the sub-mentor ranges may no longer fit; the Checks tab says so and you edit the ranges.
- A new teacher takes over a subject: *Reallocate* with the date it takes effect.
- An elective: *New elective group*, then add students from its list. They stay in their own section.

## What each person sees

| Person | Sees |
|---|---|
| Class teacher | the whole class |
| Faculty who currently teach a subject in a class | the whole class, from the start date to the end date |
| Sub-mentor | only the students in their own range |
| Faculty with an approved access request | the class, until the access expires |
| HOD | every class of the department |
| Admin | everything |
| Student | their class, class teacher and sub-mentor on the dashboard |

A faculty member who needs another class uses *My classes > Ask for access to a class*, with a reason. The HOD of that class's department (or an Admin) approves for 7, 30, 90 or 180 days or until the term closes, or declines.

## Exams and assignments

An exam or an assignment can be aimed at classrooms (join-code groups) and at academic classes. A faculty member can aim only at classes they teach or are class teacher of (a sub-mentor sees their students but does not set work for the whole class); a HOD at any class of the department; an Admin at any.

## The faculty dashboard

- **Class switcher** at the top: "All my classes", each academic class you teach or look after, and your own join-code classrooms. The choice is remembered on that computer. Every number and list on the dashboard (and the Students tab) is then for that class only. A HOD sees every class of the department; an Admin every class. A class that is not yours is refused, never widened.
- A faculty member sees only the students of their own classes in the Students list and on a student's page. (Before, the Students tab listed the whole department.)
- **Needs attention:** students who have not started, went quiet for a week or more, or are stuck (four or more tries on a problem, not solved). **Hardest problems:** problems where fewer than 40% of those who tried got it.
- **Customise** (top right): show or hide each widget, move it up or down, or start from a preset (everything, watching students, just the essentials). Saved for you, on any computer. If a widget is later removed from the system, your saved layout fixes itself.
- Department-wide cohort comparisons are for HODs and Admins.

## Not built yet

- Content ownership moving to the new teacher on reallocation (assignments and exams stay with the old owner; the HOD can still manage them).
- Faculty seeing no courses by default, with access by grant to a class (courses still follow the existing rules).
- A notification to the faculty member when a request is decided (they see the status on *My classes*).
- The rollover wizard (promote years, carry assignments forward, dry run, rollback): for now each term is built from the students' current year and section.
- Automatic repair of simple consistency problems.
