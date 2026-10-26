#!/usr/bin/env bash
# Builds the production images of api, the backup job and web, tagged with an image tag (the short commit hash in CI).
# Each image gets two names: a local one (ai-fitting-<app>:<tag>, what deploy.sh uses without a
# registry) and, if IMAGE_REGISTRY is set, the registry one that CI pushes from main.
#
#   IMAGE_TAG=<tag> [IMAGE_REGISTRY=ghcr.io/owner/] scripts/ci-build-images.sh
#
# Optional: SENTRY_ORG, SENTRY_AUTH_TOKEN and the projects SENTRY_PROJECT (web) and
# SENTRY_PROJECT_API (api) for the source map upload of both images (the token is passed as a
# BuildKit secret, never as a build argument); for web, NEXT_PUBLIC_SENTRY_DSN,
# NEXT_PUBLIC_SENTRY_ENVIRONMENT, NEXT_PUBLIC_MIXPANEL_TOKEN and NEXT_PUBLIC_YANDEX_MAPS_API_KEY
# (baked into the browser bundle; empty turns Sentry or analytics off, or shows a placeholder for
# the stores' map). IMAGE_SOURCE: repository URL for the OCI label.
#
# Fails if the api image holds source maps: the Dockerfile deletes them after the upload, and they
# carry the TypeScript source (inlineSources).
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${IMAGE_TAG:?set IMAGE_TAG}"
registry="${IMAGE_REGISTRY:-}"

names() {
  local app="$1"
  printf -- '-t\nai-fitting-%s:%s\n' "$app" "$tag"
  [ -n "$registry" ] && printf -- '-t\n%sai-fitting-%s:%s\n' "$registry" "$app" "$tag"
  return 0
}
labels=()
[ -n "${IMAGE_SOURCE:-}" ] && labels=(--label "org.opencontainers.image.source=$IMAGE_SOURCE")

group() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$*"; else echo "==> $*"; fi; }
endgroup() { if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi; }

secret=()
[ -n "${SENTRY_AUTH_TOKEN:-}" ] && secret=(--secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN)

group "api image $tag"
mapfile -t api_names < <(names api)
docker build --target runtime "${api_names[@]}" "${labels[@]}" "${secret[@]}" \
  --build-arg SENTRY_ORG="${SENTRY_ORG:-}" \
  --build-arg SENTRY_PROJECT="${SENTRY_PROJECT_API:-}" \
  --build-arg SENTRY_RELEASE="$tag" \
  api
# The api's source maps carry the TypeScript source (inlineSources): the image must not ship them.
maps="$(docker run --rm --entrypoint find "ai-fitting-api:$tag" dist -name '*.map')"
if [ -n "$maps" ]; then
  echo "The api image holds source maps:" >&2
  echo "$maps" >&2
  exit 1
fi
endgroup

# The backup job (spec 0012): the api's runtime plus the PostgreSQL client, from the same build
# cache, so it carries the api's code without its source maps.
group "backup image $tag"
mapfile -t backup_names < <(names backup)
docker build --target backup "${backup_names[@]}" "${labels[@]}" "${secret[@]}" \
  --build-arg SENTRY_ORG="${SENTRY_ORG:-}" \
  --build-arg SENTRY_PROJECT="${SENTRY_PROJECT_API:-}" \
  --build-arg SENTRY_RELEASE="$tag" \
  api
endgroup

group "web image $tag"
mapfile -t web_names < <(names web)
docker build --target runtime "${web_names[@]}" "${labels[@]}" "${secret[@]}" \
  --build-arg NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}" \
  --build-arg NEXT_PUBLIC_SENTRY_ENVIRONMENT="${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-}" \
  --build-arg NEXT_PUBLIC_MIXPANEL_TOKEN="${NEXT_PUBLIC_MIXPANEL_TOKEN:-}" \
  --build-arg NEXT_PUBLIC_YANDEX_MAPS_API_KEY="${NEXT_PUBLIC_YANDEX_MAPS_API_KEY:-}" \
  --build-arg SENTRY_ORG="${SENTRY_ORG:-}" \
  --build-arg SENTRY_PROJECT="${SENTRY_PROJECT:-}" \
  --build-arg SENTRY_RELEASE="$tag" \
  web
endgroup

for app in api backup web; do
  size="$(docker image inspect --format '{{.Size}}' "ai-fitting-$app:$tag")"
  echo "ai-fitting-$app:$tag  $((size / 1024 / 1024)) MB"
done
