#!/usr/bin/env bash
# Update the Docker deployment on the server to the latest `main`, safely.
#
#   bash deploy/update.sh            check, ask, update, wait for the site to answer; roll back by itself if it does not
#   bash deploy/update.sh --check    look only: what would change, and is .env ready. Changes nothing.
#   bash deploy/update.sh --yes      do not ask for confirmation (the exam question is still printed)
#   bash deploy/update.sh rollback <commit>   go back to an earlier commit (printed at the start of every update)
#
# Run it from anywhere inside the repository on the server. Do NOT update while an exam is running: the site restarts for a minute or two
# and every open exam page has to claim its session again.
#
# What it does, in order: refuses to run on a dirty checkout; shows what is new; checks .env for settings the new code needs;
# asks; fast-forwards to origin/main; rebuilds the website and the API (Judge0 and its database are NOT touched); starts them;
# waits for the API and the website to answer; if they do not, goes back to the previous commit and rebuilds that.
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-main}"
API_URL="${DEPLOY_API_URL:-http://127.0.0.1:3001/health}"
WEB_URL="${DEPLOY_WEB_URL:-http://127.0.0.1:3000/login}"
WAIT_SECONDS="${DEPLOY_WAIT_SECONDS:-150}"

MODE="update"; ASSUME_YES=0; ROLLBACK_TO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --yes|-y) ASSUME_YES=1 ;;
    rollback) MODE="rollback"; shift; ROLLBACK_TO="${1:-}" ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)"; exit 2 ;;
  esac
  shift || true
done

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
LOG="$ROOT/deploy/deploy.log"

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nSTOP: %s\n' "$*" >&2; exit 1; }
note() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG" 2>/dev/null || true; }

# ── tools ──
command -v git >/dev/null || fail "git is not installed."
command -v docker >/dev/null || fail "docker is not installed or not on PATH."
if docker compose version >/dev/null 2>&1; then DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose"
else fail "Neither 'docker compose' nor 'docker-compose' is available."; fi
command -v curl >/dev/null || fail "curl is not installed."

# ── .env ──
# Reads KEY=value from .env without running it (a value may contain characters the shell would interpret).
env_get() { grep -E "^$1=" "$ROOT/.env" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true; }

ENV_ERRORS=0; ENV_WARNINGS=0
env_error() { printf '  [must fix] %s\n' "$*"; ENV_ERRORS=$((ENV_ERRORS + 1)); }
env_warn()  { printf '  [check]    %s\n' "$*"; ENV_WARNINGS=$((ENV_WARNINGS + 1)); }

check_env() {
  step "Checking .env"
  [ -f "$ROOT/.env" ] || { env_error ".env does not exist in $ROOT (copy .env.example and fill it in)"; return; }
  local jwt refresh cors trust nodeenv
  jwt="$(env_get JWT_SECRET)"; refresh="$(env_get JWT_REFRESH_SECRET)"
  if [ -z "$jwt" ] || printf '%s' "$jwt" | grep -qiE 'change_this|your_|secret_key_here|example'; then env_error "JWT_SECRET is missing or still the example text"
  elif [ "${#jwt}" -lt 32 ]; then env_error "JWT_SECRET is shorter than 32 characters"; fi
  if [ -z "$refresh" ] || printf '%s' "$refresh" | grep -qiE 'change_this|your_|here|example'; then env_error "JWT_REFRESH_SECRET is missing or still the example text"
  elif [ "${#refresh}" -lt 32 ]; then env_error "JWT_REFRESH_SECRET is shorter than 32 characters"; fi
  if [ -n "$jwt" ] && [ "$jwt" = "$refresh" ]; then env_error "JWT_SECRET and JWT_REFRESH_SECRET are the same; they must differ"; fi
  nodeenv="$(env_get NODE_ENV)"
  [ "$nodeenv" = "production" ] || env_warn "NODE_ENV is '${nodeenv:-unset}', not 'production'"
  cors="$(env_get CORS_ORIGIN)"
  if [ -z "$cors" ] || [ "$cors" = "*" ]; then env_warn "CORS_ORIGIN is ${cors:-unset}: set it to the address people open the site at"
  elif printf '%s' "$cors" | grep -q 'localhost' && [ "$nodeenv" = "production" ]; then env_warn "CORS_ORIGIN is '$cors' but NODE_ENV is production"; fi
  trust="$(env_get TRUST_PROXY)"
  if [ -z "$trust" ]; then env_warn "TRUST_PROXY is not set. It is how many proxies sit in front of the API (Caddy or a tunnel in front: 1 or 2). Wrong values mix up client IPs"
  elif printf '%s' "$trust" | grep -qiE '^(true|false)$'; then env_error "TRUST_PROXY must be a number or an address list, not true/false"; fi
  [ -n "$(env_get FIREBASE_SERVICE_ACCOUNT)" ] || [ -f "$ROOT/backend/service-account.json" ] || env_warn "No Firebase service account found (FIREBASE_SERVICE_ACCOUNT in .env, or backend/service-account.json)"
  [ -n "$(env_get SMTP_HOST)" ] || env_warn "SMTP_HOST is not set: students and admins will NOT be emailed when the server proves tampering in an exam (the evidence is still recorded)"
  [ -n "$(env_get NEXT_PUBLIC_FIREBASE_API_KEY)" ] || env_warn "NEXT_PUBLIC_FIREBASE_API_KEY is empty: the website is built with it, sign-in needs it"
  if [ "$ENV_ERRORS" -eq 0 ] && [ "$ENV_WARNINGS" -eq 0 ]; then say "  .env looks right."; fi
}

wait_healthy() {
  local waited=0
  say "Waiting up to ${WAIT_SECONDS}s for the API ($API_URL) and the website ($WEB_URL) to answer..."
  while [ "$waited" -lt "$WAIT_SECONDS" ]; do
    if curl -fsS -m 5 -o /dev/null "$API_URL" 2>/dev/null && curl -fsS -m 5 -o /dev/null "$WEB_URL" 2>/dev/null; then
      say "Both answer after ${waited}s."; return 0
    fi
    sleep 5; waited=$((waited + 5))
  done
  return 1
}

rebuild_and_start() {
  step "Rebuilding the website and the API (Judge0 is left alone)"
  $DC build backend frontend
  step "Starting"
  $DC up -d
}

# ── rollback mode ──
if [ "$MODE" = "rollback" ]; then
  [ -n "$ROLLBACK_TO" ] || fail "Usage: bash deploy/update.sh rollback <commit>"
  git cat-file -e "${ROLLBACK_TO}^{commit}" 2>/dev/null || fail "'$ROLLBACK_TO' is not a commit in this repository."
  [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "There are uncommitted changes to tracked files. Look at 'git status' first."
  step "Going back to $(git log -1 --format='%h %s' "$ROLLBACK_TO")"
  git checkout -q "$BRANCH"
  git reset -q --hard "$ROLLBACK_TO"
  rebuild_and_start
  wait_healthy && { note "rollback to $ROLLBACK_TO ok"; say "Rolled back and healthy."; exit 0; }
  note "rollback to $ROLLBACK_TO FAILED"; fail "Rolled back but the site does not answer. Run: $DC logs backend --tail 80"
fi

# ── update / check ──
step "Looking at the checkout"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { git status --short --untracked-files=no; fail "Tracked files have local changes (listed above). Commit or undo them first so nothing is lost."; }
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT_BRANCH" = "$BRANCH" ] || fail "On branch '$CURRENT_BRANCH', not '$BRANCH'. Run: git checkout $BRANCH"
OLD="$(git rev-parse HEAD)"
say "Now on: $(git log -1 --format='%h %s (%cd)' --date=short)"

step "Fetching origin/$BRANCH"
git fetch -q origin "$BRANCH"
NEW="$(git rev-parse "origin/$BRANCH")"
if [ "$OLD" = "$NEW" ]; then
  say "Already up to date."
  check_env
  [ "$MODE" = "check" ] && exit 0
  say "Nothing to update. (To rebuild anyway: $DC up --build -d)"; exit 0
fi
git merge-base --is-ancestor "$OLD" "$NEW" || fail "This checkout has commits that origin/$BRANCH does not (it cannot fast-forward). Do not force it; tell whoever maintains the code."
COUNT="$(git rev-list --count "$OLD..$NEW")"
say "$COUNT new commit(s):"
git log --format='  %h %s' "$OLD..$NEW" | head -n 25
[ "$COUNT" -le 25 ] || say "  ... and $((COUNT - 25)) more"
say "Files changed: $(git diff --name-only "$OLD" "$NEW" | wc -l | tr -d ' ')"

check_env
if [ "$MODE" = "check" ]; then say; say "Check only: nothing was changed."; exit 0; fi
[ "$ENV_ERRORS" -eq 0 ] || fail "Fix the [must fix] lines in .env above, then run this again."

step "Before you continue"
say "  - Is an exam running or about to start? The site restarts for a minute or two. Do NOT update during an exam."
say "  - If anything goes wrong this script goes back to $(git rev-parse --short "$OLD") by itself. To go back later: bash deploy/update.sh rollback $(git rev-parse --short "$OLD")"
if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'No exam is running. Update now? [y/N] '
  read -r ANSWER || ANSWER=""
  case "$ANSWER" in y|Y|yes|YES) ;; *) say "Cancelled. Nothing was changed."; exit 0 ;; esac
fi

note "update $OLD -> $NEW"
step "Updating the code"
git merge -q --ff-only "origin/$BRANCH"
say "Now on: $(git log -1 --format='%h %s')"

rebuild_and_start
if wait_healthy; then
  note "update ok $NEW"
  step "Done"
  $DC ps
  say; say "Updated to $(git rev-parse --short HEAD). Hard-refresh the browser (Ctrl+Shift+R) to load the new website."
  say "To go back if you notice a problem later: bash deploy/update.sh rollback $(git rev-parse --short "$OLD")"
  exit 0
fi

step "The site did not answer: going back to $(git rev-parse --short "$OLD")"
note "update $NEW FAILED health check; rolling back to $OLD"
$DC logs backend --tail 40 2>&1 || true
git reset -q --hard "$OLD"
rebuild_and_start
if wait_healthy; then
  note "rolled back to $OLD ok"
  fail "The update did not start cleanly, so the previous version is running again. Read the backend log above, fix it, and try again."
fi
note "rollback to $OLD FAILED"
fail "The update failed AND the previous version does not answer either. Run: $DC logs backend --tail 80  and $DC ps"
