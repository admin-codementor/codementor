# Updating the college server (Docker)

The site runs on the college computer with `docker compose` (website, API, Judge0 and its database). Updating means: get the latest `main`, rebuild the website and the API, start them, and check they answer. `deploy/update.sh` does all of that and goes back by itself if the site does not come up.

**Do not update while an exam is running or about to start.** The site restarts for a minute or two, and every open exam page has to claim its session again.

## The normal update

Run these in the project folder on the server.

```bash
bash deploy/update.sh --check
```
Shows what is new and whether `.env` is ready. Changes nothing. Read the `[must fix]` and `[check]` lines.

```bash
bash deploy/update.sh
```
Asks "No exam is running. Update now?", then updates, rebuilds, starts, and waits up to 150 seconds for the API and the website to answer. It prints the commit it came from.

If the site does not answer, it goes back to the previous commit, rebuilds that, and stops with an error. Read the backend log it prints, then tell whoever maintains the code.

## Going back later

```bash
bash deploy/update.sh rollback <commit>
```
The commit is printed at the end of every update (and in `deploy/deploy.log`). This rebuilds that version. Nothing in the database is changed by an update or a rollback: all data lives in Firebase.

## What the script refuses to do, and why

| It stops when | Reason |
|---|---|
| Tracked files have local changes | An update would otherwise overwrite them. Commit or undo them first. |
| You are not on `main` | The server should only run `main`. |
| The checkout has commits `main` does not | It cannot fast-forward; it never forces. Tell the maintainer. |
| `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing, still the example text, shorter than 32 characters, or the same as the other | Anyone could forge a login. |
| `TRUST_PROXY` is `true` or `false` | `true` lets any client forge its address. It must be a number (how many proxies are in front: Caddy or a tunnel is 1 or 2). |

It only warns (and asks you to look) when `NODE_ENV` is not `production`, `CORS_ORIGIN` is `*`, empty or `localhost` in production, `TRUST_PROXY` is not set, or the Firebase settings are missing.

## Settings the new code reads in `.env`

| Setting | Meaning |
|---|---|
| `TRUST_PROXY` | Number of proxies in front of the API. Wrong value mixes up client addresses (rate limits, exam network check). |
| `CORS_ORIGIN` | The address people open the site at. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Real secrets, different from each other. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional but wanted. Mail for exam integrity (to the student and the admins). Gmail with an app password, Brevo, or the college mail server all work. Without it nothing is emailed; the evidence is still recorded. |
| `APP_URL` | Optional. The site address used for the link in the admin mail (defaults to the first `CORS_ORIGIN`). |
| `KEEP_ALIVE_TIMEOUT_MS` | Optional. How long the API keeps an idle connection (default 65000). Leave it unless the proxy in front holds idle connections longer than that. |

## Checking by hand

```bash
docker compose ps
```
All services should say "Up".

```bash
curl http://localhost:3001/api/system-status
```
`"status":"ok"` means the API, the database and the code judge are all reachable. `"degraded"` means the judge is down (multiple-choice exams still work). `"down"` (HTTP 503) means the database is unreachable.

```bash
docker compose logs backend --tail 50
```

## Tested here, and not

`deploy/tests/test-update.sh` runs the real script against a throwaway git repository with stand-ins for `docker`, `curl` and `sleep` (18 checks: up to date, dirty checkout, bad `.env`, answering no, a good update, a failed health check that rolls back, rollback by commit, diverged checkout, wrong branch). It has **not** been run against real Docker on the college computer. The first real update should be done with `--check` first and with someone watching.
