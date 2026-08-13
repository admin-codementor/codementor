# CodeMentor — Deployment & Operations Guide

**Audience:** you, running this project solo, with no prior deployment experience.
**Last updated:** 2026-08-09

This guide replaces the scattered advice in `DEPLOYMENT.md` and `DEPLOYMENT_AZURE.md`
(both stale — Azure was a temporary demo). Read Part 0 even if you skip everything
else; the root `README.md` describes an architecture this project no longer has.

---

## Part 0 — What CodeMentor actually is

### The problem it solves

Colleges teaching programming have a grading problem. A lecturer with 60 students
cannot read 60 submissions per assignment, cannot tell who copied from whom, and
cannot give each student feedback fast enough to matter. Students, meanwhile, get
their marks two weeks after they've forgotten what they wrote.

CodeMentor is a coding-assessment platform for that specific situation. Students
solve problems in a browser IDE; their code runs against real test cases in seconds;
faculty see who's struggling and get automated plagiarism reports. It's the LeetCode
interaction model, but owned by the institution, scoped to its courses and classes.

### Who uses it

| Role | What they do |
|---|---|
| **Student** | Solve problems in the Monaco IDE, run code, submit for grading, take contests and MCQ tests, track progress |
| **Faculty** | Author problems and test cases, create assignments and classes, run plagiarism checks, view analytics per student |
| **HOD / Admin** | Everything faculty can do, scoped across departments; manage permissions and audit logs |

### The real current architecture

> ⚠️ The root `README.md` is out of date. It describes React + Vite, PostgreSQL,
> Socket.IO, OpenAI, and bcrypt logins. **None of that is true anymore.** Use this
> table instead.

| Layer | What it actually is | Where it runs today |
|---|---|---|
| Frontend | Next.js 16 + MUI v6 (Material 3), Monaco editor | Vercel |
| Backend | Node 22 + Express 5, stateless | Railway |
| Database | **Firebase Firestore** (not Postgres) | Google, managed |
| Auth | **Firebase Auth** → backend mints its own JWT | Google, managed |
| Cache / rate limits | **Upstash Redis** (REST-based) | Upstash, managed |
| Code execution | **Judge0 CE** in privileged Docker | GCP VM (currently down) |
| AI tutor | Google Gemini via `@google/genai` | Google, managed |
| Plagiarism | JPlag 5.1.0 (Java) shelled out from the backend | Inside the backend container |

Two architectural decisions matter more than the rest, because they constrain
every hosting choice you make:

**1. The backend is stateless.** Socket.IO and BullMQ were removed (commit
`267e715`). Verdicts are delivered by the client *polling* `GET /api/submit/status/:jobId`
rather than a server push. This means the backend can run anywhere, scale to
multiple instances, restart freely, and never needs sticky sessions.

**2. Judge0 cannot be serverless — ever.** It executes untrusted student code
inside `isolate`, which needs Linux cgroups and namespaces, which needs
`privileged: true` containers. No serverless platform on earth will give you that.
**Judge0 always needs a real machine you control.** This single fact is why you
can't just "put everything on Vercel", and it's the pivot point of the entire
hosting decision below.

### Why you're here

The stack was assembled for a free-tier cloud demo. Your friend set it up and has
since left. Right now the GCP VM hosting Judge0 is unreachable — all ports filtered,
including SSH — so code execution is broken on the live site (`/api/submit` returns
503). You need to decide whether to repair the cloud setup or move onto the college
server, and you need to be able to run it yourself either way.

---

## Part 1 — The moving parts

Before choosing a path, understand what each piece needs. This table is the whole
problem in one view:

| Component | Needs | Can it be managed/free? |
|---|---|---|
| Frontend (Next.js) | Static + SSR hosting, CDN | ✅ Vercel free tier is genuinely fine |
| Backend (Express) | Node 22, ~512MB RAM, **Java 17** for JPlag | ✅ Railway, or self-host |
| Firestore | Nothing — it's Google's | ✅ Free tier covers a college |
| Firebase Auth | Nothing — it's Google's | ✅ Free |
| Upstash Redis | Nothing — REST API | ✅ Free tier: 10k commands/day |
| **Judge0** | **Privileged Docker, 2+ vCPU, 4GB+ RAM, root** | ❌ **Never. Always your own machine.** |
| Gemini | API key | ✅ Free tier exists, then pay-per-token |

So the question "GCP or college server?" is really only a question about **Judge0
and the backend**. The frontend stays on Vercel regardless — it's free, it's a global
CDN, and self-hosting static Next.js output buys you nothing.

---

## Part 2 — Path A: Cloud deployment (GCP VM + Vercel + Railway)

This is what you have now. Here's how to build or repair it from scratch.

### A1. Judge0 on a Google Cloud VM

**Create the VM**

1. Go to <https://console.cloud.google.com> → create a project (or use `codementor-sreyas`)
2. **Enable billing.** A VM will not start without it, even inside free credits.
3. Compute Engine → VM instances → **Create instance**
   - **Name:** `judge0`
   - **Region:** `asia-south1` (Mumbai) — lowest latency from India
   - **Machine type:** `e2-medium` (2 vCPU, 4 GB) to start; `e2-standard-2`
     (2 vCPU, 8 GB) if you expect a full class submitting at once
   - **Boot disk:** Ubuntu 22.04 LTS, 30 GB balanced persistent disk
   - **Firewall:** leave HTTP/HTTPS unchecked for now
4. Create it.

**Reserve a static IP — do not skip this**

This is why your current VM vanished. A default external IP is *ephemeral*: stop
the VM and Google takes the address back. Your backend then points at an IP that
belongs to someone else.

- VPC network → **IP addresses** → find the ephemeral IP attached to `judge0`
- Click **Reserve** → give it a name → it's now static

**Install Docker and Judge0**

SSH into the VM (the browser SSH button in the console is fine):

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in so the group takes effect. Judge0 also needs cgroup v1, which
Ubuntu 22.04 doesn't use by default:

```bash
sudo nano /etc/default/grub
```

Set this line, then save:

```
GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
```

```bash
sudo update-grub && sudo reboot
```

After it reboots, fetch Judge0:

```bash
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
unzip judge0-v1.13.1.zip && cd judge0-v1.13.1
```

**Configure it.** Edit `judge0.conf` and set at minimum:

```
AUTHN_HEADER=X-Auth-Token
AUTHN_TOKEN=<paste a long random string here>
ENABLE_NETWORK=false
MAX_QUEUE_SIZE=100
```

`AUTHN_TOKEN` is the only thing standing between the public internet and free
arbitrary code execution on your VM. Generate it with `openssl rand -hex 32`.
Also set strong `POSTGRES_PASSWORD` and `REDIS_PASSWORD` values in that file.

```bash
docker compose up -d db redis
sleep 10
docker compose up -d
```

Verify locally on the VM:

```bash
curl -H "X-Auth-Token: YOUR_TOKEN" http://localhost:2358/system_info
```

**Firewall**

VPC network → Firewall → Create rule:
- Targets: your `judge0` instance (use a network tag)
- Source IP ranges: as narrow as you can manage
- Protocols: `tcp:2358`

Railway does not offer static outbound IPs on hobby plans, so you may be forced to
allow `0.0.0.0/0` here. If so, your `AUTHN_TOKEN` is doing all the security work —
make it long, and add TLS (below).

**Add TLS** — because without it, student code and your auth token cross the public
internet in cleartext. Point a subdomain at the static IP, then:

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
judge0.yourdomain.com {
    reverse_proxy localhost:2358
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains a Let's Encrypt certificate automatically. Now close 2358 to the
public and use `https://judge0.yourdomain.com` as your `JUDGE0_URL`.

### A2. Backend on Railway

1. <https://railway.app> → sign in with GitHub → **New Project** → **Deploy from GitHub repo**
2. Select `srinu6663/codementor`
3. **Settings → Build:**
   - **Root Directory:** `backend`
   - **Builder:** `Dockerfile` ← critical, see below
4. **Variables** — set all of these:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | your Vercel URL |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | a different `openssl rand -hex 32` |
| `JUDGE0_URL` | `https://judge0.yourdomain.com` |
| `JUDGE0_AUTH_TOKEN` | the token from `judge0.conf` |
| `GEMINI_API_KEY` | from Google AI Studio |
| `FIREBASE_SERVICE_ACCOUNT` | full contents of `service-account.json` (raw JSON works) |
| `UPSTASH_REDIS_REST_URL` | from Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | from Upstash console |

**Why the Builder setting matters:** `backend/Dockerfile` installs Java 17 and
downloads the JPlag JAR. If Railway auto-detects Nixpacks from `package.json`
instead, you get a plain Node image — everything works *except* plagiarism
detection, which fails with a 503. It's a silent partial failure.

Watch the build log for `openjdk-17`. Also grep it for
`WARNING: JPlag JAR download failed` — the Dockerfile's `curl ... || echo` means a
failed JAR download still produces a green build.

Verify: `curl -i https://your-app.up.railway.app/health` → expect `200 {"status":"ok"}`.

### A3. Frontend on Vercel

1. <https://vercel.com> → **Add New Project** → import the same repo
2. **Root Directory:** `frontend-next`
3. Framework preset: Next.js (auto-detected)
4. **Environment Variables:**

| Variable | Value |
|---|---|
| `API_PROXY_TARGET` | `https://your-app.up.railway.app` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | your OAuth client ID |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from Firebase console |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `codementor-sreyas.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `codementor-sreyas` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `codementor-sreyas.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `801060632268` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | your web app ID |

**The one thing that will bite you:** `src/lib/api.ts` uses `baseURL: "/"`, so every
API call is same-origin and goes through the `/api/*` rewrite in `next.config.ts`.
That rewrite target is **frozen at build time**. If `API_PROXY_TARGET` isn't set,
the build silently bakes in `http://localhost:3001` — no error, no warning, just a
frontend where every API call 404s. And changing the variable later requires a
**redeploy**, not a restart.

Test it: `curl -i https://your-domain/api/judge-health` should return **401**
(proof it reached Express), not 404 (proof it didn't).

### A4. The managed services

**Upstash Redis:** <https://console.upstash.com> → Create Database → pick the region
closest to Railway → copy the **REST** URL and token (not the `redis://` one).

**Firebase:** Console → Project settings → Service accounts → Generate new private
key. Save as `backend/service-account.json` locally (gitignored); paste its contents
into Railway's `FIREBASE_SERVICE_ACCOUNT`. Under Authentication → Sign-in method,
enable Email/Password and Google.

**Gemini:** <https://aistudio.google.com/apikey> → create a key.

### A5. Cost estimate — Path A

Rough monthly figures for `asia-south1`, on-demand. **Verify with the
[GCP pricing calculator](https://cloud.google.com/products/calculator)** — cloud
prices change and vary by region.

| Item | Monthly (USD) | Notes |
|---|---|---|
| GCP `e2-medium` (2 vCPU, 4GB) | ~$27–33 | Minimum viable for Judge0 |
| GCP `e2-standard-2` (2 vCPU, 8GB) | ~$55–65 | If a full class submits at once |
| 30 GB balanced persistent disk | ~$3–4 | |
| Static external IP | ~$3 | Charged whether attached or not |
| Network egress | ~$0.12/GB | Small for this workload |
| Railway Hobby | $5 | Includes $5 usage credit |
| Vercel Hobby | $0 | Free for non-commercial |
| Upstash | $0 | Free tier: 10k commands/day |
| Firebase Spark | $0 | 50k Firestore reads/day |
| Gemini | $0 → varies | Free tier, then per-token |
| **Total** | **~$38–48/mo** (small VM)<br>**~$66–77/mo** (larger VM) | ≈ ₹3,200–6,500/mo |

Two cost traps specific to your situation:
- **Free credits expire.** GCP's $300 trial credit lasts 90 days. When it runs out,
  billing starts — or the VM stops. This is a likely explanation for your current outage.
- **Firestore reads add up.** The free tier is 50k reads/day. An analytics dashboard
  that queries every submission can burn that fast. Upstash caching exists partly
  to blunt this.

---

## Part 3 — Path B: College server

### B1. What to ask the college for

Take this list to your HOD or IT department. These are the actual requirements —
nothing here is negotiable except the sizing.

**Hardware / VM:**
- A Linux VM or bare-metal box: **4 vCPU, 8 GB RAM, 100 GB disk** minimum
- Ubuntu 22.04 LTS or similar
- **`sudo` / root access** — non-negotiable, Judge0 needs privileged containers
- Permission to install and run **Docker**

**Network — this is the part IT will care about, so be precise:**
- **Outbound HTTPS (port 443) must be allowed.** That's all you strictly need if
  you use Cloudflare Tunnel (see below).
- You do **not** need a public IP, port forwarding, or inbound firewall holes.
  Say this explicitly — it removes IT's main objection.
- If they *will* give you a public IP and can open 443 inbound, that's simpler
  still, but don't lead with the ask.

**Operational:**
- Who administers the box, and can you get an account that survives semester resets?
- What's the uptime expectation? Is it powered down during holidays?
- Is it reimaged between terms?
- Is there a UPS / backup power?

Those last four questions decide whether this path is viable at all. A server that
gets wiped every semester is worse than a $30/mo VM.

### B2. The reachability problem, and how to solve it

Your backend runs on Railway (public cloud). A college server usually sits behind
campus NAT with no public IP. **Railway cannot dial into that.** This is the single
reason "just use the college server" plans fail.

**Cloudflare Tunnel solves it.** You run a small daemon (`cloudflared`) on the college
box. It makes an **outbound** connection to Cloudflare and holds it open. Cloudflare
gives you a public hostname that routes requests back down that tunnel.

- No public IP needed
- No inbound firewall rules
- No port forwarding
- Free TLS certificate included
- Free tier is generous

It also solves the TLS problem from Path A for free, and means port 2358 is never
exposed to anything.

**Setup:**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
cloudflared tunnel login
cloudflared tunnel create codementor
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-UUID>
credentials-file: /home/youruser/.cloudflared/<tunnel-UUID>.json

ingress:
  - hostname: judge0.yourdomain.com
    service: http://localhost:2358
  - hostname: api.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

```bash
cloudflared tunnel route dns codementor judge0.yourdomain.com
cloudflared tunnel route dns codementor api.yourdomain.com
sudo cloudflared service install
```

You need a domain on Cloudflare for this (a `.com` is ~₹900/yr; some registrars
do cheaper TLDs). This is the one unavoidable cost of Path B.

### B3. Deploying the stack

The repo already has a complete `docker-compose.yml` designed for exactly this.
Read the comments in it — it puts Judge0 on an isolated network with **no exposed
ports**, reachable only by the backend. That's a better security posture than your
current GCP setup.

```bash
git clone https://github.com/srinu6663/codementor.git
cd codementor
cp backend/.env.example backend/.env
nano backend/.env    # fill in every value
docker compose up -d --build
```

That brings up frontend, backend, Judge0 server, Judge0 worker, and Judge0's own
Postgres and Redis. Then point `cloudflared` at ports 3000 and 3001.

**Decide what stays in the cloud.** You have two sub-options:

| | Keep Firestore/Firebase | Go fully self-hosted |
|---|---|---|
| Effort | Zero — works as-is | Large — you'd need to replace Firestore and Firebase Auth entirely |
| Cost | Free at your scale | Free |
| Risk | Depends on Google | All yours |
| Recommendation | ✅ **Do this** | ❌ Not worth it |

Keep Firebase. It's free at your scale, it's already integrated, and rewriting the
data layer to Postgres would be weeks of work for no benefit.

### B4. The H100 angle

The H100 is **wasted on Judge0** — code execution is CPU-bound and won't touch the
GPU. But it unlocks something GCP never will at this price: **you can self-host the
AI tutor** and drop the Gemini dependency entirely.

You've already got an AI gateway abstraction in the backend, so swapping the
provider is a config change, not a rewrite. Serve a model with
[Ollama](https://ollama.com) or [vLLM](https://docs.vllm.ai), point the gateway at
it, and your per-token cost goes to zero. That's a genuine strategic advantage and
a good line in a project review.

Do this *after* the basic deployment works, not during.

### B5. Cost estimate — Path B

| Item | Monthly | Notes |
|---|---|---|
| Server hardware | ₹0 | College provides |
| Electricity | ₹0 to you | College absorbs it |
| Cloudflare Tunnel | ₹0 | Free tier |
| Domain name | ~₹75/mo | ~₹900/yr, amortised |
| Vercel (frontend) | ₹0 | Keep it here |
| Firebase / Upstash / Gemini | ₹0 | Free tiers |
| **Total** | **~₹75/mo (~$1)** | Essentially free |

The real cost of Path B isn't money — it's **your time and the reliability risk.**
Budget a weekend for the initial setup, and accept that when campus power fails or
IT reimages the box, the site goes down and you're the one fixing it.

---

## Part 4 — Head to head

| | Path A: Cloud | Path B: College server |
|---|---|---|
| **Monthly cost** | ~$38–77 (₹3,200–6,500) | ~$1 (₹75) |
| **Setup time** | Half a day | A weekend |
| **Reliability** | Google/Railway's problem | Campus power, network, IT |
| **Who fixes outages** | Mostly nobody — it self-heals | You, in person |
| **Public reachability** | Built in | Needs Cloudflare Tunnel |
| **Scaling for a big exam** | Change machine type, pay more | Limited by the hardware you have |
| **Root access** | Full | Shared, policy-constrained |
| **Self-hosted LLM** | No | ✅ Yes — the H100 |
| **Survives you graduating** | Only while someone pays | Only while IT cooperates |
| **Risk of silent death** | ⚠️ High — credits expire, VMs stop | ⚠️ Medium — reimaging, semester resets |

### Pros and cons, honestly

**Path A — Cloud**

*Pros:* works today; no IT permission needed; genuine uptime; scaling is a dropdown;
static IP and TLS are solved problems; nobody unplugs it to run a lab.

*Cons:* costs real money forever; free credits expire and take your site with them
(this already happened); you're one lapsed card away from an outage; egress and
Firestore reads can surprise you.

**Path B — College server**

*Pros:* effectively free; far more compute than you could afford to rent; the H100
enables a self-hosted AI tutor; the repo's `docker-compose.yml` already targets this
exact topology; better security model out of the box (Judge0 on an isolated network,
no exposed ports).

*Cons:* depends on campus power, network, and IT goodwill; you're the on-call
engineer; a semester reimage can wipe everything; needs Cloudflare Tunnel to be
reachable; if IT blocks outbound tunneling, the whole plan collapses.

### My recommendation

**College server for the long run, GCP as a stopgap — and don't migrate before your
next demo.**

Sequenced:

1. **Now (before any VC/HOD demo):** repair the GCP VM. Start it, reserve a static
   IP, update `JUDGE0_URL` in Railway. Do not re-architect with an evaluation
   pending — you'd trade a known-broken-but-fixable state for an unknown one.
2. **Next (after the demo):** stand up Judge0 on the college server behind
   Cloudflare Tunnel. Point Railway's `JUDGE0_URL` at the tunnel hostname. Run both
   in parallel for a few days, then decommission the GCP VM. Migration is *one
   environment variable*, so rollback is trivial — that's exactly why you move
   Judge0 first and everything else later.
3. **Later:** move the backend onto the college box too. Evaluate a self-hosted
   model for the AI tutor on the H100. Keep the frontend on Vercel permanently.

**The one thing that flips this:** if campus IT blocks outbound `cloudflared`, or
the server is reimaged each semester, stay on GCP and pay the ~$40/mo. Reliability
during evaluations is worth it. Get answers to the four operational questions in
§B1 *before* investing a weekend in the migration.

---

## Part 5 — Learning resources

I've given official documentation links (stable) and **search terms** for video
content rather than specific URLs, because video links rot and I'd rather send you
to a search that stays accurate than a dead link.

### Official docs — read these first

| Topic | Link |
|---|---|
| Judge0 | <https://github.com/judge0/judge0> and <https://ce.judge0.com/> |
| Docker — getting started | <https://docs.docker.com/get-started/> |
| Docker Compose | <https://docs.docker.com/compose/> |
| Cloudflare Tunnel | <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/> |
| GCP Compute Engine | <https://cloud.google.com/compute/docs> |
| GCP pricing calculator | <https://cloud.google.com/products/calculator> |
| Railway | <https://docs.railway.com/> |
| Vercel | <https://vercel.com/docs> |
| Next.js deployment | <https://nextjs.org/docs/app/building-your-application/deploying> |
| Firebase Admin SDK | <https://firebase.google.com/docs/admin/setup> |
| Firestore pricing | <https://firebase.google.com/docs/firestore/quotas> |
| Upstash | <https://upstash.com/docs/redis/overall/getstarted> |
| Caddy | <https://caddyserver.com/docs/> |
| JPlag | <https://github.com/jplag/JPlag> |

### Video search terms

Search these on YouTube — the top results are reliably good and stay current:

- `"Docker tutorial for beginners"` — **TechWorld with Nana** has the best
  single Docker crash course; watch this before anything else if Docker is new
- `"Docker Compose tutorial"`
- `"Cloudflare Tunnel tutorial self hosting"` — **NetworkChuck** and
  **Christian Lempa** both cover this well
- `"Google Cloud Compute Engine tutorial"`
- `"deploy Next.js to Vercel"`
- `"Judge0 self hosted setup"` — thinner coverage; the GitHub README is better
- `"Linux command line basics"` — if `ssh`, `nano`, and `systemctl` are unfamiliar,
  start here rather than with Docker

### Skills to build, in order

1. **Linux basics** — ssh, file editing, `systemctl`, reading logs
2. **Docker** — images vs containers, `docker compose up`, `docker logs`
3. **Networking concepts** — ports, DNS, what a reverse proxy does, what TLS is
4. **Then** the platform specifics above

Do not skip 1–3 to get to 4. Every deployment problem you'll hit is really a
problem in one of the first three.

---

## Part 6 — Operational runbook

Things you'll need repeatedly, once it's running.

### Health checks

```bash
curl -i https://your-backend/health
```

```bash
curl -i https://your-frontend/api/judge-health
```

A **401** on the second is success — it proves the request reached Express. A **404**
means the Vercel rewrite is misconfigured.

### When code execution breaks

`/api/submit` returning **503** means one of two things, and the response body tells
you which:

- `"queue_full": false` → **Judge0 is unreachable.** Check the VM is running and
  its IP hasn't changed.
- `"queue_full": true` → Judge0 is alive but saturated. Raise `MAX_QUEUE_SIZE` or
  add workers.

### When plagiarism breaks

A **503** with `JPlag JAR not found` means Railway built with Nixpacks instead of
the Dockerfile, or the JAR download silently failed. Check the build log.

### Known operational hazards in this codebase

1. **The rate limiter fails open.** If Upstash is unreachable or you exhaust the
   free tier's 10k commands/day, rate limiting silently stops. Combined with
   `POST /api/submit` accepting unauthenticated requests, that means unlimited
   anonymous code execution on your judge. Worth making the submit limiters fail
   *closed*.
2. **`trust proxy` is set to `1`** but your chain is Vercel edge → Railway edge →
   Express, which may be two hops. If `req.ip` resolves to infrastructure rather
   than the client, anonymous rate-limit buckets collapse together. Check Railway's
   morgan logs — if every request shows the same IP, bump it to `2`.
3. **Ephemeral IPs.** Always reserve static. This has already bitten you once.
4. **Build-time env vars.** `API_PROXY_TARGET` is baked into the Vercel build.
   Changing it needs a redeploy.

### Secrets checklist

Never commit these; they belong in platform dashboards only:

- `FIREBASE_SERVICE_ACCOUNT` / `service-account.json` — full admin, bypasses all
  Firestore rules
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `JUDGE0_AUTH_TOKEN`
- `GEMINI_API_KEY`
- `UPSTASH_REDIS_REST_TOKEN`

If any leaks: rotate it, deploy the new value, **then** revoke the old one — in that
order, or you take the site down.

---

## Appendix — Immediate next steps

1. Check GCP console: is the `judge0` VM running? What's its external IP?
2. Compare that IP to `JUDGE0_URL` in Railway's variables
3. If the VM is stopped: start it, **reserve a static IP**, update Railway
4. Verify: `curl -i https://your-frontend/api/judge-health` → expect 401
5. Ask your HOD the four operational questions in §B1
6. Update the root `README.md` — it describes an architecture that no longer exists
