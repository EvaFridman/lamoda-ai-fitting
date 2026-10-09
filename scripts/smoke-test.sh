#!/usr/bin/env bash
# Checks a running site through its entry point (nginx): the page shows the greeting from the api,
# and the api reports the expected version. Used by CI after a deploy and by hand.
#
#   scripts/smoke-test.sh <base-url> [expected-version]     e.g. https://localhost a1b2c3d
#
# Certificates are not checked (-k): locally and in CI nginx runs on a self-signed one.
set -euo pipefail

base="${1:?usage: smoke-test.sh <base-url> [expected-version]}"
expected="${2:-}"

page="$(curl -sk --max-time 10 "$base/")"
grep -q 'Hello, world!' <<<"$page" || { echo "smoke: the page at $base/ has no greeting" >&2; exit 1; }

live="$(curl -sk --max-time 10 --fail "$base/api/health/live")" ||
  { echo "smoke: $base/api/health/live does not answer 200" >&2; exit 1; }
version="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' <<<"$live")"
if [ -n "$expected" ] && [ "$version" != "$expected" ]; then
  echo "smoke: $base reports version '$version', expected '$expected'" >&2
  exit 1
fi

# Only liveness is public: readiness stays closed however its path is spelled. --path-as-is, or
# curl itself would resolve the dot segments.
for path in /api/health/ready /api/health/ready/ /api/HEALTH/ready /api/health/ready%2F \
  /api/health//ready /api/%68ealth/ready /api/health/./ready /api/x/../health/ready; do
  status="$(curl -sk --max-time 10 --path-as-is -o /dev/null -w '%{http_code}' "$base$path")"
  if [ "$status" != 403 ]; then
    echo "smoke: $base$path answers $status, expected 403" >&2
    exit 1
  fi
done

echo "smoke: ok ($base, version $version)"
