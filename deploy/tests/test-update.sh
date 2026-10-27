#!/usr/bin/env bash
# Tests deploy/update.sh without Docker or a network: a throwaway origin and "server" checkout, and stand-ins for docker, curl and sleep.
#   bash deploy/tests/test-update.sh
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../update.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAILED=0
ok()   { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad()  { FAILED=$((FAILED + 1)); printf '  FAIL %s\n' "$1"; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; printf "       exit=%s
%s
" "${CODE:-?}" "$(printf "%s" "${OUT:-}" | sed "s/^/       | /" | head -30)"; fi; }

# ── stand-ins ──
BIN="$TMP/bin"; mkdir -p "$BIN"
CALLS="$TMP/docker-calls.log"
cat > "$BIN/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >> "$CALLS"
if [ "\$1" = "compose" ] && [ "\$2" = "version" ]; then exit 0; fi
if [ "\$1" = "compose" ] && [ "\$2" = "ps" ]; then echo "NAME  STATUS"; fi
exit 0
EOF
cat > "$BIN/curl" <<EOF
#!/usr/bin/env bash
[ -e "$TMP/FAIL_HEALTH" ] && exit 22
exit 0
EOF
printf '#!/usr/bin/env bash\nexit 0\n' > "$BIN/sleep"
chmod +x "$BIN/docker" "$BIN/curl" "$BIN/sleep"
export PATH="$BIN:$PATH"
export DEPLOY_WAIT_SECONDS=5

git config --global --get user.email >/dev/null 2>&1 || { export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t; }

# ── repositories ──
ORIGIN="$TMP/origin.git"; SEED="$TMP/seed"; SERVER="$TMP/server"
git init -q --bare -b main "$ORIGIN"
git init -q -b main "$SEED"
mkdir -p "$SEED/deploy"; cp "$SCRIPT" "$SEED/deploy/update.sh"
echo one > "$SEED/app.txt"
git -C "$SEED" add -A && git -C "$SEED" commit -q -m "first"
git -C "$SEED" remote add origin "$ORIGIN" && git -C "$SEED" push -q origin main

GOOD_ENV='NODE_ENV=production
JWT_SECRET=0123456789abcdef0123456789abcdef0123
JWT_REFRESH_SECRET=fedcba9876543210fedcba9876543210fedc
CORS_ORIGIN=https://exam.college.example
TRUST_PROXY=2
FIREBASE_SERVICE_ACCOUNT={"x":1}
NEXT_PUBLIC_FIREBASE_API_KEY=abc'

fresh_server() {
  rm -rf "$SERVER" "$CALLS" "$TMP/FAIL_HEALTH"; : > "$CALLS"
  git clone -q "$ORIGIN" "$SERVER"
  printf '%s\n' "$GOOD_ENV" > "$SERVER/.env"
}
publish() { echo "$1" >> "$SEED/app.txt"; git -C "$SEED" add -A; git -C "$SEED" commit -q -m "$1"; git -C "$SEED" push -q origin main; }
run() { OUT="$(cd "$SERVER" && bash deploy/update.sh "$@" 2>&1 < "${STDIN:-/dev/null}")"; CODE=$?; }
containers_touched() { grep -qE "build|up -d|down|restart" "$CALLS"; }
head_of() { git -C "$SERVER" rev-parse HEAD; }

echo "update.sh"

fresh_server
OLD="$(head_of)"
run --yes
check "up to date: exits 0, says so, touches no containers" '[ $CODE -eq 0 ] && echo "$OUT" | grep -q "Already up to date" && ! containers_touched'

publish "second change"
fresh_server_old="$OLD"
echo "scratch" >> "$SERVER/app.txt"
run --yes
check "a tracked file with local changes stops the update and names it" '[ $CODE -eq 1 ] && echo "$OUT" | grep -q "local changes" && [ "$(head_of)" = "$OLD" ]'
git -C "$SERVER" checkout -q -- app.txt

run --check
check "--check shows the new commit and changes nothing" '[ $CODE -eq 0 ] && echo "$OUT" | grep -q "second change" && echo "$OUT" | grep -q "Check only" && [ "$(head_of)" = "$OLD" ] && ! containers_touched'

printf '%s\n' "$GOOD_ENV" | sed 's/^JWT_SECRET=.*/JWT_SECRET=your_super_secret_jwt_key_change_this/' > "$SERVER/.env"
run --yes
check "an example JWT_SECRET in .env blocks the update before anything changes" '[ $CODE -eq 1 ] && echo "$OUT" | grep -q "must fix" && [ "$(head_of)" = "$OLD" ] && ! containers_touched'

printf '%s\n' "$GOOD_ENV" | sed 's/^TRUST_PROXY=.*/TRUST_PROXY=true/' > "$SERVER/.env"
run --yes
check "TRUST_PROXY=true is refused (it lets clients forge their address)" '[ $CODE -eq 1 ] && echo "$OUT" | grep -q "TRUST_PROXY must be a number"'

printf '%s\n' "$GOOD_ENV" | grep -v '^TRUST_PROXY=' > "$SERVER/.env"
run --check
check "a missing TRUST_PROXY is a warning, not a stop" '[ $CODE -eq 0 ] && echo "$OUT" | grep -q "TRUST_PROXY is not set"'
printf '%s\n' "$GOOD_ENV" > "$SERVER/.env"

STDIN="$TMP/no"; echo "n" > "$STDIN"
run
check "answering no cancels and changes nothing" '[ $CODE -eq 0 ] && echo "$OUT" | grep -q "Cancelled" && [ "$(head_of)" = "$OLD" ] && ! containers_touched'
unset STDIN

run --yes
NEWHEAD="$(git -C "$ORIGIN" rev-parse main)"
check "a good update fast-forwards to origin/main and exits 0" '[ $CODE -eq 0 ] && [ "$(head_of)" = "$NEWHEAD" ] && echo "$OUT" | grep -q "Updated to"'
check "it rebuilds the website and API and starts them, and never touches Judge0" 'grep -q "build backend frontend" "$CALLS" && grep -q " up -d" "$CALLS" && ! grep -qi judge0 "$CALLS"'
check "the build happens before the start" '[ "$(grep -n "build backend frontend" "$CALLS" | head -1 | cut -d: -f1)" -lt "$(grep -n " up -d" "$CALLS" | head -1 | cut -d: -f1)" ]'
check "it prints how to go back" 'echo "$OUT" | grep -q "rollback"'

# the site does not come up: the previous version must be restored
fresh_server
OLD="$(head_of)"
publish "broken change"
touch "$TMP/FAIL_HEALTH"
run --yes
check "if the site does not answer, it goes back to the previous commit and exits 1" '[ $CODE -eq 1 ] && [ "$(head_of)" = "$OLD" ] && echo "$OUT" | grep -q "previous version is running again\|does not answer either"'
check "the previous version is rebuilt (two builds in total)" '[ "$(grep -c "build backend frontend" "$CALLS")" -eq 2 ]'
rm -f "$TMP/FAIL_HEALTH"

# rollback command
fresh_server
FIRST="$(head_of)"
git -C "$SERVER" pull -q --ff-only origin main
run rollback "$FIRST"
check "rollback <commit> returns to that commit and rebuilds" '[ $CODE -eq 0 ] && [ "$(head_of)" = "$FIRST" ] && grep -q "build backend frontend" "$CALLS"'
run rollback
check "rollback without a commit explains the usage" '[ $CODE -ne 0 ] && echo "$OUT" | grep -q "Usage"'
run rollback deadbeef
check "rollback to an unknown commit is refused" '[ $CODE -ne 0 ] && echo "$OUT" | grep -q "not a commit"'

# a local commit that origin does not have must never be overwritten
fresh_server
publish "upstream change"
echo local >> "$SERVER/app.txt"; git -C "$SERVER" add -A; git -C "$SERVER" commit -q -m "local only"
LOCAL="$(head_of)"
run --yes
check "a diverged checkout is refused, not overwritten" '[ $CODE -eq 1 ] && echo "$OUT" | grep -q "cannot fast-forward" && [ "$(head_of)" = "$LOCAL" ]'

# wrong branch
fresh_server
git -C "$SERVER" checkout -q -b other
run --yes
check "being on another branch is refused" '[ $CODE -eq 1 ] && echo "$OUT" | grep -q "not .main."'

echo
echo "$PASS passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
