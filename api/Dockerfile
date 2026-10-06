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
COPY --from=prod-deps /app/node_modules ./node_modules
# "type": "module" tells Node that dist/*.js is ESM.
COPY package.json ./
# Schema, migrations and config for `prisma migrate deploy`.
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# The temporal-worker runs the same image with ["node", "dist/temporal/worker.js"].
CMD ["node", "dist/main.js"]
