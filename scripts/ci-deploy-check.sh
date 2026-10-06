#!/usr/bin/env bash
# Runs the production setup on this machine with images built by ci-build-images.sh and checks a
# blue-green deploy end to end, with the same deploy.sh the server runs:
#   1. deploy <tag> (blue), smoke test through nginx;
#   2. deploy the same images as a second version (green) while scripts/request-loop.sh runs:
#      no request may fail (AC26); smoke test of the new version.
# nginx runs on its temporary self-signed certificate, SITE_DOMAIN is localhost, ports 80 and 443
# must be free. Used by the `images` job in CI; runs locally the same way.
#
#   IMAGE_TAG=<tag> scripts/ci-deploy-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${IMAGE_TAG:?set IMAGE_TAG}"
second="$tag-next"
# The images just built on this machine, under their local names. The CI job sets IMAGE_REGISTRY for
# publishing; with it, deploy.sh would pull from the registry, where nothing is pushed before this
# check passes (and never from a pull request). On the server deploy.sh does pull from GHCR.
export IMAGE_REGISTRY=""
work="$(mktemp -d)"
env_file="$work/deploy.env"

group() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$*"; else echo "==> $*"; fi; }
endgroup() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }

# A throwaway environment. The request loop comes from one address, so the per-client limit is
# raised: this checks switching, not rate limiting.
cat > "$env_file" <<EOF
POSTGRES_USER=ai_fitting
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=ai_fitting
SITE_DOMAIN=localhost
THROTTLE_LIMIT=1000000
EOF

for app in api web; do
  docker tag "ai-fitting-$app:$tag" "ai-fitting-$app:$second"
done

group "deploy $tag (first deploy, blue)"
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$tag"
scripts/smoke-test.sh https://localhost "$tag"
endgroup

group "deploy $second (green) under a request loop"
scripts/request-loop.sh https://localhost > "$work/loop.out" 2>&1 &
loop=$!
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$second"
sleep 2
kill -TERM "$loop"
loop_status=0
wait "$loop" || loop_status=$?
cat "$work/loop.out"
scripts/smoke-test.sh https://localhost "$second"
endgroup

[ "$loop_status" -eq 0 ] || { echo "ci-deploy-check: requests failed during the switch" >&2; exit 1; }
echo "ci-deploy-check: ok"
