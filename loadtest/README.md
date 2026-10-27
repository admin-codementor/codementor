# Load tests

k6 scenarios for the exam, and a runner that starts the exam sandbox (the real API with an in-memory database), runs a scenario against it and reports what the server process used. Plan: `docs/scale-readiness/19-load-testing.md`; targets: `docs/TNP_ADMIN_EXAMS_SECURITY_PLAN.md` (S2).

## Run it

Once: install k6 (`winget install GrafanaLabs.k6`).

```bash
node loadtest/run-local.cjs <scenario> --students 1000 --latency 30 [options]
```

| Scenario | What it does | What must hold |
|---|---|---|
| `burst` | 1000 students open the exam in the first minutes (dashboard, instructions, start, first read) | zero errors; start p95 under 2 s |
| `sustained` | everyone answers every `--think-min`..`--think-max` seconds, reloads and records violations now and then; at the end every accepted answer is read back | zero errors; **zero lost answers**; save p95 under 500 ms |
| `surge` | steady, then from `--surge-at` everyone answers `--surge-factor` times faster, then everyone presses Finish within `--submit-window` seconds | the same, plus every submit succeeds and reads back as submitted |
| `storm` | everyone reloads the exam at once (`--storm-at`): a new session is claimed and the old window must be refused | every old window refused; zero lost answers |
| `capacity` | everyone started; the save rate is stepped up (`--rates 50,100,200,...`, `--step-seconds`) | prints a table; capacity is the highest step with p95 under 500 ms, no errors, full rate |

Sandbox options: `--students` (default 200), `--questions` (40), `--latency` (ms added to every database call, standing in for Firestore; use 30), `--duration-min` (exam length, 60), `--port`. Everything else (`--start-window`, `--run-seconds`, `--think-min`, `--think-max`, `--reload-rate`, `--violation-rate`, ...) goes to k6.

A real exam is about **25 saves per second** (1000 students, one answer every 40 s) and about 125 at a 5x last-minutes rush. Think times of 2 to 6 seconds (as in the examples below) make a run 10 times harsher and 10 times shorter than a real exam.

Results go to `loadtest/results/` (not committed): the k6 summary, and a CSV of server CPU, memory and event-loop delay every 5 seconds.

## What a local run proves, and what it does not

**Proves:** the exam code under concurrency: sessions, ordered saves, takeover, submit, no lost answers, how many requests one API process serves, and whether memory grows.

**Does not prove (needs the college server or staging):**
- **Firestore.** The database is in memory with a pause per call. Real Firestore has transaction contention, quotas and billing. The first run on staging must watch the Firestore usage graph.
- **Judge0 / coding.** No coding scenario exists yet. It needs a real Judge0 and the college server (chapter 19, T1 and T3 with code runs).
- **The network.** Client and server are on one machine. Bandwidth, many different IP addresses, Wi-Fi drops and slow links are not modelled.
- **Real Redis.** The sandbox runs without Redis (rate limits use the in-process fallback).
- **Several API copies.** Capacity is for ONE process; the plan is several behind the ingress.
- **The login herd** (1000 sign-ins at once). Tokens are minted by the sandbox; sign-in is not exercised.

To point a scenario at another server: `k6 run -e BASE_URL=https://... -e TOKENS_FILE=tokens.json -e EXAM_ID=... loadtest/scenarios/exam-sustained.js` (tokens file: `[{"id": "...", "token": "<access token>"}]`, one per test student, on a **staging** project only. Never run these against production).

## Found by the first runs (2026-10-27)

- **Keep-alive resets.** With Node's default 5 s keep-alive, 15 of 30,000 saves failed with "connection forcibly closed" after idle pauses between answers (a proxy keeps idle connections longer than Node does). The server now holds idle connections for 65 s (`src/utils/serverTimeouts.js`). The same run after the change: 0 failures.
- **One API process on this machine (30 ms simulated database, 1000 students started):** 500 saves/s with p95 under 60 ms; 600/s p95 680 ms; errors from 800/s; CPU saturates one core. That is 20 times the 25/s of a real exam and 4 times a 5x rush, for one process.
- **Ten minutes at the real exam rate** (1000 students, one answer every 20 to 60 s, 14,181 saves): zero errors, zero lost answers, save p95 54 ms, memory +4 MB over the run, one process at 6% median CPU (20% peak). A 3-hour soak (`--run-seconds 10800 --duration-min 240`) is still to run before the first graded exam.
- Under overload memory grows quickly (about 1 GB at 1000/s): when the autoscaler is configured, scale on CPU or request rate before this point, and give each pod a memory limit with headroom.

See `docs/PROJECT_LOG.md` for the dated run table.
