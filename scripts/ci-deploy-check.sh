#!/usr/bin/env bash
# Runs the production setup on this machine with images built by ci-build-images.sh and checks a
# blue-green deploy end to end, with the same deploy.sh the server runs:
#   1. deploy <tag> (blue), smoke test through nginx; the seed loaded the demo catalog;
#   2. deploy the same images as a second version (green) while scripts/request-loop.sh runs:
#      no request may fail (AC26); smoke test of the new version; the second seed changed no
#      counts (spec 0002, AC11).
# nginx runs on its temporary self-signed certificate, SITE_DOMAIN is localhost, ports 80 and 443
# must be free. Used by the `images` job in CI; runs locally the same way. Outside CI it removes, on
# exit, the stacks it started with their volumes, and refuses to start next to an existing one
# (spec 0002, C25).
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
# A project name or file list from the caller's shell would override the names in the compose files:
# the check and the teardown would then act on another project, e.g. the development stack.
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES
work="$(mktemp -d)"
env_file="$work/deploy.env"

group() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$*"; else echo "==> $*"; fi; }
endgroup() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }

# Row counts of the catalog tables and users, one "table=count" pair per table, and the products
# that lack an image, a size or an attribute value.
counts() {
  docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T postgres \
    psql -U ai_fitting -d ai_fitting -tA -F= -c "
      SELECT 'categories', count(*) FROM categories UNION ALL
      SELECT 'brands', count(*) FROM brands UNION ALL
      SELECT 'products', count(*) FROM products UNION ALL
      SELECT 'product_images', count(*) FROM product_images UNION ALL
      SELECT 'product_variations', count(*) FROM product_variations UNION ALL
      SELECT 'attributes', count(*) FROM attributes UNION ALL
      SELECT 'attribute_values', count(*) FROM attribute_values UNION ALL
      SELECT 'product_attribute_values', count(*) FROM product_attribute_values UNION ALL
      SELECT 'users', count(*) FROM users UNION ALL
      SELECT 'products_incomplete', count(*) FROM products p
        WHERE NOT EXISTS (SELECT 1 FROM product_images x WHERE x.product_id = p.id)
          OR NOT EXISTS (SELECT 1 FROM product_variations x WHERE x.product_id = p.id)
          OR NOT EXISTS (SELECT 1 FROM product_attribute_values x WHERE x.product_id = p.id)"
}
count_of() { sed -n "s/^$1=//p" <<< "$2"; }

# A throwaway environment. The request loop comes from one address, so the per-client limit is
# raised: this checks switching, not rate limiting.
cat > "$env_file" <<EOF
POSTGRES_USER=ai_fitting
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=ai_fitting
SITE_DOMAIN=localhost
MEDIA_BASE_URL=https://localhost/media/
THROTTLE_LIMIT=1000000
EOF

# Outside CI: remove what this run starts, so the next run gets a fresh database. Only what it
# starts: an existing stack is an earlier run or a real deploy, and its volumes may hold data.
projects=(ai-fitting-infra ai-fitting-blue ai-fitting-green ai-fitting-worker)
teardown() {
  echo "==> removing the deploy check stacks"
  # A failed second deploy exits before the request loop is stopped.
  if [ -n "${loop:-}" ]; then kill -TERM "$loop" 2>/dev/null || true; fi
  for color in blue green; do
    COLOR="$color" IMAGE_TAG="$tag" docker compose -p "ai-fitting-$color" -f deploy/compose/app.yml \
      --env-file "$env_file" down --remove-orphans || true
  done
  IMAGE_TAG="$tag" docker compose -f deploy/compose/worker.yml --env-file "$env_file" down || true
  docker compose -f deploy/compose/infra.yml --env-file "$env_file" --profile server down --volumes \
    || true
  rm -f .deploy-state
  docker image rm "ai-fitting-api:$second" "ai-fitting-web:$second" > /dev/null || true
}
if [ -z "${GITHUB_ACTIONS:-}" ]; then
  # Each docker call on its own line, so a docker error stops the script instead of passing the check.
  for project in "${projects[@]}"; do
    containers="$(docker ps -aq --filter "label=com.docker.compose.project=$project")"
    volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$project")"
    if [ -n "$containers" ] || [ -n "$volumes" ]; then
      echo "ci-deploy-check: $project already exists (an earlier run or a real deploy); remove by hand" \
        "the containers and volumes labelled com.docker.compose.project=$project" >&2
      exit 1
    fi
  done
  if [ -e .deploy-state ]; then
    echo "ci-deploy-check: .deploy-state exists (an earlier run or a real deploy); remove it by hand" >&2
    exit 1
  fi
  trap teardown EXIT
fi

for app in api web; do
  docker tag "ai-fitting-$app:$tag" "ai-fitting-$app:$second"
done

group "deploy $tag (first deploy, blue)"
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$tag"
scripts/smoke-test.sh https://localhost "$tag"
first_counts="$(counts)"
echo "$first_counts"
# AC8: the demo catalog, every product complete, and no users.
[ "$(count_of categories "$first_counts")" -ge 5 ] && [ "$(count_of brands "$first_counts")" -ge 5 ] \
  && [ "$(count_of products "$first_counts")" -ge 30 ] && [ "$(count_of users "$first_counts")" -eq 0 ] \
  && [ "$(count_of products_incomplete "$first_counts")" -eq 0 ] \
  || { echo "ci-deploy-check: the seed did not load the demo catalog" >&2; exit 1; }
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
second_counts="$(counts)"
endgroup

[ "$loop_status" -eq 0 ] || { echo "ci-deploy-check: requests failed during the switch" >&2; exit 1; }
[ "$second_counts" = "$first_counts" ] || {
  printf 'ci-deploy-check: the second seed changed the counts:\n%s\n' "$second_counts" >&2
  exit 1
}
echo "ci-deploy-check: ok"
