# Faculty Authoring, AI Features & Analytics — Update Plan

> Scope: the HOD's asks (AI chatbot, AI/import-based problem authoring, working class & MCQ
> flows, real analytics) plus the UX repair of the authoring flows.
> Status: **plan — awaiting decisions in §5.** Nothing implemented yet.
> Prerequisite reading: [`docs/scale-readiness/14-ai-features.md`](../scale-readiness/14-ai-features.md)
> (design for A1/A2 already settled there), [`docs/DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md).

---

## 0. Status

**P1 (WS-0 unblock) — implemented and verified, 2026-08-12.** All twelve findings in §1 fixed;
see §6.

**P2 — implemented, verification partly blocked by the environment. See §7.** The AI gateway is
done and verified; the verified-test-case pipeline and the staged import pipeline are code-complete
with their deterministic logic verified, but two steps can only be verified on a Linux host / with
non-exhausted AI quota.

**P3 — complete and verified. See §8.** Problems have a draft/published lifecycle; all three
authoring flows (problem, assignment, MCQ) run on one shared shell with autosave and reordering;
assignments can be targeted at classes; and the question bank ships.

**P4 — analytics rebuilt and verified. See §9.** One cached snapshot behind four levels of
drill-down, and the two bar charts are replaced by distributions, a day×hour heatmap, scatter,
funnel, radar, per-test-case hotspots and MCQ item analysis. P5–P6 not started.

> ### ✅ AI blocker — found during verification, now resolved
> **Symptom:** every AI feature returned 500. The old `GEMINI_API_KEY` could *list* models
> (HTTP 200, 50 of them) but every `generateContent` returned 403 `PERMISSION_DENIED — "Your
> project has been denied access"`.
>
> **Two distinct causes, and the second is the one worth remembering:**
> 1. That key's Google project was blocked. A replacement key cleared it.
> 2. With the new key, generation *still* failed — 404 **`"models/gemini-2.5-flash is no longer
>    available to new users"`**. The model id was hardcoded in **four** places. Google retires
>    models and blocks retired ids for newly-created keys, so a valid key plus a pinned model id
>    still equals a dead feature.
>
> **Fix:** the model is now configuration — `GEMINI_MODEL`, defaulting to the floating alias
> **`gemini-flash-latest`**, which tracks Google's current flash model and can't be retired out
> from under us.
>
> Verified working on this key, for text **and** JSON mode: `gemini-flash-latest`,
> `gemini-3.6-flash`, `gemini-3.1-flash-lite`, `gemini-flash-lite-latest`. Two to avoid:
> `gemini-3.5-flash` generates text but returned unparseable JSON, and `gemini-2.5-flash-lite`
> 404s — neither is usable here, since `reviewCode` and the test-case generator both need JSON
> mode.
>
> All five AI endpoints then verified live: **16/16 passed** — tutor (incl. the Socratic
> "ends with a question" constraint), history persistence, explain-error, code review with
> structured output, and the faculty test-case generator.
>
> **To test a key** before wiring it in, from `backend/`:
> ```bash
> node src/scripts/checkAiKey.js
> ```
> It checks list-models *and* `generateContent` — those two disagreeing is exactly how this hid —
> and explains each failure mode. Try a candidate without touching `.env`:
> `GEMINI_API_KEY=AIza... node src/scripts/checkAiKey.js`
>
> **Still open:** free-tier rate limits are low. Enable billing on the Google project before a
> full-cohort exam or the tutor will start returning 429s under load (cost model:
> `14-ai-features.md` §14.5 — roughly ₹300–3,000/month at this scale).

> ### 🔴 Judge0 cannot execute code on a Windows/Docker-Desktop dev machine
> Found while verifying P2. Two separate problems:
>
> **1. `JUDGE0_URL` pointed at a dead host.** It was the external address of the Google
> Cloud test VM, currently paused. Local `.env` now uses `http://localhost:2358`; the real host
> lives only in the deployed `.env` — it is deliberately not written down in this repository, which
> is public, because Judge0 executes untrusted code. Note that **a stopped GCP VM loses its
> external IP** unless it is reserved as static, so re-check the address when the VM is resumed. A
> dead `JUDGE0_URL` takes down submissions, contests and AI test generation together.
>
> **2. Judge0's sandbox needs cgroup v1; Docker Desktop only offers v2.** Symptom is HTTP 201
> followed by status `Internal Error`, with this in `docker logs judge0_worker`:
> ```
> Failed to create control group /sys/fs/cgroup/memory/box-N/: No such file or directory
> chown: cannot access '/box': No such file or directory
> ```
> The Linux fix in `DEPLOYMENT_GUIDE.md` (`systemd.unified_cgroup_hierarchy=0` via GRUB) **has no
> working Docker Desktop equivalent** — I tried the WSL2 analogue (`~/.wslconfig`
> `kernelCommandLine`). The flag does reach the kernel, but Docker Desktop's own distro still
> mounts cgroup v2 and the containers see v2 only, so it changes nothing. That config has been
> reverted. The newest published image is `judge0/judge0:1.13.1` (April 2024), which bundles
> isolate 1.x — there is no cgroup-v2-capable Judge0 image to upgrade to.
>
> **Consequence:** code execution can only be verified on a Linux host — the GCP VM (where the
> GRUB fix applies) or the college server. On a Windows laptop, Judge0 will accept submissions and
> return `Internal Error` for every one of them. Worth stating plainly in the run-local docs,
> because it looks like a code bug and isn't.

---

## 1. What I verified in the code first

I read the actual routes, controllers, repositories and pages before planning. The three
"not working" reports are **real and mostly one root cause**, not UX perception.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| **B1** | 🔴 Blocker | Role `hod` is rejected by **every route outside `/api/faculty/*`**. Classes, MCQ, ZIP import, PDF export, contests, proctor and judge-health all use `authorize('faculty','admin')`. But the faculty shell shows all those pages to HOD. So an HOD clicking "Create class" or "New Test" gets a silent 403. | `routes/classroom.routes.js:11-12`, `routes/mcq.routes.js:15`, `routes/problemImport.routes.js:41`, `routes/pdfExport.routes.js:9-11`, `routes/contest.routes.js:19-23`, `routes/proctor.routes.js:10`, `routes/judgeHealth.routes.js:9` vs `faculty/layout.tsx:9-18,33` |
| **B2** | 🔴 Blocker | Faculty pages swallow API errors (`.catch(() => {})`). A 403 or 500 renders as "the button does nothing" — which is exactly how B1 was reported. | `faculty/classes/page.tsx:132,155-157`; `faculty/mcq/page.tsx:137,202-204`; `faculty/analytics/page.tsx:56,71` |
| **B3** | 🔴 Blocker | **MCQ tests can't be edited.** `getTestFaculty` returns Firestore camelCase (`questionText`, `correctIndex`); the builder reads `question_text` / `correct_index`. Reopening a saved test shows every question blank, and saving then fails its own validation. | `controllers/mcq.controller.js:99-110` + `repositories/mcqRepository.js` (`getQuestions`) vs `faculty/mcq/page.tsx:159-166` |
| **B4** | 🔴 Blocker | **Editing a problem destroys it.** The dialog only receives `{id,title,difficulty,tags}` from the list row and resets description, test cases, stubs, editorial and checker to blank; the faculty must retype the statement. And `updateProblem` **ignores `test_cases` entirely** — there is no way to change test cases after creation, and no `GET /api/faculty/problems/:id` to hydrate the form. | `faculty/problems/page.tsx:115-130,162-176`; `controllers/faculty.controller.js:240-272` |
| **B5** | 🔴 Blocker | **Assignments are always created empty.** The dialog hard-codes `problem_ids: []`, there is no problem picker, and there is no update route. Every assignment a student opens has zero problems. | `faculty/dashboard/page.tsx:137-143`; `routes/faculty.routes.js:70-75` |
| **B6** | 🟠 High | Ownership checks are `createdBy !== req.user.id` with no admin/HOD bypass, and `getProblems` lists only your own problems. An HOD cannot review, fix or reuse a colleague's problem. | `controllers/faculty.controller.js:248,278,474,555` |
| **B7** | 🟠 High | The AI test-case generator asks the model to **invent expected outputs**. A hallucinated output marks all 800 students wrong in the same way. Ch.14 §14.4 explicitly forbids this; the correct pipeline (reference solution → Judge0) already exists next door in `generateRandomTests`. | `controllers/faculty.controller.js:292-345` vs `generateRandomTests` at `:457-510` and `14-ai-features.md:117-133` |
| **B8** | 🟠 High | The AI tutor is **not disabled during exams** (finding F26, still open). A student in a graded assessment can ask for help. | `routes/ai.routes.js` — no exam-context check on any of the 4 endpoints |
| **B9** | 🟡 Medium | `services/aiGateway.js` from PR-1 Phase 0 **no longer exists** in this codebase; `ai.controller.js` calls `@google/genai` directly. The locked "model-agnostic now, vLLM on the H100 later" decision is currently unimplemented. | `backend/src/services/` contains only `judgeService.js`; `ai.controller.js:1-10` |
| **B10** | 🟡 Medium | Analytics is two bar charts (cohort average → student average). No distribution, trend, topic, funnel or per-question view — the complaint is accurate. | `faculty/analytics/page.tsx` (whole file) |
| **B11** | 🟡 Medium | Every analytics endpoint reads the **entire `submissions` collection** per request (`listAll()`). The repo header already flags this. Deeper analytics multiplies the cost — it needs pre-aggregation, not more `listAll` calls. | `repositories/submissionRepository.js:1-11`; `faculty.controller.js:836,897` |
| **B12** | ⚪ Low | `listAvailable` sorts on `createdAt` after mapping it away — the sort is a no-op. | `controllers/mcq.controller.js:211` |

**Root cause summary:** B1 + B2 together explain all three "not working" reports. The flows
are built; the HOD's role is locked out and the UI hides the error.

---

## 2. Workstreams

### WS-0 — Unblock (must ship before anything else) · ~2–3 days

| Task | Change |
|---|---|
| 0.1 | Introduce one `facultyStaff = authorize('faculty','admin','hod')` helper and apply it to classroom, mcq, problemImport, pdfExport, contest, proctor, judgeHealth routes. Scope of HOD write access → **decision D1 (§5)**. |
| 0.2 | Kill every `.catch(() => {})` in faculty pages; route failures through the existing `ToastProvider`. Add a small `useApi` helper so this can't regress. |
| 0.3 | Fix B3: map questions to snake_case in `getTestFaculty` (`question_text`, `correct_index`, `options`, `marks`, `topic`, `explanation`). |
| 0.4 | Fix B4 part 1: add `GET /api/faculty/problems/:id` returning the full problem + test cases; hydrate the edit dialog from it. |
| 0.5 | Fix B4 part 2: accept `test_cases` in `updateProblem` and persist via the existing `problemRepo.replaceTestCases`. |
| 0.6 | Fix B5 part 1: real problem picker in the assignment dialog + `PUT /api/faculty/assignments/:id`. |
| 0.7 | Fix B6: allow `admin`/`hod` to bypass `createdBy` checks (department-scoped for HOD, matching `scopeDept`). |
| 0.8 | Fix B8: exam-context guard on all four `/api/ai/*` endpoints (403 when the active assignment `isExam`). |
| 0.9 | Fix B12 and add the missing MCQ list sort. |

**Ship this as its own deploy.** It is small, it is all bug-fix, and it makes the demo work.

### WS-1 — Import + AI problem authoring (the HOD's ask) · ~5–6 days

**1a. Import pipeline (no AI dependency).** A single "Import" wizard that never writes
straight to the live catalogue:

```
upload → parse → staged drafts (problemDrafts) → faculty review/edit table → approve → publish
```

- Formats: **JSON** (existing shape, now validated), **DOCX** (`mammoth`), **PDF**
  (`pdf-parse`), **CSV/XLSX** (`xlsx`), plus the existing **ZIP** package importer.
- Unstructured input (DOCX/PDF/paste) goes through an AI **extraction** step: split into
  discrete questions, pull out title / statement / constraints / sample I-O. Extraction is a
  parsing job, not authoring — the model never invents content here.
- New endpoints: `POST /api/problem-import/parse` (returns drafts, writes nothing live),
  `GET/PATCH /api/problem-import/drafts/:id`, `POST /api/problem-import/commit`.
- New Firestore collection `problemDrafts` with `status: draft | needs_tests | verified | published`.

**1b. Verified AI test-case generation** (replaces B7):

```
1. faculty gives topic/difficulty/constraints (or an imported statement)
2. model returns: statement, samples, REFERENCE SOLUTION, and INPUTS ONLY
3. Judge0 runs the reference solution on each input  ← the whole trick
4. Judge0's real stdout becomes the expected output
5. reference must reproduce the statement's own samples, or the draft is rejected
6. faculty reviews the pass matrix and publishes
```

`utils/judge0Run.js` and the loop in `generateRandomTests` already do steps 3–4 — this
reuses them. Inputs that TLE, crash or produce empty output are dropped and reported rather
than silently saved. Old `generateAITestCases` is retired.

**1c. MCQ import + generation.** Same staging model: bulk paste / CSV / DOCX → drafts →
review → publish. AI assists with distractors and explanations; correct answers always come
from the source document or the faculty, never the model alone.

**1d. Syllabus grounding (the "RAG" ask).** Staged deliberately:
- **Now:** upload the syllabus, chunk by unit/topic, store it, and pass the *relevant chunk*
  as generation context. A college syllabus is a few dozen pages — chunk-and-select beats a
  vector database at this size, with no new infrastructure.
- **Later (only if the corpus grows to books/notes/past papers):** embeddings + vector search.
  Flagged as **decision D3 (§5)** so we don't build a vector store we don't need.

**1e. Restore the AI gateway (B9).** Re-add `services/aiGateway.js` with
`AI_PROVIDER=gemini|openai-compatible`, and route all AI calls through it. Everything in this
workstream is written against the gateway, so the H100/vLLM switch is a config change later.

### WS-2 — Authoring UX rebuild · ~5 days

The current flows are a 500-line dialog (problems), a 3-field dialog (assignments) and an
all-or-nothing question list (MCQ). Replace all three with **one authoring shell**, reused:

```
Step 1 Details → Step 2 Content → Step 3 Verify → Step 4 Publish
        (autosaves to a draft at every step; nothing is lost on reload)
```

| Surface | What changes |
|---|---|
| **Problem authoring** | Full page, not a dialog. Statement (markdown + live preview) → test cases (manual / import / AI-verified, with a table view instead of stacked textareas) → **Verify** (runs the reference solution against every test and shows a pass matrix) → Publish. Draft/published state, so a half-finished problem is never visible to students. |
| **Assignment builder** | Details → **pick problems** from a searchable question bank with drag-to-reorder (`framer-motion` `Reorder` — already a dependency, no new package) → assign to class(es) → schedule + proctoring → review summary. Fixes B5 properly. |
| **MCQ builder** | Same shell. Per-question autosave, drag-to-reorder, import/AI entry points, student preview before publish. |
| **Question bank** | One place listing problems + MCQ items with topic/difficulty/tag filters and usage counts, so content is reused instead of retyped. |

Cross-cutting: consistent empty/loading/error states, a visible draft→published lifecycle,
and confirmation on anything destructive (`ConfirmProvider` already exists).

### WS-3 — Faculty analytics that reads like a SaaS product · ~5–6 days

**Structure — four levels, each answering a different question:**

| Level | Audience | Answers |
|---|---|---|
| L0 Institution / Department | HOD | Are we improving? Which department/year/section is behind? |
| L1 Class / Cohort | Faculty | Who is struggling, on what, and since when? |
| L2 Object | Faculty | Is *this problem/test/assignment* any good? |
| L3 Student | Faculty | What exactly does this student not understand? |

**Chart set — deliberately not all bars.** Everything below is computable from data already
stored (`verdict`, `runtime`, `memory`, `score`, `testResults[]`, `language`, `assignmentId`,
`submittedAt`, `topicMastery`, `ratingHistory`, MCQ attempts, plagiarism results):

| Visual | Reads | Answers |
|---|---|---|
| KPI row with sparkline + Δ vs previous period | trend | "better or worse than last week?" |
| Activity heatmap (day × hour, and calendar) | rhythm | when students actually work; dead weeks |
| **Score/attempt distribution histogram + box plot per cohort** | spread | the direct fix for "only averages" — shows the bimodal class the mean hides |
| Scatter: attempts vs AC-rate, one dot per student, quadrant-labelled | segmentation | struggling / careless / strong / inactive |
| Funnel: opened → attempted → submitted → accepted | drop-off | where an assignment loses people |
| Topic radar + bump chart (cohort and student) | mastery | which topics regressed |
| Time-to-first-AC and attempts-to-solve distributions | difficulty | is the problem hard or badly worded? |
| **Per-test-case failure heatmap** (endpoint already exists: `getProblemTestHeatmap`) | hotspots | the exact edge case the class misses |
| **MCQ item analysis: difficulty index vs discrimination index** | question quality | flags questions that don't separate strong from weak students |
| Student timeline + rating line + strengths/weaknesses + risk reasons | narrative | one screen per student, not one bar |
| At-risk board with reason chips (`getAtRiskStudents` exists) | triage | who to talk to on Monday |

Every level supports date-range, cohort and difficulty filters, cross-filtering by click, and
CSV / PDF export (`pdfExport` routes already exist).

**Engineering reality (B11):** these views cannot be served by more `listAll()` calls. Add a
rollup layer — `analyticsRollups` documents (per-student-per-day, per-cohort-per-day,
per-problem) written incrementally on submission finalize plus a periodic backfill — and serve
dashboards from rollups with the existing `cached()` helper. Live queries stay only for small
scopes (one student, one problem). This is a prerequisite for WS-3, not an optimisation.

**New chart dependencies** → **decision D4 (§5)** (`@nivo/heatmap`, `@nivo/scatterplot`,
`@nivo/radar`, `@nivo/calendar`, `@nivo/boxplot` — same family as the three nivo packages
already installed, or fall back to `@mui/x-charts` which is also already present).

### WS-4 — AI chatbot · ~3 days

- **Socratic hardening:** the system instruction from Ch.14 §14.3, escalating hint levels 1–4,
  hint usage recorded on the submission so faculty can see "solved with 4 hints".
- **Exam lockout** (already listed as 0.8 — it lands in WS-0 because it is a safety fix).
- **Real chat, not a stub:** persistent multi-thread conversations (today history is keyed by
  `problemId` with a literal `"general"` sentinel — `ai-tutor/page.tsx:207`), markdown +
  streaming, per-user daily quota and token/cost logging through the gateway.
- **Context attach:** current problem, current editor buffer, last verdict — so "why did test 3
  fail" works without copy-paste.
- **Faculty-side assistant** → **decision D2 (§5)**. My recommendation: it answers over
  *pre-computed aggregates only* ("summarise this cohort's weak topics", "draft feedback for
  the bottom quartile") and never sees raw student code or names, which keeps student code off
  the provider and the answers grounded in numbers we already trust.

### WS-5 — Pre-deploy verification · ~2 days

Your explicit requirement. Concretely:

1. A written **smoke matrix** in `docs/` — every role (student / faculty / HOD / admin) × every
   flow (register, login, join class, create class, create problem, import, AI test-gen,
   assignment, MCQ, submit, plagiarism, analytics, exports) with expected result. This is the
   artefact that would have caught B1 on day one.
2. A **seed script** producing a demo college: 2 departments, 4 sections, ~40 students,
   problems, assignments, MCQ tests and submission history — so analytics has something to draw.
3. **Integration tests** for the flows WS-0 fixes, including a role-authorization matrix test
   that fails if a route forgets `hod`.
4. Manual pass against real Firestore + Judge0 using the browser preview, before deploy.

---

## 3. Sequencing

| Phase | Contents | Effort | Deployable? |
|---|---|---|---|
| **P1** | WS-0 (unblock) + WS-5.1 smoke matrix | 2–3 d | ✅ yes — ship immediately |
| **P2** | WS-1e gateway, WS-1a import, WS-1b verified AI tests | 5–6 d | ✅ yes |
| **P3** | WS-2 authoring UX + question bank | 5 d | ✅ yes |
| **P4** | WS-3 rollups + analytics | 5–6 d | ✅ yes |
| **P5** | WS-4 chatbot + WS-1c/1d MCQ & syllabus generation | 4 d | ✅ yes |
| **P6** | WS-5 seed, tests, full verification pass | 2 d | — |

**Total ≈ 23–26 working days.** Each phase ends deployable; nothing forces a big-bang release.

If the HOD demo is close, the highest-visibility subset is **P1 + WS-1b (verified AI test
generation) + the distribution/heatmap charts from WS-3** — that is roughly 6–7 days and it
demonstrates all three complaints fixed.

---

## 4. Explicitly out of scope

- Self-hosted LLM (decision D12 — Gemini stays until the H100 is actually offered; the gateway
  in WS-1e makes the switch a config change).
- Multi-college tenancy (deferred by the PR-1 locked decisions).
- Vector database / embeddings (WS-1d starts without one — see D3).
- Live proctoring or exam lifecycle rework (that is the separate PR-1 Phase 1 track).

---

## 5. Locked decisions (agreed 2026-08-12)

| # | Decision | Resolution |
|---|---|---|
| **D1** | HOD capability | **Faculty-level writes within own department + cross-department read** for oversight. WS-0.1 applies `authorize('faculty','admin','hod')` everywhere, and WS-0.7 makes ownership bypass department-scoped via the existing `scopeDept`. No new permission model. |
| **D2** | Faculty AI assistant | **Aggregates only.** It answers over pre-computed rollups and drafts feedback text. No raw student code and no student names reach the provider. Depends on WS-3 rollups, so it lands in P5. |
| **D3** | Syllabus grounding | **Chunk-and-select, no vector store.** Upload → chunk by unit/topic → pass the relevant chunk as generation context. Revisit embeddings only if the corpus grows past a syllabus (books, notes, past papers). |
| **D4** | Chart packages | **Add `@nivo/heatmap`, `@nivo/scatterplot`, `@nivo/radar`, `@nivo/calendar`, `@nivo/boxplot`** — same family as the three nivo packages already installed, imported per-chart. |

---

## 6. P1 — what shipped and how it was verified

### Changes

| Area | Change |
|---|---|
| `role.middleware.js` | New `facultyStaff` guard (faculty + admin + hod), `canManageResource`, and async `canManageOwnedBy` (resolves the owner's department only when it can change the answer). |
| 8 route files | classroom, mcq, problemImport, pdfExport, contest, proctor, judgeHealth, rating now use `facultyStaff`. Only permission-management and audit-log stay `authorize('admin')`. |
| 6 controllers | Every bare `createdBy/facultyId !== req.user.id` check replaced with the D1 rule (faculty, classroom, contest, proctor, plagiarism ×3, mcq). |
| `classroom.controller.js` | `listClassrooms` no longer drops `hod` into the *student* branch (an HOD's class list was always empty); admin/HOD see all classes. |
| `mcq.controller.js` | `getTestFaculty` maps to snake_case; read/write access split (`readableTest` vs `writableTest`) so cross-department oversight reads work while writes stay scoped; `can_edit` + `author` exposed; dead `listAvailable` sort fixed. |
| `faculty.controller.js` | New `GET /problems/:id` (full detail + test cases) and `GET /assignments/:id`; `updateProblem` now persists `test_cases`; new `PUT /assignments/:id`; shared assignment validation rejects empty/unknown problem lists and bad deadlines; `getProblems` returns `author` + `canEdit`; HOD dashboard shows all assignments. |
| `problemRepository.js` | `getTestCases` orders by `_order` (batch writes share one `serverTimestamp`, so ordering by `createdAt` shuffled test cases on every save); `addTestCases` continues the sequence. |
| `examLock.js` (new) | Exam lockout on all four `/api/ai/*` routes — explicit (named assignment) **and** implicit (`exam_start` with no later `auto_submit`), fail-closed. |
| `apiError.ts` (new) + 7 pages | Every `.catch(() => {})` in the faculty pages replaced with a real message via toast/Alert. |
| Assignment dialog | Rebuilt with a searchable problem picker, order-preserving selection chips, and edit support. |
| Problem dialog | Hydrates from the new detail endpoint instead of blanking the form. |
| Faculty nav | Permissions moved to admin-only (it calls `authorize('admin')`, so it 403'd for faculty and HOD). |

### Verification

Run against the real backend + Firestore. Every fixture created was deleted afterwards
(confirmed by re-querying).

| Check | Result |
|---|---|
| `tsc --noEmit`, `next build` | Clean; all routes compiled |
| Role × route matrix (8 routes × 4 roles) | faculty/admin/**hod** pass the gate everywhere; student correctly blocked |
| Functional round-trips | **34/34 passed** — MCQ save→reopen keeps text/answers/options/order; problem detail returns statement + tests; `test_cases` now actually replace; empty/unknown-problem/bad-deadline assignments rejected; assignment update persists |
| Exam lockout | **11/11 passed** — blocked with *no* assignment id in the body (the bypass that matters), history and code-review locked too, other students and faculty unaffected, unlocks after `auto_submit` |
| Browser (session injected as HOD, then as a problem author) | HOD created a class (was silently 403); saw classes/problems/tests across all departments (previously empty); existing MCQ questions render populated; problem edit dialog hydrates statement + all 3 test cases; empty-assignment submit refused with a clear message; selection order preserved; zero console errors |

### Known gaps left open deliberately

- **173 pre-existing `react-hooks/set-state-in-effect` lint errors** repo-wide (the
  `setLoading(true)` -inside-`useEffect` pattern). Present before this work — I verified the
  untouched original of one file reports the same errors. Fixing it is a codebase-wide refactor,
  not P1.
- **Assignments still have no DELETE route** (noticed while cleaning up test fixtures).
- `submissionRepo.listAll()` on every analytics request — the WS-3 rollup work addresses it.

---

## 7. P2 — what shipped and how it was verified

### WS-1e — AI gateway ✅ done and verified

`backend/src/services/aiGateway.js` is now the only door to a model.
`AI_PROVIDER=gemini | openai-compatible` (the latter covers vLLM, Ollama and llama.cpp, all of
which expose `/v1/chat/completions`), so the H100 switch becomes config rather than a rewrite.

It also concentrates the things that already bit us: the model id lives in one place, `generateJson`
parses and re-rolls on malformed output (so a stray code fence can't 500 a student), and transient
provider failures (429/503) are retried with backoff instead of surfacing as feature outages.

**Verified:** all four AI endpoints still pass through the gateway — 12/12 checks (tutor, history,
explain-error, code review with structured output).

### WS-1b — Judge0-verified test-case generation ⚠️ code complete, execution unverified

`backend/src/services/testCaseGenerator.js` replaces the old generator that asked the model for
`{input, output}` pairs. The pipeline is Ch.14 §14.4:

1. model returns a **reference solution + inputs only**
2. the reference is run against **the samples in the statement** — if it can't reproduce them, the
   whole batch is refused (`422 REFERENCE_UNRELIABLE`) rather than trusted
3. Judge0 executes the reference on each input; **its real stdout becomes the expected output**
4. inputs the reference can't run are dropped and reported, never guessed

**Verified (27/27)** with an injected executor covering the decision logic: the sample gate, dedupe,
per-input rejection reasons, `JUDGE0_UNREACHABLE`, `NO_CASES`, judge-like output comparison
(trailing-whitespace tolerant), and — the important one — that a model-supplied `testCases` field
is **ignored** in favour of the executed value.

**Not verified:** real sandboxed execution, because Judge0 cannot run on this Windows machine (see
the cgroup finding above). Live proof requires the GCP VM or the college server. What *was*
observed live is the gate working correctly: with a broken sandbox the endpoint returned
`422 REFERENCE_UNRELIABLE` and named the reason, instead of storing invented outputs.

### WS-1a — staged import pipeline ✅ mostly verified

Parse → review → publish, where **parse never touches the live catalogue**.
New: `problemDrafts` collection, `services/problemImporter.js`, five endpoints
(`POST /parse`, `GET /drafts`, `PATCH /drafts/:id`, `DELETE /drafts/:id`, `POST /commit`), and the
`ImportWizard` UI on the Problems page.

Formats: **JSON, CSV, DOCX, pasted text** (plus the pre-existing ZIP importer). PDF was left out
rather than adding another parser dependency for a format nobody asked for.

> **Dependency note:** `xlsx` (SheetJS) was installed for XLSX support and then **removed** — the
> npm-published version carries prototype-pollution and ReDoS advisories with **no fix available**,
> which is a bad trade for a convenience format in an app that ingests faculty uploads. CSV is
> parsed by a small hand-written RFC-4180 tokeniser instead (quoted commas, embedded newlines,
> `""` escapes, Excel BOM — all covered by tests). Only `mammoth` was added.

**Verified (31/31 live + 24/24 deterministic):** JSON and CSV import end to end; the live catalogue
provably unchanged by parsing (0 → 0); readiness/warning computation; editing a draft clearing its
warnings; commit publishing only publishable drafts and **skipping** ones with no test cases;
re-commit refused as already published; cross-faculty draft access refused (404); mammoth text
extraction from a real `.docx`; corrupt-docx handling; field-length caps; CSV tokeniser edge cases.

**Not verified:** the AI *splitting* step for DOCX/pasted prose. The free-tier Gemini quota was
exhausted by this session's verification (429 `RESOURCE_EXHAUSTED` after backoff) — which is itself
concrete evidence for the billing point: if a day of testing exhausts it, 800 students will.

**Browser-verified** (faculty session, JSON path — no AI quota needed): the wizard reaches step 2
with "2 found · 1 ready · 1 selected"; the draft with no test cases shows **Needs work** with its
checkbox **disabled**; repairing it in place (add test case → fill input/expected) flips it to
**ready**, enables its checkbox and clears the warning banner; Publish then created both problems,
and re-reading them from the API showed complete statements and test cases. Zero console errors.
All probe data deleted afterwards.

While doing that I hardened one thing in the wizard: row fields derived their new value from the
`draft` captured in the current render, so two edits landing in the same batch would each compute
from the same copy and the second would discard the first. Edits now compose against a ref, and the
save is debounced per draft (it was one PATCH per keystroke). Verified by filling Input and Expected
in a single tick — both values survive.

### Remaining before P2 can be called done

| # | Item |
|---|---|
| 1 | Run the DOCX/pasted-text import once quota allows (`scratchpad/docxTest.js` asserts the document's own examples are preserved, not invented). |
| 2 | Run the generation pipeline against a Linux Judge0 to prove step 3 executes (`scratchpad/genTestsTest.js` cross-checks every output against an independent oracle solution). |

---

## 8. P3 — problem authoring

### Draft / published lifecycle

Problems now carry `status: 'draft' | 'published'`. **A missing status means published**, so all 77
problems that predate the lifecycle stayed visible — that was the first thing the tests asserted.

- `/api/problems` (public, unauthenticated), `/api/problems/:id` and `/:id/adjacent` all exclude
  drafts, so a draft is indistinguishable from a non-existent problem to a student, including to
  someone guessing an id.
- `PATCH /api/faculty/problems/:id/status` publishes or unpublishes. **Publishing** is gated on the
  problem being gradeable (title + statement + ≥1 complete test case, else `422 INCOMPLETE`);
  **unpublishing is never blocked** — pulling a broken problem must always work — but it returns a
  warning naming any assignment that just lost access to it.
- Assignments reject draft problems, since a draft 404s for students and would hand out an
  assignment nobody can open.
- Creation defaults to `published`, so the quick-add dialog, ZIP import and import-commit are
  unchanged. Only the authoring flow asks for a draft.

**Verified: 27/27** — including the regression guard (77 → 77 public problems after adding a draft,
77 → 78 after publishing it), draft detail 404, exclusion from prev/next navigation, publish
preconditions, the unpublish warning, and cross-faculty status changes refused.

### The authoring flow

`components/faculty/AuthoringShell.tsx` is a reusable stepper frame (clickable steps, save-state
indicator, blocked-step tooltips) intended for the assignment and MCQ builders too.
`/faculty/problems/[id]/edit` is the first flow on it: **Details → Statement → Test cases →
Review & publish**.

- Autosave debounced at 800ms, plus a flush on unmount and a `beforeunload` guard, so navigating or
  closing the tab can't lose the last edit. Edits compose against a ref rather than the render's
  copy, for the same reason as in the import wizard.
- Statement is Markdown with a live student preview (`react-markdown` + `remark-gfm`, both already
  dependencies).
- Test cases are a table rather than stacked textareas; incomplete rows are highlighted and excluded
  from the save. AI generation reports what was verified and what was dropped.
- Forward navigation is blocked per step with the reason in a tooltip, and Publish is disabled until
  the review checklist passes.
- "Author a problem" creates the draft immediately so autosave has a target from the first keystroke;
  the old dialog stays as "Quick add", and Edit now opens the full flow.

**Browser-verified**: autosave showed "Draft saved" and the title propagated to the heading; the
Markdown preview rendered headings, bold, a GFM table and a code block; "Next" was disabled on the
Test cases step until a complete case existed; the review checklist filled in; **Publish flipped the
public catalogue from 404 to 200 for that problem**; the chip became "Published" and the action
became "Unpublish"; a full page reload preserved title, tags, statement, difficulty and test case;
the list gained a Status column showing Live/Draft. No console errors. All probe data deleted
(public catalogue back to 77).

### Assignment builder — `/faculty/assignments/[id]/edit`

Four steps on the shared shell: **Details → Problems → Who gets it → Review**. `new/edit` builds
locally and POSTs on save, because an assignment needs at least one problem to exist at all —
pre-creating an empty shell would litter the list with unusable rows.

**Class targeting is new backend capability.** Assignments gained `classroomIds`, and — following
the same rule as problem status — **an empty list means every student**, which is exactly how every
existing assignment behaved. Students only see a targeted assignment if they are in one of its
classes, and `getNotifications` applies the same filter (otherwise a student is pinged about a
deadline they can't open). Targeting another faculty member's class is rejected.

Only **published** problems are offered, since a draft 404s for students and the API rejects it.

### MCQ builder — `/faculty/mcq/[id]/edit`

**Details → Questions → Preview → Publish**, with per-question autosave (debounced, complete
questions only — a half-typed one would be rejected and fail the whole save) and a student preview.

This needed a new endpoint: `PUT /api/mcq/tests/:id`. Previously only the *question list* could be
changed after creation, so fixing a typo in a title or a wrong duration meant deleting the test and
starting over.

### Question bank — `/faculty/bank`

`GET /api/faculty/question-bank` returns coding problems and MCQ questions (flattened out of their
tests) with **usage counts** — how many assignments and contests reference each problem — plus
filters for status, difficulty, tag and usage. The "Never used" filter is the point: it surfaces
material that already exists and has never been assigned, which is what stops re-typing.

### Reordering — and an accessibility fix

Both builders use `framer-motion` `Reorder` with handle-only drag. **I could not verify the pointer
drag itself**: synthetic pointer events don't drive framer-motion's gesture system, and the browser
pane wasn't displayed so a real click-drag wasn't available. Rather than ship an unverifiable
interaction as the *only* way to reorder, both flows also have explicit **move up / move down**
buttons.

That is not just a testability workaround — drag-and-drop is unreachable with a keyboard or a
screen reader, so ordering would otherwise have been mouse-only. The buttons are the accessible
path and were verified end to end.

### Verification

**30/30 backend checks**, including the regression guard that an untargeted assignment is still
visible to a student who is in no class, targeting reaching only class members, notifications
respecting the same filter, MCQ metadata validation, and question-bank usage counts.

**Browser-verified**: the assignment flow gated each step, reordered correctly through three moves
(Alpha/Bravo/Charlie → Charlie/Bravo/Alpha), showed that order in the review summary, and **persisted
it exactly** on save; the MCQ flow renamed the test through the new endpoint ("Draft saved"),
reordered questions with the save landing, previewed them in the new order, and published — with
title, order and published state all confirmed server-side; the question bank showed usage counts,
search, the MCQ tab, and the "Never used" filter correctly returning nothing when everything is in
use. No console errors. All probe data deleted (public catalogue back to 77).

> Two apparent failures during this verification were my test harness, not the app: MUI renders a
> hidden read-only shadow `<textarea>` for auto-sizing multiline fields, and MUI `Select` opens on
> **mousedown**, not click. Both are worth remembering for future UI checks.

---

## 9. P4 — analytics

### The data layer

Every panel now reads **one cached snapshot** (`backend/src/services/analyticsService.js`) instead of
each view calling `submissionRepo.listAll()`. Two things made that worth doing beyond tidiness:

1. **Submissions store the full source code.** Counting verdicts used to download every student's
   solutions. A Firestore field mask (`listAllForAnalytics`) drops `code` and `testResults` —
   measured **31.5% smaller and ~3× faster** on the current seed set, and the gap widens as real
   solutions get longer.
2. **The cache is keyed by version.** The snapshot lives in Upstash, so it survives restarts and
   deploys — without `SNAPSHOT_VERSION` in the key, a release that fixes an aggregation bug keeps
   serving the old numbers until the TTL happens to lapse. That was caught the hard way: a
   language-name fix appeared not to work because a cached snapshot was still being served.

Rollups were **deliberately not built**. At 275 submissions a one-pass scan is the right tool; the
snapshot is a cache with no stored state, so when volume outgrows a full scan the same shape can be
produced from incremental daily rollups without any caller changing.

### The views

Four levels, each answering a different question:

| Level | Panels |
|---|---|
| **Overview** | KPI tiles with period-over-period deltas and sparklines · solved-count histogram · effort-vs-success scatter (one dot per student, click to open them) · day×hour activity heatmap · submissions/accepted trend · cohort comparison as box plots + table · verdicts · language mix · hardest-problems table |
| **Cohort** | spread histogram · topic-mastery radar · student table sorted by risk, with explainable signal chips |
| **Problem** | funnel · attempts-to-solve distribution · **per-test-case failure hotspots** · verdicts |
| **MCQ item analysis** | difficulty index vs discrimination index scatter, with flagged questions listed |

The emphasis throughout is **distributions over averages**: a cohort mean of "12 solved" reads the
same whether everyone solved 12 or half solved 24 and half solved none, and those need opposite
responses. The overview leads with the histogram and says so in the copy when the median is 0.

Two deliberate honesty choices:

- **The "active students" KPI has no trend arrow.** "Active in the window" is derivable from each
  student's last activity, but the *previous* window isn't (a student active in both has their last
  activity in the current one, so the comparison would undercount). Showing no arrow beats showing a
  wrong one; doing it properly needs per-day membership the cache deliberately doesn't carry.
- **The funnel has three nested stages, not four.** "Needed more than one attempt" was in the first
  draft and made the funnel non-monotonic — most students who solve do it first try, so it isn't a
  stage between attempted and solved. It's reported next to `gaveUp` as a struggle signal instead.

### Verification

**40/40 API checks** against the real dataset — not just status codes: the day×hour grid totals
match the daily totals, histogram counts sum to the student count, quartiles are ordered, the funnel
is monotonic, difficulty index matches correct/attempts, discrimination stays within −1…1, the
cached second call is faster than the first (2166ms → 400ms), and a CSE faculty member is blocked
from an ECE cohort.

**Browser-verified** with 29 rendered charts: 169 heatmap cells, 29 scatter dots (one per active
student), 9 cohort box-plot rows, drill-down into CSE (12 students, risk chips reading "never
submitted" / "inactive 14+ days"), problem drill-down (funnel 42 → 7 → 3, 4 gave up, test-case
hotspots), and MCQ item analysis. No console errors.

Two bugs the tests caught and fixed: the non-monotonic funnel above, and language names rendering as
"Lang python" because `submission.language` holds a Judge0 numeric id in some rows and a plain name
in others — now normalised, so "71" and "python" merge into one Python bucket.

### Note on your data

The cohort list surfaced real data-entry drift: `aiml`, `AIML`, `CSE(AIML)`, `rocketscience` and
`Unassigned` are all separate departments. That is worth cleaning up in the student records — no
amount of charting will merge them.
