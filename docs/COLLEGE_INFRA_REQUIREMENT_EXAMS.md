# CodeMentor: what the college needs to provide to run exams without crashing

**DRAFT for the owner to review before it goes to the college.** Prepared 2026-10-26.
Every figure below is marked **derived** (from our capacity study in `docs/scale-readiness/`), **budget** (a limit we will build to and test) or **ask** (what we request). Nothing here has been measured on the college network yet; the load test in the first two weeks replaces the budgets with measurements.

To: Principal, Head of IT / Network, Training and Placement Cell, HODs
From: CodeMentor team, Department of CSE

---

## 1. One-page summary

| | |
|---|---|
| **What** | A coding and exam platform for the whole college, replacing the paid licence for coding practice and exams. |
| **Size we are designing for** | **1000 students writing and running code at the same moment** (a synchronised exam), **3000 students logged in at once**, exams up to 3 hours. |
| **What we ask the college for** | (1) one server of **16 to 24 CPU cores, 32 GB RAM, 100 GB SSD, no GPU**; (2) a reliable **internet link of at least 100 Mbps** during exams and wired or well-provisioned lab networks; (3) **power and uptime** on exam days; (4) a named **contact** for exam days. |
| **What we do not ask for** | A public IP, inbound firewall changes, GPU time, or administrator effort beyond the initial setup. All traffic from the server is **outbound HTTPS only**. |
| **What happens with less** | The system does not crash; coding verdicts take longer at the peak (a queue with a visible position), and below the minimum we recommend fewer simultaneous coding exams. Section 8 lists each case. |
| **Trial** | One month, removable on request. We will run a rehearsal with a small group before any graded exam. |

---

## 2. The workload

| Item | Figure | Basis |
|---|---|---|
| Students writing a coding exam together | up to **1000** | design target |
| Students logged in at the same time | up to **3000** | design target |
| Login burst at exam start | about 1000 in 10 minutes, half in the first 2 minutes | derived (ch. 6) |
| Code runs during a coding exam | about **4 to 6 per second** sustained, up to 2x at peaks | derived (ch. 6, 9) |
| Acceptable wait for a verdict at the peak | up to **20 seconds**, with a visible queue position | derived |
| Exam length | up to 3 hours | assumed |
| MCQ and aptitude tests | 1000 at once, **no code execution**, database-heavy | derived (ch. 6, scenario S5) |

The main uncertainty is the **language mix**: mostly Python needs about a third of the compute of a mixed set, and mostly Java needs nearly twice as much. We need to know the languages the college will use in exams.

---

## 3. Compute (the one thing that cannot be hosted outside)

Student code is untrusted and must run in an isolated sandbox. Everything else (website, API) is hosted externally.

| Resource | Ask | Basis |
|---|---|---|
| CPU cores | **16 minimum, 20 to 24 recommended** | **derived**: 60 runs per student at about 1.33 CPU-seconds each, 2x peak, 30% margin gives about 20 cores (ch. 9) |
| RAM | **32 GB** | 16 sandboxes at 512 MB each, plus services (derived) |
| Disk | **100 GB SSD** | grows with submission history (derived) |
| GPU | **none** | the workload is CPU-only |
| Operating system | a recent Linux server edition (for example Ubuntu 22.04 or 24.04 LTS) with `sudo` | we need to confirm the kernel's cgroup mode, because the code sandbox is known to need the older cgroup v1 or specific kernel settings |
| Software | Docker or containerd, and **K3s (Kubernetes)**, installed by us | automatic scaling and load balancing; the sandbox needs privileged containers |
| Machines | **two machines preferred** | one machine is a single point of failure; with one, a hardware fault stops exams until it is repaired |
| Isolation | containers; cannot touch other workloads on the machine | design |

Sensitivity (derived, ch. 9): a light exam (30 runs per student) needs about 10 cores; the base case about 20; a heavy exam (80 runs per student) about 26.
The assumption "about 1.33 CPU-seconds per run" is **the weakest number** and will be measured in the first load test.

**Optional second machine:** if the college wants the website and API on campus too, add **2 machines of 4 vCPU and 8 GB RAM** for the API, plus a 4 vCPU, 16 GB database machine. This is only needed if the college wants exams to survive an internet outage; see section 5.

---

## 4. Network

| Requirement | Ask | Basis |
|---|---|---|
| Internet link during exams | **at least 100 Mbps**, not shared with a heavy download that day | **budget** below |
| Server connectivity | outbound HTTPS (443) only; no inbound ports | design |
| Allowed domains | to be listed by us (hosting, database, email, monitoring) so the firewall can allow them | ask |
| Exam labs | only if graded tests are held in labs: **wired** machines preferred; if Wi-Fi, the network team confirms the access points can carry that many students. **Students may also work from any other network** (home, mobile data), so the platform is built to be light and to survive drops. | ask |
| DNS and time | a working campus DNS and correct server clock | ask |

**Bandwidth budget (to be verified by the load test):** we will build the exam page to a budget of **3 MB for the first load** (then cached) and **about 100 KB per student per minute** afterwards.
That gives, for 1000 students: a start-of-exam burst of about 3 GB over 10 minutes (**about 40 Mbps**), then about **13 Mbps** steady. The 100 Mbps ask leaves about 2x margin for other campus use. If the budget turns out to be wrong, the load test will tell us before an exam.

---

## 5. Availability and what happens if something fails

| Failure | What students see | What we do |
|---|---|---|
| Brief internet drop (seconds) | Answers are saved locally, a small "reconnecting" notice, no work lost | automatic retry and sync |
| Longer internet outage | The exam clock keeps running on the server; students reconnect and continue | staff may extend or resume individual attempts (audited) |
| Judge server down or overloaded | MCQ parts continue; coding submissions wait in a queue with a position | alert to us; restart; staff may extend time |
| Power cut at the server | Same as above after restart | UPS recommended (ask) |

The platform is built so that **no answer is lost** and the **exam owner can extend time** for affected students. It cannot prevent a campus-wide outage; for that case only, a campus-hosted copy (section 3, optional second machine) is needed.

**Ask:** UPS on the server, and the server in a location with stable cooling and power on exam days.

---

## 6. Security obligations (shared)

| Area | College | CodeMentor team |
|---|---|---|
| Physical access to the server | restricted | none needed |
| OS patching | none (we patch the container host during a window agreed with you) | yes |
| Accounts on the server | one named account for us | yes |
| Backups | none | scheduled and tested restores |
| Data | the college is the data owner | encrypted in transit; access logged; staff roles and 2FA for Admin and T&P |
| Incident | a named contact | we alert and report within a day |

Student data (CGPA, backlogs) is sensitive. The platform shows it only to the student, their HOD, T&P and Admin, and logs exports. Consent wording shown to students needs the college's sign-off.

---

## 7. Exam-day support

We ask the college to name **one contact for exam days** (network or IT) who can be reached during the exam, and to give **at least 7 days' notice** of a graded exam so we can run the pre-flight checks and freeze changes. We provide a pre-flight checklist, a status page during the exam, and a runbook for the most common problems.

---

## 8. What each level of provision delivers

| Provision | Delivers | Limits |
|---|---|---|
| **16 cores, 32 GB, 100 Mbps** | One full-college coding exam (1000 students) with verdicts up to about 20 seconds at the peak | occasional queueing; one big coding exam at a time |
| **24 cores** | Same, comfortable margin; heavy exams (80 runs per student) | none expected |
| **8 cores** | About 500 students writing code, or 1000 on MCQ-heavy exams | longer waits at the peak; we advise staggered batches |
| **Below 8 cores or under 50 Mbps** | Practice and small exams only | not suitable for a college-wide graded coding exam |
| **No college server** | Practice and small tests on the current free setup only | not suitable for a graded coding exam; we do not plan to rent cloud servers |

---

## 9. Timeline we propose

| When | What |
|---|---|
| Now | The college reviews this document and names the contact. |
| Week 1 to 2 | The college prepares the server and network. We prove the code sandbox runs on it, then run a load test there and report the real figures. Until the server is ready we test locally at reduced scale. |
| Week 2 | **Rehearsal:** about 100 students on the college server and network, a short test. |
| Week 3 onward | A graded exam with 7 days' notice. |

---

## 10. Open items for the owner before sending

1. Which languages will the exams use (this swings the compute by 6x)?
2. How many students sit one coding exam at the same time in practice (all 1000, or batches)?
3. Do we ask for the optional campus-hosted copy (section 3), or only the code-runner server?
4. Who signs this for the college side, and who is the exam-day contact?
5. Do we have any figure for the campus internet link today?
6. What operating system and kernel does the college server run, and does the college allow Kubernetes (K3s) and privileged containers on it?
7. Can the college provide a second machine?
