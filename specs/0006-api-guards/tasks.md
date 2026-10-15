# 0006 api guards, limiters, pipes and middleware: tasks

Status: done (2026-10-15); amended 2026-10-15 in T6: F20 and T5's review notes. History, not
instructions.
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
- 👤 Merge at a quiet time: the deploy recreates nginx, a few seconds down (F21).

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
- [x] **T6. nginx and CD send them too.** Proxy headers move into one included snippet with
      `X-Proxy-Secret ${PROXY_SECRET}` (on `/api/` and `/socket.io/`, not on `/`) and
      `X-Request-Id $request_id` (everywhere); `add_header X-Request-Id … always`,
      `proxy_hide_header X-Request-Id`; `log_format` with `$request_id`. `PROXY_SECRET` reaches
      nginx (`infra.yml`), api and web (`app.yml`) and the server's `.env` (`cd.yml`);
      `deploy/README.md` lists it. F18: the api's HTTP server refuses to start with an empty
      `PROXY_SECRET` and `NODE_ENV=production` (not the env schema the worker shares); `cd.yml` stops before writing `.env` when the secret is missing;
      `ci-deploy-check.sh` sets one. F20: `app.yml` gives web `${PROXY_SECRET:?…}`; web's
      `getServerEnv` refuses an empty one with `NODE_ENV=production`. From T5's security review:
      `/` keeps overwriting `X-Real-IP` and `X-Forwarded-For` (web trusts them and forwards them
      with the secret), sets `X-Proxy-Secret ""`, and `/socket.io/` gets the snippet too (its own
      `proxy_set_header` lines do not inherit); web's port stays unpublished. From T6's review
      (F18): the secret is 32+ letters or digits (api, web, and `cd.yml`'s first step, which also
      refuses it equal to `ADMIN_API_TOKEN`); `apply_nginx_config` rolls back all of `conf.d`; a
      rollback to the running copy recreates it when its config changed and checks readiness.
      Check: `scripts/ci-deploy-check.sh` passes; through the CI nginx a response's
      `X-Request-Id` is on nginx's and the api's log lines; a client-sent one is replaced, also
      through `/` (web forwards it to the api); after a rotated secret and a rollback to the
      running copy, it is trusted again. AC8, AC14.
      Commit: `feat(deploy): pass the proxy secret and the request id through nginx`
- [x] **T6b. Rotation without a gap (F21).** The api accepts `PROXY_SECRET_NEXT` as well
      (`request-context.ts`, env schema: same format, refused equal to `ADMIN_API_TOKEN`, may be
      empty); `app.yml` passes it to the api only; `cd.yml` writes it and checks its format when
      set; `.env.example`; `deploy/README.md` describes rotation in two deploys and drops T6's
      interim note. `deploy.sh` refuses a new `PROXY_SECRET` the serving api does not trust,
      before nginx is recreated (F21, added in review).
      Check: unit and e2e tests of both secrets; `ci-deploy-check.sh`'s rotation step goes
      through `PROXY_SECRET_NEXT` and also passes with a failed deploy in between; a secret the
      serving copy does not trust is refused with nginx unchanged. AC8.
      Commit: `feat(api): accept the next proxy secret while it is rotated`

After the merge of PR 1:

- 👤 On the public domain: two addresses get separate quotas; `X-Request-Id` is on the response
  (AC8, AC14). The deploy recreates nginx once (its new `PROXY_SECRET`): a few seconds down.
- 👤 Rotate `PROXY_SECRET` and deploy again: until the switch the old copy logged it (F18).

## PR 2 · `feat/0006-api-guards` · access, quotas, body, details, timeouts, sockets

- [x] **T7. Access closed by default.** `AccessGuard` (global), `@Public()`, `@AdminOnly()` as
      metadata (plan §2); public markers on health, hello, catalog reads and the gateway; the
      throttler guard registered before it in `AppModule`; marker test through `DiscoveryService`.
      `CLAUDE.md`: the admin access rule becomes "closed by default".
      Check: e2e: a test controller with no marker → 401; a public route with a wrong token → 200;
      wrong-token requests reach 429; 0004's e2e tests pass. AC1, AC2, AC3, AC6 (counting part).
      Commit: `feat(api): close every route that is not marked public or admin`
- [x] **T8. Quota tiers.** Six named throttlers and `TieredThrottlerGuard` (plan §3), `@Expensive()`;
      `THROTTLE_{READ,WRITE,EXPENSIVE}_{BURST,MINUTE}` replace `THROTTLE_LIMIT` and
      `THROTTLE_TTL_MS` in the env schema, `.env.example`, both compose files and the test setup.
      Check: e2e with low values: writes 429 while reads answer; burst and minute each give 429;
      admin requests are counted; the Redis-down test per tier. AC4–AC7.
      Commit: `feat(api): limit reads, writes and expensive routes separately`
- [x] **T9. Body limit and details cap.** `BODY_LIMIT` through `useBodyParser`; the validation pipe
      keeps N details plus `TOO_MANY_ERRORS` (plan §4). Backlog: "Cap on validation details" leaves.
      Check: e2e: 150 KB of JSON → 413 `PAYLOAD_TOO_LARGE`; unit: 60 unknown fields → 51 details.
      AC11 (api part), AC16.
      Commit: `feat(api): cap the body size and the validation details`
- [x] **T9b. One HTTP setup for the server and the tests.** Added in T9's review (owner,
      2026-10-15): the steps `server.ts` takes (no default parsers, request context, CORS, the
      JSON parser with `BODY_LIMIT`, the global pipe) were copied by hand into `createTestApp()`
      and the e2e specs, and five of them lacked the body limit. One function in `common/http/`
      takes them; `server.ts`, `createTestApp()` and every e2e that builds the app call it, and
      T10's timeout interceptor goes there. `CLAUDE.md`: the e2e setup rule names the function.
      Check: `npm run verify`; no e2e spec calls `useRequestContext` or `useBodyParser` itself.
      Commit: `refactor(api): set up the http app in one place`
- [x] **T10. Timeouts.** Timeout interceptor → 503; Node `keepAliveTimeout`, `headersTimeout`,
      `requestTimeout` (plan §4); `REQUEST_TIMEOUT_MS` in env.
      Check: e2e: a test route slower than a low timeout → 503 in the api's format; unit: the
      server's timeouts are set. AC15 (api part).
      Commit: `feat(api): answer 503 when a request runs too long`
- [x] **T11. Socket message size.** `maxHttpBufferSize` from `SOCKET_MAX_MESSAGE_BYTES` (plan §6).
      Check: e2e: a message over the limit closes the socket, `ping` still answers. AC12 (api part).
      Commit: `feat(api): limit the size of socket messages`

## PR 3 · `feat/0006-edge` · nginx limits and headers

- [x] **T12. Edge limits.** `limit_req` on `/api/` and `/socket.io/`, `limit_conn` on
      `/socket.io/`, `client_max_body_size 1m`, JSON answers for 429 and 413 (plan §5); a proxy
      read timeout above the api's. Backlog: "Request rate limit at the edge" and "WebSocket
      connections per client" leave.
      Check: through the CI nginx: a flood → 429 JSON while another address is served; 2 MB → 413
      JSON; the 11th socket from one address is refused; `ci-deploy-check.sh` passes (its request
      loop hits `/api/health/live`, outside the limit). AC10, AC11, AC12, AC15.
      Commit: `feat(deploy): limit requests and sockets per address at nginx`
- [x] **T13. Security headers.** Server-level `add_header … always`: `nosniff`,
      `frame-ancestors 'none'`, `Referrer-Policy` (plan §5). Backlog: "Security headers" leaves.
      Check: `curl -I` through the CI nginx on an api route, a web page and an nginx 429. AC13.
      Commit: `feat(deploy): send security headers on every response`

After the merge of PR 3:

- 👤 On the public domain: AC10–AC13 (flood, body, sockets, headers).

## PR 4 · `docs/0006-close` · acceptance

- [x] **T14. Acceptance record and close.** The table below filled in; `CLAUDE.md` checked against
      AC17; every file of this folder `Status: done`. The pull request carries `Closes #29`.
      Check: every AC has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0006`

## Acceptance record

Filled in by T14.

CI run 38697597004 is the merge of PR #54 (`e9bdb21`): its job Images (main) ran
`scripts/ci-deploy-check.sh` against the CI copy of nginx. 👤 marks the owner's checks on https://lamoda-ai-fitting.ru on
2026-10-15: after PR #51 (`08fbd13`) for AC8 and AC14, after PR #54 for AC10–AC13. Test files are
under `api/` unless named otherwise; all pass in `npm run verify`.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | `test/access-markers.e2e-spec.ts` walks every route of the app and fails on one with neither marker; `test/access.e2e-spec.ts`: a route with neither marker answers 401 to every request, the right token included                                                                                                                                                                                                                                                                                                                      |
| AC2  | pass   | `test/database/access.e2e-spec.ts`: GET of the catalog reads and `/health/live` answers 200 with no token, a wrong or the right one; `/users`, `/fitting-sessions` and `/ai-generations` answer 401 with no token or a wrong one; a catalog write answers 401 without the right token, HEAD 401 on an admin route and 200 on a public one; the public routes are listed in `PUBLIC_HANDLERS` of `test/access-markers.e2e-spec.ts`                                                                                                       |
| AC3  | pass   | `src/common/http/request-context.spec.ts`: the principal is anonymous with no token, a wrong or an empty one, admin with the right one; `test/access.e2e-spec.ts`: a public route answers 200 with a wrong token                                                                                                                                                                                                                                                                                                                        |
| AC4  | pass   | `test/throttling-tiers.e2e-spec.ts`: a client over its write quota gets 429 on writes while its reads answer 200; each request counts in one tier only                                                                                                                                                                                                                                                                                                                                                                                  |
| AC5  | pass   | `test/throttling-tiers.e2e-spec.ts`: 429 in the error format past the burst limit and past the minute limit, with `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                                         |
| AC6  | pass   | `test/throttling-tiers.e2e-spec.ts`, "admin requests": they count against the write quota with the right token and with a wrong one, and against the read quota with a wrong one; `test/throttling-realtime.e2e-spec.ts`: wrong-token requests reach 429                                                                                                                                                                                                                                                                                |
| AC7  | pass   | `test/throttling-realtime.e2e-spec.ts`: 429 over the limit with Redis down; `src/throttling/fallback-throttler-storage.spec.ts` and `.redis.spec.ts`: a Redis that fails or stops answering is replaced by counting in memory. The storage is shared by every tier                                                                                                                                                                                                                                                                      |
| AC8  | pass   | 👤 After 22 requests from the owner's machine `X-RateLimit-Remaining: 78`; from the server in the same minute `99`. web: `web/src/shared/api/api-fetch.test.ts` sends the visitor's address, and its own `X-Proxy-Secret`, dropping the caller's; `test/request-context.e2e-spec.ts` gives each forwarded address its own quota with the secret                                                                                                                                                                                         |
| AC9  | pass   | `test/request-context.e2e-spec.ts`: without the secret, or with a wrong one, requests share one quota whatever `X-Forwarded-For` says                                                                                                                                                                                                                                                                                                                                                                                                   |
| AC10 | pass   | CI: floods of 100 unknown routes, 100 broken JSON bodies and 200 liveness requests from one address: 59, 83 and 97 answered nginx's 429, every one `application/json` with `TOO_MANY_REQUESTS`; then 5 requests from another address answered 200. 👤 A flood of 400 unknown routes: 48 × 404 from the api, 352 × 429 `application/json` `TOO_MANY_REQUESTS`; then `/api/hello` from the server answered 200. Both send the other address's request right after the flood, not during it (F39)                                          |
| AC11 | pass   | CI and 👤: a 2 MB body answers 413 `application/json` `PAYLOAD_TOO_LARGE`. api: `test/errors.e2e-spec.ts`, a JSON body of 101 KB or 150 KB answers 413 `PAYLOAD_TOO_LARGE`, 102400 bytes is read, a gzip body that inflates past the limit answers 413                                                                                                                                                                                                                                                                                  |
| AC12 | pass   | CI: one address holds 10 sockets, the 11th answers 429 `TOO_MANY_REQUESTS` in JSON, another address connects. 👤 10 sockets held for 30 s, the 11th answered 429 `TOO_MANY_REQUESTS` in JSON. Message size: `test/socket-message-size.e2e-spec.ts`, a message over the limit closes the socket (413 over long-polling) and never reaches the gateway                                                                                                                                                                                    |
| AC13 | pass   | CI: `/` and `/api/hello` carry `nosniff`, `frame-ancestors 'none'` and `strict-origin-when-cross-origin` once each, and so do nginx's 429 and 413. 👤 The same on `/` and `/api/hello`; nginx's 429 carries `nosniff`                                                                                                                                                                                                                                                                                                                   |
| AC14 | pass   | 👤 `curl -sI -H 'X-Request-Id: mine' /api/hello`: one `X-Request-Id`, 32 hex, the client's value replaced. CI: the ids of `/` and `/api/hello` are on nginx's and the api's log lines. Sentry: `src/common/http/request-context.spec.ts` calls the isolation scope's `setTag('request_id', …)` with the id answered in `X-Request-Id`; no 5xx event has reached Sentry since the request id was added, so no real event was seen (F39). web: `web/src/shared/api/api-fetch.test.ts` replaces the caller's request id with the visitor's |
| AC15 | pass   | `test/request-timeout.e2e-spec.ts`: a route slower than the timeout answers 503 `SERVICE_UNAVAILABLE` in the error format. nginx: by configuration, `proxy_read_timeout 60s` on `/api/` against `REQUEST_TIMEOUT_MS` of at most 30 s (env schema) plus 1 s of the throttler's Redis call; not exercised (F39)                                                                                                                                                                                                                           |
| AC16 | pass   | `src/common/validation/validation-pipe.spec.ts`: 60 unknown fields answer 50 details and one `TOO_MANY_ERRORS`; `test/errors.e2e-spec.ts`: the same for `POST /products` with 60 unknown fields and `GET /products` with 51 unknown parameters                                                                                                                                                                                                                                                                                          |
| AC17 | pass   | `CLAUDE.md`, "Conventions": access closed by default, the request context and request id, `PROXY_SECRET`, `PROXY_SECRET_NEXT`, `THROTTLE_*`, `BODY_LIMIT`, `REQUEST_TIMEOUT_MS`, `SOCKET_MAX_MESSAGE_BYTES`; `.env.example` lists all of them; `specs/backlog.md` has lost the four items of F2 and has "IDOR checks with auth (0006 F4)"                                                                                                                                                                                               |
