# Pre-deploy checklist

Run through this before every deploy. It exists because the last round of "it's not
working" reports were all things a five-minute check would have caught: a role
missing from a route, a config value pointing at a dead host, a model id Google had
retired.

Two commands do most of the work. **Neither writes anything you keep** — the smoke
suite creates its own fixtures and deletes them again.

```bash
cd backend
npm run preflight     # config + connectivity
npm start             # in another terminal
npm run test:smoke    # 135 checks against the running stack
```

Both exit non-zero on failure, so they can gate a deployment script.

---

## 1. Preflight — configuration and connectivity

`npm run preflight` checks the things that are invisible until they break:

| Check | Why it's here |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` set, long, **and different from each other** | Identical secrets mean a refresh token is accepted as an access token. |
| `FIREBASE_SERVICE_ACCOUNT` valid, Firestore reachable | Everything stores here. |
| `JUDGE0_URL` reachable **and actually executing code** | Reachable is not the same as working — see §4. A dead value takes down submissions, contests *and* AI test generation together. |
| AI provider responds to a real generation | A key can list models and still be unable to generate. |
| `NODE_ENV=production` on the deployed host | |
| `CORS_ORIGIN` not `*` | |
| `JUDGE0_URL` isn't `localhost` when `NODE_ENV=production` | A deployed backend cannot reach your laptop. |

Every failure prints what to do about it. For AI specifically, `npm run check:ai`
gives a deeper diagnosis.

---

## 2. Smoke suite — behaviour

`npm run test:smoke` runs 135 checks against the running backend and the real
database. Run a single suite with `npm run test:smoke -- roles`.

| Suite | Covers |
|---|---|
| `roles` | Every staff route accepts faculty **and admin and HOD**; students are refused; admin-only routes refuse faculty/HOD; unauthenticated requests are refused; the public catalogue stays public. |
| `authoring` | Problem create/edit round-trip (statement and test cases survive), draft lifecycle, publish preconditions, assignment validation and ordering. |
| `mcqImport` | MCQ save→reopen keeps question text and answers; metadata editing; publish gating; staged import never publishes on parse; commit skips unpublishable drafts. |
| `examTargeting` | **AI is locked during a graded exam**, including with no assignment id in the request; class targeting reaches only the targeted class; untargeted assignments still reach everyone. |
| `analyticsAi` | Analytics arithmetic (not just HTTP 200): heatmap totals match daily totals, quartiles ordered, histograms sum correctly, funnel stages nested, MCQ difficulty/discrimination in range, department scoping enforced. |

**Skipped ≠ passed.** If Judge0 or the AI provider is unavailable, the affected
checks report `SKIP` with the reason and the run ends with `PASSED WITH GAPS`. Those
paths are then **unverified** — treat them as untested, not working.

---

## 3. Manual pass

Automation can't judge whether a screen is usable. Sign in as each role and walk
these. Everything here has broken at least once.

### Faculty
- [ ] Dashboard loads; stats are not all zero
- [ ] **Problems → Author a problem** — type a title, watch "Draft saved" appear
- [ ] Statement step: Markdown preview renders (headings, code block, table)
- [ ] Test cases step: "Next" stays disabled until one complete case exists
- [ ] Publish → the problem appears in the student catalogue
- [ ] Reload the authoring page mid-edit — nothing is lost
- [ ] **Import** — upload a `.json` or `.csv`, confirm the review step lists drafts, publish, confirm only complete ones land
- [ ] **Assignments → New** — pick problems, reorder with the ▲▼ buttons, target a class, save
- [ ] **MCQ → Questions** — reopen a saved test; **every question still has its text and correct answer**
- [ ] **Question bank** — filters work; "Never used" surfaces unassigned material
- [ ] **Analytics** — charts render; click a cohort, then a problem, and drill back out
- [ ] Export a CSV and a question-paper PDF

### HOD
- [ ] Every faculty item above works (this is the role that was locked out)
- [ ] Classes/problems/tests from other departments are visible
- [ ] Editing another department's item is refused, and the UI shows it as read-only rather than failing on click
- [ ] Permissions and Audit Log are **absent** from the nav

### Student
- [ ] Register / sign in
- [ ] Join a class with a code
- [ ] Problem list shows published problems and **no drafts**
- [ ] Open a problem, submit code, **get a verdict** (needs Judge0 — see §4)
- [ ] Assignments list shows only assignments targeted at their class (or untargeted ones)
- [ ] Start a proctored exam → **the AI tutor refuses to help**
- [ ] Submit the exam → the tutor works again
- [ ] Take an MCQ test and see the score

### Admin
- [ ] Permissions page loads and a flag can be toggled
- [ ] Audit log shows recent actions

---

## 4. Known environment blockers

### Judge0 cannot execute code on Windows / Docker Desktop

Judge0's sandbox (`isolate`) needs **cgroup v1**; Docker Desktop provides only v2.
The symptom is HTTP 201 followed by status `Internal Error` on every submission,
with this in `docker logs judge0_worker`:

```
Failed to create control group /sys/fs/cgroup/memory/box-N/: No such file or directory
```

The Linux fix (`systemd.unified_cgroup_hierarchy=0` via GRUB, in
`DEPLOYMENT_GUIDE.md`) **has no working Docker Desktop equivalent** — the `.wslconfig`
analogue was tried and does not change what the containers see. There is no
cgroup-v2-capable Judge0 image to upgrade to (latest is `1.13.1`, April 2024).

**Consequence:** code execution, and therefore AI test-case generation, can only be
verified on a Linux host — the GCP VM or the college server. On a Windows laptop
those checks will `SKIP`, and student submissions will not run.

### `JUDGE0_URL` differs per environment

| Environment | Value |
|---|---|
| Local dev (Docker on your laptop) | `http://localhost:2358` |
| `docker compose` in this repo | `http://judge0_server:2358` |
| Deployed (Google Cloud VM) | `http://<VM_EXTERNAL_IP>:2358` |

A **stopped GCP VM loses its external IP** unless the address is reserved as static,
so re-check it whenever the VM is resumed.

### AI free-tier quota

The free Gemini tier is low enough that a day of testing exhausts it (it did during
this work — `429 RESOURCE_EXHAUSTED`). Enable billing on the Google project before a
full-cohort exam, or the tutor will start refusing students under load. Cost model:
`docs/scale-readiness/14-ai-features.md` §14.5 — roughly ₹300–3,000/month at this
scale.

### Model ids are configuration, not constants

Google retires models and blocks retired ids for newly-created keys. `GEMINI_MODEL`
defaults to the floating alias `gemini-flash-latest` for exactly this reason. If you
pin a specific version, `npm run check:ai` after every key change.

---

## 5. Go / no-go

Deploy only when:

- [ ] `npm run preflight` reports **no blocking problems** against the *target* environment
- [ ] `npm run test:smoke` reports **ALL CHECKS PASSED** (not "passed with gaps") against a host where Judge0 executes
- [ ] A student can submit code and receive a verdict on that host
- [ ] The manual pass in §3 is done for all four roles
- [ ] `NODE_ENV=production`, `CORS_ORIGIN` set to the real frontend origin
- [ ] A working AI key with billing enabled, if AI features are part of the release

If any check is skipped rather than passed, write down which one and why before
deciding to proceed.

---

## Note on seed data

There is deliberately **no demo-seed script**. This database already holds real
student records, and a seeder that writes a fake college into it is more likely to
create cleanup work than to help. The smoke suite creates every fixture it needs,
prefixed `smoketest-`/`SMOKE`, and deletes them in teardown — the run reports what it
removed so a leak is visible.
