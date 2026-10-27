# Exam-day playbook

For the people running a graded exam: the exam owner, the invigilators and whoever looks after the server. It describes what exists **today**. The last section lists what does not exist yet.

**Contacts (fill in before the exam):** server: ____________ · exam owner: ____________ · HOD: ____________

## How the exam behaves (so nothing surprises you)

- **The server owns the clock.** The time a student has left is decided on the server when they press Start. A wrong clock on a student's computer changes nothing.
- **Answers save as the student clicks.** The top bar shows "Saved 10:42:15". If the connection drops it says "Waiting for connection" and keeps the answers on that computer; they upload when the connection returns.
- **One window at a time.** Opening the exam on a second device or tab makes that one active; the first shows "open in another window" and can take it back with one button.
- **Leaving fullscreen or switching tab is counted.** After the number set on the exam (default 5, 0 means never), the student's exam is **paused**: they see a plain screen and their time keeps running. **Nothing ends an exam early.** Only the server deadline does.
- **Time ran out:** the saved answers are marked as submitted at the deadline. This happens when the exam owner opens the report, or when the student next opens the exam.

## A week before

1. Create the exam in **Faculty > Exams**. Set the window, the duration and the **"pause after this many violations"** number. Publish it.
2. Sit it yourself with two test students on two different computers: start, answer, switch tab until paused, resume from the roster, finish. This takes 15 minutes and finds more than any document.
3. For an exam with coding sections, run a real submission for every problem and read the verdict.
4. Agree **who can resume students**: an Admin, the exam's owner, or the owner's HOD. Nobody else can.
5. Decide the freeze: **no updates to the server from 24 hours before the exam** until it ends.

## The day before

1. On the server: `bash deploy/update.sh --check` (changes nothing). Fix every `[must fix]`.
2. `docker compose ps` shows every service "Up". `df -h` shows at least 20% free disk. `free -m` shows free memory.
3. `curl http://localhost:3001/api/system-status` says `"status":"ok"`.
4. Open the site from a phone on mobile data and from the campus Wi-Fi, and sign in with a test student.
5. Firebase: the billing budget alert is set, and Firestore rules are the deny-all file in the repo (check in the console).
6. Print the one-pager at the end of this page for every invigilator.

## 30 minutes before

- Open **Faculty > Exams > Live roster** for the exam in one browser tab, and `/api/system-status` in another. Keep both open.
- Tell students: use fullscreen, do not open other tabs, **do not clear browser data**, and if something looks wrong put a hand up instead of refreshing repeatedly.

## During the exam

The roster refreshes every 10 seconds and shows each student's state, time left, number answered, violations and when they last saved.

| What you see | What it means | What to do |
|---|---|---|
| **Paused** | The student passed the violation limit | Ask the student what happened. If it was accidental, press **Resume**, write the reason (kept on the record, at least 5 characters), add extra minutes only if they lost real time. They are told and their page continues by itself. |
| **Last saved** is many minutes ago for someone **In progress** | Their connection is down or the computer is asleep | Go to them. Answers already saved are safe. When the connection returns they continue. |
| Student sees "open in another window" | They opened the exam twice | Press **Use this window instead** on the one they want. |
| **Time ran out** | The deadline passed without Finish | Answers are saved and will be marked. If it was our fault (see below), use **Resume** with extra minutes. Limits: the owner can add up to 60 minutes and resume a student 3 times, an Admin up to 180 and 6. |
| Many students **Paused** at once | A shared cause (the network dropped everyone out of fullscreen, a projector, a room-wide event) | Do not resume one by one yet. Fix the cause, then resume them. |

Every 15 minutes look at: the roster counts, `/api/system-status`, and (on the server) `docker stats --no-stream`. Healthy on the test PC at a real exam rate (1000 students, one answer every 40 s): about 6% of one core and steady memory. A server that is much busier than that, or memory that keeps climbing, is the sign to call the person who looks after the server.

## If something goes wrong

| Problem | Do this |
|---|---|
| `/api/system-status` says **degraded** | The code judge is down. Multiple-choice work is unaffected. Students with coding questions: keep writing code and do not press Submit repeatedly. Restart the judge: `docker compose restart judge0_server judge0_worker`. Resume students whose time was lost afterwards (extra minutes). |
| `/api/system-status` says **down** or the site does not load | `docker compose ps` and `docker compose logs backend --tail 80`. If a service is not "Up": `docker compose up -d`. Students: wait, do not restart computers or clear browser data. Their answers on screen are kept. |
| Site broke right after an update | `bash deploy/update.sh rollback <previous commit>` (printed when you updated). Do not update again during the exam. |
| Everyone's page shows "Waiting for connection" | The network or the tunnel is down. Answers are safe on each computer. Check the tunnel/proxy, then wait; pages reconnect by themselves. Afterwards resume anyone who ran out of time because of it. |
| A student says they lost answers | Open the roster row: "Answered" counts what the server has. Have them reload the exam page (reloading is safe and keeps their answers). Never tell them to clear browser data. |
| A student cannot sign in | Ask two others to try. Everyone: the server. One student: their password (an Admin or faculty member can reset it). |

## After the exam

1. Open the exam **report**. This also marks anyone whose time ran out.
2. Write down: the time anything went wrong, how many students it touched, the error text on screen, and what you did. Keep it with the exam record.
3. Peak numbers to note: students at once, the slowest verdict you saw, anything in `docker compose logs backend` that repeated.

## What does not exist yet (do not rely on it)

- **Alerts to a phone** (Telegram or email) when the site goes down. Today a person has to look at `/api/system-status`; a free uptime monitor can watch it every 5 minutes (alert on anything but HTTP 200), and that should be set up before the first graded exam.
- **Randomised question order** per student and the **integrity report and email** for hard evidence.
- **A 3-hour soak and a real rehearsal on the college server** with about 100 students. The load numbers in `loadtest/README.md` come from a single PC with a simulated database.
- **Autoscaling and several API copies** (the Kubernetes plan). One API process on the test PC handled about 500 saves per second, about 20 times a real exam, but the college server has not been measured.
- **The load of the sign-in rush** when 1000 students log in within a minute.

## One-pager for invigilators

> **If something goes wrong during the exam**
>
> - A student is **Paused**: ask what happened, tell the exam owner. Only the owner, the HOD or an Admin can resume.
> - The screen says **"Waiting for connection"**: their answers are safe on their computer. Do not refresh again and again; wait a minute.
> - **"Open in another window"**: they have the exam open twice. Close the other one, then press the button.
> - **Never** tell a student to clear browser data or restart the computer unless the server person says so.
> - Note: the time, how many students, the exact words on the screen. Then call: ______________
