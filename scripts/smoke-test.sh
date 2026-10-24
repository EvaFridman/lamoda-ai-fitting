#!/usr/bin/env bash
# Checks a running site through its entry point (nginx): `/` sends to the catalog, whose page has
# its heading and products from the api, a category page shows its name from the api, and the api
# reports the expected version. Used by CI after a deploy and by hand.
#
#   scripts/smoke-test.sh <base-url> [expected-version]     e.g. https://localhost a1b2c3d
#
# Certificates are not checked (-k): locally and in CI nginx runs on a self-signed one.
set -euo pipefail

base="${1:?usage: smoke-test.sh <base-url> [expected-version]}"
expected="${2:-}"

# A temporary redirect (spec 0014 O42); curl prints the Location resolved against the request.
root="$(curl -sk --max-time 10 -o /dev/null -w '%{http_code} %{redirect_url}' "$base/")"
[ "$root" = "307 $base/catalog" ] ||
  { echo "smoke: $base/ answers '$root', expected '307 $base/catalog'" >&2; exit 1; }
page="$(curl -sk --max-time 10 "$base/catalog")"
grep -q '<h1' <<<"$page" || { echo "smoke: the page at $base/catalog has no heading" >&2; exit 1; }
# A product card, rendered on the server from the api's first batch: any product, not one of the
# seed by name (spec 0014 O71).
grep -q '<article' <<<"$page" ||
  { echo "smoke: the page at $base/catalog shows no product from the api" >&2; exit 1; }
# A category's heading comes from the api through web too: the seed's "Платья", which the seed
# never renames (spec 0014 O69). The `<h1>` starts with it; the count or its placeholder follows
# inside (spec 0020 W26), and the breadcrumbs hold the name too, so only the heading's start counts.
page="$(curl -sk --max-time 10 "$base/catalog/dresses")"
grep -qE '<h1[^>]*>Платья' <<<"$page" ||
  { echo "smoke: the page at $base/catalog/dresses has no heading from the api" >&2; exit 1; }

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
