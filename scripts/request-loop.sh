#!/usr/bin/env bash
# Sends requests to a site without pause until stopped (SIGTERM/SIGINT), alternating the page and
# /api/health/live, then reports how many failed. Run it around a deploy to check that no request
# fails while versions switch (AC26). The page counts as failed unless it shows the greeting: a 200
# carrying the error state (e.g. the api refusing web) is a failure too.
#
#   scripts/request-loop.sh <base-url> & pid=$!; ...deploy...; kill $pid; wait $pid
#
# Exit 0 if every response was 200, 1 otherwise. Certificates are not checked (-k).
set -uo pipefail

base="${1:?usage: request-loop.sh <base-url>}"
total=0
failed=0
statuses=""

report() {
  echo "request-loop: $total requests, $failed failed${statuses:+ (non-200:$statuses)}"
  [ "$failed" -eq 0 ]
  exit $?
}
trap report TERM INT

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

while :; do
  for path in / /api/health/live; do
    code="$(curl -sk -o "$body" --max-time 5 -w '%{http_code}' "$base$path" || true)"
    if [ "$code" = 200 ] && [ "$path" = / ] && ! grep -q 'Hello, world!' "$body"; then
      code=200-without-greeting
    fi
    total=$((total + 1))
    if [ "$code" != 200 ]; then
      failed=$((failed + 1))
      statuses="$statuses $code$path"
    fi
  done
done
