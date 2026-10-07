# syntax=docker/dockerfile:1

# Exact versions: an image built today and in a month must be the same. Bump Node together with
# .nvmrc and CI; npm together with CI's NPM_VERSION.
ARG NODE_IMAGE=node:26.10.0-trixie-slim
ARG NPM_VERSION=12.2.0

# npm 12 (Node images ship 11): install scripts run only for packages approved in allowScripts.
FROM ${NODE_IMAGE} AS base
ARG NPM_VERSION
RUN npm install -g "npm@${NPM_VERSION}" && npm cache clean --force
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN chown node:node /app

# Dependencies.
FROM base AS deps
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN npm ci

# Dependencies plus the whole project: configs (tsconfig.json with the @/ alias, next.config.ts,
# instrumentation) and sources.
FROM deps AS source
COPY --chown=node:node . .

# Development (docker-compose.yml): app/ and src/ are bind-mounted over the copy and `next dev`
# reloads on change. A config change needs `docker compose up -d --build web`.
FROM source AS dev
CMD ["npm", "run", "dev"]

# Production build. Needs no api, Redis or database: data from the api renders per request.
FROM source AS build
# NEXT_PUBLIC_* are inlined into the browser bundle at build time, so one image per environment.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
# Source map upload (only when the token secret is given; see next.config.ts).
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_RELEASE
# The Sentry token is a BuildKit secret: it exists only during this RUN and lands in no layer and
# in no `docker image history`. Without it the build skips source maps.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    npm run build

# Runtime: the standalone server, its static files and public/ (the standalone output leaves both
# out; public/ holds the placeholder images under /media/), nothing else. Files are owned by root
# and only readable by the app user, so a compromised process cannot rewrite its own code; the
# server's cache under .next/cache is the only place it writes.
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
# --chown: COPY --from keeps the owner the files had in the build stage (the app user).
COPY --from=build --chown=root:root /app/.next/standalone ./
COPY --from=build --chown=root:root /app/.next/static ./.next/static
COPY --from=build --chown=root:root /app/public ./public
# base gives /app to the app user; take it back, or the process could replace files in it.
RUN chown root:root /app \
    && mkdir -p .next/cache \
    && chown node:node .next/cache
USER node
EXPOSE 3001
CMD ["node", "server.js"]
