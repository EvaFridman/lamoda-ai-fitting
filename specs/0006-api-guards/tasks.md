# 0006 api guards, limiters, pipes and middleware: tasks

Status: accepted (2026-10-15).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`. Before opening one, rebase onto `main` if spec 0005 merged meanwhile
  (F1).
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box.
- PR 1 carries the whole chain of the client address (api, web, nginx, the secret in CD) in one
  release: an api that checks the secret before nginx and web send it would count every visitor as
  one address.
- The last pull request carries `Closes #29` under "Что сделано" (F15).

## PR 0 · `docs/0006-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (F1–F17).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0006`
- [x] **T2. Plan.** `plan.md`; F13 revised (no subnet list).
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0006`
- [x] **T3. Tasks.** This file; the backlog gets "IDOR checks with auth" (F4).
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0006`

## PR 1 · `feat/0006-request-context` · client address, request id, principal

Before the merge:

- 👤 Add `PROXY_SECRET` to GitHub Environment `production` (`openssl rand -hex 32`).

- [x] **T4. Request context in the api.** `common/http/request-context.ts` (plan §1): trusted source
      by `X-Proxy-Secret`, client address, request id, principal; `@CurrentPrincipal()`;
      `trust proxy` off; pino-http `genReqId`; Sentry tag `request_id`; `X-Request-Id` on every
      response. `AdminGuard` reads the principal instead of comparing the token itself. `PROXY_SECRET`
      in the env schema (refused when equal to a set `ADMIN_API_TOKEN`, F19), `.env.example`,
      `docker-compose.yml`, `scripts/init-env.sh`. The throttler's `getTracker` reads the context's
      address.
      Check: unit tests of the middleware (secret right, wrong, empty; id valid, invalid, missing);
      e2e: without the secret a changed `X-Forwarded-For` keeps one quota (AC9); a `BAD_JSON`
      response carries an `X-Request-Id` that is on its log line (plan, Risks); 0004's admin
      tests pass unchanged. AC3 (principal part), AC9.
      Commit: `feat(api): read the client address and request id from trusted proxies only`
- [x] **T5. web forwards the secret and the request id.** `apiFetch` sends `X-Proxy-Secret` (server
      env `PROXY_SECRET`, zod schema in `shared/config`) and the incoming `x-request-id`;
      `docker-compose.yml` passes the secret to web.
      Check: unit test of `apiFetch` headers; locally, two page loads with different
      `X-Real-IP` through web count as two clients in the api's log. AC8 (web part).
      Commit: `feat(web): send the proxy secret and the request id to the api`
- [ ] **T6. nginx and CD send them too.** Proxy headers move into one included snippet with
      `X-Proxy-Secret ${PROXY_SECRET}` (on `/api/` and `/socket.io/`, not on `/`) and
      `X-Request-Id $request_id` (everywhere); `add_header X-Request-Id … always`,
      `proxy_hide_header X-Request-Id`; `log_format` with `$request_id`. `PROXY_SECRET` reaches
      nginx (`infra.yml`), api and web (`app.yml`) and the server's `.env` (`cd.yml`);
      `deploy/README.md` lists it. F18: the api's env schema refuses an empty `PROXY_SECRET` with
      `NODE_ENV=production`; `cd.yml` stops before writing `.env` when the secret is missing;
      `ci-deploy-check.sh` sets one.
      Check: `scripts/ci-deploy-check.sh` passes; through the CI nginx a response's
      `X-Request-Id` is on nginx's and the api's log lines; a client-sent one is replaced. AC8,
      AC14.
      Commit: `feat(deploy): pass the proxy secret and the request id through nginx`

After the merge of PR 1:

- 👤 On the public domain: two addresses get separate quotas; `X-Request-Id` is on the response
  (AC8, AC14).

## PR 2 · `feat/0006-api-guards` · access, quotas, body, details, timeouts, sockets

- [ ] **T7. Access closed by default.** `AccessGuard` (global), `@Public()`, `@AdminOnly()` as
      metadata (plan §2); public markers on health, hello, catalog reads and the gateway; the
      throttler guard registered before it in `AppModule`; marker test through `DiscoveryService`.
      `CLAUDE.md`: the admin access rule becomes "closed by default".
      Check: e2e: a test controller with no marker → 401; a public route with a wrong token → 200;
      wrong-token requests reach 429; 0004's e2e tests pass. AC1, AC2, AC3, AC6 (counting part).
      Commit: `feat(api): close every route that is not marked public or admin`
- [ ] **T8. Quota tiers.** Six named throttlers and `TieredThrottlerGuard` (plan §3), `@Expensive()`;
      `THROTTLE_{READ,WRITE,EXPENSIVE}_{BURST,MINUTE}` replace `THROTTLE_LIMIT` and
      `THROTTLE_TTL_MS` in the env schema, `.env.example`, both compose files and the test setup.
      Check: e2e with low values: writes 429 while reads answer; burst and minute each give 429;
      admin requests are counted; the Redis-down test per tier. AC4–AC7.
      Commit: `feat(api): limit reads, writes and expensive routes separately`
- [ ] **T9. Body limit and details cap.** `BODY_LIMIT` through `useBodyParser`; the validation pipe
      keeps N details plus `TOO_MANY_ERRORS` (plan §4). Backlog: "Cap on validation details" leaves.
      Check: e2e: 150 KB of JSON → 413 `PAYLOAD_TOO_LARGE`; unit: 60 unknown fields → 51 details.
      AC11 (api part), AC16.
      Commit: `feat(api): cap the body size and the validation details`
- [ ] **T10. Timeouts.** Timeout interceptor → 503; Node `keepAliveTimeout`, `headersTimeout`,
      `requestTimeout` (plan §4); `REQUEST_TIMEOUT_MS` in env.
      Check: e2e: a test route slower than a low timeout → 503 in the api's format; unit: the
      server's timeouts are set. AC15 (api part).
      Commit: `feat(api): answer 503 when a request runs too long`
- [ ] **T11. Socket message size.** `maxHttpBufferSize` from `SOCKET_MAX_MESSAGE_BYTES` (plan §6).
      Check: e2e: a message over the limit closes the socket, `ping` still answers. AC12 (api part).
      Commit: `feat(api): limit the size of socket messages`

## PR 3 · `feat/0006-edge` · nginx limits and headers

- [ ] **T12. Edge limits.** `limit_req` on `/api/` and `/socket.io/`, `limit_conn` on
      `/socket.io/`, `client_max_body_size 1m`, JSON answers for 429 and 413 (plan §5); a proxy
      read timeout above the api's. Backlog: "Request rate limit at the edge" and "WebSocket
      connections per client" leave.
      Check: through the CI nginx: a flood → 429 JSON while another address is served; 2 MB → 413
      JSON; the 11th socket from one address is refused; `ci-deploy-check.sh` passes (its request
      loop hits `/api/health/live`, outside the limit). AC10, AC11, AC12, AC15.
      Commit: `feat(deploy): limit requests and sockets per address at nginx`
- [ ] **T13. Security headers.** Server-level `add_header … always`: `nosniff`,
      `frame-ancestors 'none'`, `Referrer-Policy` (plan §5). Backlog: "Security headers" leaves.
      Check: `curl -I` through the CI nginx on an api route, a web page and an nginx 429. AC13.
      Commit: `feat(deploy): send security headers on every response`

After the merge of PR 3:

- 👤 On the public domain: AC10–AC13 (flood, body, sockets, headers).

## PR 4 · `docs/0006-close` · acceptance

- [ ] **T14. Acceptance record and close.** The table below filled in; `CLAUDE.md` checked against
      AC17; every file of this folder `Status: done`. The pull request carries `Closes #29`.
      Check: every AC has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0006`

## Acceptance record

Filled in by T14.

| AC   | Result | Evidence |
| ---- | ------ | -------- |
| AC1  |        |          |
| AC2  |        |          |
| AC3  |        |          |
| AC4  |        |          |
| AC5  |        |          |
| AC6  |        |          |
| AC7  |        |          |
| AC8  |        |          |
| AC9  |        |          |
| AC10 |        |          |
| AC11 |        |          |
| AC12 |        |          |
| AC13 |        |          |
| AC14 |        |          |
| AC15 |        |          |
| AC16 |        |          |
| AC17 |        |          |
