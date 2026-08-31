#!/usr/bin/env bash
# ============================================================================
# GET /api/internal/permissions — LOCAL VERIFICATION
#
# The four resolution states were originally demonstrated by typing curl
# commands by hand against a dev server, with the fixture rows inserted as ad
# hoc SQL mid-session. That proved the endpoint worked once, on one machine,
# and left nothing behind that anyone could re-run.
#
# This script is the replacement. It seeds the fixture, calls the endpoint for
# every resolution state, and compares each answer to what the seed says it
# should be — so the output is PASS/FAIL lines, not JSON for a human to squint
# at. Nothing here is a deployment: local dev server, local database.
#
# Run (from the repo root, with the dev server already up):
#   npm run dev -w apps/quiktrack          # in another terminal
#   bash apps/quiktrack/docs/Quikpilot_docs/verify-permissions-endpoint.sh
#
# Env:
#   QUIKTRACK_URL   override the base URL (default http://localhost:3004)
#
# HOW TO READ IT
#   * every check prints PASS or FAIL with the value it compared
#   * the run exits non-zero if any check failed, so it is CI-shaped even
#     though nothing runs it in CI today
#   * a FAIL on sections 3-7 means the resolver disagrees with the fixture —
#     report it, do not patch resolvePermissions.ts to make it green
# ============================================================================

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BASE_URL="${QUIKTRACK_URL:-http://localhost:3004}"
ENDPOINT="$BASE_URL/api/internal/permissions"

FAILURES=0

# ── helpers ────────────────────────────────────────────────────────────────

# Read a dotted path out of a JSON document on stdin. Arrays are printed as a
# comma-joined string so they compare as plain scalars below. `node` rather
# than `jq` because jq is not installed on a stock Windows/Git-Bash box and
# node already is — this repo cannot run without it.
jget() {
  node -e '
    const raw = require("fs").readFileSync(0, "utf8");
    let doc;
    try { doc = JSON.parse(raw); } catch { console.log("<not-json>"); process.exit(0); }
    let v = doc;
    for (const k of process.argv[1].split(".")) {
      if (v === null || v === undefined) break;
      v = v[k];
    }
    if (v === undefined) console.log("<absent>");
    else if (v === null) console.log("<null>");
    else if (Array.isArray(v)) console.log(v.join(","));
    else console.log(String(v));
  ' "$1"
}

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf 'PASS  %-52s %s\n' "$label" "$actual"
  else
    printf 'FAIL  %-52s expected [%s] got [%s]\n' "$label" "$expected" "$actual"
    FAILURES=$((FAILURES + 1))
  fi
}

# Call the endpoint for one user, echoing the response body.
ask() {
  local user="$1" project="${2:-}"
  local url="$ENDPOINT?userId=$user&orgId=$ORG_ID"
  [ -n "$project" ] && url="$url&projectId=$project"
  curl -s -H "x-internal-secret: $SECRET" "$url"
}

# ── 0. prerequisites ───────────────────────────────────────────────────────

echo ''
echo '=== 0. prerequisites ==='

if [ ! -f "$APP_DIR/.env.local" ]; then
  echo "FAIL  apps/quiktrack/.env.local not found — nothing to read the secret from."
  exit 1
fi

# cut -d= -f2- keeps '=' inside the value; the tr calls strip surrounding
# quotes and any CRLF the file picked up on Windows.
SECRET="$(grep -m1 '^INTERNAL_AI_RUNTIME_SECRET=' "$APP_DIR/.env.local" \
  | cut -d= -f2- | tr -d '\r' | tr -d '"' | tr -d "'")"

if [ -z "$SECRET" ]; then
  echo "FAIL  INTERNAL_AI_RUNTIME_SECRET is unset or empty in .env.local."
  echo "      The route fails closed on an empty secret, so every check would 401."
  exit 1
fi
echo "PASS  INTERNAL_AI_RUNTIME_SECRET is set (${#SECRET} chars, value not printed)"

# The dev server must already be running — this script does not start it. A
# server that is down and one that is up but broken must not look alike, so
# probe for a response code rather than for a live TCP port.
PROBE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$ENDPOINT?userId=x&orgId=x")"
if [ "$PROBE" = "000" ]; then
  echo "FAIL  no dev server answering on $BASE_URL"
  echo "      start it with:  npm run dev -w apps/quiktrack"
  exit 1
fi
echo "PASS  dev server answering on $BASE_URL (unauthenticated probe → $PROBE)"

# ── 1. seed ────────────────────────────────────────────────────────────────

echo ''
echo '=== 1. seed the fixture (idempotent — safe to re-run) ==='

# stderr is deliberately NOT captured — it goes straight to the terminal so a
# Prisma stack trace stays readable, and cannot corrupt the JSON on stdout.
SEED="$(cd "$APP_DIR" && npm run --silent db:seed:permissions-demo -- --json)"
if [ $? -ne 0 ] || [ -z "$SEED" ]; then
  echo "FAIL  seed script did not complete (see its output above)"
  exit 1
fi

ORG_ID="$(printf '%s' "$SEED" | jget orgId)"
PROJECT_ID="$(printf '%s' "$SEED" | jget projectId)"
PROJECT_KEY="$(printf '%s' "$SEED" | jget projectKey)"
FALLBACK_GRANTS="$(printf '%s' "$SEED" | jget fallbackGrantKeys)"

U_ADMIN="$(printf '%s' "$SEED" | jget users.adminBypass.userId)"
U_SPACE="$(printf '%s' "$SEED" | jget users.spaceAdmin.userId)"
U_PROJ="$(printf '%s' "$SEED" | jget users.projectRole.userId)"
U_FALL_GRANTS="$(printf '%s' "$SEED" | jget users.orgFallbackGrants.userId)"
U_FALL_EMPTY="$(printf '%s' "$SEED" | jget users.orgFallbackEmpty.userId)"

if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "<absent>" ]; then
  echo "FAIL  could not read ids out of the seed output:"
  echo "$SEED"
  exit 1
fi
echo "PASS  seeded org $ORG_ID, project $PROJECT_ID ($PROJECT_KEY)"
echo "      fallback grants: $FALLBACK_GRANTS"

# ── 2-6. one section per resolution state ──────────────────────────────────

echo ''
echo '=== 2. admin_bypass — org-tier admin, list omitted ==='
R="$(ask "$U_ADMIN" "$PROJECT_ID")"
check "resolution" "admin_bypass" "$(printf '%s' "$R" | jget data.project.resolution)"
check "isAdmin" "true" "$(printf '%s' "$R" | jget data.isAdmin)"
check "permissions omitted, not empty" "<absent>" "$(printf '%s' "$R" | jget data.project.permissions)"

echo ''
echo '=== 3. space_admin — Space Admin project role, list omitted ==='
R="$(ask "$U_SPACE" "$PROJECT_ID")"
check "resolution" "space_admin" "$(printf '%s' "$R" | jget data.project.resolution)"
check "isAdmin" "false" "$(printf '%s' "$R" | jget data.isAdmin)"
check "permissions omitted, not empty" "<absent>" "$(printf '%s' "$R" | jget data.project.permissions)"

echo ''
echo '=== 4. project_role — the project role is authoritative ==='
R="$(ask "$U_PROJ" "$PROJECT_ID")"
check "resolution" "project_role" "$(printf '%s' "$R" | jget data.project.resolution)"
check "isMember" "true" "$(printf '%s' "$R" | jget data.project.isMember)"
# This user holds NO app-wide role, so an empty org answer next to a non-empty
# project answer is the proof that the project role was consulted on its own.
check "orgPermissions is empty" "" "$(printf '%s' "$R" | jget data.orgPermissions)"
PROJ_PERMS="$(printf '%s' "$R" | jget data.project.permissions)"
if [ -n "$PROJ_PERMS" ] && [ "$PROJ_PERMS" != "<absent>" ]; then
  printf 'PASS  %-52s %s\n' "project permissions are non-empty" "$(printf '%s' "$PROJ_PERMS" | awk -F, '{print NF}') grants"
else
  printf 'FAIL  %-52s got [%s]\n' "project permissions are non-empty" "$PROJ_PERMS"
  FAILURES=$((FAILURES + 1))
fi

echo ''
echo '=== 5. org_fallback with grants — EXACT set, not merely non-empty ==='
R="$(ask "$U_FALL_GRANTS" "$PROJECT_ID")"
check "resolution" "org_fallback" "$(printf '%s' "$R" | jget data.project.resolution)"
# Against the seed, not against itself: this is the check that would catch the
# resolver returning some other user's permissions, or the union of every role
# in the org. A non-empty assertion would pass in both those cases.
check "orgPermissions == seeded grant set" "$FALLBACK_GRANTS" \
  "$(printf '%s' "$R" | jget data.orgPermissions)"

# The project answer must be the same set minus app-wide-only resources. The
# expected value is computed from the response's OWN appWideOnlyResources
# rather than a hardcoded list — the contract says the consumer reads the split
# off the wire, so this checks the endpoint is self-consistent about it.
EXPECTED_PROJ="$(printf '%s' "$R" | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const appWideOnly = new Set(d.data.appWideOnlyResources);
  const seeded = process.argv[1] ? process.argv[1].split(",") : [];
  console.log(seeded.filter((k) => !appWideOnly.has(k.split(":")[0])).join(","));
' "$FALLBACK_GRANTS")"
check "project permissions == set minus app-wide-only" "$EXPECTED_PROJ" \
  "$(printf '%s' "$R" | jget data.project.permissions)"

if [ "$EXPECTED_PROJ" = "$FALLBACK_GRANTS" ]; then
  printf 'FAIL  %-52s %s\n' "the split is exercised at all" \
    "seed holds no app-wide-only grant — previous check is vacuous"
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS  %-52s %s\n' "the split is exercised at all" "org set is strictly larger"
fi

echo ''
echo '=== 6. org_fallback with no grants — EMPTY, and present ==='
R="$(ask "$U_FALL_EMPTY" "$PROJECT_ID")"
check "resolution" "org_fallback" "$(printf '%s' "$R" | jget data.project.resolution)"
check "orgPermissions is empty" "" "$(printf '%s' "$R" | jget data.orgPermissions)"
# Empty but PRESENT — the two bypass states omit the key, and the difference is
# the whole reason the resolution enum exists.
check "permissions present (empty, not omitted)" "" \
  "$(printf '%s' "$R" | jget data.project.permissions)"

# ── 7. auth ────────────────────────────────────────────────────────────────

echo ''
echo '=== 7. auth — the endpoint is closed without the shared secret ==='
NO_SECRET="$(curl -s -o /dev/null -w '%{http_code}' \
  "$ENDPOINT?userId=$U_ADMIN&orgId=$ORG_ID&projectId=$PROJECT_ID")"
check "no x-internal-secret header → 401" "401" "$NO_SECRET"

WRONG_SECRET="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "x-internal-secret: definitely-not-the-secret" \
  "$ENDPOINT?userId=$U_ADMIN&orgId=$ORG_ID&projectId=$PROJECT_ID")"
check "wrong x-internal-secret → 401" "401" "$WRONG_SECRET"

BODY="$(curl -s "$ENDPOINT?userId=$U_ADMIN&orgId=$ORG_ID")"
check "401 body leaks nothing but 'Unauthorized'" "Unauthorized" \
  "$(printf '%s' "$BODY" | jget error)"

# ── summary ────────────────────────────────────────────────────────────────

echo ''
echo '=== SUMMARY ==='
if [ "$FAILURES" -eq 0 ]; then
  echo 'PASS  every check passed'
  exit 0
fi
echo "FAIL  $FAILURES check(s) failed"
echo '      A failure here is a report, not a patch: §5 of the session doc puts'
echo '      changes to resolvePermissions.ts out of scope.'
exit 1
