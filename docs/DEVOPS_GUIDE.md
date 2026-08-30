# CodeMentor — DevOps Guide

**Audience:** you, running this project solo, learning DevOps by building it.
**Last updated:** 2026-08-30

This is the reference for how CodeMentor's development lifecycle works — what
happens automatically, what tools do it, and why each piece exists. See
`docs/DEPLOYMENT_GUIDE.md` for the hosting/infrastructure decision itself.

---

## The full lifecycle

```
 ┌──────────┐   ┌──────┐   ┌──────────┐   ┌──────┐   ┌─────────┐   ┌─────────┐   ┌──────────┐
 │  1. PLAN │ → │2. CODE│ → │ 3. CI    │ → │4. TEST│ → │5. PACKAGE│ → │6. RELEASE│ → │7. OPERATE│
 │  ideas,  │   │ write │   │ build+   │   │ verify│   │ Docker   │   │ (CD)     │   │  monitor,│
 │  backlog │   │ branch│   │ lint gate│   │ works │   │ image    │   │ deploy   │   │  alert   │
 └──────────┘   └──────┘   └──────────┘   └──────┘   └─────────┘   └─────────┘   └────┬─────┘
      ▲                                                                                │
      └────────────────────────── feedback: bugs, usage, new ideas ─────────────────────┘
```

Every feature rides this same loop. Once it's set up, "how do I ship this" stops
being a decision you make every time.

---

## Stage by stage

### 1. Plan
Where an idea or bug becomes a tracked item instead of a thought you might forget.
**Tool:** GitHub Issues + GitHub Projects (free, built into the repo).

### 2. Code
Written on a branch, not directly on `main`. Convention: `feature/short-name` or
`fix/short-name`, opened as a PR even solo — gives you a diff view and a clean
revert point if something breaks.
**Tool:** Git + GitHub.

### 3. CI — Continuous Integration
The automatic "does this still work" check on every push. Defined in
`.github/workflows/ci.yml`: installs dependencies, lints, builds both apps,
builds both Docker images. Runs on every push and PR against `main`.
**Tool:** GitHub Actions (free — 2,000 minutes/month on private repos).

### 4. Test
Three tiers, deliberately not all automatic:
- **Lint** (ESLint, frontend) — runs in CI on every push.
- **Smoke suite** (`backend/tests`) — hits a real backend + real Firestore
  project by design. Stays a manual/deploy-time gate, not wired into every-commit
  CI, because it needs live infrastructure behind it and would otherwise write
  to production-adjacent data on every push.
- **Load testing** (future — PR-07 in `docs/scale-readiness/19-load-testing.md`)
  — proving the system survives an 800-student exam-start burst before it
  happens for real.
  **Tool:** k6 or Artillery (free, open source).

### 5. Package
Turning code into a runnable, versioned artifact.
**Tool:** Docker (`backend/Dockerfile`, `frontend-next/Dockerfile`) + Docker
Compose (`docker-compose.yml`) for the full stack. Once CD exists, add
**GitHub Container Registry (ghcr.io)** — free — so CI builds the image once and
pushes it; deployment becomes "pull this exact image" instead of rebuilding on
whatever machine runs it.

### 6. Release — CD (Continuous Deployment)
Getting a built package onto a real machine automatically. Depends on the
deploy target (open decision — see `docs/DEPLOYMENT_GUIDE.md`):
- **VM options:** local machine (now) → college server via Cloudflare Tunnel
  (target — free, no public IP or open ports needed) → GCP VM (paid fallback,
  ~$30–40/mo). Judge0 specifically must run on a real VM — it needs privileged
  Docker containers to sandbox student code, which no serverless platform allows.
- **Frontend:** either Vercel (free CDN, stays up even if the VM is down) or
  self-hosted via the `frontend` service already defined in `docker-compose.yml`.
- **Mechanism:** a GitHub Actions step that SSHes into the VM and runs
  `docker compose pull && docker compose up -d`.

### 7. Operate / Monitor
Knowing something's wrong before a student tells you.
- Health endpoints already exist (`/health`).
- Docker healthchecks already used for Judge0's db/redis.
- **Uptime Kuma** (free, open-source, self-hosted — runs as one more container)
  for uptime alerting. Concrete version of `docs/scale-readiness/17-monitoring.md`.

**Managed services kept as-is** (per the existing hosting decision — replacing
them buys nothing at this scale): Firebase Auth + Firestore, Upstash Redis,
Google Gemini.

---

## Full tech list

| Layer | Tool | Cost | Status |
|---|---|---|---|
| Version control | Git + GitHub | Free | Done |
| Project tracking | GitHub Issues + Projects | Free | In progress |
| CI | GitHub Actions | Free (2,000 min/mo) | In progress |
| Containers | Docker + Docker Compose | Free | Done |
| Container registry | GitHub Container Registry (ghcr.io) | Free | Later, with CD |
| Code execution sandbox | Judge0 CE | Free (needs a real VM) | Exists, needs a home |
| Deploy target | Local now → college server VM (Cloudflare Tunnel) → GCP fallback | Free → ~₹75/mo domain → ~$30–40/mo | Open decision |
| CD | GitHub Actions (SSH deploy step) | Free | After VM chosen |
| Auth / DB | Firebase Auth + Firestore | Free at this scale | Kept as-is |
| Cache / rate-limit | Upstash Redis | Free tier | Kept as-is |
| AI tutor | Google Gemini | Free tier | Kept as-is |
| Monitoring/uptime | Uptime Kuma (self-hosted) | Free | Later |
| Load testing | k6 or Artillery | Free | Later (PR-07) |

---

## How a new feature flows through this, once it's fully live

1. Idea → GitHub Issue → Backlog column on the Projects board
2. Move to In Progress, branch, build locally with `docker compose up`
3. Push → CI runs automatically, green/red in the Actions tab
4. Open a PR → review the diff → merge to `main`
5. (Once CD exists) merging auto-deploys to the VM
6. Monitoring watches it live
7. Card moves to Done — cycle repeats
