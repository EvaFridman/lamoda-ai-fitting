#!/usr/bin/env bash
# Builds the production images of api and web, tagged with an image tag (the short commit hash in CI).
# Each image gets two names: a local one (ai-fitting-<app>:<tag>, what deploy.sh uses without a
# registry) and, if IMAGE_REGISTRY is set, the registry one that CI pushes from main.
#
#   IMAGE_TAG=<tag> [IMAGE_REGISTRY=ghcr.io/owner/] scripts/ci-build-images.sh
#
# Optional: SENTRY_ORG, SENTRY_AUTH_TOKEN and the projects SENTRY_PROJECT (web) and
# SENTRY_PROJECT_API (api) for the source map upload of both images (the token is passed as a
# BuildKit secret, never as a build argument); for web, NEXT_PUBLIC_SENTRY_DSN and
# NEXT_PUBLIC_SENTRY_ENVIRONMENT (baked into the browser bundle). IMAGE_SOURCE: repository URL for
# the OCI label.
#
# BUILD_CACHE=gha (CI): builds with a Buildx builder and the GitHub Actions cache, one scope per
# image, and loads the images into the local Docker. It needs ACTIONS_RUNTIME_TOKEN and
# ACTIONS_RESULTS_URL, which GitHub gives only to actions (images.yml exports them). Without it the
# images build with the local Docker's builder and no shared cache.
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

# build <app> <docker build arguments...>
case "${BUILD_CACHE:-}" in
  '')
    build() { shift; docker build "$@"; }
    ;;
  gha)
    # BuildKit pinned by version and digest (plan of spec 0005): it sees the Sentry secret and
    # builds what main publishes. A builder left by an earlier call is reused; the version in its
    # name keeps a new pin from reusing an old builder.
    buildkit=v0.33.1
    buildkit_digest=sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
    builder="ai-fitting-ci-buildkit-$buildkit"
    docker buildx inspect "$builder" > /dev/null 2>&1 ||
      docker buildx create --name "$builder" --driver docker-container \
        --driver-opt "image=moby/buildkit:$buildkit@$buildkit_digest"
    # mode=max keeps the layers of the dependency and build stages, where the time goes; a cache
    # that cannot be written never fails the build. version=2: the cache service GitHub runs.
    build() {
      local app="$1"
      shift
      docker buildx build --builder "$builder" --load \
        --cache-from "type=gha,version=2,scope=$app" \
        --cache-to "type=gha,version=2,scope=$app,mode=max,ignore-error=true" \
        "$@"
    }
    ;;
  *)
    echo "BUILD_CACHE must be empty or gha, got: $BUILD_CACHE" >&2
    exit 1
    ;;
esac

group "api image $tag"
mapfile -t api_names < <(names api)
build api --target runtime "${api_names[@]}" "${labels[@]}" "${secret[@]}" \
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

group "web image $tag"
mapfile -t web_names < <(names web)
build web --target runtime "${web_names[@]}" "${labels[@]}" "${secret[@]}" \
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
