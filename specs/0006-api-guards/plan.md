# 0006 api guards, limiters, pipes and middleware: plan

Status: done (2026-10-15); amended 2026-10-15 in T4–T12 by the decisions they added to
`clarifications.md`. History, not instructions.

How spec 0006 is built. Decisions: [clarifications.md](clarifications.md); criteria:
[spec.md](spec.md).

## 1. Request context (F4, F10, F13)

One Express middleware, `common/http/request-context.ts`, registered in `server.ts` before Nest's
own middleware, so pino, Sentry, the throttler, the guards and the filter all read its result with
`requestContextOf(req)` (kept in a `WeakMap` keyed by the request, so Express's `Request` type
needs no extension):

- **Trusted source.** A request is trusted when its `X-Proxy-Secret` header equals `PROXY_SECRET`
  (compared like the admin token: SHA-256 digests and `timingSafeEqual`). nginx sends the header
  on `/api/` and `/socket.io/`, web's `apiFetch` sends it on every call. An empty `PROXY_SECRET`
  trusts nothing. A set `PROXY_SECRET_NEXT` is accepted too, compared the same way (rotation in
  two deploys, F21).
- **Client address.** Trusted: the single address in `X-Forwarded-For` (nginx and web both send
  exactly one). Otherwise: the socket's address. `trust proxy` is turned off; `req.ip` is no longer
  read anywhere.
- **Request id.** Trusted and a valid `X-Request-Id` (32 hex characters, nginx's `$request_id`):
  that id. Otherwise a new `randomUUID()`. The response gets `X-Request-Id`; pino-http's `genReqId`
  returns it; `Sentry.getIsolationScope().setTag('request_id', id)`.
- **Principal.** `admin` when `X-Admin-Token` matches `ADMIN_API_TOKEN` (the comparison moves here
  from `AdminGuard`), else `anonymous`. `@CurrentPrincipal()` (`common/auth/`) reads it.

## 2. Access closed by default (F3, F16)

- `common/auth/access.guard.ts`, a global `APP_GUARD`. Metadata: `@Public()` and `@AdminOnly()`
  (now `SetMetadata` + `ApiSecurity('admin')`, no own guard). Neither → 401 `UNAUTHORIZED`;
  `@AdminOnly()` and principal not `admin` → 401; `@Public()` → through, whatever the token (F16).
- Controllers made public: health, hello, the public reads of the catalog (per route, next to the
  `@AdminOnly()` writes), the socket gateway (global guards also run for gateway handlers).
- **Order.** The throttler guard runs before the access guard, so a request with a wrong token is
  counted before it is refused (F5, AC6). Both `APP_GUARD`s are registered in one place
  (`AppModule.providers`) in that order, with a comment.
- **Marker test.** An e2e test walks every controller method through Nest's `DiscoveryService`
  and fails on one without either marker (AC1).

## 3. Quota tiers (F5, F6)

- `ThrottlerModule` gets six named throttlers: `read-burst`, `read-minute`, `write-burst`,
  `write-minute`, `expensive-burst`, `expensive-minute` (burst window 1 s, minute window 60 s).
- `throttling/tiered-throttler.guard.ts` extends `ThrottlerGuard`: `handleRequest` skips the
  throttlers of other tiers; the tier is `expensive` with `@Expensive()`, else `read` for
  GET/HEAD, else `write`. `getTracker` returns `requestContextOf(req).clientAddress`.
- `FallbackThrottlerStorage` stays as it is (0001 B12b). `@SkipThrottle()` on health and the gateway
  stays.
- `@Expensive()` is applied to no route now: AI generations and photo upload do not start work
  yet (0004 E12).

## 4. Pipes, body, timeouts (F11, F12, F14)

- **Body.** `app.useBodyParser('json', { limit: BODY_LIMIT })` in `server.ts`; the filter's
  `entity.too.large` mapping stays.
- **Details cap.** `createValidationPipe`'s `exceptionFactory` keeps the first `N` details and adds
  `{ field: '', code: 'TOO_MANY_ERRORS', message: '<k> more errors' }`.
- **Timeout.** A global interceptor (`common/http/timeout.interceptor.ts`, HTTP context only):
  after `REQUEST_TIMEOUT_MS` → `RequestTimeoutError` (an `AppException('SERVICE_UNAVAILABLE')`;
  its own Observable, not rxjs `timeout`, so the handler is still listened to). The handler's work
  is not cancelled (no cancellation through Prisma); the timeout only answers the client. Changed
  in T10's review (owner, 2026-10-15; the plan had "reported to Sentry like every 5xx"): the first
  timeout of a route within a minute goes to Sentry, repeats only to the log; the handler is
  listened to after the timeout and its end is logged as a warning with the request id (F29). The
  shared Redis client gets `commandTimeout` 1 s, and after a failed command the throttler counts in
  memory for 10 s before one request tries Redis again (F28).
- **Node server.** After `listen`: `keepAliveTimeout` 65 s, above nginx's upstream keep-alive
  (60 s, `keepalive 16` in `active.conf`), so nginx never reuses a socket Node has just closed
  (today Node's 5 s default allows that race); `requestTimeout` 30 s and `headersTimeout` 30 s
  (Node requires it to be at most `requestTimeout`; changed in T10's review, owner, 2026-10-15:
  the plan had 66 s, from the rule of Node before 18 that it exceed `keepAliveTimeout`).

## 5. nginx (F7, F8, F9, F10, F12, F13, F17)

In `deploy/nginx/templates/default.conf.template`:

- `limit_req_zone $binary_remote_addr` zones `edge_api` and `edge_socket`, `limit_conn_zone`
  `edge_sockets` (`api` and `web` are already the upstream zones' names); `limit_req` with
  `nodelay` (F32) on `location /api/` and `/socket.io/`; `/api/health/live` (the deploy's request
  loop) gets its own generous zone (F36), web pages none (F37). `limit_req_status 429`,
  `limit_conn_status 429`.
- `client_max_body_size 1m` at the server level (web takes no uploads).
- `error_page 413` and `error_page 429` → named locations that `return` JSON in the api's format
  (`default_type application/json`); `/api/` also maps nginx's 502 and 504 to a JSON 503, with
  `proxy_read_timeout 60s` (F33).
- `location ~* ^/api/socket\.io` answers 404 `ROUTE_NOT_FOUND` in the api's format, so socket.io
  is reached only through `/socket.io/` and its limits (F35).
- Client timeouts of 10 s (header, body, send) and `keepalive_timeout 15s`; `limit_conn`
  `edge_conns` 50 per address at the server level (repeated in `/socket.io/`); zone `edge_health`
  on `/api/health/live` (F36). Web pages stay without `limit_req` (F37).
- Server-level `add_header … always`: `X-Content-Type-Options nosniff`,
  `Content-Security-Policy "frame-ancestors 'none'"`, `Referrer-Policy
strict-origin-when-cross-origin`, `X-Request-Id $request_id`; `proxy_hide_header X-Request-Id`
  so the api's copy is not doubled. No location gets its own `add_header` (it would drop these, as
  the HSTS comment already warns).
- The proxy headers move into one snippet (`templates/proxy-headers.conf.template`) included by
  the server block and `/socket.io/`, adding `X-Request-Id $request_id` and
  `X-Proxy-Secret ${PROXY_SECRET}` (the image fills it from the environment like `SITE_DOMAIN`).
  `/` (web) gets `X-Request-Id` but not the secret.
- `log_format` with `$request_id`, used by `access_log`.

## 6. socket.io (F8, F30, F31)

`SocketIoAdapter`: `maxHttpBufferSize` from `SOCKET_MAX_MESSAGE_BYTES` (at most 1 MB); a bigger
message never reaches the gateway: it closes a WebSocket connection, and over long-polling its
request answers 413 (F30). Its parser takes no binary attachments from clients: a message that
announces one closes the connection (F31).

## 7. web

`apiFetch` sends `X-Proxy-Secret` (server env `PROXY_SECRET`, zod schema in `shared/config`) and
forwards the incoming `x-request-id`. Its 5 s timeout stays below the api's 10 s.

## Values

| What                       | Value                 | Why                                                                 |
| -------------------------- | --------------------- | ------------------------------------------------------------------- |
| read                       | 10/s, 300/min         | a page makes a few api calls; filtering clicks come in bursts       |
| write                      | 3/s, 60/min           | only admin scripts write today                                      |
| expensive                  | 1/s, 10/min           | an AI generation will cost money                                    |
| nginx `/api/`              | 20 r/s, burst 40      | twice the read burst: never hit by a client within the api's quotas |
| nginx `/socket.io/`        | 10 r/s, burst 20      | long-polling before the upgrade makes a few requests                |
| `limit_conn` sockets       | 10 per address        | a few tabs per person, a small office behind NAT                    |
| nginx `/api/health/live`   | 50 r/s, burst 100     | five times the deploy's request loop from one address (F36)         |
| `limit_conn` requests      | 50 per address        | a browser holds at most 6 connections per host (F36)                |
| nginx client timeouts      | 10 s; keep-alive 15 s | bounds a slow client; a pause in a body, not the whole body (F36)   |
| `SOCKET_MAX_MESSAGE_BYTES` | 64 KB                 | only `ping` exists                                                  |
| `BODY_LIMIT`               | 100 KB                | today's implicit value                                              |
| `REQUEST_TIMEOUT_MS`       | 10 000                | the slowest list today answers well under a second                  |
| N (details)                | 50                    | backlog's example; a DTO has far fewer fields                       |

## Environment

| Variable                                                       | Package         | Default               | Production                                                        |
| -------------------------------------------------------------- | --------------- | --------------------- | ----------------------------------------------------------------- |
| `PROXY_SECRET`                                                 | api, web, nginx | `''` (trusts nothing) | GitHub secret → server `.env`; `init-env.sh` generates it locally |
| `PROXY_SECRET_NEXT`                                            | api             | `''`                  | GitHub secret → server `.env`, set only while rotating (F21)      |
| `THROTTLE_{READ,WRITE,EXPENSIVE}_{BURST,MINUTE}`               | api             | the values above      | compose defaults                                                  |
| `BODY_LIMIT`, `REQUEST_TIMEOUT_MS`, `SOCKET_MAX_MESSAGE_BYTES` | api             | the values above      | compose defaults                                                  |

`THROTTLE_LIMIT` and `THROTTLE_TTL_MS` are removed; tests set the tiers low instead
(`api/vitest.config.ts`, `test/support/test-app.ts`). A release that removes them is safe: compose
stops passing them in the same commit.

## Backlog

Removed by the closing commits: "Request rate limit at the edge", "Security headers", "WebSocket
connections per client", "Cap on validation details". Added: "IDOR checks with auth" (F4).

## Risks

- **Middleware order.** The request-context middleware, the body parser, pino-http and Nest's
  guards must run in that order: `useRequestContext(app)` comes before `init()` and before any
  `useBodyParser()`. A body the parser refuses (BAD_JSON, PAYLOAD_TOO_LARGE) never reaches
  pino-http, so the error filter writes the request id on its own line. The first task proves it
  with a test that reads the request id from a BAD_JSON response's log line.
- **The secret in nginx.** It sits in the rendered config inside the nginx container; it only
  proves "came through our proxy", grants no data access, and is rotated in two deploys through
  `PROXY_SECRET_NEXT` (F21, `deploy/README.md`); `deploy.sh` refuses a new secret the serving api
  does not trust yet.
- **NAT.** An office behind one address shares the edge limit and the api's quotas; the values above
  leave room for a few people.
- **Rename of `@AdminOnly()` internals.** 0004's admin tests must still pass unchanged (AC2).
- **Overlap with 0005.** Its tasks change `deploy/compose/app.yml` and the CI workflows; rebase
  before each phase's pull request (F1).

## How each criterion is verified

| AC         | Check                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| AC1        | marker e2e test; e2e with a test controller without markers → 401                                                                    |
| AC2        | 0004's e2e tests unchanged; qa-tester on public reads                                                                                |
| AC3        | unit test of the middleware; e2e: public route with a wrong token → 200                                                              |
| AC4–AC6    | e2e with low tier values: writes 429, reads 200; wrong-token requests reach 429                                                      |
| AC7        | the existing Redis-down e2e test, per tier                                                                                           |
| AC8        | qa-tester: two `X-Forwarded-For` with the secret → separate quotas                                                                   |
| AC9        | e2e: without the secret, changing `X-Forwarded-For` keeps one quota                                                                  |
| AC10–AC12  | CI deploy check against the local nginx: flood → 429 JSON, 2 MB body → 413 JSON, 11th socket refused; production repeat by the owner |
| AC13, AC14 | `curl -I` locally through the CI nginx and on the public domain; log line and Sentry tag by id                                       |
| AC15       | e2e with a test route slower than a low `REQUEST_TIMEOUT_MS` → 503                                                                   |
| AC16       | unit test of the pipe: 60 unknown fields → 51 details                                                                                |
| AC17       | review of `CLAUDE.md`, `.env.example`, `specs/backlog.md`                                                                            |
