# College server setup — step by step

DRAFT. Written before we have seen the server, so every step marked **(check)** must be confirmed on the real machine first.
None of this has been run yet: Docker is not installed on the development PC, so the compose file has only been written, not tested.

Stack: nginx -> 4 API copies + 2 website copies -> local Redis -> Judge0. App data stays in Firebase Firestore for now.

## 0. What we need to know first
- Operating system and version (`lsb_release -a`). Ubuntu 22.04/24.04 assumed. **(check)**
- How we get in: SSH, remote desktop, or sitting at it. **(check)**
- Whether Docker is already installed (`docker --version`). **(check)**
- The address students will type (IP or name) and whether HTTPS is needed on day one.
- Whether the server can reach the internet (Firebase, Gemini, Docker image downloads). **(check)** It must reach Firebase.

## 1. Install Docker (Ubuntu)
Follow the official guide: https://docs.docker.com/engine/install/ubuntu/ (apt repository method), then:
```bash
sudo usermod -aG docker $USER      # log out and in again
docker compose version
```

## 2. Judge0 needs the older "cgroup v1" mode (Ubuntu 22.04+)
Judge0 1.13 will not run code under the new cgroup v2. **(check)** with `stat -fc %T /sys/fs/cgroup` — `cgroup2fs` means v2.
If v2: add `systemd.unified_cgroup_hierarchy=0` to `GRUB_CMDLINE_LINUX` in `/etc/default/grub`, run `sudo update-grub`, then `sudo reboot`.
Reboots the machine, so do it before anyone is using it.

## 3. Get the code and secrets
```bash
git clone https://github.com/admin-codementor/codementor.git && cd codementor
git checkout main
cp backend/.env.example .env
```
Fill `.env` (never paste its contents into chat). Besides the existing values, add:
- `SRH_TOKEN` — any long random string (`openssl rand -hex 32`)
- `JUDGE0_DB_PASSWORD` — another long random string
- `CORS_ORIGIN` — exactly the address students will open, e.g. `http://10.0.0.5`
- Firebase service-account key and the `NEXT_PUBLIC_FIREBASE_*` values, copied from the current working setup

## 4. Start
```bash
docker compose -f deploy/server/docker-compose.yml up -d --build
docker compose -f deploy/server/docker-compose.yml ps
```
All services should reach `healthy`. First build takes several minutes.

## 5. Check it works
```bash
curl -s http://localhost/health        # API answers through nginx
curl -sI http://localhost/login        # website answers
docker compose -f deploy/server/docker-compose.yml logs --tail 50 backend
```
Then open the address in a browser from another PC on the network, log in, and run one piece of code.

## 6. Firewall
```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```
Nothing else is open: Redis, Judge0 and the API replicas are only reachable inside Docker.

## 7. One-time backfill (after the app is running, never while an exam is live)
The fast dashboard, leaderboard and faculty tables read one small record per student. Until this has run once they use the old slow scan, so nothing is broken, just slower.
Needs Firestore billing (Blaze) switched on: it reads every submission once.
```bash
docker compose -f deploy/server/docker-compose.yml exec backend node scripts/backfill-student-stats.js          # look only, writes nothing
docker compose -f deploy/server/docker-compose.yml exec backend node scripts/backfill-student-stats.js --apply  # writes the records
```
Read what the first command prints before running the second.

## 8. Updating later
Do not update while an exam is running (open exam pages must claim their session again).
```bash
git pull origin main
docker compose -f deploy/server/docker-compose.yml up -d --build
docker compose -f deploy/server/docker-compose.yml restart nginx
```
To go back: `git checkout <earlier commit>` and run the same two compose commands.

## Known risks in this draft
- **Redis gateway (`srh`)**: a third-party image that makes local Redis look like Upstash. Must be tested with the rate limiter and cache before relying on it. Fallback: switch the backend to a normal Redis client (small code change).
- **Judge0 worker counts (8 + 8) and queue 2000** are estimates from the research. We confirm with the load test, not by guessing.
- **nginx reads the replica addresses at start**: after scaling the API up or down, restart nginx.
- **Firestore free plan** stops at 50,000 reads a day. Fine for the first copy and testing; not for a real exam.
- `deploy/update.sh` and the old `deploy/Caddyfile` still describe the single-container setup. They do not work with this stack: use section 8 here instead.
