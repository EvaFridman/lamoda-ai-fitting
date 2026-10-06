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
export IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"

log() { printf '%s deploy: %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
fail() { log "FAILED: $*"; exit 1; }

# One deploy at a time (CI also serializes, this guards manual runs). mkdir is atomic everywhere.
mkdir "$lock_dir" 2>/dev/null || fail "another deploy holds $lock_dir (remove it if that deploy died)"
trap 'rmdir "$lock_dir"' EXIT

infra() { docker compose -f "$compose_dir/infra.yml" --env-file "$env_file" "$@"; }
app() {
  local color="$1" image_tag="$2"
  shift 2
  COLOR="$color" IMAGE_TAG="$image_tag" \
    docker compose -p "ai-fitting-$color" -f "$compose_dir/app.yml" --env-file "$env_file" "$@"
}
worker() { IMAGE_TAG="$tag" docker compose -f "$compose_dir/worker.yml" --env-file "$env_file" "$@"; }

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

# Applies the deployed nginx template to the running nginx. The image renders templates into
# conf.d only when the container starts, a reload re-reads only what is already rendered, and the
# container is not restarted on a deploy (that would drop requests). So the image's own start-up
# scripts render it again here; a config nginx -t rejects is rolled back and nginx keeps the old one.
apply_nginx_config() {
  infra exec -T nginx sh -eu -c '
    cp /etc/nginx/conf.d/default.conf /tmp/default.conf.prev
    . /docker-entrypoint.d/15-local-resolvers.envsh
    /docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null
    if ! nginx -t -q; then cp /tmp/default.conf.prev /etc/nginx/conf.d/default.conf; exit 1; fi
    nginx -s reload
  '
}

image_tag_of() {
  docker inspect --format '{{.Config.Image}}' "ai-fitting-$1-api-1" 2>/dev/null | sed 's/.*://'
}
is_healthy() {
  [ "$(docker inspect --format '{{.State.Health.Status}}' "ai-fitting-$1-$2-1" 2>/dev/null)" = healthy ]
}

active="$(sed -n 's/^COLOR=//p' "$state_file" 2>/dev/null || true)"
active_tag="$(sed -n 's/^TAG=//p' "$state_file" 2>/dev/null || true)"
if [ "$active" = blue ]; then target=green; else target=blue; fi
log "active: ${active:-none} (${active_tag:-none}); deploying $tag to $target"

# 1. The images must exist before anything running is touched.
if [ -n "$IMAGE_REGISTRY" ]; then
  app "$target" "$tag" pull --quiet || fail "cannot pull images for $tag"
else
  for image in api web; do
    docker image inspect "ai-fitting-$image:$tag" >/dev/null 2>&1 || fail "no local image ai-fitting-$image:$tag"
  done
fi

# 2. Data stores, Temporal, nginx: a no-op when nothing changed.
profile_args=()
[ "${DEPLOY_PROFILE:-}" = server ] && profile_args=(--profile server)
infra "${profile_args[@]}" up -d --wait || fail "infrastructure did not become healthy"
apply_nginx_config || fail "nginx rejected the deployed template; it keeps its previous config"

if [ "$(image_tag_of "$target")" = "$tag" ] && is_healthy "$target" api && is_healthy "$target" web; then
  # 3a. Rollback to the version that ran before: it is still running, only the switch is left.
  log "$target already runs $tag and is healthy: switching only"
else
  # 3b. Migrations first, from the new image. They must stay compatible with the running version
  #     (specs/principles.md), which keeps serving until the switch.
  log "migrating the database with $tag"
  app "$target" "$tag" run --rm --no-deps -T api npx --no-install prisma migrate deploy >&2 \
    || fail "migrations failed; $active keeps serving"

  log "starting $target with $tag"
  if ! app "$target" "$tag" up -d --wait --remove-orphans; then
    app "$target" "$tag" stop >&2 || true
    fail "$target with $tag did not become healthy; stopped it, ${active:-nothing} keeps serving"
  fi
  # Readiness from inside: the new api reaches Postgres, Redis and Temporal.
  app "$target" "$tag" exec -T api node -e \
    "fetch('http://127.0.0.1:3000/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" \
    || { app "$target" "$tag" stop >&2 || true; fail "$target is not ready; stopped it, ${active:-nothing} keeps serving"; }
fi

# 4. Switch, then confirm from outside that the new version answers.
log "switching nginx to $target"
switch_to "$target" || fail "nginx rejected the new upstream; ${active:-nothing} keeps serving"
served=""
for _ in $(seq 1 20); do
  served="$(served_version || true)"
  [ "$served" = "$tag" ] && break
  sleep 1
done
if [ "$served" != "$tag" ]; then
  if [ -n "$active" ]; then
    log "the site reports '${served:-nothing}', not $tag: switching back to $active"
    switch_to "$active" || true
  fi
  fail "$tag does not serve the site"
fi

# 5. The worker is replaced in place (not blue-green, see worker.yml).
log "replacing the Temporal worker with $tag"
worker up -d --remove-orphans >&2 || log "WARNING: the worker did not start; the site is fine, background jobs are not"

printf 'COLOR=%s\nTAG=%s\nPREVIOUS_COLOR=%s\nPREVIOUS_TAG=%s\n' \
  "$target" "$tag" "$active" "$active_tag" > "$state_file"
log "done: $tag serves the site from $target; ${active:-nothing} stays as the rollback copy"
