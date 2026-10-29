#!/usr/bin/env bash
# End-to-end smoke test against a running API (pnpm dev/start in apps/api).
# Talks to the API directly, impersonating the web proxy with the shared secret.
# Usage: API_LOG=/tmp/api.log PROXY_SHARED_SECRET=... test/smoke.sh [api-url]
set -uo pipefail
API=${1:-http://localhost:4000}
SECRET=${PROXY_SHARED_SECRET:-dev-proxy-secret-change-me}
RUN=$(date +%s)
SLUG="smoke-$RUN"
OWNER="owner-$RUN@smoke.test"; STAFF="staff-$RUN@smoke.test"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
FAIL=0

# req <jar> <host> <method> <path> [json]  -> prints body, sets $CODE
req() {
  local jar=$1 host=$2 method=$3 path=$4 body=${5:-}
  CODE=$(curl -s -o "$TMP/out" -w '%{http_code}' -b "$jar" -c "$jar" -X "$method" "$API$path" \
    -H "x-ownlevel-proxy: $SECRET" -H "x-forwarded-host: $host" -H "origin: http://$host" \
    -H 'content-type: application/json' ${body:+-d "$body"})
  cat "$TMP/out"
}
check() { # check <name> <expected-code> ; uses $CODE and last body in $TMP/out
  if [ "$CODE" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (got $CODE, want $2): $(cat "$TMP/out")"; FAIL=1; fi
}
contains() { if grep -q "$2" "$TMP/out"; then echo "ok   $1"; else echo "FAIL $1: missing '$2' in $(cat "$TMP/out")"; FAIL=1; fi; }

PLAT=localhost; AGENCY="$SLUG.localhost:3100"
: > "$TMP/p"; : > "$TMP/a"; : > "$TMP/s"; : > "$TMP/x"

req $TMP/p $PLAT POST /api/auth/sign-up/email "{\"email\":\"$OWNER\",\"password\":\"password123\",\"name\":\"Owner\"}" >/dev/null; check "owner signs up on platform host" 200
req $TMP/p $PLAT GET /api/slugs/$SLUG >/dev/null; contains "slug is available" '"available":true'
req $TMP/p $PLAT POST /api/agencies "{\"name\":\"Smoke $RUN\",\"slug\":\"$SLUG\"}" >/dev/null; check "agency created" 201
req $TMP/p $PLAT GET /api/slugs/$SLUG >/dev/null; contains "slug now taken" '"available":false'
req $TMP/p $PLAT POST /api/agencies "{\"name\":\"Dup\",\"slug\":\"$SLUG\"}" >/dev/null; check "duplicate slug rejected" 409
req $TMP/p $AGENCY POST /api/agencies '{"name":"Nope"}' >/dev/null; check "agency signup blocked on agency host" 404

req $TMP/x $AGENCY GET /api/host >/dev/null; contains "agency host resolves with branding" '"kind":"agency"'
req $TMP/x "nope-$RUN.localhost" GET /api/host >/dev/null; check "unknown host is 404" 404
curl -s "$API/api/host" -H "x-forwarded-host: $AGENCY" > "$TMP/out"
contains "X-Forwarded-Host ignored without secret (still platform)" '"kind":"platform"'

# handoff: platform session -> one-time token -> agency session
OTT=$(req $TMP/p $PLAT GET /api/auth/one-time-token/generate | sed 's/.*"token":"\([^"]*\)".*/\1/')
req $TMP/a $AGENCY POST /api/auth/one-time-token/verify "{\"token\":\"$OTT\"}" >/dev/null; check "one-time token creates agency session" 200
req $TMP/x $AGENCY POST /api/auth/one-time-token/verify "{\"token\":\"$OTT\"}" >/dev/null; check "one-time token cannot be reused" 400
req $TMP/a $AGENCY GET /api/me >/dev/null; contains "owner sees agency on its host" 'agency_owner'

req $TMP/a $AGENCY PATCH /api/agency/branding '{"appName":"Smoke Hub","primaryColor":"#ff5500","clientLabel":"Account"}' >/dev/null; check "branding saved" 200
req $TMP/a $AGENCY PATCH /api/agency/branding '{"primaryColor":"red"}' >/dev/null; check "invalid color rejected" 400
req $TMP/x $AGENCY GET /api/host >/dev/null; contains "branding served publicly on host" 'Smoke Hub'

req $TMP/a $AGENCY POST /api/team/invitations "{\"email\":\"$STAFF\",\"role\":\"agency_user\"}" >/dev/null; check "invite sent" 201
# Dev email transport prints the link to the API console. Point API_LOG at that output (or set INVITE_TOKEN).
if [ -z "${INVITE_TOKEN:-}" ] && [ -n "${API_LOG:-}" ]; then
  sleep 1; INVITE_TOKEN=$(grep -o 'accept-invite?token=[A-Za-z0-9_-]*' "$API_LOG" | tail -1 | cut -d= -f2)
fi
[ -z "${INVITE_TOKEN:-}" ] && echo "skip invite acceptance steps (set API_LOG or INVITE_TOKEN)"
if [ -n "${INVITE_TOKEN:-}" ]; then
  req $TMP/x $AGENCY GET "/api/invitations/preview?token=$INVITE_TOKEN" >/dev/null; contains "invite preview" "$STAFF"
  req $TMP/x "other-$RUN.localhost" GET "/api/invitations/preview?token=$INVITE_TOKEN" >/dev/null; check "invite hidden on other host" 404
  req $TMP/s $AGENCY POST /api/auth/sign-up/email "{\"email\":\"$STAFF\",\"password\":\"password123\",\"name\":\"Staff\"}" >/dev/null; check "invitee signs up" 200
  req $TMP/s $AGENCY GET /api/team >/dev/null; check "invitee has no access before accepting" 403
  req $TMP/s $AGENCY POST /api/invitations/accept '{"token":"wrong"}' >/dev/null; check "bad token rejected" 404
  req $TMP/s $AGENCY POST /api/invitations/accept "{\"token\":\"$INVITE_TOKEN\"}" >/dev/null; check "invitation accepted" 200
  req $TMP/s $AGENCY POST /api/invitations/accept "{\"token\":\"$INVITE_TOKEN\"}" >/dev/null; check "invitation cannot be reused" 404
  req $TMP/s $AGENCY GET /api/team >/dev/null; contains "staff now sees the team" "$STAFF"
  req $TMP/s $AGENCY PATCH /api/agency/branding '{"appName":"x"}' >/dev/null; check "staff cannot edit branding" 403
  req $TMP/x $AGENCY POST /api/auth/request-password-reset "{\"email\":\"$STAFF\"}" >/dev/null; check "reset requested" 200
fi

echo; [ $FAIL = 0 ] && echo "ALL PASSED (agency: $SLUG)" || echo "SOME FAILED"
exit $FAIL
