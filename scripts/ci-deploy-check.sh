#!/usr/bin/env bash
# Runs the production setup on this machine with images built by ci-build-images.sh and checks a
# blue-green deploy end to end, with the same deploy.sh the server runs:
#   1. deploy <tag> (blue), the first request's time measured (spec 0018 plan §5, printed only),
#      smoke test through nginx; the seed loaded the demo catalog; nginx's
#      request id is on the response and on nginx's and the api's log lines (spec 0006 AC14);
#      nginx's security headers on api and web and on nginx's own errors (AC13);
#      nginx's limits per address: a flood, a 2 MB body, an 11th socket (AC10–AC12), a 51st request
#      in progress and an unfinished header (F36); a flood of pages and of photos is refused while
#      one catalog visit stays under (spec 0014 AC16); /healthz answers 404 from outside (spec 0014
#      plan §5); the seed uploaded its photos and nginx serves
#      them at /media/ (spec 0011 AC2, AC3), from its cache while the storage answers 5xx (M36);
#      Temporal's retention is 24 hours (spec 0013 N45), then changed for the next deploy; the
#      database had no migrations yet, so a copy went to the backup bucket before they ran (spec
#      0012 AC2), and the nightly backup job runs (plan §6);
#   2. deploy the same images as a second version (green) while scripts/request-loop.sh runs:
#      no request may fail (AC26); smoke test of the new version; the second seed changed no
#      counts (spec 0002, AC11) and uploaded no photo, no object changed (spec 0011 AC6); the
#      retention is 24 hours again; no new migration, no copy (spec 0012 AC3); the backup job was
#      replaced by the new version's;
#   2b. a deploy that would recreate nginx with a changed config, against a storage that refuses
#      writes and lacks one photo: it stops at the seed, nginx's container and rendered config are
#      unchanged and /media/ answers 200 (spec 0011 M38);
#   2c. a deploy with a new migration stops before the migrations, and green keeps serving, when
#      its backup image is missing (spec 0012 P24) and when the storage refuses its copy (AC2);
#   3. rotate PROXY_SECRET in two deploys (spec 0006 F21), with a failed one in between:
#      a. set PROXY_SECRET_NEXT and roll back to <tag>, still running in blue: deploy.sh recreates
#         it, so it accepts the next secret too;
#      b. make the next secret PROXY_SECRET and deploy an image whose api is never ready: nginx is
#         recreated with the new secret, the deploy fails, and blue still trusts nginx and web;
#         that version has neither the backup job nor its image, so its deploy skips the copy
#         (spec 0012 P24);
#      c. a third secret, unknown to blue, is refused by deploy.sh before nginx is recreated;
#      d. deploy <tag>-next (green) with the new secret only; an app image no container uses is
#         removed, the images of blue and green stay;
#   4. with the serving api stopped, /api/ answers 503 in the api's format (F33);
#   5. no request that reached the storage carried X-Proxy-Secret (spec 0011 plan §7).
# nginx runs on its temporary self-signed certificate, SITE_DOMAIN is localhost, ports 80 and 443
# must be free. A SeaweedFS container (spec 0011 M12, the image of docker-compose.yml's `s3`) on the
# network `ai-fitting` stands in for the production storage with throwaway keys; `s3` there is a
# probe in front of it, which logs what each request brings (method, path, header names). Used by the `images` job in CI; runs locally the same way. Outside CI it removes, on
# exit, the stacks it started with their volumes, and refuses to start next to an existing one
# (spec 0002, C25).
#
#   IMAGE_TAG=<short commit hash> scripts/ci-deploy-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${IMAGE_TAG:?set IMAGE_TAG}"
# The copy before migrations is named by the tag, which must be a commit hash (spec 0012 plan §2);
# a few more hex digits make the tag of the version with a new migration (2c).
[[ "$tag" =~ ^[0-9a-f]{7,37}$ ]] \
  || { echo "ci-deploy-check: IMAGE_TAG must be a short commit hash, not '$tag'" >&2; exit 1; }
second="$tag-next"
broken="$tag-broken"
migrating="${tag}abc"
# deploy.sh removes the app images no container uses, the backup image after each deploy too: this
# name, outside its prefix, keeps the image for the later deploys' tags.
backup_source="deploy-check-backup:$tag"
# The backup image of a later deploy's tag (the same image as <tag>'s).
backup_image_for() { docker tag "$backup_source" "ai-fitting-backup:$1"; }
# The images just built on this machine, under their local names. The CI job sets IMAGE_REGISTRY for
# publishing; with it, deploy.sh would pull from the registry, where nothing is pushed before this
# check passes (and never from a pull request). On the server deploy.sh does pull from GHCR.
export IMAGE_REGISTRY=""
# A project name or file list from the caller's shell would override the names in the compose files:
# the check and the teardown would then act on another project, e.g. the development stack.
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES
work="$(mktemp -d)"
# Until teardown takes over: an early exit leaves no env files with the run's keys (spec 0011 M35).
trap 'rm -rf "$work"' EXIT
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
# nginx's (32 hex characters), and that id is on nginx's log and on the api's: on a line of each
# api route given (the start of its `url`), or with none given on any line. Through a category page
# (`/catalog/dresses?sort=price_asc`) the api's lines are web's calls: the category by its slug from
# the proxy (the request's headers) and the products from the page (`headers()`), so it checks that
# both send the proxy secret. Routes, not a count: while the page cache is skipped the page reads
# more as the visitor and would make up a missing line. The sort keeps the page's batch out of the
# page cache, whose reads carry no visitor's id (spec 0018 V26).
# The page's two reads on the visitor's behalf: the proxy's and the batch (`/products/facets` is
# another route).
page_routes=('/categories/by-slug/dresses' '/products?')
check_request_id() {
  local path="$1" color="$2" ids id i route found nginx_log api_log id_lines
  local routes=("${@:3}")
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
    id_lines="$(grep -F "\"id\":\"$id\"" <<< "$api_log" || true)"
    found=1
    grep -qF "request_id=$id" <<< "$nginx_log" && [ -n "$id_lines" ] || found=0
    for route in "${routes[@]}"; do
      grep -qF "\"url\":\"$route" <<< "$id_lines" || found=0
    done
    [ "$found" = 1 ] \
      && { echo "request id $id of $path is on nginx's and the api's log lines ${routes[*]}"; return 0; }
    sleep 1
  done
  echo "ci-deploy-check: request id $id of $path is missing from nginx's log or from the api's lines ${routes[*]:-}" >&2
  return 1
}

# AC13 (spec 0006 F9): nginx's security headers, as curl's -w prints them with $security_w (a
# repeated header prints as "a, b" and fails the match). check_security_headers reads the whole
# header instead and wants each exactly once; not for /_next/image or Swagger's static files, which
# add a CSP of their own. With `page`, the CSP is web's full one (spec 0014 AC17, plan §5): nginx
# adds none, so it is one header with a nonce, scripts from 'self' and no framing.
security_w='%header{x-content-type-options}|%header{content-security-policy}|%header{referrer-policy}'
security="nosniff|frame-ancestors 'none'|strict-origin-when-cross-origin"
check_security_headers() {
  local path="$1" kind="${2:-}" headers name expected got
  headers="$(curl -sk --max-time 10 -o /dev/null -D - "https://localhost$path" | tr -d '\r')" \
    || { echo "ci-deploy-check: $path: the request failed" >&2; return 1; }
  for name in x-content-type-options content-security-policy referrer-policy; do
    case "$name" in
      x-content-type-options) expected=nosniff ;;
      content-security-policy) expected="frame-ancestors 'none'" ;;
      referrer-policy) expected=strict-origin-when-cross-origin ;;
    esac
    # The value is everything after the name's ": " (web's CSP holds "data: blob:" too).
    got="$(awk -F': ' -v n="$name" 'tolower($1) == n { sub(/^[^:]*: /, ""); print }' <<< "$headers")"
    if [ "$name" = content-security-policy ] && [ "$kind" = page ]; then
      [ "$(wc -l <<< "$got")" -eq 1 ] \
        && grep -qE "^default-src 'self'; script-src 'self' 'nonce-[A-Za-z0-9+/=]+' " <<< "$got" \
        && grep -qF "frame-ancestors 'none'" <<< "$got" \
        || { echo "ci-deploy-check: $path answers $name '$got', expected web's one policy" >&2; return 1; }
      continue
    fi
    [ "$got" = "$expected" ] \
      || { echo "ci-deploy-check: $path answers $name '$got', expected one '$expected'" >&2; return 1; }
  done
  echo "$path carries the security headers once${kind:+, the CSP of web}"
}

# Runs a command in the nginx container. Its curl reaches nginx from 127.0.0.1, another address
# than this machine's, so one address can be over nginx's limits while this machine is served.
in_nginx() { docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T nginx "$@"; }
in_temporal() { docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T temporal "$@"; }
# The retention of the namespace the api and the worker use, as Temporal prints it ("86400s").
temporal_retention() {
  in_temporal temporal operator namespace describe -n default --address 127.0.0.1:7233 -o json \
    | sed -n 's/.*"workflowExecutionRetentionTtl": *"\([^"]*\)".*/\1/p'
}
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
# the api's format past the burst (40 on /api/, 100 on liveness, 33 on pages, 60 on /media/).
# Unknown routes, broken JSON, liveness, pages and photos: the api's own limit never counts them
# (a page's api reads are web's, under the throwaway quota), so every 429 here is nginx's.
# At most 40 at once: past 50 in progress the connection limit (edge_conns) would answer the same
# 429, so nginx's log must show the request zone <zone> refusing them.
nginx_log_count() {
  docker compose -f deploy/compose/infra.yml --env-file "$env_file" logs nginx 2>&1 \
    | grep -c "$1" || true
}
# With `page`, web's answers carry its own one policy instead (spec 0014 plan §5), nginx's 429s
# still nginx's.
page_security="nosniff\|default-src 'self'; script-src 'self' 'nonce-[A-Za-z0-9+/=]+' [^|,]*frame-ancestors 'none'[^|,]*\|strict-origin-when-cross-origin$"
check_flood() {
  local what="$1" request="$2" zone="$3" total="${4:-100}" kind="${5:-}" out n429 json429 bodies bare before after conns
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
  if [ "$kind" = page ]; then
    bare="$(grep -v '^000 ' <<< "$out" | grep -vF " $security" | grep -vcE " $page_security" || true)"
  else
    bare="$(grep -v '^000 ' <<< "$out" | grep -vcF " $security" || true)"
  fi
  [ "$n429" -gt 0 ] && [ "$json429" -eq "$n429" ] && [ "$bodies" -eq "$n429" ] && [ "$bare" -eq 0 ] || {
    printf 'ci-deploy-check: a flood of %s: %s of %s answered 429, %s as JSON, %s with the code, %s without the security headers:\n%s\n' \
      "$what" "$n429" "$total" "$json429" "$bodies" "$bare" "$(sort <<< "$out" | uniq -c)" >&2
    return 1
  }
  echo "a flood of $what: $n429 of $total answered nginx's 429 in the api's format, all with the security headers"
}

# spec 0014 AC16, the local half: one catalog visit is under the page and photo limits. The visit
# measured in production made 14 page requests; a batch has 60 photos. All at once (at most 40 in
# progress, under edge_conns), from the address the floods above used, once its buckets refilled
# (33 pages in 1 s, 60 photos in 2 s; 5 s leaves room for a flood's tail, O114).
check_visit() {
  local out n429 failed
  sleep 5
  out="$(in_nginx sh -c "$inner --parallel --parallel-immediate --parallel-max 40 \
    -o /dev/null -o /dev/null -w '%{http_code}\n' \
    'https://localhost/catalog?visit=[1-14]' 'https://localhost/media/no-such-key.webp?visit=[1-60]'; true")"
  n429="$(grep -c '^429$' <<< "$out" || true)"
  failed="$(grep -c '^000$' <<< "$out" || true)"
  [ "$(wc -l <<< "$out")" -eq 74 ] && [ "$n429" -eq 0 ] && [ "$failed" -eq 0 ] || {
    printf 'ci-deploy-check: one visit (14 pages, 60 photos) got:\n%s\n' "$(sort <<< "$out" | uniq -c)" >&2
    return 1
  }
  echo "one visit, 14 pages and 60 photos at once, stays under nginx's limits"
}

check_edge_limits() {
  local i status got holders held
  check_flood "unknown routes" "'https://localhost/api/no-such-route-[1-100]'" edge_api
  check_flood "broken JSON" \
    "-X POST -H 'Content-Type: application/json' -d '{' 'https://localhost/api/products?n=[1-100]'" \
    edge_api
  check_flood "liveness" "'https://localhost/api/health/live?n=[1-200]'" edge_health 200
  # spec 0014 AC16: web's pages and /media/, with random missing keys (O39: a 404 is cached per
  # key, so each new one reaches the bucket).
  check_flood "pages" "'https://localhost/catalog?n=[1-100]'" edge_pages 100 page
  # nginx decodes %2F into /_next/static/a, Next renders its not-found page: counted as a page.
  check_flood "pages behind an encoded /_next/static/" \
    "'https://localhost/x%2F..%2F_next/static/a?n=[1-100]'" edge_pages 100 page
  # A range past a file's end makes Next render its 416 page.
  check_flood "static files with a Range" \
    "-H 'Range: bytes=999999999-' 'https://localhost/_next/static/a?n=[1-100]'" edge_pages
  check_flood "photos" "'https://localhost/media/no-such-key-[1-100].webp'" edge_media
  check_visit
  # The flooding address is over its limit; a visitor at a normal pace from this machine is served.
  for i in 1 2 3 4 5; do
    status="$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' 'https://localhost/api/categories?limit=1' \
      || true)"
    [ "$status" = 200 ] \
      || { echo "ci-deploy-check: after the flood, another address got $status from /api/categories?limit=1" >&2; return 1; }
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
  # comes (curl reads it from a `sleep`) hold their slots through a GET of `/_next/static/`, which
  # has no rate limit, until client_body_timeout (10 s); meanwhile a 51st request is refused. All in one shell in the
  # container, so docker's own delays do not eat the 10 s. Not `pkill sleep` at the end: the
  # image's reload loop sleeps too; anchored, or `-f` would match this shell's own command line.
  local out
  out="$(in_nginx sh -c "for i in \$(seq 50); do
      sleep 29 | $inner -T - -X GET -o /dev/null https://localhost/_next/static/check 2> /dev/null &
    done
    i=0
    while [ \$(pgrep -f '^curl .* -T - -X GET' | wc -l) -lt 50 ] && [ \$i -lt 30 ]; do
      sleep 0.1; i=\$((i + 1))
    done
    sleep 1
    echo \$(pgrep -f '^curl .* -T - -X GET' | wc -l)
    $inner --max-time 5 -o /tmp/request-51 -w '%{http_code} %{content_type} $security_w\n' \
      https://localhost/_next/static/check
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
      'https://localhost/api/categories?limit=1' || true)"
    [ "${got%% *}" != 000 ] && break
  done
  expect_error "/api/ with the api stopped" "$got" "503 application/json $security" \
    "$(cat "$work/503.json")" SERVICE_UNAVAILABLE
}

# A request to the emulator signed with its admin keys, from inside its container (its port is not
# published); the keys stay in the container's environment, off this machine's command lines.
s3_admin() {
  docker exec -i "$s3_container" sh -c \
    'curl -sS --fail-with-body --aws-sigv4 aws:amz:ru-1:s3 --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" "$@"' \
    s3_admin "$@"
}
# The probe's log so far, in a file: a pipe into grep -q could end docker logs early, and under
# pipefail its SIGPIPE would read as "not found".
probe_log() {
  docker logs "$probe_container" > "$work/probe.log" 2>&1 \
    || { echo "ci-deploy-check: cannot read the storage probe's log" >&2; return 1; }
}
# "key etag" of every object under media/, sorted (the seed's photos are far below one page). Each
# <Contents> is read whole, so the order of its tags (S3 puts <LastModified> between <Key> and
# <ETag>, SeaweedFS does not) does not matter; a failed request, an entry without both tags or a
# listing that yields nothing fails here. Callers run it in `$(…)` or before `||`, where set -e
# is off, so every failure returns 1 itself.
media_etags() {
  local listing
  listing="$(s3_admin 'http://localhost:8333/ai-fitting?list-type=2&prefix=media/' \
    | awk -v RS='<Contents>' 'NR > 1 {
        if (index($0, "<Key>") == 0 || index($0, "<ETag>") == 0) exit 1
        key = $0; sub(/.*<Key>/, "", key); sub(/<\/Key>.*/, "", key)
        etag = $0; sub(/.*<ETag>/, "", etag); sub(/<\/ETag>.*/, "", etag)
        print key, etag
      }' | sort)" \
    || { echo "ci-deploy-check: cannot list media/ in the storage emulator, or an entry lacks <Key> or <ETag>" >&2; return 1; }
  [ -n "$listing" ] \
    || { echo "ci-deploy-check: the listing of media/ holds no object (or a form this does not read)" >&2; return 1; }
  printf '%s\n' "$listing"
}
# How many photos the seed of a deploy log uploaded ("Seed done: ..., N photos uploaded").
photos_uploaded() { grep -o '[0-9]* photos uploaded' "$1" | sed 's/ .*//'; }

# spec 0011 AC2, AC3 on the runner: every image of the catalog through nginx answers 200 as a webp
# with the seed's Cache-Control and none of the storage's headers (x-amz-*, Timeweb's x-rgw-*, the
# emulator's Seaweed-*, M39); a query string reaches
# nothing (the emulator would act on ?response-content-type=); a missing key, a folder and a write
# answer 404 in the api's format (M30); the storage got only nginx's Host and no query string.
check_media() {
  local keys key headers n=0 got first
  keys="$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T postgres \
    psql -U ai_fitting -d ai_fitting -tA -c 'SELECT DISTINCT image_key FROM product_images ORDER BY 1')" \
    || { echo "ci-deploy-check: cannot read the image keys from the database" >&2; return 1; }
  [ -n "$keys" ] || { echo "ci-deploy-check: the catalog has no image" >&2; return 1; }
  while read -r key; do
    headers="$(curl -sk --max-time 10 -o /dev/null -D - "https://localhost/media/$key" | tr -d '\r')" \
      || { echo "ci-deploy-check: /media/$key: the request failed" >&2; return 1; }
    head -n 1 <<< "$headers" | grep -q '^HTTP/1.1 200 ' \
      && grep -qix 'content-type: image/webp' <<< "$headers" \
      && grep -qix 'cache-control: public, max-age=86400' <<< "$headers" \
      && ! grep -qiE '^(x-amz-|x-rgw-|seaweed-)' <<< "$headers" \
      || { printf 'ci-deploy-check: /media/%s answers:\n%s\n' "$key" "$headers" >&2; return 1; }
    n=$((n + 1))
    # Under edge_media's 30 a second, however many photos the seed has (spec 0014 O110).
    sleep 0.04
  done <<< "$keys"
  echo "$n catalog images: 200, image/webp, Cache-Control: public, max-age=86400, no x-amz-*, x-rgw-*, Seaweed-*"
  first="$(head -n 1 <<< "$keys")"
  check_security_headers "/media/$first"
  got="$(curl -sk --max-time 10 -o /dev/null -w '%{http_code} %{content_type}' \
    "https://localhost/media/$first?response-content-type=text/html&X-Amz-Expires=1" || true)"
  [ "$got" = '200 image/webp' ] \
    || { echo "ci-deploy-check: /media/ with a query string answers '$got', expected 200 image/webp" >&2; return 1; }
  echo "a query string does not change /media/'s answer"

  local path method
  # A key over S3's 1024 bytes: the storage refuses it with its own XML (400), which nginx hides.
  local long
  long="$(head -c 1100 /dev/zero | tr '\0' a)"
  for path in /media/no-such-key.webp /media/ /media/seed/ "/media/$(dirname "$first")/" \
    "/media/$long.webp"; do
    got="$(curl -sk --max-time 10 -o "$work/media.json" -w "%{http_code} %{content_type} $security_w" \
      "https://localhost$path" || true)"
    expect_error "${path:0:60}" "$got" "404 application/json $security" "$(cat "$work/media.json")" \
      NOT_FOUND
  done
  for method in PUT POST DELETE; do
    got="$(curl -sk --max-time 10 -X "$method" -d x -o "$work/media.json" \
      -w "%{http_code} %{content_type} $security_w" "https://localhost/media/$first" || true)"
    expect_error "$method /media/<key>" "$got" "404 application/json $security" \
      "$(cat "$work/media.json")" ROUTE_NOT_FOUND
  done

  # What nginx sent the storage, from the probe's log: the visitor's headers stay behind (only the
  # Host nginx sets, and Connection), and so does the query string. nginx starts after the
  # deploy's throwaway containers (the seed, the bucket check) and may get the address of one of
  # them, so only lines logged since nginx started count.
  local nginx_container nginx_ip from_nginx bad
  nginx_container="$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" ps -q nginx)"
  nginx_ip="$(docker inspect -f '{{(index .NetworkSettings.Networks "ai-fitting").IPAddress}}' \
    "$nginx_container")"
  docker logs --since "$(docker inspect -f '{{.State.StartedAt}}' "$nginx_container")" \
    "$probe_container" > "$work/probe.log" 2>&1 \
    || { echo "ci-deploy-check: cannot read the storage probe's log" >&2; return 1; }
  # Node writes an IPv4 address as ::ffff:a.b.c.d where the container has IPv6.
  from_nginx="$(grep -E "\"from\":\"(::ffff:)?${nginx_ip//./\\.}\"" "$work/probe.log" || true)"
  [ -n "$from_nginx" ] \
    || { echo "ci-deploy-check: the storage got no request from nginx ($nginx_ip)" >&2; return 1; }
  bad="$(grep -vE '"url":"/ai-fitting/media/[^"?]+","headers":\["host"(,"connection")?\]\}$' \
    <<< "$from_nginx" || true)"
  [ -z "$bad" ] \
    || { printf 'ci-deploy-check: nginx sent the storage more than a key and its Host:\n%s\n' "$bad" >&2; return 1; }
  echo "nginx sent the storage $(wc -l <<< "$from_nginx" | tr -d ' ') requests: a key and its Host, nothing else"
}

# spec 0011 M36: while the storage answers 5xx, a photo nginx has cached is served from the cache
# even when expired, and one it has not answers 503 in the api's format. The photo here is fresh
# for a second (its own Cache-Control), then stays in the cache as an expired copy; it sits at the
# top of media/ (no new folder) and is removed afterwards, so AC6's comparison of media/ after the
# second deploy does not see it.
check_media_stale() {
  local key=media/stale-check.webp headers got asked
  s3_admin -o /dev/null -X PUT -H 'Content-Type: image/webp' -H 'Cache-Control: public, max-age=1' \
    --data-binary stale "http://localhost:8333/ai-fitting/$key"
  headers="$(curl -sk --max-time 10 -o /dev/null -D - "https://localhost/$key" | tr -d '\r' || true)"
  head -n 1 <<< "$headers" | grep -q '^HTTP/1.1 200 ' \
    && grep -qix 'cache-control: public, max-age=1' <<< "$headers" \
    || { printf 'ci-deploy-check: /%s answers:\n%s\nexpected 200 with Cache-Control: public, max-age=1\n' "$key" "$headers" >&2; return 1; }
  sleep 2
  docker exec "$probe_container" touch /tmp/fail
  # The expired copy is served only after nginx asked the storage and got its 503: the probe logs
  # that request, so a copy still fresh (a lost Cache-Control) cannot pass for a stale one.
  probe_log
  asked="$(grep -cF "\"url\":\"/ai-fitting/$key\"" "$work/probe.log" || true)"
  got="$(curl -sk --max-time 10 -o "$work/media.txt" -w '%{http_code} %{content_type}' \
    "https://localhost/$key" || true)"
  [ "$got" = '200 image/webp' ] && [ "$(cat "$work/media.txt")" = stale ] \
    || { echo "ci-deploy-check: an expired cached photo with the storage failing answers '$got', expected 200 image/webp from the cache" >&2; return 1; }
  probe_log
  [ "$(grep -cF "\"url\":\"/ai-fitting/$key\"" "$work/probe.log" || true)" -gt "$asked" ] \
    || { echo "ci-deploy-check: nginx did not ask the storage for the expired /$key" >&2; return 1; }
  echo "an expired cached photo with the storage answering 503 is served from nginx's cache"
  got="$(curl -sk --max-time 10 -o "$work/media.json" -w "%{http_code} %{content_type} $security_w" \
    https://localhost/media/check/never-cached.webp || true)"
  expect_error "an uncached photo with the storage failing" "$got" "503 application/json $security" \
    "$(cat "$work/media.json")" SERVICE_UNAVAILABLE
  docker exec "$probe_container" rm /tmp/fail
  s3_admin -o /dev/null -X DELETE "http://localhost:8333/ai-fitting/$key"
}

# The keys under pre-deploy/ in the backup bucket, one per line (none: empty).
pre_deploy_copies() {
  s3_admin 'http://localhost:8333/ai-fitting-backups?list-type=2&prefix=pre-deploy/' \
    | grep -o '<Key>[^<]*</Key>' | sed -e 's/<Key>//' -e 's/<\/Key>//' || true
}
# Number of lines, 0 for an empty string.
count_lines() { if [ -z "$1" ]; then echo 0; else wc -l <<< "$1" | tr -d ' '; fi; }

# spec 0012 plan §6: the deploy left the nightly backup job running from the image of <tag>, never
# restarted, and it has started: it logged its next run, or its run when started between 04:00 and
# 04:30 Moscow time (P15). Its config is checked at start, so a refused one would restart it.
check_backup_job() {
  local container=ai-fitting-backup-backup-1 logs="" started=""
  for _ in $(seq 1 30); do
    logs="$(docker logs "$container" 2>&1 || true)"
    if grep -qE 'Next backup run|Backup run started' <<< "$logs"; then started=1; break; fi
    sleep 1
  done
  [ -n "$started" ] \
    && [ "$(docker inspect --format '{{.Config.Image}} {{.State.Running}} {{.RestartCount}}' "$container")" = "ai-fitting-backup:$1 true 0" ] \
    || { printf 'ci-deploy-check: the backup job does not run from ai-fitting-backup:%s; its log:\n%s\n' "$1" "$logs" >&2; exit 1; }
  echo "the backup job runs from ai-fitting-backup:$1"
}

# A throwaway age public key for the backup job; its private key is never kept, the database tests
# decrypt copies (spec 0012 plan §7). From the api image, which has age-encryption.
backup_recipient="$(docker run --rm --entrypoint node "ai-fitting-api:$tag" --input-type=module -e \
  "const age = await import('age-encryption'); console.log(await age.identityToRecipient(await age.generateIdentity()));")"
s3_key_id="$(openssl rand -hex 10)"
s3_secret="$(openssl rand -hex 20)"

# A throwaway environment. The request loop comes from one address, so the per-client limit is
# raised: this checks switching, not rate limiting. The backup job uses the emulator's admin keys
# for both of its keys; production has a read-only and a write-only key (spec 0012 P11).
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
S3_ACCESS_KEY_ID=$s3_key_id
S3_SECRET_ACCESS_KEY=$s3_secret
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
GOOGLE_CLIENT_ID=deploy-check.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=deploy-check-google-client-secret
BACKUP_BUCKET=ai-fitting-backups
BACKUP_READ_ACCESS_KEY_ID=$s3_key_id
BACKUP_READ_SECRET_ACCESS_KEY=$s3_secret
BACKUP_WRITE_ACCESS_KEY_ID=$s3_key_id
BACKUP_WRITE_SECRET_ACCESS_KEY=$s3_secret
BACKUP_AGE_RECIPIENT=$backup_recipient
EOF
unset s3_key_id s3_secret
# The emulator's admin user, from the same keys; in a file, so they stay off its command line.
sed -n -e 's/^S3_ACCESS_KEY_ID=/AWS_ACCESS_KEY_ID=/p' -e 's/^S3_SECRET_ACCESS_KEY=/AWS_SECRET_ACCESS_KEY=/p' \
  "$env_file" > "$work/s3.env"
s3_container=ai-fitting-check-s3
probe_container=ai-fitting-check-s3-probe

# Outside CI: remove what this run starts, so the next run gets a fresh database. Only what it
# starts: an existing stack is an earlier run or a real deploy, and its volumes may hold data.
projects=(ai-fitting-infra ai-fitting-blue ai-fitting-green ai-fitting-worker ai-fitting-backup)
teardown() {
  echo "==> removing the deploy check stacks"
  # A failed second deploy exits before the request loop is stopped.
  if [ -n "${loop:-}" ]; then kill -TERM "$loop" 2>/dev/null || true; fi
  for color in blue green; do
    COLOR="$color" IMAGE_TAG="$tag" docker compose -p "ai-fitting-$color" -f deploy/compose/app.yml \
      --env-file "$env_file" down --remove-orphans || true
  done
  IMAGE_TAG="$tag" docker compose -f deploy/compose/worker.yml --env-file "$env_file" down || true
  IMAGE_TAG="$tag" docker compose -f deploy/compose/backup.yml --env-file "$env_file" down || true
  # Before infra: the network is removed only once nothing is attached to it.
  docker rm -f -v "$probe_container" "$s3_container" > /dev/null 2>&1 || true
  docker compose -f deploy/compose/infra.yml --env-file "$env_file" --profile server down --volumes \
    || true
  rm -f .deploy-state
  # It holds the run's env files with their one-off keys (spec 0011 M35).
  rm -rf "$work"
  docker image rm "ai-fitting-api:$second" "ai-fitting-web:$second" "ai-fitting-api:$broken" \
    "ai-fitting-web:$broken" "ai-fitting-api:$tag-stale" "ai-fitting-api:$migrating" \
    "ai-fitting-web:$migrating" "ai-fitting-backup:$migrating" "ai-fitting-backup:$second" \
    "$backup_source" > /dev/null 2>&1 || true
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
  for container in "$s3_container" "$probe_container"; do
    if [ -n "$(docker ps -aq --filter "name=^$container\$")" ]; then
      echo "ci-deploy-check: the container $container exists (an earlier run); remove it by hand" >&2
      exit 1
    fi
  done
  trap teardown EXIT
fi

for app in api web; do
  docker tag "ai-fitting-$app:$tag" "ai-fitting-$app:$second"
done
docker tag "ai-fitting-backup:$tag" "$backup_source"

group "storage emulator"
# The api needs the storage from its first deploy on (the seed uploads its photos, spec 0011 T9),
# so the emulator joins the network before it: infra's containers and network are created here, not started, and deploy.sh still sees
# a first deploy (nginx not running).
docker compose -f deploy/compose/infra.yml --env-file "$env_file" up --no-start
# The flags of docker-compose.yml's `s3`; ready once the bucket exists, a moment after the S3 port.
docker run -d --name "$s3_container" --network ai-fitting --network-alias s3-emulator \
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
# media/ readable without a key, as s3-init sets it locally (api/src/storage/dev-setup.ts; the
# production image refuses that setup). In production only the server's address reads it (M15).
printf '%s' '{"Version":"2012-10-17","Statement":[{"Sid":"PublicReadMedia","Effect":"Allow","Principal":"*","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::ai-fitting/media/*"]}]}' \
  | s3_admin -o /dev/null -X PUT --data-binary @- 'http://localhost:8333/ai-fitting?policy'
# The backup bucket of the copy before migrations (spec 0012).
s3_admin -o /dev/null -X PUT 'http://localhost:8333/ai-fitting-backups'
# The probe that is `s3` for the api, the worker and nginx: it logs each request's method, path and
# header names (never values: the api's carry its signature) and passes it on unchanged, adding
# to each answer it passes on the x-rgw-object-type Timeweb's storage sends, which nginx must hide
# (M39); while
# /tmp/fail exists it answers 503 instead (a failing storage, check_media_stale), and while
# /tmp/read-only exists it refuses every write with S3's 403 (the storage user of M38). Node from
# the api image, which this machine has anyway.
docker run -d --name "$probe_container" --network ai-fitting --network-alias s3 "ai-fitting-api:$tag" \
  node -e "
    const http = require('node:http');
    const fs = require('node:fs');
    http.createServer((req, res) => {
      const { remoteAddress: from } = req.socket;
      console.log(JSON.stringify({ from, method: req.method, url: req.url, headers: Object.keys(req.headers) }));
      if (fs.existsSync('/tmp/fail')) {
        req.resume();
        res.writeHead(503).end();
        return;
      }
      if (fs.existsSync('/tmp/read-only') && !['GET', 'HEAD'].includes(req.method)) {
        req.resume();
        res.writeHead(403, { 'Content-Type': 'application/xml' })
          .end('<?xml version=\"1.0\" encoding=\"UTF-8\"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>');
        return;
      }
      const upstream = http.request(
        { host: 's3-emulator', port: 8333, method: req.method, path: req.url, headers: req.headers },
        (answer) => {
          res.writeHead(answer.statusCode, [...answer.rawHeaders, 'x-rgw-object-type', 'Normal']);
          answer.pipe(res);
        },
      );
      upstream.on('error', () => res.destroy());
      req.pipe(upstream);
    }).listen(8333);
  " > /dev/null
for _ in $(seq 30); do
  probe_status="$(docker exec "$probe_container" node -e "
    fetch('http://127.0.0.1:8333/ai-fitting/media/').then((r) => console.log(r.status), () => console.log(0))")" \
    || probe_status=0
  [ "$probe_status" != 0 ] && break
  sleep 1
done
[ "$probe_status" != 0 ] || {
  docker logs "$probe_container" >&2 || true
  echo "ci-deploy-check: the storage probe does not answer after 30 s" >&2
  exit 1
}
echo "the storage emulator serves the bucket ai-fitting, media/ readable without a key, behind the probe"
endgroup

group "deploy $tag (first deploy, blue)"
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$tag" 2>&1 | tee "$work/deploy-1.log"
# The first visitor, before the smoke test warms these pages (spec 0018 V25); numbers only.
node scripts/measure-first-request.mjs https://localhost /catalog /catalog/dresses
scripts/smoke-test.sh https://localhost "$tag"
first_counts="$(counts)"
echo "$first_counts"
# AC8: the demo catalog, every product complete, and no users.
[ "$(count_of categories "$first_counts")" -ge 5 ] && [ "$(count_of brands "$first_counts")" -ge 5 ] \
  && [ "$(count_of products "$first_counts")" -ge 30 ] && [ "$(count_of users "$first_counts")" -eq 0 ] \
  && [ "$(count_of products_incomplete "$first_counts")" -eq 0 ] \
  || { echo "ci-deploy-check: the seed did not load the demo catalog" >&2; exit 1; }
# /api/categories?limit=1, not /api/health/live: the api does not log health checks.
check_request_id '/api/categories?limit=1' blue
check_request_id '/catalog/dresses?sort=price_asc' blue "${page_routes[@]}"
check_security_headers '/api/categories?limit=1'
# `/` is Next's redirect, answered before proxy.ts runs: nginx's policy only.
check_security_headers /
check_security_headers /catalog page
check_security_headers /catalog/dresses page
# An unknown category: proxy.ts's rewrite to the not-found page keeps the policy.
check_security_headers /catalog/no-such-category page
# The socket location and nginx's 403 for readiness: a location's own add_header would drop them.
check_security_headers '/socket.io/?EIO=4&transport=polling'
check_security_headers /api/health/ready
# web's health route is for the container's check only (spec 0014 plan §5).
got="$(curl -sk --max-time 10 -o "$work/healthz.json" -w "%{http_code} %{content_type} $security_w" \
  https://localhost/healthz || true)"
expect_error "/healthz from outside" "$got" "404 application/json $security" \
  "$(cat "$work/healthz.json")" ROUTE_NOT_FOUND
endgroup

group "the copy before the first migrations"
# spec 0012 AC2: a fresh database has no _prisma_migrations, so every migration is new; the job
# stored one copy named by the tag, and its log line comes before the migrations'.
copies="$(pre_deploy_copies)"
[ "$(count_lines "$copies")" = 1 ] && grep -qE "^pre-deploy/[0-9TZ-]+-$tag-[0-9a-f]{16}/database\.dump\.age\$" <<< "$copies" \
  || { printf 'ci-deploy-check: the first deploy left these copies under pre-deploy/:\n%s\n' "$copies" >&2; exit 1; }
stored="$(grep -n 'Database copy stored' "$work/deploy-1.log" | head -n 1 | cut -d: -f1)"
migrated="$(grep -n "migrating the database with $tag" "$work/deploy-1.log" | head -n 1 | cut -d: -f1)"
[ -n "$stored" ] && [ -n "$migrated" ] && [ "$stored" -lt "$migrated" ] \
  || { echo "ci-deploy-check: the copy was not stored before the migrations ran (lines '$stored', '$migrated')" >&2; exit 1; }
# P27: the name's random suffix is in no line of the deploy's log, which CD shows on GitHub.
suffix="$(sed -E 's|.*-([0-9a-f]{16})/.*|\1|' <<< "$copies")"
! grep -qF "$suffix" "$work/deploy-1.log" \
  || { echo "ci-deploy-check: the deploy's log shows the suffix of the copy's name" >&2; exit 1; }
echo "the first deploy stored $copies before migrating"
check_backup_job "$tag"
endgroup

group "the catalog media through nginx"
# AC6: the first deploy uploaded every photo of the catalog.
first_etags="$(media_etags)" \
  || { echo "ci-deploy-check: cannot list media/ in the storage emulator" >&2; exit 1; }
[ "$(photos_uploaded "$work/deploy-1.log")" -gt 0 ] \
  && [ "$(photos_uploaded "$work/deploy-1.log")" -eq "$(wc -l <<< "$first_etags")" ] \
  || { echo "ci-deploy-check: the seed uploaded '$(photos_uploaded "$work/deploy-1.log")' photos, the bucket holds $(wc -l <<< "$first_etags")" >&2; exit 1; }
echo "the first seed uploaded $(photos_uploaded "$work/deploy-1.log") photos"
check_media
check_media_stale
endgroup

group "nginx's limits per address"
check_edge_limits
endgroup

group "Temporal's retention"
# spec 0013 N45: every deploy sets it, so a changed one comes back with the next deploy (green).
[ "$(temporal_retention)" = 86400s ] \
  || { echo "ci-deploy-check: Temporal's retention is '$(temporal_retention)', not 24 hours" >&2; exit 1; }
in_temporal temporal operator namespace update -n default --retention 72h --address 127.0.0.1:7233 > /dev/null
echo "the first deploy set 24 hours; changed to 72 hours for the next deploy to undo"
endgroup

group "deploy $second (green) under a request loop"
backup_image_for "$second"
scripts/request-loop.sh https://localhost > "$work/loop.out" 2>&1 &
loop=$!
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$second" 2>&1 | tee "$work/deploy-2.log"
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
# AC6: the second seed uploaded nothing and changed no object.
[ "$(photos_uploaded "$work/deploy-2.log")" = 0 ] && [ "$(media_etags)" = "$first_etags" ] || {
  echo "ci-deploy-check: the second seed uploaded '$(photos_uploaded "$work/deploy-2.log")' photos or changed objects in media/" >&2
  exit 1
}
echo "the second seed uploaded no photo and changed no object"
[ "$(temporal_retention)" = 86400s ] \
  || { echo "ci-deploy-check: the second deploy left Temporal's retention at '$(temporal_retention)'" >&2; exit 1; }
echo "the second deploy set Temporal's retention back to 24 hours"
# spec 0012 AC3: the same migrations, all applied: the job ran and stored nothing.
grep -qF 'No new migration, no copy before the deploy' "$work/deploy-2.log" \
  && [ "$(pre_deploy_copies)" = "$copies" ] \
  || { echo "ci-deploy-check: the second deploy, with no new migration, did not run the job or stored a copy" >&2; exit 1; }
echo "the second deploy, with no new migration, made no copy"
check_backup_job "$second"

group "a refused write stops the deploy before nginx changes"
# spec 0011 M38. S3_ENDPOINT with the trailing slash CD allows changes nginx's environment and its
# rendered map, so a deploy that reached the nginx step would recreate nginx. One photo is removed
# from the bucket past the probe, so the seed has one to upload, and the probe refuses it.
nginx_id="$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" ps -q nginx)"
nginx_conf() { in_nginx sh -c 'find /etc/nginx/conf.d -type f | sort | xargs cat | sha256sum'; }
conf_before="$(nginx_conf)"
etags="$(media_etags)" || exit 1
kept="$(head -n 1 <<< "$etags" | cut -d ' ' -f 1)"
missing="$(tail -n 1 <<< "$etags" | cut -d ' ' -f 1)"
s3_admin -o /dev/null -X DELETE "http://localhost:8333/ai-fitting/$missing"
docker exec "$probe_container" touch /tmp/read-only
cp "$env_file" "$work/kept.env"
grep -v '^S3_ENDPOINT=' "$work/kept.env" > "$env_file"
echo 'S3_ENDPOINT=http://s3:8333/' >> "$env_file"
backup_image_for "$second"
if ENV_FILE="$env_file" deploy/scripts/deploy.sh "$second" 2>&1 | tee "$work/deploy-refused.log"; then
  echo "ci-deploy-check: the deploy against a storage that refuses writes was expected to fail" >&2
  exit 1
fi
docker exec "$probe_container" rm /tmp/read-only
cp "$work/kept.env" "$env_file"
grep -qF 'the seed failed' "$work/deploy-refused.log" \
  || { echo "ci-deploy-check: the deploy failed, but not at the seed" >&2; exit 1; }
probe_log
grep -qF "\"method\":\"PUT\",\"url\":\"/ai-fitting/$missing" "$work/probe.log" \
  || { echo "ci-deploy-check: the seed did not try to upload $missing" >&2; exit 1; }
[ "$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" ps -q nginx)" = "$nginx_id" ] \
  || { echo "ci-deploy-check: nginx was recreated by a deploy that failed at the seed" >&2; exit 1; }
[ "$(nginx_conf)" = "$conf_before" ] \
  || { echo "ci-deploy-check: nginx's rendered config changed in a deploy that failed at the seed" >&2; exit 1; }
got="$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' "https://localhost/$kept" || true)"
[ "$got" = 200 ] || { echo "ci-deploy-check: /$kept answers '$got' after the failed deploy, expected 200" >&2; exit 1; }
echo "the refused upload of $missing stopped the deploy at the seed; nginx and /media/ are as they were"
endgroup

group "a refused copy stops a deploy with a new migration before the migrations"
# spec 0012 AC2: <tag> plus a migration the database has not applied; the probe refuses the copy's
# upload, so the deploy stops before migrating and green keeps serving.
new_migration=29991231000000_deploy_check
docker tag "ai-fitting-api:$tag" "ai-fitting-api:$migrating"
docker tag "ai-fitting-web:$tag" "ai-fitting-web:$migrating"
# P24: its api image has the backup job, so a missing backup image stops the deploy instead of
# skipping the copy.
if ENV_FILE="$env_file" deploy/scripts/deploy.sh "$migrating" 2>&1 | tee "$work/deploy-no-backup.log"; then
  echo "ci-deploy-check: the deploy of a version with the backup job but no backup image was expected to fail" >&2
  exit 1
fi
grep -qF "$migrating has the backup job, but ai-fitting-backup:$migrating cannot be found" \
  "$work/deploy-no-backup.log" \
  && ! grep -qF "migrating the database with $migrating" "$work/deploy-no-backup.log" \
  || { echo "ci-deploy-check: the deploy with no backup image failed, but not before the migrations for it" >&2; exit 1; }
echo "a version with the backup job but no backup image stops before the migrations"
docker build -q -t "ai-fitting-backup:$migrating" - > /dev/null <<EOF
FROM $backup_source
USER root
RUN mkdir prisma/migrations/$new_migration && echo 'SELECT 1;' > prisma/migrations/$new_migration/migration.sql
USER node
EOF
docker exec "$probe_container" touch /tmp/read-only
if ENV_FILE="$env_file" deploy/scripts/deploy.sh "$migrating" 2>&1 | tee "$work/deploy-copy-refused.log"; then
  echo "ci-deploy-check: the deploy whose copy the storage refuses was expected to fail" >&2
  exit 1
fi
docker exec "$probe_container" rm /tmp/read-only
grep -qF 'the database copy failed' "$work/deploy-copy-refused.log" \
  && ! grep -qF "migrating the database with $migrating" "$work/deploy-copy-refused.log" \
  || { echo "ci-deploy-check: the deploy failed, but not at the copy, or it migrated" >&2; exit 1; }
probe_log
grep -qE "\"method\":\"PUT\",\"url\":\"/ai-fitting-backups/pre-deploy/[^\"]*-$migrating-[0-9a-f]{16}/database\.dump\.age" \
  "$work/probe.log" \
  || { echo "ci-deploy-check: the job did not try to upload the copy of $migrating" >&2; exit 1; }
[ "$(pre_deploy_copies)" = "$copies" ] \
  || { echo "ci-deploy-check: a refused copy left an object under pre-deploy/" >&2; exit 1; }
applied="$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T postgres \
  psql -U ai_fitting -d ai_fitting -tA -c "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '$new_migration'")"
[ "$applied" = 0 ] \
  || { echo "ci-deploy-check: $new_migration reached the database after a refused copy" >&2; exit 1; }
scripts/smoke-test.sh https://localhost "$second"
echo "the refused copy stopped the deploy of $migrating before the migrations; $second keeps serving"
endgroup

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
check_request_id '/api/categories?limit=1' blue
check_request_id '/catalog/dresses?sort=price_asc' blue "${page_routes[@]}"
endgroup

group "rotation, deploy 2 fails: PROXY_SECRET is the new one, the api of $broken is never ready"
# The api image of <tag> whose server answers everything but readiness: the migrations, the seed
# (it uploads the photo the refused deploy left out) and the media checks pass, nginx is recreated
# with the new secret (spec 0011 M38: it changes last), and the deploy stops before the switch.
# Without dist/backup and with no backup image, it also stands for a version from before the
# backup job (spec 0012 P24).
docker build -q -t "ai-fitting-api:$broken" - > /dev/null <<EOF
FROM ai-fitting-api:$tag
USER root
RUN echo "import { createServer } from 'node:http'; createServer((req, res) => res.writeHead(req.url === '/health/ready' ? 503 : 200).end()).listen(3000);" > dist/main.js \
  && rm -r dist/backup
USER node
EOF
docker tag "ai-fitting-web:$tag" "ai-fitting-web:$broken"
set_proxy_secrets "$new_secret" ""
if ENV_FILE="$env_file" deploy/scripts/deploy.sh "$broken" 2> "$work/broken.err"; then
  cat "$work/broken.err" >&2
  echo "ci-deploy-check: the deploy of $broken was expected to fail" >&2
  exit 1
fi
cat "$work/broken.err" >&2
# The image is ESM ("type": "module"): a server that crashed would fail the health check instead.
grep -qF 'is not ready' "$work/broken.err" \
  || { echo "ci-deploy-check: the deploy of $broken failed, but not at readiness" >&2; exit 1; }
# spec 0012 P24: a version from before the backup job deploys without the copy.
grep -qF "copy skipped: $broken predates the backup job" "$work/broken.err" \
  || { echo "ci-deploy-check: the deploy of $broken, which has no backup job, did not skip the copy" >&2; exit 1; }
# nginx sends the new secret now, or the checks below would only show that blue trusts the old one.
# Compared, never printed.
[ "$(docker compose -f deploy/compose/infra.yml --env-file "$env_file" exec -T nginx \
  printenv PROXY_SECRET)" = "$new_secret" ] \
  || { echo "ci-deploy-check: nginx was not recreated with the new PROXY_SECRET" >&2; exit 1; }
# blue keeps serving, started with the old secret and the new one as PROXY_SECRET_NEXT: it trusts
# nginx (the new secret, /api/categories?limit=1) and its own web (the old one, the category page).
scripts/smoke-test.sh https://localhost "$tag"
check_request_id '/api/categories?limit=1' blue
check_request_id '/catalog/dresses?sort=price_asc' blue "${page_routes[@]}"
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
check_request_id '/api/categories?limit=1' blue
endgroup

group "rotation, deploy 2 again: $second (green) with the new secret only; unused images go"
set_proxy_secrets "$new_secret" ""
# An app image no container uses (its own id, unlike the tags of <tag>): the deploy removes it and
# keeps the images of blue, green and the worker.
docker build -q -t "ai-fitting-api:$tag-stale" - > /dev/null <<EOF
FROM ai-fitting-api:$tag
LABEL stale=1
EOF
backup_image_for "$second"
ENV_FILE="$env_file" deploy/scripts/deploy.sh "$second"
scripts/smoke-test.sh https://localhost "$second"
check_request_id '/api/categories?limit=1' green
check_request_id '/catalog/dresses?sort=price_asc' green "${page_routes[@]}"
if docker image inspect "ai-fitting-api:$tag-stale" > /dev/null 2>&1; then
  echo "ci-deploy-check: the deploy kept an app image no container uses" >&2
  exit 1
fi
for image in "ai-fitting-api:$tag" "ai-fitting-web:$tag" "ai-fitting-api:$second" "ai-fitting-web:$second"; do
  docker image inspect "$image" > /dev/null 2>&1 \
    || { echo "ci-deploy-check: the deploy removed $image, which a container uses" >&2; exit 1; }
done
endgroup

# Last: it leaves the site without an api.
group "nginx's answer with the api stopped"
check_api_unavailable green
endgroup

# Every request the storage got in this run (the api's, the worker's, nginx's before and after it
# was recreated): none carried the proxy secret. Node writes header names in lower case.
probe_log
if grep -qF '"x-proxy-secret"' "$work/probe.log"; then
  echo "ci-deploy-check: a request to the storage carried X-Proxy-Secret" >&2
  exit 1
fi
echo "the storage got $(grep -c '"from"' "$work/probe.log") requests, none with X-Proxy-Secret"

echo "ci-deploy-check: ok"
