# Errors and self-healing: what the platform does when something goes wrong

For the Admin and whoever looks after the server. The aim: **nothing the person did is lost without them being told, and nothing fails with a stack trace or a bare "failed".**

## What a person sees

- **One error shape** from the API: a plain sentence, what to do next, a code, and a short **reference** (like `4F2A9C1B`) that is also written next to the full technical error in the server log. Never a stack, file path or database message. (Built before S7: `backend/src/utils/apiError.js`.)
- **An error screen inside the menu**: if one page crashes, only that page is replaced (with *Try again* and *Home*); the menu and header stay, and what they already submitted is safe.
- **A "Report this problem" button** on every error that has a reference, and on a crashed page. It sends the reference, the page (path only), the error code and a few words from the person. The Admin reads them in **System health > Problem reports** and marks them seen or resolved. A person can send a few an hour.
- **An offline banner** ("You are offline. Your work on this page stays here until you are back.") and a "back online" notice.
- **Automatic retry** of page data: a failure on our side or on the network is tried again twice (after 1 s, then 2 s) before the person sees an error. A "too fast" answer waits and tries again; a real answer such as "not allowed" is never retried.
- **Plain words from the judge**: no server names or settings are shown to students ("The code checker is not available right now. Your code is safe in the editor.").

## The code judge

- **Circuit breaker** (`utils/circuitBreaker.js`). After 5 failed calls in 30 seconds the breaker opens for 20 seconds: new work is answered at once with "the code checker is busy, your code is still in the editor" (code `JUDGE_BUSY`), instead of hundreds of students each waiting 15 seconds. After 20 seconds one test call goes through; if it works the breaker closes. A bad request (4xx) never opens it. Change the numbers with `JUDGE_BREAKER_FAILURES`, `JUDGE_BREAKER_WINDOW_MS`, `JUDGE_BREAKER_OPEN_MS`.
- **A job already running waits for the judge** without using up one of its three attempts, so a short outage does not fail work that was already accepted.
- **The reaper** (`services/judgeReaper.js`, every minute). Judging advances only when the student's browser asks, so a closed tab used to leave the submission unfinished. A job nobody has touched for 90 seconds is pushed one step on the student's behalf and its result is recorded; a job still open after **15 minutes** is marked failed with a plain message and kept in the **dead-letter list**, which the Admin sees under System health.
- **One key, one submission.** The editor sends an `Idempotency-Key` with each press of Submit. The server remembers the first job for that person and key, and answers a repeat with the same job instead of starting another. (A second press within 10 seconds is also stopped earlier by the submission rate limit.) A submission that could not start releases its key, so the retry is a fresh attempt.

## Background upkeep and the daily self-check

Runs inside the API process (`services/maintenance.js`); switch it off on a second process with `MAINTENANCE=off`. **Several API servers can run at once**: every task takes a short lease first, so only one server runs it, and a task never runs more often than its interval.

| Task | How often | What it does |
|---|---|---|
| judge reaper | every minute | as above |
| self-check | daily | see below |
| housekeeping | daily | removes submit keys older than a day and finished judge jobs older than a week |

**The self-check** looks for things that should add up, **repairs two kinds by itself** (the owner's decision) and reports the rest. Every repair is logged with how many.

- *Repaired:* a student's mentor or position out of step with the class structure (re-derived from the class teacher and sub-mentor ranges, as on every change); placement applications whose drive no longer exists.
- *Only reported:* submissions the reaper gave up on in the last day; the judge connection being open.

The Admin sees the last result under **System health**, can run it now, and each run is written to the audit log.

## For the server

- Routes: `GET /api/admin/health`, `POST /api/admin/health/self-check`, `GET /api/admin/problem-reports`, `POST /api/admin/problem-reports/:id/status` (Admin only), and `POST /api/problem-reports` (any signed-in person, 6 an hour).
- New collections: `leases`, `judgeDeadLetters`, `submitKeys`, `problemReports`, and the `selfCheck` document under `collegeSettings`. Judge jobs now carry `createdAtMs` and `touchedAtMs`.
- Rules are pure and tested: `utils/circuitBreaker.js` (18 checks), `utils/maintenanceRules.js` (18 checks); `tests/pure/resilienceFlow.js` (37 checks) runs the breaker, the reaper, the lease, the self-check and the report routes.
- Try the Admin screens with no real data: `node scripts/admin-sandbox.js` (it now includes health and reports).

## Not built

- Retrying a **save** automatically after a network drop (exam answers already use ordered saves and a resume path; other forms show the error and keep what was typed).
- A server restart or alert when a health check fails (use an uptime monitor on `/api/system-status`, see `docs/EXAM_DAY_PLAYBOOK.md`).
- Repairing exam attempts or marks automatically: they are reported only, because a wrong repair there changes a student's result.
- Circuit breakers around AI providers and outside coding platforms.
