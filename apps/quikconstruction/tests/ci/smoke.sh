#!/usr/bin/env bash
# QuikConstruction CI smoke — build, migrate, seed, test.
#
# Designed for GitHub Actions, GitLab CI, Jenkins — anywhere you can run
# bash. Fails fast and prints a clear summary so the broken step is
# obvious in the job log.
#
# Usage:
#   ./tests/ci/smoke.sh              # full suite
#   ./tests/ci/smoke.sh --skip-e2e   # just build + migrate + seed + API tests
#   ./tests/ci/smoke.sh --no-server  # tests only — server must already be up
#
# Exit code: 0 on success, non-zero with a clear "FAILED step: X" line on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$APP_DIR"

SKIP_E2E=0
NO_SERVER=0
for arg in "$@"; do
  case "$arg" in
    --skip-e2e) SKIP_E2E=1 ;;
    --no-server) NO_SERVER=1 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────
PASS="$(printf '\033[32m✓\033[0m')"
FAIL="$(printf '\033[31m✗\033[0m')"
BLUE="$(printf '\033[34m')"
RESET="$(printf '\033[0m')"

step() { printf "\n${BLUE}── %s ──${RESET}\n" "$*"; }
ok()   { printf "  %s %s\n" "$PASS" "$*"; }
die()  { printf "\n%s FAILED step: %s\n" "$FAIL" "$*"; exit 1; }

trap 'rc=$?; [ $rc -ne 0 ] && printf "\n%s smoke.sh exited with rc=%d\n" "$FAIL" "$rc"' EXIT

# ─── 1. Dependencies ──────────────────────────────────────────────────
step "1/6  Install dependencies"
if [ ! -d "node_modules" ]; then
  pnpm install --frozen-lockfile || die "pnpm install"
fi
ok "dependencies installed"

# ─── 2. Build ─────────────────────────────────────────────────────────
step "2/6  Next.js production build"
pnpm run build > .ci-build.log 2>&1 || {
  tail -40 .ci-build.log
  die "next build (see full log at .ci-build.log)"
}
ok "build passed"

# ─── 3. Database migrate + generate ───────────────────────────────────
step "3/6  Prisma generate + migrate"
# Only run against a real Postgres when DATABASE_URL points at one.
# For demo runs the app uses in-memory stores, so migrate is a no-op.
if [[ "${DATABASE_URL:-}" == postgresql://* ]]; then
  pnpm exec prisma generate || die "prisma generate"
  pnpm exec prisma migrate deploy || die "prisma migrate deploy"
  ok "migrations applied"
else
  printf "    (DATABASE_URL not set or non-postgres; skipping migrate)\n"
fi

# ─── 4. Seed ──────────────────────────────────────────────────────────
step "4/6  Seed reference data"
if [[ "${DATABASE_URL:-}" == postgresql://* ]]; then
  pnpm exec prisma db seed || die "prisma db seed"
  ok "seed applied"
else
  printf "    (skipped — no database configured)\n"
fi

# ─── 5. Start server (unless external) ────────────────────────────────
SERVER_PID=""
if [ $NO_SERVER -eq 0 ]; then
  step "5/6  Start app server on :3010"
  # Ensure no stale server
  if command -v lsof >/dev/null && lsof -i :3010 >/dev/null 2>&1; then
    die "port 3010 is already in use; pass --no-server or free it first"
  fi
  AUTH_DEMO_MODE=true STORAGE_DRIVER=local STORAGE_LOCAL_DIR=./.storage-ci \
    pnpm exec next start -p 3010 -H 127.0.0.1 > .ci-server.log 2>&1 &
  SERVER_PID=$!
  # Wait up to 60s for the server to accept connections
  for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:3010/api/me > /dev/null 2>&1; then
      ok "server ready (pid $SERVER_PID)"
      break
    fi
    sleep 1
    if [ $i -eq 60 ]; then
      tail -40 .ci-server.log
      die "server did not become ready within 60s"
    fi
  done
  trap 'rc=$?; [ -n "$SERVER_PID" ] && kill $SERVER_PID 2>/dev/null || true; [ $rc -ne 0 ] && printf "\n%s smoke.sh exited with rc=%d\n" "$FAIL" "$rc"' EXIT
else
  step "5/6  (server start skipped — --no-server)"
fi

# ─── 6. Tests ─────────────────────────────────────────────────────────
step "6/6  Run test suites"
export E2E_BASE_URL="http://127.0.0.1:3010"
export E2E_EXTERNAL_SERVER=1

# API integration tests — fast, no browser
pnpm exec playwright test tests/api --reporter=list --workers=1 || die "API integration tests"
ok "API integration tests passed"

if [ $SKIP_E2E -eq 0 ]; then
  pnpm exec playwright test tests/e2e --reporter=list --workers=1 || die "E2E tests"
  ok "E2E tests passed"
else
  printf "    (--skip-e2e: E2E suite skipped)\n"
fi

# ─── Summary ──────────────────────────────────────────────────────────
printf "\n${PASS} smoke.sh complete — all steps passed\n"
printf "Artifacts:\n"
printf "  - build log:  .ci-build.log\n"
printf "  - server log: .ci-server.log\n"
printf "  - playwright: tests/.artifacts/\n"
