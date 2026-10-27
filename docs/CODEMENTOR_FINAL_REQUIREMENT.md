# CodeMentor: final infrastructure and platform requirement

**For:** HOD, Principal, college IT and network team
**From:** CodeMentor team, Department of CSE
**Date:** 2026-10-26. This replaces `docs/CODEMENTOR_REQUIREMENT.md`.
**Built from:** `docs/CODEMENTOR_REQUIREMENT.md`, `docs/INFRA_REQUIREMENTS_GUIDE.md`, `docs/DEVOPS_GUIDE.md`, `docs/DEPLOYMENT_GUIDE.md`, `docs/scale-readiness/` (chapters 5 to 20), `Review_Feedback.md` (items 1, 2, 3, 4, 7, 19, 20), the repository's Docker, Judge0 and Firestore files, and the plan in `docs/TNP_ADMIN_EXAMS_SECURITY_PLAN.md`.

Each row gives the **resource**, **what to provide**, **what it is used for**, and **cost**. Only the best option is listed. Figures marked *(est.)* are our estimates and will be replaced by measurements from the load test.

---

## 0. The whole picture

**What it is:** the college's all-year platform: coding practice, courses, assignments, tests and exams, analytics for faculty, HODs and Admin, the placement cell, and an AI tutor.
**Size:** 3000 students and staff daily, from any network (campus Wi-Fi, home, mobile data). Peak: **1000 students writing and running code at the same moment** (about 200 submissions at once is already inside this).
**Why a real machine is unavoidable:** students' code is untrusted and must run in a sandbox that needs Linux and privileged containers. No free hosting offers that. Everything else already runs on managed or free services.

**Where each part runs**

| Part | Runs on | Notes |
|---|---|---|
| Code runner (Judge0, with its own database and Redis) | **College server** | The reason we need the server |
| Platform API (Node.js 22, Express) and plagiarism checker (JPlag, Java 17) | **College server** | Same cluster as Judge0 |
| Our cache and rate-limit store (Redis) | **College server** | Replaces the free managed Redis, whose free limit is too small (section 5) |
| Monitoring, alerts, dashboards | **College server** | |
| Our own AI model | **College GPU server** | Section 6 |
| Database and sign-in (Firestore, Firebase Authentication) | **Google Cloud (Firebase)** | Managed; paid per use |
| Backups of the database | **Google Cloud Storage** | |
| Website (Next.js) | **Vercel**, or the college server | Section 3, item "Website hosting" |
| Security, speed and the safe link to the server | **Cloudflare (free)** | Outbound-only tunnel, no open ports |

The college server runs **containers under Kubernetes (K3s)**, not full virtual machines. If the college prefers to give us a VM, K3s runs inside it.

---

## 1. Compute and servers (college)

| Resource | What to provide | Used for | Cost to college |
|---|---|---|---|
| Main server | **24 CPU cores, 64 GB RAM**, no GPU needed for this server | Judge0 workers (1 core and 512 MB each, up to about 18 to 20 at once), API copies, Redis, monitoring, Kubernetes itself | Existing hardware, electricity |
| Second server | **Identical to the first**, joined to the same Kubernetes cluster | Standby and extra capacity. One machine is a single point of failure: Kubernetes restarts crashed programs but cannot survive a dead machine | Existing hardware, electricity |
| Disk | **500 GB SSD** per server plus a **separate backup disk** | Judge0 database (grows with submission history), logs, metrics, local backups | |
| Operating system | **Linux server (Ubuntu 22.04 or 24.04 LTS)** with admin (`sudo`) access for our team | The sandbox (`isolate`) requires Linux. We must confirm the kernel's cgroup mode, because Judge0's sandbox is known to need the older cgroup v1 or specific kernel settings | |
| Software allowed | **Docker or containerd, Kubernetes (K3s), privileged containers for the code runner only** | Running everything as containers; the sandbox needs privileged mode | |
| Disk encryption | Full-disk encryption on the servers | Protecting student data if a disk is removed | |
| Server stability | **Not reimaged between semesters**; an account for us that survives term resets; maintenance windows agreed in advance | A server wiped each semester is worse than no server | |

**How the sizing was derived** (`docs/scale-readiness/09-judge0-capacity.md`): 1000 students at about 60 runs each in a 3-hour exam is 60,000 runs, which is about 5.6 runs per second. At about 1.33 CPU-seconds per run (mixed languages) that is about 7.4 cores sustained, about 15 at peak, about 20 with a 30% margin. RAM: 16 to 20 sandboxes at 512 MB plus services. The 64 GB adds room for the API copies, Redis and monitoring that now share the machine. *(est.: the 1.33 figure will be measured.)*
**Language mix matters:** mostly Python needs about a third of this; mostly Java about twice. We need to know the languages used in exams.

---

## 2. Automatic scaling and load balancing

This is what makes the system use little when quiet and everything it has when busy.

| Resource | What we set up | Used for |
|---|---|---|
| Orchestrator | **K3s** (lightweight Kubernetes), all settings stored in git and applied by CI | Scaling, restarting, rolling updates, rebuild from git |
| Load balancer | **Cloudflare, then the cluster's ingress (Traefik)**, spreading requests across API copies; health and readiness checks; graceful shutdown | No single copy takes all the traffic; a crashed copy gets no traffic |
| API scaling | **Horizontal Pod Autoscaler**: minimum 2 copies, maximum set by the server's cores; scales on CPU (about 60%) and response time | More API copies when many users are online, fewer when quiet |
| Code-runner scaling | **KEDA** scales Judge0 worker copies by the **length of the submission queue** (minimum about 2 when idle, maximum equal to the cores reserved for running code) | A big test starts workers within seconds; they stop afterwards |
| Scheduled scaling | **Weekday and time-of-day schedule** (higher Monday to Friday daytime, lowest at night and weekends, as in the review's traffic pattern), plus **automatic pre-warm 30 minutes before each scheduled exam** from the exam's start time, student count and language mix; released after the exam ends | Capacity is ready before the burst, and costs nothing when idle |
| Learning the pattern | Metrics are kept weekly; the schedule is adjusted from real traffic, not guessed | "Scale with traffic patterns" (review item 4) |
| Queue | **Submissions are accepted instantly and queued** (deep queue, about 2000), with a **per-student limit of 2 in progress**, round-robin so one student's flood cannot block others, and a visible **queue position** | A sudden spike (5 to 10 times the average in the last minutes of a test) is absorbed instead of crashing |
| Cost guard rails | A **maximum on every scaler**, resource limits on every program, budget alerts, and an alarm if capacity stays high after a test ends | A fault cannot run away |
| Per-use cloud costs | Caching and counters cut database reads; per-student limits on AI calls | Cloud cost (database reads, AI usage) also follows traffic |

**Honest limits**
- **The ceiling is the college hardware.** "Maximum mode" can use every core we are given and no more. Beyond that the queue makes results slower; nothing is dropped. More headroom comes only from the second server and more machines joining the cluster.
- **Quiet times** free the cores for other people's work on the shared server. The electricity saving of a physical server is small; the benefit is shared use and no waste.
- **Judge0 on Kubernetes is the one technical risk.** First task: a one-day test on the college's own operating system. Fallback: Docker Compose on the same host with the same images (the repository already has it).
- Scaling a wasteful path only wastes more, so the database read reductions (`docs/scale-readiness`, work package PR-01) are done first.

---

## 3. Network

| Resource | What to provide | Used for | Cost |
|---|---|---|---|
| Internet link | **300 Mbps or more**, symmetric, dedicated on exam days | All student and staff traffic to our server, and the server to Google (Firebase). The platform is reachable from any network, so the college's link carries every user's traffic | College's connection |
| Inbound access | **None.** No public IP, no port forwarding, no firewall changes | Cloudflare Tunnel is outbound-only | |
| Outbound access | **Port 7844 (TCP and UDP) to Cloudflare** (`region1.v2.argotunnel.com`, `region2.v2.argotunnel.com`) and **HTTPS (443)** to a list of domains we provide | The tunnel (it needs port 7844), and Google, updates, email, monitoring (443). If the college cannot allow port 7844, the alternative is a public IP with inbound 443 to a reverse proxy, which needs a firewall change | |
| Server address | A **fixed internal (private) IP address** for each server, not one that changes | The campus web name and the firewall rules point at it | |
| Lab IP ranges | The IP ranges of the labs, **only if** a test is locked to the lab network | The optional lab-only exam restriction | |
| Campus web name | An address like `codementor.sreyas.ac.in` pointing at the server (campus DNS) | Students on campus reach it directly over the campus network | |
| Server room to labs | **Fast wired link** between the server room and the labs | Lab tests | |
| Lab network | **Wired computers on a separate lab network**, only if graded tests are held in labs | Stable connections for many students in one room | |
| Students' own networks | Not our requirement: students may use **any Wi-Fi, mobile data or hotspot** | The platform is built light: about 3 MB for the first load, about 100 KB per student per minute, usable on about 1 Mbps, with work saved on the device first and retries on drops *(budgets, to be tested)* | |
| Domain name | A domain for the public address (about ₹900 a year) or a college subdomain | Cloudflare Tunnel | ~₹900/yr |
| Cloudflare | Free plan | TLS, DNS, attack protection, caching, the tunnel | Free |
| Website hosting | **Vercel**, as decided in `docs/scale-readiness/13-hosting-decision.md` (free, stays up if the college server is down). **To check:** Vercel's free plan is for non-commercial use, so confirm it fits a college deployment, or host the website on the cluster behind Cloudflare | Serving the website | Free, or Vercel paid plan |

---

## 4. Storage and backups

| Resource | What to provide | Used for | Cost |
|---|---|---|---|
| Server disks | As in section 1 | Judge0 data, logs, metrics | |
| Local backups | A separate disk, nightly copies of Judge0's database and cluster settings | Recovering from a server fault | |
| Database backups | **Daily Firestore export to Google Cloud Storage, kept 30 days**, and a **restore drill** before real use | Recovering from mistakes; a backup nobody has restored is not a backup | a few hundred rupees a month at most *(est.)* |
| Retention | Every submission and grade kept; no silent deletes | Grade disputes months later | |

---

## 5. Database, Firebase and Google Cloud

| Resource | What to provide | Used for | Cost |
|---|---|---|---|
| **Firebase Firestore (Google Cloud)** | **Blaze (pay-as-you-go) plan**, with **budget alerts at ₹1,000, ₹3,000 and ₹5,000 a month**. A billing account and card held by the owner or the college | The main database: students, courses, exams, answers. The free Spark plan's 50,000 reads per day would stop the platform minutes into a busy session | See below |
| **Firebase Authentication** | Part of the same project | Sign-in and passwords (we never see a password) | Free at our size *(verify)* |
| **Firestore security rules** | **Deny-all** (already in `firestore.rules`); all access through our API only | Nobody can read or write data directly | Free |
| **Google Cloud Storage** | One bucket for backups | Section 4 | Low |
| **Our own Redis** | Runs on the college server | Cache and rate limits. The free managed Redis allows about 10,000 commands a day, and every API request uses at least one for rate limiting, so 1000 users exceed it within minutes | Free (our server) |
| **Judge0's database (PostgreSQL) and Redis** | Run on the college server with Judge0 | Tracking code-execution jobs | Free (our server) |
| Later: PostgreSQL for the main database | After a successful pilot (`docs/scale-readiness/12-data-layer.md`, decision D8) | Stops mismatched records structurally | Free (our server) |

**Firestore cost.** Google gives a daily free amount (about 50,000 reads, 20,000 writes and 20,000 deletes, and 1 GiB stored). Beyond it, the US price is about **$0.03 per 100,000 reads, $0.09 per 100,000 writes and $0.01 per 100,000 deletes**. Mumbai prices may differ and must be checked on Google's pricing page. In our own study the bill is **about ₹400 a month after the read-reduction work and about ₹22,000 a month without it**, which is why that work comes first.
**Region:** a Firestore region cannot be changed after creation; we must confirm ours (ideally Mumbai).

---

## 6. AI tutor (our own model)

| Resource | What to provide | Used for | Cost |
|---|---|---|---|
| GPU | **1 GPU with 24 GB or more of memory** (a slice of the college H100, or an L4 or A10 class card) | Serving our own fine-tuned 7 to 8 billion-parameter model for the Socratic tutor, hosted on campus with vLLM or Ollama | College hardware |
| Fine-tuning time | A time-boxed share of the H100 per training run (a few GPU-hours per run *(est.)*) | Fine-tuning our model on our Socratic examples (a LoRA style fine-tune of a 7 to 8B model fits in 24 GB) | College hardware |
| Isolation | GPU time-slice or slice quota, on a **separate node or namespace** from the exam servers | The model never takes cores from exams, and the GPU owner keeps control of his workload | |
| Transition | **Google Gemini stays as the working tutor** until our model passes quality checks | The current feature keeps working | about ₹300 to 3,000 a month at full use (`docs/scale-readiness/14-ai-features.md`) |
| Data | Student code and questions stay on campus once our model is live | Privacy | |

---

## 7. Security (Kubernetes and application)

| Control | Requirement | Used for |
|---|---|---|
| Network separation | Separate namespaces for the app, the code runner, data and monitoring; **default-deny network policies**: only the API may reach the code runner; the code runner has **no outgoing network** | A compromise in one part cannot reach the others |
| Code sandbox | `isolate` with network off, strict CPU, memory, time, process and file limits; Judge0 token set; compiler options, command-line arguments and submission delete disabled; the code runner on its own namespace (it needs privileged mode, so it is fenced in) | Untrusted student code cannot harm the server or other students |
| Pod security | The restricted standard for every normal pod: no root, read-only filesystem, no extra privileges, resource limits | Hardened containers |
| Access control (RBAC) | Cluster RBAC with least privilege; in the application, roles (student, faculty, HOD, T&P, Admin) enforced **on the server** from one access matrix, with a test that every route refuses the roles that should not use it | Everyone sees only what their role allows |
| API gateway | Cloudflare and the ingress: rate limits, size limits, request validation, attack protection (WAF) | One controlled entry point |
| Secrets | Kept in Kubernetes secrets encrypted at rest and in an encrypted file in git; never in code; rotation runbook | No leaked keys |
| Encryption | In transit: TLS everywhere. At rest: Google (database) and full-disk encryption on the servers | Protecting stored and moving data |
| Sign-in | Firebase Authentication; **2FA required for Admin and T&P**; short sessions; role changes take effect within minutes | Strong identity |
| Exam integrity | Server-authoritative timer, answers and scores; signed attempt token; autosave; second-device takeover; violation policy (warn, flag, lock after N); a log of evidence; email to student and Admin only for hard evidence | Console tricks and tampering do not work and are recorded |
| Audit | Append-only log of every Admin and T&P action (who, what, how many, before and after) | Evidence for disputes |
| Image safety | Pinned image versions (Judge0 1.13.1), automatic scanning of images and dependencies, secret scanning, static analysis on every change | Catching known holes before release |
| Attack tests | Automated tests that try what a student could try in the browser console, run on every change and before every exam | The substitute for a human reviewer. No human review was done, and every report will say so |

---

## 8. Operations and DevOps

| Resource | What to provide | Used for | Cost |
|---|---|---|---|
| Source and CI | GitHub and GitHub Actions: lint, tests, route audit, build, security scans | Every change is checked before it reaches students | Free |
| Container registry | GitHub Container Registry | Deploy exactly the image that was tested | Free |
| Deployment | Automatic roll-out through git, with zero-downtime updates and one-step rollback | Safe releases | Free |
| Staging | A separate test environment (own Firebase project and secrets) | Testing before production, and load tests | Free to low |
| Monitoring | Metrics and dashboards (Prometheus and Grafana), error tracking (Sentry free), uptime checks (UptimeRobot or Uptime Kuma), a judge-health monitor | Knowing before students do | Free |
| Alerts | Telegram group and email, with severity levels; an exam-day dashboard | Fast response | Free |
| Load testing | k6 scenarios: exam-start burst, sustained exam, last-minute surge, MCQ test; plus scale-up, scale-down, killed-server and slow-network runs | Proving the numbers before an exam | Free |
| Runbooks | Deploy, rollback, Judge0 warm-up, secret rotation, incident playbooks, pre-exam checklist, rebuild the cluster from git | Calm recovery | |
| Email | A free transactional email service from a college address | Reminders, integrity and exam notices | Free tier |

---

## 9. People and support

| Need | Requirement | Used for |
|---|---|---|
| Support contact | **One named IT or network person**, reachable during large tests | Fixing network problems fast |
| Notice | **7 days' notice** before large tests or placement drives | Safety checks, a change freeze, pre-warm |
| Server administrator | The person who administers the server, and the agreed maintenance windows | Updates without surprise |
| Sign-off | A named person for the college's data-consent wording shown to students | Privacy |
| Our side | A named maintainer and a written handover, so the system does not depend on one person | Continuity |

---

## 10. Cost summary

| Item | Cost |
|---|---|
| Hardware, electricity, internet | College (existing) |
| Google Cloud (database, backups) | about ₹400 to 1,500 a month *(est.)*, capped by budget alerts |
| Domain name | about ₹900 a year |
| Cloudflare, GitHub, monitoring, email | Free |
| Gemini until our own model is live | about ₹300 to 3,000 a month at full use |
| **Total software** | **about ₹15,000 a year**, up to about ₹50,000 if Gemini is used at full adoption (`docs/scale-readiness/08-cost-model.md`) |
| For comparison | the current licence is about ₹15 lakh a year |

No servers are rented. There is no cloud fallback for the code runner, so the fallback is operational: stagger large tests in batches, use the second server, and keep the public Judge0 only for small practice.

---

## 11. Rollout

1. **Weeks 1 to 2:** server and network ready; one-day test of Judge0 on Kubernetes on the college operating system; load test on the college server; security baseline closed (Firestore rules, billing plan, rate limits, CSP, token lifetime).
2. **Week 2:** rehearsal with about 100 students.
3. **Week 3 onwards:** phased ramp: one class, then one year, then the department, then the college.

## 12. What the college decides or confirms

1. Server and second server, and who administers them.
2. The operating system, kernel and whether Kubernetes and privileged containers are allowed.
3. The internet speed available, and the speed between the server room and the labs.
4. The exam-day contact and the 7-day notice rule.
5. The H100 GPU share for our AI model.
6. The billing owner for the Google Cloud account.
7. The data-consent wording.
8. The languages that exams will use.
