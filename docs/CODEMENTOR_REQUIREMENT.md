# CodeMentor Requirement

## 1. Compute & server

| Name | Requirement | Reason | Why this is best |
| --- | --- | --- | --- |
| CPU | 16 cores (20–24 better) | Grades up to 1,000 students' code at once without slowing down — derived from measured execution cost per programming language | Matches the real, calculated load; less risks exam-day failure, much more wastes idle hardware |
| RAM | 32 GB | 16 code "sandboxes" × 512 MB, plus supporting services | Sized exactly to the sandbox count — a 4–8 GB machine can't safely run 16 at once |
| Disk | 100 GB | Stores submission history; grows over time | Enough for a full semester of records before the next review |
| GPU (for grading code) | None | Code execution never touches a GPU | Keeping this part of the ask GPU-free is what makes it approvable on a machine already used for GPU work |
| Operating system | Ubuntu 22.04 LTS (or similar Linux) | The sandbox technology (`isolate`) requires Linux | Free, open-source, the standard choice for this job — also used by the International Olympiad in Informatics |
| Access | `sudo` + permission to run Docker | The sandbox needs privileged containers | Docker contains everything — nothing else touches the host machine |

## 2. Network

| Name | Requirement | Reason | Why this is best |
| --- | --- | --- | --- |
| Inbound access | None — no public IP, no port forwarding, no firewall changes | We only ever need to connect outward | Removes the main objection an IT admin would raise; nothing is exposed to the internet |
| Outbound access | HTTPS (port 443) only | Needed for an outbound-only tunnel (Cloudflare Tunnel) | Free, zero firewall changes, works from behind any campus network |

## 3. Software (already built)

| Name | Requirement / choice | Reason | Why this is best |
| --- | --- | --- | --- |
| Website | Next.js, hosted on Vercel | Needs to be fast and reachable | Free tier, zero maintenance, stays online even if the college server goes down |
| Backend server | Node.js | Runs the application logic | Already built; free hosting available |
| Code execution engine | Judge0 (open-source) | Compiles and runs student code safely | Same engine used by the International Olympiad in Informatics — proven, free, open-source |
| Plagiarism detection | JPlag (open-source) | Compares submissions for copied code | Free, widely used in academia, already integrated |
| Database / login | Firebase (Google) | Stores data, handles sign-in | See Database section below |
| AI tutor | Google Gemini API | Powers student chat and question generation | See AI section below |

## 4. AI features, and the GPU question

| Name | Requirement | Reason | Why this is best |
| --- | --- | --- | --- |
| Student chat/FAQ assistant | Google Gemini API (cloud), as built today | Answers student questions, gives homework help | Already working; costs ~₹300–3,000/month even at full scale; needs no setup |
| Faculty question generator | Google Gemini API, paired with our own code-execution engine to check the answers | Turns a syllabus topic into a ready-to-use coding problem | Reuses infrastructure we already have; the AI never has to guess the correct answer — our execution engine confirms it |
| **GPU, to self-host our own AI model** | **1 GPU, 24 GB+ VRAM** (e.g. an RTX 4090 / A10 / L4-class card, or a slice of the department's H100) | Runs a 7–8 billion-parameter open model (via Ollama or vLLM) for the chat assistant and question generator, on campus instead of Google's cloud | Keeps student queries on campus and removes per-use cost; request it once the CPU ask above is approved and running — listed as its own line item so it's visible, without diluting the CPU ask's strongest point ("we need no GPU for grading") |

## 5. Database

| Name | Requirement | Reason | Why this is best |
| --- | --- | --- | --- |
| Main application database | **Use Firebase Firestore now; move to PostgreSQL after a successful pilot** | Firestore already works and needs no setup; PostgreSQL is the only one of the two that can structurally stop mismatched records (e.g. a submission pointing at a deleted problem) | Firestore is right for right now — rebuilding the data layer before a live evaluation is how projects fail publicly. PostgreSQL is right for later, once real academic records (which must be defensible) start piling up |
| Judge0's own database | PostgreSQL + Redis, bundled with Judge0 | Judge0 needs somewhere to track code-execution jobs | Already included in Judge0's existing setup — no extra work, and separate from the app's main database above |
| Cache / rate-limiting store | Upstash Redis (managed) | Speeds up repeated lookups and enforces submission rate limits | Free tier covers our scale; zero maintenance |
| Backups | Automated backup **and a tested restore**, before any real student data moves to a new database | Protects academic records, which can't be recreated if lost | Non-negotiable — ships as part of any migration, never as a follow-up |
| Data retention | Keep every submission and grade indefinitely; no silent deletes | These are academic records a student can dispute later | Required for any grade dispute to be defensible months or years later |

## 6. Cybersecurity

| Name | Requirement | Reason | Why this is best |
| --- | --- | --- | --- |
| Code sandboxing | Isolated execution (`isolate`), no network access, strict memory/CPU/time limits | Student code is untrusted and must not be able to harm the server or other students | Same sandbox technology used by the International Olympiad in Informatics |
| Database access rules | Deny-all by default; every request goes through our backend, never directly to the database | Stops anyone reading or writing data they shouldn't | Removes the single largest open security risk identified in our own review |
| Encryption in transit | TLS on every request (via Cloudflare) | Protects data moving between student, server, and database | Already provided free by the services we use; no extra setup |
| Encryption at rest | Handled by the managed database provider (Google) | Protects stored data if a disk is ever compromised | Comes free with the managed service; self-hosting would mean building this ourselves |
| Login and passwords | Firebase Authentication | Removes a whole category of risk — we never see or store a raw password | Built and hardened by Google at enormous scale, free |
| Role-based access | Student / Faculty / HOD / Admin roles, enforced on the server | Each person should only see and do what their role allows | Enforced server-side, not just hidden in the interface — the only version that can be trusted |
| Secrets (API keys, credentials) | Stored only in the hosting platform's secret manager, never in the code | Prevents a leaked key reaching a public code repository | Zero extra cost, industry-standard practice |
| Audit logging | Logs every account change, role change, data export, and plagiarism run | Creates an evidence trail if an incident or student dispute needs investigating | Already built; required for any academic-integrity decision to be defensible |
| Heavier enterprise security (Kubernetes, a dedicated API gateway, formal pod-security standards) | Not requested now | These solve problems at a scale — many teams, many services, large internet-facing traffic — that doesn't match one department's pilot | The same protection is already achieved here through Docker's resource limits, an isolated network, and the access rules above, without taking on a cluster that needs its own ongoing operator |

## Cost comparison

| | CodeTantra (now) | Commercial cloud | College server |
| --- | --- | --- | --- |
| Annual cost | ₹15,00,000 | ~₹4,20,000 (~₹2,00,000 with exam-day-only resizing) | ~₹15,000 |
| Who owns the data | Vendor | Us | Us |
| Who's responsible if something breaks | Vendor | Student team | Student team |

This is not a proposal to cancel CodeTantra now — it's a proposal to run a pilot alongside it, at near-zero cost, with a decision made later from evidence.

## Rollout plan

1. **Pilot, this semester.** One department, on the college server, running alongside CodeTantra.
2. **Load test before any real exam.** Validate the sizing numbers above against the live system, ramping in phases — one class, then one year, then the full department.
3. **Evaluate.** Did it stay up? Did faculty use it? Is the problem catalogue growing?
4. **Decide, at the next contract renewal.** Only after the pilot succeeds and a staffing/continuity plan exists.

## Risks

| Risk | Mitigation |
| --- | --- |
| The student team graduates and nobody maintains it | Documentation and runbooks already written; we'd welcome a staff member with access |
| Problem catalogue isn't ready in time | Scope the pilot to 20–40 well-made problems, not a full question bank |
| First real session fails publicly | Phased ramp (one class → one year → department), load-tested first |
| Server access withdrawn or hardware reclaimed | Commercial-cloud fallback already costed at ~₹2–4.2 lakh/year |
| Security incident | Sandbox isolation, no inbound network, written incident-response policy |

## What we're asking for

A one-month departmental pilot on the terms in the tables above. Removable immediately, no discussion needed, if it causes any problem. We would welcome a review of the architecture and security design by whoever the college designates.
