#!/usr/bin/env bash
# Builds the production images of api and web, tagged with an image tag (the short commit hash in CI).
# Each image gets two names: a local one (ai-fitting-<app>:<tag>, what deploy.sh uses without a
# registry) and, if IMAGE_REGISTRY is set, the registry one that CI pushes from main.
#
#   IMAGE_TAG=<tag> [IMAGE_REGISTRY=ghcr.io/owner/] scripts/ci-build-images.sh
#
# Optional, for web: NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_SENTRY_ENVIRONMENT (baked into the browser
# bundle), SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN (source map upload; the token is passed as
# a BuildKit secret, never as a build argument). IMAGE_SOURCE: repository URL for the OCI label.
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

group "api image $tag"
mapfile -t api_names < <(names api)
docker build --target runtime "${api_names[@]}" "${labels[@]}" api
endgroup

group "web image $tag"
mapfile -t web_names < <(names web)
secret=()
[ -n "${SENTRY_AUTH_TOKEN:-}" ] && secret=(--secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN)
docker build --target runtime "${web_names[@]}" "${labels[@]}" "${secret[@]}" \
  --build-arg NEXT_PUBLIC_SENTRY_DSN="${NEXT_PUBLIC_SENTRY_DSN:-}" \
  --build-arg NEXT_PUBLIC_SENTRY_ENVIRONMENT="${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-}" \
  --build-arg SENTRY_ORG="${SENTRY_ORG:-}" \
  --build-arg SENTRY_PROJECT="${SENTRY_PROJECT:-}" \
  --build-arg SENTRY_RELEASE="$tag" \
  web
endgroup

for app in api web; do
  size="$(docker image inspect --format '{{.Size}}' "ai-fitting-$app:$tag")"
  echo "ai-fitting-$app:$tag  $((size / 1024 / 1024)) MB"
done
