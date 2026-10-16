#!/usr/bin/env bash
# Runs the production setup on this machine with images built by ci-build-images.sh and checks a
# blue-green deploy end to end, with the same deploy.sh the server runs:
#   1. deploy <tag> (blue), smoke test through nginx; the seed loaded the demo catalog; nginx's
#      request id is on the response and on nginx's and the api's log lines (spec 0006 AC14);
#      nginx's security headers on api and web and on nginx's own errors (AC13);
#      nginx's limits per address: a flood, a 2 MB body, an 11th socket (AC10–AC12), a 51st request
#      in progress and an unfinished header (F36);
#   2. deploy the same images as a second version (green) while scripts/request-loop.sh runs:
#      no request may fail (AC26); smoke test of the new version; the second seed changed no
#      counts (spec 0002, AC11);
#   3. rotate PROXY_SECRET in two deploys (spec 0006 F21), with a failed one in between:
#      a. set PROXY_SECRET_NEXT and roll back to <tag>, still running in blue: deploy.sh recreates
#         it, so it accepts the next secret too;
#      b. make the next secret PROXY_SECRET and deploy an image whose seed fails: nginx is
#         recreated with the new secret, the deploy fails, and blue still trusts nginx and web;
#      c. a third secret, unknown to blue, is refused by deploy.sh before nginx is recreated;
#      d. deploy <tag>-next (green) with the new secret only;
#   4. with the serving api stopped, /api/ answers 503 in the api's format (F33).
# nginx runs on its temporary self-signed certificate, SITE_DOMAIN is localhost, ports 80 and 443
# must be free. A SeaweedFS container (spec 0011 M12, the image of docker-compose.yml's `s3`) on the
# network `ai-fitting`, named `s3` there, stands in for the production storage with throwaway keys. Used by the `images` job in CI; runs locally the same way. Outside CI it removes, on
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

# AC13 (spec 0006 F9): nginx's security headers, as curl's -w prints them with $security_w (a
# repeated header prints as "a, b" and fails the match). check_security_headers reads the whole
# header instead and wants each exactly once; not for /_next/image or Swagger's static files, which
# add a CSP of their own.
security_w='%header{x-content-type-options}|%header{content-security-policy}|%header{referrer-policy}'
security="nosniff|frame-ancestors 'none'|strict-origin-when-cross-origin"
check_security_headers() {
  local path="$1" headers name expected got
  headers="$(curl -sk --max-time 10 -o /dev/null -D - "https://localhost$path" | tr -d '\r')" \
    || { echo "ci-deploy-check: $path: the request failed" >&2; return 1; }
  for name in x-content-type-options content-security-policy referrer-policy; do
    case "$name" in
      x-content-type-options) expected=nosniff ;;
      content-security-policy) expected="frame-ancestors 'none'" ;;
      referrer-policy) expected=strict-origin-when-cross-origin ;;
    esac
    got="$(awk -F': ' -v n="$name" 'tolower($1) == n { print $2 }' <<< "$headers")"
    [ "$got" = "$expected" ] \
      || { echo "ci-deploy-check: $path answers $name '$got', expected one '$expected'" >&2; return 1; }
  done
  echo "$path carries the security headers once"
}

# Runs a command in the nginx container. Its curl reaches nginx from 127.0.0.1, another address
# than this machine's, so one address can be over nginx's limits while this machine is served.
in_nginx() { docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T nginx "$@"; }
# The parts of a curl call to nginx from inside its container.
inner='curl -sk --resolve localhost:443:127.0.0.1'
# A WebSocket handshake by hand: curl's own ws:// support is not in every build. The key is any
# 16 random bytes in base64.
socket_url='https://localhost/socket.io/?EIO=4&transport=websocket'
socket_headers="-H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: $(openssl rand -base64 16)'"

# Fails unless "<status> <content type>" is <expected> and the body file holds the error code.
expect_error() {
  local what="$1" got="$2" expected="$3" body="$4" code="$5"
  [ "$got" = "$expected" ] && grep -qF "{\"error\":{\"code\":\"$code\"" <<< "$body" \
    || { echo "ci-deploy-check: $what answers '$got' $body, expected $expected with $code" >&2; return 1; }
  echo "$what answers $expected $code"
}

# AC10: a flood of requests at once from one address (100, or 200 to liveness) gets nginx's 429 in
# the api's format past the burst (40 on /api/, 100 on liveness). Unknown routes, broken JSON and
# liveness: the api's own limit never counts them, so every 429 here is nginx's.
# At most 40 at once: past 50 in progress the connection limit (edge_conns) would answer the same
# 429, so nginx's log must show the request zone <zone> refusing them.
nginx_log_count() {
  docker compose -f deploy/compose/infra.yml --env-file "$env_file" logs nginx 2>&1 \
    | grep -c "$1" || true
}
check_flood() {
  local what="$1" request="$2" zone="$3" total="${4:-100}" out n429 json429 bodies bare before after conns
  before="$(nginx_log_count "limiting requests.* by zone \"$zone\"")"
  conns="$(nginx_log_count 'limiting connections by zone "edge_conns"')"
  # A transfer that fails shows in the counts, so curl's exit code is ignored.
  out="$(in_nginx sh -c "rm -rf /tmp/flood && $inner --parallel --parallel-immediate \
    --parallel-max 40 --create-dirs -o '/tmp/flood/#1' \
    -w '%{http_code} %{content_type} $security_w\n' $request; true")"
  after="$(nginx_log_count "limiting requests.* by zone \"$zone\"")"
  [ "$after" -gt "$before" ] \
    && [ "$(nginx_log_count 'limiting connections by zone "edge_conns"')" -eq "$conns" ] \
    || { echo "ci-deploy-check: a flood of $what was not refused by the zone $zone alone" >&2; return 1; }
  n429="$(grep -c '^429 ' <<< "$out" || true)"
  json429="$(grep -c '^429 application/json ' <<< "$out" || true)"
  bodies="$(in_nginx sh -c "grep -lF '{\"error\":{\"code\":\"TOO_MANY_REQUESTS\"' /tmp/flood/* | wc -l")"
  # AC13: the api's answers and nginx's 429 alike (a failed transfer, 000, has no headers).
  bare="$(grep -v '^000 ' <<< "$out" | grep -vcF " $security" || true)"
  [ "$n429" -gt 0 ] && [ "$json429" -eq "$n429" ] && [ "$bodies" -eq "$n429" ] && [ "$bare" -eq 0 ] || {
    printf 'ci-deploy-check: a flood of %s: %s of %s answered 429, %s as JSON, %s with the code, %s without the security headers:\n%s\n' \
      "$what" "$n429" "$total" "$json429" "$bodies" "$bare" "$(sort <<< "$out" | uniq -c)" >&2
    return 1
  }
  echo "a flood of $what: $n429 of $total answered nginx's 429 in the api's format, all with the security headers"
}

check_edge_limits() {
  local i status got holders held
  check_flood "unknown routes" "'https://localhost/api/no-such-route-[1-100]'" edge_api
  check_flood "broken JSON" \
    "-X POST -H 'Content-Type: application/json' -d '{' 'https://localhost/api/products?n=[1-100]'" \
    edge_api
  check_flood "liveness" "'https://localhost/api/health/live?n=[1-200]'" edge_health 200
  # The flooding address is over its limit; a visitor at a normal pace from this machine is served.
  for i in 1 2 3 4 5; do
    status="$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' https://localhost/api/hello \
      || true)"
    [ "$status" = 200 ] \
      || { echo "ci-deploy-check: after the flood, another address got $status from /api/hello" >&2; return 1; }
    sleep 0.2
  done
  echo "another address is served after the flood"

  # AC11: a body over 1 MB answers nginx's 413 in the api's format.
  got="$(head -c 2097152 /dev/zero | tr '\0' a | curl -sk --max-time 10 -o "$work/413.json" \
    -w "%{http_code} %{content_type} $security_w" -H 'Content-Type: application/json' \
    --data-binary @- https://localhost/api/products || true)"
  expect_error "a 2 MB body" "$got" "413 application/json $security" "$(cat "$work/413.json")" \
    PAYLOAD_TOO_LARGE

  # AC12: one address holds 10 sockets; the 11th is refused with 429 in the api's format while
  # another address still connects. curl waits for a body that never comes after 101, so a holder
  # keeps its socket until it is killed below (or its 60 s run out). Each holder writes its response
  # headers (-D) as soon as they arrive.
  in_nginx sh -c "rm -rf /tmp/sockets && mkdir /tmp/sockets && for i in \$(seq 10); do
      $inner $socket_headers --max-time 60 -o /dev/null -D /tmp/sockets/\$i '$socket_url' &
    done; wait; true" &
  holders=$!
  for i in $(seq 20); do
    held="$(in_nginx sh -c "grep -l '^HTTP/1.1 101' /tmp/sockets/* 2> /dev/null | wc -l")"
    [ "$held" -eq 10 ] && break
    sleep 0.5
  done
  [ "$held" -eq 10 ] \
    || { echo "ci-deploy-check: only $held of 10 sockets from one address connected" >&2; return 1; }
  got="$(in_nginx sh -c "$inner $socket_headers --max-time 2 -o /tmp/socket-11 \
    -w '%{http_code} %{content_type} $security_w' '$socket_url'; true")"
  expect_error "an 11th socket from one address" "$got" "429 application/json $security" \
    "$(in_nginx cat /tmp/socket-11)" TOO_MANY_REQUESTS
  status="$(eval "curl -sk $socket_headers --max-time 2 -o /dev/null -w '%{http_code}' '$socket_url'" || true)"
  [ "$status" = 101 ] \
    || { echo "ci-deploy-check: a socket from another address got $status, expected 101" >&2; return 1; }
  echo "one address holds 10 sockets, its 11th is refused, another address connects"
  # The holders are the only curl processes in the nginx container.
  in_nginx pkill curl || true
  wait "$holders" || true
  # /api/ strips its prefix: socket.io behind it would escape the socket limits.
  got="$(curl -sk --max-time 10 -o "$work/404.json" -w "%{http_code} %{content_type} $security_w" \
    'https://localhost/api/socket.io/?EIO=4&transport=polling' || true)"
  expect_error "socket.io under /api/" "$got" "404 application/json $security" \
    "$(cat "$work/404.json")" ROUTE_NOT_FOUND

  # F36: one address has at most 50 requests in progress anywhere. 50 uploads whose body never
  # comes (curl reads it from a `sleep`) hold their slots through `/`, which has no rate limit,
  # until client_body_timeout (10 s); meanwhile a 51st request is refused. All in one shell in the
  # container, so docker's own delays do not eat the 10 s. Not `pkill sleep` at the end: the
  # image's reload loop sleeps too; anchored, or `-f` would match this shell's own command line.
  local out
  out="$(in_nginx sh -c "for i in \$(seq 50); do
      sleep 29 | $inner -T - -X POST -o /dev/null https://localhost/ 2> /dev/null &
    done
    i=0
    while [ \$(pgrep -f '^curl .* -T - -X POST' | wc -l) -lt 50 ] && [ \$i -lt 30 ]; do
      sleep 0.1; i=\$((i + 1))
    done
    sleep 1
    echo \$(pgrep -f '^curl .* -T - -X POST' | wc -l)
    $inner --max-time 5 -o /tmp/request-51 -w '%{http_code} %{content_type} $security_w\n' \
      https://localhost/
    pkill curl; pkill -f '^sleep 29'; true")"
  held="$(sed -n 1p <<< "$out")"
  got="$(sed -n 2p <<< "$out")"
  [ "$held" = 50 ] \
    || { echo "ci-deploy-check: only $held of 50 uploads from one address were running" >&2; return 1; }
  expect_error "a 51st request in progress from one address" "$got" "429 application/json $security" \
    "$(in_nginx cat /tmp/request-51)" TOO_MANY_REQUESTS

  # F36: a client that never finishes its header is dropped after client_header_timeout (10 s).
  # Plain HTTP on port 80: the timeout is set for every server. nginx closes without an answer.
  local started elapsed line
  # A failed `exec` of a redirection ends the script with no message, so the port is checked first.
  curl -s --max-time 5 -o /dev/null http://127.0.0.1/nginx-health \
    || { echo "ci-deploy-check: nginx does not answer on port 80" >&2; return 1; }
  started="$(date +%s)"
  exec 3<> /dev/tcp/127.0.0.1/80
  printf 'GET / HTTP/1.1\r\nHost: localhost\r\n' >&3
  read -r -t 30 line <&3 || true
  exec 3<&-
  elapsed=$(($(date +%s) - started))
  [ "$elapsed" -ge 9 ] && [ "$elapsed" -le 15 ] \
    || { echo "ci-deploy-check: an unfinished header was dropped after ${elapsed}s, expected ~10s" >&2; return 1; }
  echo "an unfinished header is dropped after ${elapsed}s"
}

# F33: nginx's 502 for a stopped api answers 503 in the api's format.
check_api_unavailable() {
  local color="$1" got i
  docker stop "ai-fitting-$color-api-1" > /dev/null
  # Until nginx resolves the name again (`valid=10s`) a request may wait for the gone address up to
  # the connect timeout, so it is retried for up to a minute until nginx answers.
  for i in $(seq 6); do
    got="$(curl -sk --max-time 10 -o "$work/503.json" -w "%{http_code} %{content_type} $security_w" \
      https://localhost/api/hello || true)"
    [ "${got%% *}" != 000 ] && break
  done
  expect_error "/api/ with the api stopped" "$got" "503 application/json $security" \
    "$(cat "$work/503.json")" SERVICE_UNAVAILABLE
}

# A throwaway environment. The request loop comes from one address, so the per-client limit is
# raised: this checks switching, not rate limiting.
cat > "$env_file" <<EOF
POSTGRES_USER=ai_fitting
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=ai_fitting
SITE_DOMAIN=localhost
MEDIA_BASE_URL=https://localhost/media/
THROTTLE_READ_BURST=1000000
THROTTLE_READ_MINUTE=1000000
PROXY_SECRET=$(openssl rand -hex 32)
S3_ENDPOINT=http://s3:8333
S3_BUCKET=ai-fitting
S3_ACCESS_KEY_ID=$(openssl rand -hex 10)
S3_SECRET_ACCESS_KEY=$(openssl rand -hex 20)
EOF
# The emulator's admin user, from the same keys; in a file, so they stay off its command line.
sed -n -e 's/^S3_ACCESS_KEY_ID=/AWS_ACCESS_KEY_ID=/p' -e 's/^S3_SECRET_ACCESS_KEY=/AWS_SECRET_ACCESS_KEY=/p' \
  "$env_file" > "$work/s3.env"
s3_container=ai-fitting-check-s3

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
  # Before infra: the network is removed only once nothing is attached to it.
  docker rm -f -v "$s3_container" > /dev/null 2>&1 || true
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
  if [ -n "$(docker ps -aq --filter "name=^$s3_container\$")" ]; then
    echo "ci-deploy-check: the container $s3_container exists (an earlier run); remove it by hand" >&2
    exit 1
  fi
  trap teardown EXIT
fi

for app in api web; do
  docker tag "ai-fitting-$app:$tag" "ai-fitting-$app:$second"
done

group "storage emulator"
# The api needs the storage from its first deploy on (the seed uploads its photos, spec 0011 T9),
# so the emulator joins the network before it: infra's containers and network are created here, not started, and deploy.sh still sees
# a first deploy (nginx not running).
docker compose -f deploy/compose/infra.yml --env-file "$env_file" up --no-start
# The flags of docker-compose.yml's `s3`; ready once the bucket exists, a moment after the S3 port.
docker run -d --name "$s3_container" --network ai-fitting --network-alias s3 \
  --env-file "$work/s3.env" -e S3_BUCKET=ai-fitting \
  --health-cmd 'curl -fsS -o /dev/null http://localhost:8333/healthz && curl -fsS -o /dev/null http://localhost:8888/buckets/ai-fitting/' \
  --health-interval 1s --health-retries 60 \
  chrislusf/seaweedfs:4.48 mini -dir=/data -master.telemetry=false -admin.ui=false -webdav=false \
  -s3.autoCreateBucket=false > /dev/null
for _ in $(seq 60); do
  s3_health="$(docker inspect -f '{{.State.Health.Status}}' "$s3_container")"
  [ "$s3_health" = healthy ] && break
  sleep 1
done
[ "$s3_health" = healthy ] || {
  docker logs "$s3_container" >&2 || true
  echo "ci-deploy-check: the storage emulator is $s3_health after 60 s" >&2
  exit 1
}
echo "the storage emulator serves the bucket ai-fitting"
endgroup

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
check_security_headers /api/hello
check_security_headers /
# The socket location and nginx's 403 for readiness: a location's own add_header would drop them.
check_security_headers '/socket.io/?EIO=4&transport=polling'
check_security_headers /api/health/ready
endgroup

group "nginx's limits per address"
check_edge_limits
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

# Last: it leaves the site without an api.
group "nginx's answer with the api stopped"
check_api_unavailable green
endgroup

echo "ci-deploy-check: ok"
