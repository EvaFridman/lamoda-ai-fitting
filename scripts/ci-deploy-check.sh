#!/usr/bin/env bash
# Runs the production setup on this machine with images built by ci-build-images.sh and checks a
# blue-green deploy end to end, with the same deploy.sh the server runs:
#   1. deploy <tag> (blue), smoke test through nginx; the seed loaded the demo catalog; nginx's
#      request id is on the response and on nginx's and the api's log lines (spec 0006 AC14);
#   2. deploy the same images as a second version (green) while scripts/request-loop.sh runs:
#      no request may fail (AC26); smoke test of the new version; the second seed changed no
#      counts (spec 0002, AC11);
#   3. rotate PROXY_SECRET in two deploys (spec 0006 F21), with a failed one in between:
#      a. set PROXY_SECRET_NEXT and roll back to <tag>, still running in blue: deploy.sh recreates
#         it, so it accepts the next secret too;
#      b. make the next secret PROXY_SECRET and deploy an image whose seed fails: nginx is
#         recreated with the new secret, the deploy fails, and blue still trusts nginx and web;
#      c. a third secret, unknown to blue, is refused by deploy.sh before nginx is recreated;
#      d. deploy <tag>-next (green) with the new secret only.
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
broken="$tag-broken"
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

# AC14 (spec 0006 F10): a request to <path> that sends its own X-Request-Id gets exactly one back,
# nginx's (32 hex characters), and that id is on nginx's and the api's log lines. Through `/` the
# api's line is web's call to the api, so it checks the proxy secret web sends as well.
check_request_id() {
  local path="$1" color="$2" ids id i nginx_log api_log
  ids="$(curl -sk --max-time 10 -o /dev/null -D - -H 'X-Request-Id: chosen-by-the-client' \
    "https://localhost$path" | tr -d '\r' | awk -F': ' 'tolower($1) == "x-request-id" { print $2 }')" \
    || { echo "ci-deploy-check: $path: the request failed" >&2; return 1; }
  [ "$(wc -l <<< "$ids")" -eq 1 ] && [[ "$ids" =~ ^[0-9a-f]{32}$ ]] \
    || { echo "ci-deploy-check: $path answers X-Request-Id '$ids', expected one from nginx" >&2; return 1; }
  id="$ids"
  # Log lines are written after the response. Read whole, not piped into grep -q: under pipefail
  # the writer's SIGPIPE would fail the check.
  for i in 1 2 3 4 5; do
    nginx_log="$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" logs nginx 2>&1)"
    api_log="$(docker logs "ai-fitting-$color-api-1" 2>&1)"
    # The api's own id ("req":{"id":...}), not the x-request-id header it also logs: an untrusted
    # request has nginx's id only in the header.
    grep -qF "request_id=$id" <<< "$nginx_log" && grep -qF "\"id\":\"$id\"" <<< "$api_log" \
      && { echo "request id $id of $path is on nginx's and the api's log lines"; return 0; }
    sleep 1
  done
  echo "ci-deploy-check: request id $id of $path is missing from nginx's or the api's log" >&2
  return 1
}

# A throwaway environment. The request loop comes from one address, so the per-client limit is
# raised: this checks switching, not rate limiting.
cat > "$env_file" <<EOF
POSTGRES_USER=ai_fitting
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=ai_fitting
SITE_DOMAIN=localhost
MEDIA_BASE_URL=https://localhost/media/
THROTTLE_LIMIT=1000000
PROXY_SECRET=$(openssl rand -hex 32)
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
  docker image rm "ai-fitting-api:$second" "ai-fitting-web:$second" "ai-fitting-api:$broken" \
    "ai-fitting-web:$broken" > /dev/null 2>&1 || true
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
# /api/hello, not /api/health/live: the api does not log health checks.
check_request_id /api/hello blue
check_request_id / blue
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

# Sets the proxy secrets in the env file, as CD writes them from GitHub.
set_proxy_secrets() {
  grep -v -e '^PROXY_SECRET=' -e '^PROXY_SECRET_NEXT=' "$env_file" > "$work/rotated.env"
  printf 'PROXY_SECRET=%s\nPROXY_SECRET_NEXT=%s\n' "$1" "$2" >> "$work/rotated.env"
  cp "$work/rotated.env" "$env_file"
}
old_secret="$(sed -n 's/^PROXY_SECRET=//p' "$env_file")"
new_secret="$(openssl rand -hex 32)"

group "rotation, deploy 1: PROXY_SECRET_NEXT set, roll back to $tag (blue, still running)"
set_proxy_secrets "$old_secret" "$new_secret"
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$tag"
scripts/smoke-test.sh https://localhost "$tag"
check_request_id /api/hello blue
check_request_id / blue
endgroup

group "rotation, deploy 2 fails: PROXY_SECRET is the new one, the seed of $broken fails"
# The api image of <tag> with a seed that exits with 1: the deploy stops after nginx was recreated
# with the new secret, before the switch, and leaves the database as it was.
docker build -q -t "ai-fitting-api:$broken" - > /dev/null <<EOF
FROM ai-fitting-api:$tag
USER root
RUN echo 'process.exit(1);' > dist/seed/main.js
USER node
EOF
docker tag "ai-fitting-web:$tag" "ai-fitting-web:$broken"
set_proxy_secrets "$new_secret" ""
if ENV_FILE="$env_file" deploy/scripts/deploy.sh "$broken"; then
  echo "ci-deploy-check: the deploy of $broken was expected to fail" >&2
  exit 1
fi
# nginx sends the new secret now, or the checks below would only show that blue trusts the old one.
# Compared, never printed.
[ "$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T nginx \
  printenv PROXY_SECRET)" = "$new_secret" ] \
  || { echo "ci-deploy-check: nginx was not recreated with the new PROXY_SECRET" >&2; exit 1; }
# blue keeps serving, started with the old secret and the new one as PROXY_SECRET_NEXT: it trusts
# nginx (the new secret, /api/hello) and its own web (the old one, /).
scripts/smoke-test.sh https://localhost "$tag"
check_request_id /api/hello blue
check_request_id / blue
endgroup

group "a secret blue does not accept is refused before nginx is recreated"
set_proxy_secrets "$(openssl rand -hex 32)" ""
if ENV_FILE="$env_file" deploy/scripts/deploy.sh "$second" 2> "$work/refused.err"; then
  echo "ci-deploy-check: a PROXY_SECRET the running copy does not accept was deployed" >&2
  exit 1
fi
cat "$work/refused.err" >&2
grep -qF 'does not accept the new PROXY_SECRET' "$work/refused.err" \
  || { echo "ci-deploy-check: the deploy failed, but not for the unaccepted secret" >&2; exit 1; }
[ "$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T nginx \
  printenv PROXY_SECRET)" = "$new_secret" ] \
  || { echo "ci-deploy-check: nginx was recreated with a secret blue does not accept" >&2; exit 1; }
scripts/smoke-test.sh https://localhost "$tag"
check_request_id /api/hello blue
endgroup

group "rotation, deploy 2 again: $second (green) with the new secret only"
set_proxy_secrets "$new_secret" ""
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$second"
scripts/smoke-test.sh https://localhost "$second"
check_request_id /api/hello green
check_request_id / green
endgroup

echo "ci-deploy-check: ok"
