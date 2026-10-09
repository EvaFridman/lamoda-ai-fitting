# syntax=docker/dockerfile:1

# Exact versions: an image built today and in a month must be the same. Bump Node together with
# .nvmrc and CI; npm together with CI's NPM_VERSION.
ARG NODE_IMAGE=node:26.10.0-trixie-slim
ARG NPM_VERSION=12.2.0

# npm 12 (Node images ship 11): install scripts run only for packages approved in allowScripts.
FROM ${NODE_IMAGE} AS base
ARG NPM_VERSION
RUN npm install -g "npm@${NPM_VERSION}" && npm cache clean --force
WORKDIR /app
RUN chown node:node /app

# All dependencies. The api's postinstall runs `prisma generate`, so the schema and the Prisma
# config come first. Rarely changing files before sources: a code edit does not reinstall.
FROM base AS deps
USER node
COPY --chown=node:node package.json package-lock.json .npmrc prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
RUN npm ci

# Compile.
FROM deps AS build
COPY --chown=node:node nest-cli.json tsconfig.json tsconfig.build.json ./
COPY --chown=node:node src ./src
RUN npm run build

# Source maps go to Sentry, never into the image: with the token, `inject` writes a debug id into
# each .js file and its map (Sentry matches stack traces by it) and `upload` sends the maps; without
# it (local builds, pull requests) nothing is sent. The maps are deleted either way. A failed upload
# does not fail the build, so Sentry being down cannot hold back a deploy; the log shows it.
# Workflow code is left as it is: the worker bundles it into Temporal's sandbox, which pull request
# builds (no token, no inject) would never test with the injected snippet, and workflow errors are
# not sent to Sentry. A workflow that imports runtime code from outside workflows/ needs it here too.
# The token is a BuildKit secret: it exists only during this RUN and lands in no layer and in no
# `docker image history`. A stage of its own, so the dev image does not run it.
FROM build AS release
# sentry-cli checks TLS against the system's certificates, which slim images lack (Node carries its
# own). This stage is not part of the runtime image, so the version is not pinned. Like the upload,
# a failure here (Debian mirrors down) does not hold back the build.
USER root
RUN { apt-get update \
      && apt-get install -y --no-install-recommends ca-certificates; } \
    || echo "ca-certificates not installed; the source map upload will fail on TLS." >&2; \
    rm -rf /var/lib/apt/lists/*
USER node
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then \
      { npx --no-install sentry-cli sourcemaps inject --ignore '**/temporal/workflows/**' dist \
        && npx --no-install sentry-cli sourcemaps upload --release "$SENTRY_RELEASE" dist; } \
      || echo "Source map upload to Sentry failed; stack traces of this release stay compiled JS." >&2; \
    else \
      echo "No SENTRY_AUTH_TOKEN: source maps are not uploaded."; \
    fi \
    && find dist -name '*.map' -delete

# Development (docker-compose.yml): sources are bind-mounted over src/, Nest recompiles on change.
# Nest's watcher finds the previous process with `ps`, which slim images lack.
FROM build AS dev
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/*
USER node
CMD ["npm", "run", "start:dev"]

# Production dependencies only. `prisma` is one of them: the runtime image runs `prisma migrate
# deploy`, and its approved install scripts fetch the schema engine for that.
FROM base AS prod-deps
USER node
COPY --chown=node:node package.json package-lock.json .npmrc prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
# Temporal's native module ships prebuilt binaries for five platforms (~150 MB); keep only this
# image's own Linux architecture.
RUN case "$(uname -m)" in \
      x86_64) keep=x86_64-unknown-linux-gnu ;; \
      aarch64) keep=aarch64-unknown-linux-gnu ;; \
      *) echo "unsupported architecture $(uname -m)" >&2; exit 1 ;; \
    esac \
    && find node_modules/@temporalio/core-bridge/releases -mindepth 1 -maxdepth 1 \
      ! -name "$keep" -exec rm -rf {} +

# Runtime: what the processes need to start, nothing else. Files are owned by root and only
# readable by the app user, so a compromised process cannot rewrite its own code.
FROM base AS runtime
ENV NODE_ENV=production
# --chown: COPY --from keeps the owner the files had in the build stage (the app user).
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
# "type": "module" tells Node that dist/*.js is ESM.
COPY package.json ./
# Schema, migrations and config for `prisma migrate deploy`.
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=release --chown=root:root /app/dist ./dist
# base gives /app to the app user; take it back, or the process could replace files in it.
RUN chown root:root /app
USER node
EXPOSE 3000
# The temporal-worker runs the same image with ["node", "dist/temporal/worker.js"].
CMD ["node", "dist/main.js"]
