#!/usr/bin/env bash
# Sends requests to a site without pause until stopped (SIGTERM/SIGINT), alternating a category page
# of the demo catalog and /api/health/live, then reports how many failed. Run it around a deploy to
# check that no request fails while versions switch (AC26). The page counts as failed unless it
# shows the category's heading and a product card, both read from the api: a 200 carrying the
# error state (e.g. the api refusing web) is a failure too (spec 0014 O71).
#
#   scripts/request-loop.sh <base-url> & pid=$!; ...deploy...; kill $pid; wait $pid
#
# REQUEST_LOOP_PAUSE (seconds, default 0) waits between rounds. Against production, where reads
# from one address are rate limited (300 a minute per route), 0.7 keeps the page under the limit.
#
# Exit 0 if every response was 200, 1 otherwise. Certificates are not checked (-k).
set -uo pipefail

base="${1:?usage: request-loop.sh <base-url>}"
# The seed's category "Платья"; the seed never renames a category it finds (spec 0014 plan §3.7).
page=/catalog/dresses
total=0
failed=0
statuses=""

body="$(mktemp)"
timings="$(mktemp)"
trap 'rm -f "$body" "$timings"' EXIT

report() {
  echo "request-loop: $total requests, $failed failed${statuses:+ (non-200:$statuses)}"
  # The slowest requests and when they started: compare with the deploy log's timestamps.
  echo "request-loop: slowest: $(sort -rn "$timings" | head -5 | tr '\n' ' ')"
  [ "$failed" -eq 0 ]
  exit $?
}
trap report TERM INT

while :; do
  for path in "$page" /api/health/live; do
    started="$(date -u +%H:%M:%S)"
    result="$(curl -sk -o "$body" --max-time 5 -w '%{http_code} %{time_total}' "$base$path")"
    curl_exit=$?
    code="${result% *}"
    echo "${result#* }s$path@$started" >> "$timings"
    if [ "$code" = 200 ] && [ "$path" = "$page" ]; then
      # The heading's start, as smoke-test.sh checks it (spec 0020 W26).
      if ! grep -qE '<h1[^>]*>Платья' "$body"; then
        code=200-without-heading
      elif ! grep -q '<article' "$body"; then
        code=200-without-products
      fi
    fi
    total=$((total + 1))
    if [ "$code" != 200 ]; then
      failed=$((failed + 1))
      # curl's exit code tells why there was no answer: 7 refused, 28 timeout, 52 empty reply,
      # 56 connection reset, 35 TLS handshake.
      statuses="$statuses $code$path@$started(curl $curl_exit)"
    fi
  done
  # In the background, so SIGTERM is handled at once instead of after the pause.
  sleep "${REQUEST_LOOP_PAUSE:-0}" &
  wait $!
done
