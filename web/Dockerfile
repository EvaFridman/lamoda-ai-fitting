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

# Dependencies. Also the development target (docker-compose.yml): sources are bind-mounted and
# `next dev` runs on top, with no build step.
FROM base AS deps
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN npm ci
CMD ["npm", "run", "dev"]

# Production build. Needs no api, Redis or database: data from the api renders per request.
FROM deps AS build
COPY --chown=node:node . .
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

# Runtime: the standalone server and its static files, nothing else.
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
# The server writes its cache under .next at runtime, so this tree belongs to the app user.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
CMD ["node", "server.js"]
