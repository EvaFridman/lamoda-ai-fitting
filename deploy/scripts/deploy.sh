#!/usr/bin/env bash
# Blue-green deploy of one image tag: the new copy of the app starts next to the running one, nginx
# switches to it only when it is healthy, the previous copy stays running for an instant rollback.
#
#   deploy/scripts/deploy.sh <image-tag>
#
# Runs the same way on the server (CD), in CI and on a laptop. Reads, from the environment:
#   ENV_FILE        values for the compose files (default: .env at the repository root)
#   DEPLOY_PROFILE  `server` also runs certbot (default: none)
#   IMAGE_REGISTRY  e.g. ghcr.io/evafridman/ (default: none, local images); with it, images are pulled
#   WARMUP_EXTRA_PATH  one more address for the warm-up, a check's knob (default: none; CD never
#                   sets it, ci-deploy-check.sh sets one that answers 404)
#   SKIP_OPENAI_CHECK  1 skips the check of OpenAI (default: none; CD passes the Environment's
#                   variable, the owner's way round an outage; ci-deploy-check.sh for its
#                   placeholder key)
#
# Exit 0: <image-tag> serves the site. Exit 1: it does not, and whatever served before still does.
set -euo pipefail

# macOS ships bash 3.2; this script needs 4+ (on a Mac: `brew install bash`).
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  echo "deploy: needs bash 4 or newer, this is $BASH_VERSION (on macOS: brew install bash)" >&2
  exit 1
fi

tag="${1:?usage: deploy.sh <image-tag>}"
[[ "$tag" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "deploy: bad image tag '$tag'" >&2; exit 1; }

root="$(cd "$(dirname "$0")/../.." && pwd)"
compose_dir="$root/deploy/compose"
env_file="${ENV_FILE:-$root/.env}"
state_file="$root/.deploy-state"
lock_dir="$root/.deploy-lock"

[ -f "$env_file" ] || { echo "deploy: no env file at $env_file" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
: "${SITE_DOMAIN:?set SITE_DOMAIN in $env_file}"
# nginx's map takes the storage's origin from it (spec 0011 M30); another form leaves /media/
# answering 503 with nothing in the config check to say why.
[[ "${S3_ENDPOINT:-}" =~ ^https?://[^/]+/?$ ]] \
  || { echo "deploy: S3_ENDPOINT in $env_file is not http(s)://host[:port]" >&2; exit 1; }
export IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
# The project names come from the compose files (and -p); one from the caller's shell or the env file
# would put infra and the worker into another project.
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES

log() { printf '%s deploy: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
fail() { log "FAILED: $*"; exit 1; }

# One deploy at a time (CI also serializes, this guards manual runs). mkdir is atomic everywhere.
mkdir "$lock_dir" 2>/dev/null || fail "another deploy holds $lock_dir (remove it if that deploy died)"
# bash runs it on a fatal signal too: CD's time limit ends the ssh session, which has no pty, and the
# next log line's SIGPIPE still removes the lock. No trap of its own for PIPE: bash 5.3 then skips
# this one (spec 0018 V29).
trap 'rmdir "$lock_dir"' EXIT

infra() { docker compose -f "$compose_dir/infra.yml" --env-file "$env_file" "$@"; }
app() {
  local color="$1" image_tag="$2"
  shift 2
  COLOR="$color" IMAGE_TAG="$image_tag" \
    docker compose -p "ai-fitting-$color" -f "$compose_dir/app.yml" --env-file "$env_file" "$@"
}
worker() { IMAGE_TAG="$tag" docker compose -f "$compose_dir/worker.yml" --env-file "$env_file" "$@"; }
backup() { IMAGE_TAG="$tag" docker compose -f "$compose_dir/backup.yml" --env-file "$env_file" "$@"; }

# The version the public endpoint reports, through this host's nginx (works before the real
# certificate exists, hence -k: this checks which copy answers, not the certificate).
served_version() {
  curl -sk --max-time 5 --resolve "$SITE_DOMAIN:443:127.0.0.1" \
    "https://$SITE_DOMAIN/api/health/live" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

# Points nginx at a colour: the new upstream file is checked with `nginx -t` before it replaces the
# old one, and the reload lets running requests finish on the old workers.
switch_to() {
  local color="$1"
  infra exec -T nginx sh -eu -c "
    cd /etc/nginx/upstream
    cp active.conf active.conf.prev
    cat > active.conf <<EOF
upstream api { zone api 64k; server api-$color:3000 resolve; keepalive 16; }
upstream web { zone web 64k; server web-$color:3001 resolve; keepalive 16; }
EOF
    if ! nginx -t -q; then cp active.conf.prev active.conf; exit 1; fi
    nginx -s reload
  "
}

# Replaces the state file by a rename, so a failed write (a full disk) leaves the old one whole.
write_state() {
  printf '%s\n' "$1" > "$state_file.tmp" && mv -f "$state_file.tmp" "$state_file"
}

# Applies the deployed nginx template to the running nginx. The image renders templates into
# conf.d only when the container starts, a reload re-reads only what is already rendered, and the
# container is not restarted on a deploy (that would drop requests). So the image's own start-up
# scripts render it again here; a config nginx -t rejects is rolled back and nginx keeps the old one.
apply_nginx_config() {
  infra exec -T nginx sh -eu -c '
    # The image skips a missing template silently; a missing one means a stale mount (the folder
    # was replaced on the host), and "applied" would be a lie.
    if [ ! -s /etc/nginx/templates/default.conf.template ]; then
      echo "nginx sees no template: its mount of deploy/nginx/templates is stale; recreate nginx" >&2
      exit 1
    fi
    # Every rendered file (default.conf and the snippets it includes) is rolled back together.
    rm -rf /tmp/conf.d.prev
    cp -a /etc/nginx/conf.d /tmp/conf.d.prev
    . /docker-entrypoint.d/15-local-resolvers.envsh
    /docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null
    if ! nginx -t -q; then
      # Emptied first: a file only the new templates render would stay and load on the next reload.
      find /etc/nginx/conf.d -mindepth 1 -delete
      cp -a /tmp/conf.d.prev/. /etc/nginx/conf.d/
      exit 1
    fi
    nginx -s reload
  '
}

# One catalog photo (spec 0011 M15, M31, M38): the bucket lets only this server's address read
# media/, so a new address or a broken policy shows here. First straight from the bucket, before
# nginx changes: from a throwaway container of the new api image on this server (the server's
# address, no cache). A random image of the catalog; none (an empty catalog) is not checked. Three
# tries, a second apart, for a storage that fails or times out.
media_key=""
check_bucket() {
  local status=""
  media_key="$(infra exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA \
    -c 'SELECT image_key FROM product_images ORDER BY random() LIMIT 1')" \
    || { log "cannot read an image key from the database"; return 1; }
  if [ -z "$media_key" ]; then
    log "media not checked: the catalog has no image"
    return 0
  fi
  # The database's CHECK on image keys: every segment starts with a letter or digit, no `..`.
  [[ "$media_key" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$ && "$media_key" != *..* ]] \
    || { log "unexpected image key '$media_key'"; return 1; }
  # The key goes in the environment: as an argument node could take it for one of its options.
  status="$(app "$target" "$tag" run --rm --no-deps -T -e MEDIA_KEY="$media_key" api node -e '
    const url = `${process.env.S3_ENDPOINT.replace(/\/$/, "")}/${process.env.S3_BUCKET}/media/${process.env.MEDIA_KEY}`;
    (async () => {
      let status = 0;
      for (let i = 0; i < 3 && status !== 200; i++) {
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
        status = await fetch(url, { signal: AbortSignal.timeout(10000) })
          .then(async (r) => { await r.arrayBuffer(); return r.status; })
          .catch(() => 0);
      }
      console.log(status);
    })();
  ' || true)"
  [ "$status" = 200 ] && { log "media: media/$media_key answers 200 from the bucket"; return 0; }
  log "media/$media_key answers ${status:-nothing} from the bucket; expected 200"
  return 1
}

# The same photo through nginx, as visitors get it, after the nginx step. nginx keeps a refusal a
# minute: a fixed policy shows through it only after that.
check_media_through_nginx() {
  local status=""
  [ -n "$media_key" ] || return 0
  for _ in 1 2 3; do
    status="$(curl -sk --max-time 10 -o /dev/null -w '%{http_code}' \
      --resolve "$SITE_DOMAIN:443:127.0.0.1" "https://$SITE_DOMAIN/media/$media_key" || true)"
    [ "$status" = 200 ] && { log "media: media/$media_key answers 200 through nginx"; return 0; }
    sleep 1
  done
  log "media/$media_key answers ${status:-nothing} through nginx (a refusal stays in its cache a minute); expected 200"
  return 1
}

# nginx changes last (spec 0011 M38): recreated when its infra.yml service changed (a new
# PROXY_SECRET, S3_ENDPOINT), then the deployed templates applied; a no-op when nothing changed.
update_nginx() {
  infra "${profile_args[@]}" up -d --wait || fail "nginx did not become healthy"
  apply_nginx_config || fail "the deployed nginx config was not applied (see above); nginx keeps its previous one"
}

image_tag_of() {
  docker inspect --format '{{.Config.Image}}' "ai-fitting-$1-api-1" 2>/dev/null | sed 's/.*://'
}
is_healthy() {
  [ "$(docker inspect --format '{{.State.Health.Status}}' "ai-fitting-$1-$2-1" 2>/dev/null)" = healthy ]
}

# Removes the app images no container uses: every deploy adds an api and a web image (~1.7 GB), and
# on 2026-10-16 they filled the server's disk, so the next pull failed. Kept: every image a
# container (running or stopped) was created from: the serving copy, the rollback copy, the
# worker and the backup job; a rollback to an older version pulls its images again. Only this deploy's names count
# (the registry prefix compared as text), never the tag `dev` of the development stack. A tagged
# image is removed by its name (its other tags stay), an untagged one by its id. Removes nothing
# when the containers' images cannot be listed. Exit 1 when anything was not removed.
prune_app_images() {
  local used images id ref prefix="${IMAGE_REGISTRY,,}ai-fitting-" removed=0 failed=0
  used="$(docker ps -aq | xargs -r docker inspect --format '{{.Image}}')" || return 1
  [ -n "$used" ] || return 1
  images="$(docker image ls --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}')" || return 1
  # Tagged names first: removing them may already remove an id that also shows as untagged.
  while read -r id ref; do
    [[ "$ref" == "$prefix"api:* || "$ref" == "$prefix"web:* || "$ref" == "$prefix"backup:* ]] || continue
    [[ "$ref" == *:dev ]] && continue
    grep -qxF "$id" <<<"$used" && continue
    if [[ "$ref" == *:\<none\> ]]; then
      docker image inspect "$id" >/dev/null 2>&1 || continue
      ref="$id"
    fi
    if docker image rm "$ref" >/dev/null; then removed=$((removed + 1)); else failed=1; fi
  done < <(grep -v ':<none>$' <<<"$images"; grep ':<none>$' <<<"$images")
  log "removed $removed app images no container uses"
  [ "$failed" -eq 0 ]
}

active="$(sed -n 's/^COLOR=//p' "$state_file" 2>/dev/null || true)"
active_tag="$(sed -n 's/^TAG=//p' "$state_file" 2>/dev/null || true)"
if [ "$active" = blue ]; then target=green; else target=blue; fi
log "active: ${active:-none} (${active_tag:-none}); deploying $tag to $target"

# 1. The images must exist before anything running is touched. Pulled images first make room: a
#    full disk fails the pull, and a failed deploy never reaches step 6. Only with a registry: local
#    images (CI, a laptop) are built ahead, and the next version's are not in use yet.
if [ -n "$IMAGE_REGISTRY" ]; then
  prune_app_images || log "WARNING: old app images were not all removed before the pull"
  app "$target" "$tag" pull --quiet || fail "cannot pull images for $tag"
else
  for image in api web; do
    docker image inspect "ai-fitting-$image:$tag" >/dev/null 2>&1 || fail "no local image ai-fitting-$image:$tag"
  done
fi

# 1b. A changed PROXY_SECRET recreates nginx at the nginx step, before the new copy starts. The
#     running api must already accept it (as PROXY_SECRET_NEXT, spec 0006 F21), or a deploy failing
#     after that leaves every visitor of /api/ in one quota. Checked here, before anything changes. Skipped, with a log line, when nginx is not running or
#     has no secret yet (the first deploy with it) and when the serving copy is not healthy (the
#     site is down: the deploy is the way back). A running nginx whose secret cannot be read stops
#     the deploy. The secret goes over stdin, never into a command line or log.
if [ -z "$(infra ps --status running -q nginx 2>/dev/null)" ]; then
  log "nginx is not running: PROXY_SECRET not checked"
else
  nginx_secret="$(infra exec -T nginx sh -c 'printf %s "${PROXY_SECRET-}"')" \
    || fail "cannot read the running nginx's PROXY_SECRET; nothing was changed"
  if [ -n "$nginx_secret" ] && [ "$nginx_secret" != "${PROXY_SECRET:-}" ]; then
    if [ -z "$active" ] || ! is_healthy "$active" api; then
      log "PROXY_SECRET changed, not checked: no healthy copy serves the site"
    else
      log "PROXY_SECRET changed: checking that $active accepts the new one"
      secret_status=0
      printf '%s' "${PROXY_SECRET:-}" | app "$active" "$active_tag" exec -T api node -e "
        const id = require('node:crypto').randomBytes(16).toString('hex');
        const secret = require('node:fs').readFileSync(0, 'utf8');
        fetch('http://127.0.0.1:3000/health/live', {
          headers: { 'X-Proxy-Secret': secret, 'X-Request-Id': id },
          signal: AbortSignal.timeout(5000),
        }).then((r) => process.exit(r.headers.get('x-request-id') === id ? 0 : 10), () => process.exit(1));
      " || secret_status=$?
      case "$secret_status" in
        0) ;;
        10) fail "$active does not accept the new PROXY_SECRET: set it as PROXY_SECRET_NEXT and deploy first (deploy/README.md); nothing was changed" ;;
        *) fail "cannot check that $active accepts the new PROXY_SECRET (exit $secret_status); nothing was changed" ;;
      esac
    fi
  fi
  unset nginx_secret
fi

# 2. Data stores and Temporal: a no-op when nothing changed. nginx and its certificates wait for
#    the nginx step (update_nginx).
profile_args=()
[ "${DEPLOY_PROFILE:-}" = server ] && profile_args=(--profile server)
infra up -d --wait postgres redis redis-cache temporal || fail "infrastructure did not become healthy"
# A deleted user's id stays in deleteFiles' history for the namespace's retention (spec 0013 N45).
# start-dev's default is the same 24 hours, but a new image or a fresh volume must not change it.
infra exec -T temporal temporal operator namespace update -n default --retention 24h \
  --address 127.0.0.1:7233 >/dev/null || fail "could not set the retention of Temporal's namespace"

# Set by 3a only; never taken from the caller's environment.
still_running=""
if [ "$(image_tag_of "$target")" = "$tag" ] && is_healthy "$target" api && is_healthy "$target" web; then
  # 3a. Rollback to the version that ran before: it is still running, only the switch is left.
  #     `up` is a no-op unless .env or app.yml changed since it started (a rotated PROXY_SECRET, a
  #     new variable): then compose recreates it, or nginx's new secret would
  #     not match its old one and every visitor of /api/ would share one quota (spec 0006 F18).
  log "$target already runs $tag and is healthy: switching only, recreated if its config changed"
  still_running=1
  update_nginx
  if ! app "$target" "$tag" up -d --wait --remove-orphans; then
    app "$target" "$tag" stop >&2 || true
    fail "$target with $tag did not become healthy; stopped it, ${active:-nothing} keeps serving"
  fi
else
  # 3b. Migrations first, from the new image. They must stay compatible with the running version
  #     (specs/principles.md), which keeps serving until the switch. Before them, a database copy
  #     into the backup bucket if this release brings a migration not yet applied (spec 0012 P3):
  #     the job compares its image's migrations, which are the release's, with the database's.
  #     Not on a rollback to the copy that still runs (3a): it migrates nothing. A missing variable
  #     stops here, before the image is looked for, so it is not taken for a missing image.
  backup config --quiet \
    || fail "deploy/compose/backup.yml does not resolve with $env_file; ${active:-nothing} keeps serving"
  backup_image=1
  if [ -n "$IMAGE_REGISTRY" ]; then
    backup pull --quiet backup || backup_image=""
  else
    docker image inspect "ai-fitting-backup:$tag" >/dev/null 2>&1 || backup_image=""
  fi
  if [ -n "$backup_image" ]; then
    log "copying the database before the migrations of $tag, if any"
    backup run --rm -T backup node dist/backup/main.js --pre-deploy "$tag" >&2 \
      || fail "the database copy failed; ${active:-nothing} keeps serving"
  else
    # Only a version from before the backup job has no backup image, and its migrations are all
    # applied: the copy is skipped (P24). One with the job in its api image must have it too. Exit
    # code 3 as for the seed below: docker compose itself exits with 1 on many of its errors.
    job_status=0
    app "$target" "$tag" run --rm --no-deps -T api sh -c 'test -f dist/backup/pre-deploy.js || exit 3' \
      || job_status=$?
    case "$job_status" in
      0) fail "$tag has the backup job, but ai-fitting-backup:$tag cannot be found or pulled; ${active:-nothing} keeps serving" ;;
      3) log "copy skipped: $tag predates the backup job (no backup image)" ;;
      *) fail "cannot check $tag for the backup job (exit $job_status); ${active:-nothing} keeps serving" ;;
    esac
  fi
  log "migrating the database with $tag"
  app "$target" "$tag" run --rm --no-deps -T api npx --no-install prisma migrate deploy >&2 \
    || fail "migrations failed; $active keeps serving"

  # The demo catalog (spec 0002): adds only the rows that are missing, a no-op once loaded. An image
  # from before the seed existed (a rollback) has no entry point and skips the step. Its own exit
  # code 3, because docker compose itself exits with 1 on many of its errors.
  seed_status=0
  app "$target" "$tag" run --rm --no-deps -T api sh -c 'test -f dist/seed/main.js || exit 3' \
    || seed_status=$?
  case "$seed_status" in
    0)
      log "seeding the demo catalog with $tag"
      app "$target" "$tag" run --rm --no-deps -T api node dist/seed/main.js >&2 \
        || fail "the seed failed; ${active:-nothing} keeps serving"
      ;;
    3) log "seed skipped: $tag has no dist/seed/main.js" ;;
    *) fail "cannot check $tag for the seed (exit $seed_status); ${active:-nothing} keeps serving" ;;
  esac

  # The seed has uploaded its photos. Not on a rollback (3a): it is the way back, and a broken
  # bucket is not fixed by refusing it (spec 0011 M31). Up to here a failure leaves nginx, its
  # config and /media/ as they were (M38).
  check_bucket || fail "the server cannot read the media from the bucket (deploy/README.md, \"Хранилище S3\"); nginx was not changed, ${active:-nothing} keeps serving"
  update_nginx
  check_media_through_nginx || fail "nginx does not serve the media (deploy/README.md, \"Хранилище S3\"); ${active:-nothing} keeps serving"

  log "starting $target with $tag"
  if ! app "$target" "$tag" up -d --wait --remove-orphans; then
    app "$target" "$tag" stop >&2 || true
    fail "$target with $tag did not become healthy; stopped it, ${active:-nothing} keeps serving"
  fi
fi

# Readiness from inside, for a new copy and a rollback alike (3a may have recreated it): the api
# reaches Postgres, Redis and Temporal. Each check is one attempt per dependency (no retries inside
# the api), so a dependency that blips while the copy connects gets up to 10 attempts, 1 s apart.
ready=""
for _ in $(seq 1 10); do
  if app "$target" "$tag" exec -T api node -e \
    "fetch('http://127.0.0.1:3000/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; then
    ready=1
    break
  fi
  sleep 1
done
[ -n "$ready" ] \
  || { app "$target" "$tag" stop >&2 || true; fail "$target is not ready; stopped it, ${active:-nothing} keeps serving"; }

# OpenAI from inside the new api (spec 0019 A73): GET /v1/models with the key through the proxy,
# by the client the checks and the generation use; anything but a 200 stops the copy before the
# warm-up and the switch. Not on a rollback to the copy that still runs (3a): an outage of OpenAI or
# of the proxy never blocks the way back. SKIP_OPENAI_CHECK=1 skips it (the owner's way round such an
# outage; ci-deploy-check.sh, whose key is a placeholder), and so does an image from before it (exit
# code 3, as for the seed: docker compose itself exits with 1 on many of its errors).
if [ -n "${still_running:-}" ]; then
  log "OpenAI check skipped: $target is the copy that still runs"
elif [ "${SKIP_OPENAI_CHECK:-}" = 1 ]; then
  log "OpenAI check skipped (SKIP_OPENAI_CHECK=1)"
else
  check_status=0
  app "$target" "$tag" exec -T api sh -c 'test -f dist/ai/check-openai.js || exit 3' \
    || check_status=$?
  case "$check_status" in
    0)
      log "checking OpenAI from $target"
      app "$target" "$tag" exec -T api node dist/ai/check-openai.js >&2 \
        || { app "$target" "$tag" stop >&2 || true; fail "OpenAI check failed; stopped $target, ${active:-nothing} keeps serving"; }
      ;;
    3) log "OpenAI check skipped: $tag has no dist/ai/check-openai.js" ;;
    *)
      app "$target" "$tag" stop >&2 || true
      fail "cannot look for the OpenAI check in $tag (exit $check_status); stopped $target, ${active:-nothing} keeps serving"
      ;;
  esac
fi

# Warm-up from inside web (spec 0018 V6–V8), for a new copy and a rollback alike: every address of
# its /healthz/warmup twice, the caches filled before a visitor comes; anything but the expected
# status, a slow answer or the step past 120 s stops the deploy. An image from before the list
# requests / only (the script says so). WARMUP_EXTRA_PATH is a check's knob (ci-deploy-check.sh)
# and reaches the script's process only, never the container's environment. The script's lines go
# to the log; its last line on stderr names the address that failed.
log "warming up $target"
warmup_env=()
[ -z "${WARMUP_EXTRA_PATH:-}" ] || warmup_env=(-e "WARMUP_EXTRA_PATH=$WARMUP_EXTRA_PATH")
warmup_status=0
{ warmup_err="$(app "$target" "$tag" exec -T ${warmup_env[@]+"${warmup_env[@]}"} web \
  node --input-type=module - < "$root/deploy/scripts/warmup.mjs" 2>&1 >&3)" || warmup_status=$?; } 3>&2
[ -z "$warmup_err" ] || printf '%s\n' "$warmup_err" >&2
if [ "$warmup_status" -ne 0 ]; then
  failed_at="$(sed -n 's/^warm-up failed: //p' <<< "$warmup_err" | tail -n 1)"
  app "$target" "$tag" stop >&2 || true
  fail "warm-up failed: ${failed_at:-exit $warmup_status}; stopped $target, ${active:-nothing} keeps serving"
fi

# 4. Switch, then confirm from outside that the new version answers.
log "switching nginx to $target"
# The switch's output (nginx's reload notice) is held until the state is written: written to a
# session already ended, it would stop the deploy between the switch and the record (V29).
switch_out="$(switch_to "$target" 2>&1)" \
  || { printf '%s\n' "$switch_out" >&2; fail "nginx rejected the new upstream; ${active:-nothing} keeps serving"; }
# Recorded at once, so a deploy cut off from here on (CD's time limit) leaves the state naming the
# colour nginx serves, and the next deploy never targets the serving copy (spec 0018 V29).
previous_state="$(cat "$state_file" 2>/dev/null || true)"
if ! write_state "$(printf 'COLOR=%s\nTAG=%s\nPREVIOUS_COLOR=%s\nPREVIOUS_TAG=%s' \
  "$target" "$tag" "$active" "$active_tag")"; then
  # Printed first, so the held output reaches the log whichever way the deploy ends (V31).
  if [ -n "$switch_out" ]; then printf '%s\n' "$switch_out" >&2; fi
  if [ -n "$active" ] && switch_to "$active" >&2; then
    fail "the state could not be written; switched back to $active"
  fi
  fail "the state could not be written and nginx serves $target; set COLOR=$target in $state_file by hand"
fi
if [ -n "$switch_out" ]; then printf '%s\n' "$switch_out" >&2; fi
log "recorded $target ($tag) as the serving copy"
served=""
for _ in $(seq 1 20); do
  served="$(served_version || true)"
  [ "$served" = "$tag" ] && break
  sleep 1
done
if [ "$served" != "$tag" ]; then
  if [ -n "$active" ]; then
    log "the site reports '${served:-nothing}', not $tag: switching back to $active"
    # The state follows nginx: it names $active again only once nginx serves it, and the switch's
    # output waits for it, as on the way forward.
    if back_out="$(switch_to "$active" 2>&1)"; then
      write_state "$previous_state" || log "WARNING: the state still names $target; nginx serves $active"
      if [ -n "$back_out" ]; then printf '%s\n' "$back_out" >&2; fi
    else
      printf '%s\n' "$back_out" >&2
      log "WARNING: nginx did not switch back and still serves $target, as the state says"
    fi
  else
    rm -f "$state_file"
  fi
  fail "$tag does not serve the site"
fi

# 5. The worker is replaced in place (not blue-green, see worker.yml).
log "replacing the Temporal worker with $tag"
worker up -d --remove-orphans >&2 || log "WARNING: the worker did not start; the site is fine, background jobs are not"

# 5b. So is the nightly backup job (spec 0012 plan §6). Like the worker's, the warning covers only
#     what compose refuses (no image, a variable missing); a job that refuses its config at start
#     restarts in a loop, seen in its log and, once the monitor exists (its first night), in
#     Sentry. compose looks for the image before it touches the running job, so a version from
#     before the job (no backup image, P24) leaves the old one.
log "replacing the backup job with $tag"
backup up -d --remove-orphans >&2 || log "WARNING: the backup job did not start with $tag; the site is fine, the nightly copies are not"

# 6. Old app images go after every successful deploy too (see prune_app_images).
prune_app_images || log "WARNING: old app images were not all removed; the site is fine, check the disk"

log "done: $tag serves the site from $target; ${active:-nothing} stays as the rollback copy"
