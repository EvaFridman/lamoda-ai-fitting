# 0006 api guards, limiters, pipes and middleware: clarifications

Status: done (2026-10-15). History, not instructions.

The owner's decisions for this spec. Ids `F1`, `F2`, … are referred to by the spec, the plan and
code comments.

## Order

- **F1. Number and order.** This spec is 0006 (0005 G2), written in parallel with 0005 in a second
  worktree. A merge of either spec is announced in the other's session, and the branch that merges
  later rebases onto `main`. Shared files: `specs/backlog.md`, `CLAUDE.md`,
  `deploy/compose/app.yml`, `deploy/README.md`.

## Scope

- **F2. Backlog items taken.** "Request rate limit at the edge", "Security headers", "WebSocket
  connections per client" and "Cap on validation details". The last one was left to the web spec
  (now 0007); it is decided here so 0007 is written against a fixed error contract. The commit that
  closes an item removes it from the backlog.
- **F3. Auth is a skeleton only.** No login, sessions or user accounts (0004 E1 stays: the admin
  token is the only key). Access becomes closed by default: a global access guard answers 401 for
  a route that carries neither `@Public()` nor `@AdminOnly()`, and a test fails when a route has
  neither. This replaces the rule "`@AdminOnly()` per controller or route, never global" in
  `CLAUDE.md`: a forgotten decorator now closes a route instead of opening it.
- **F4. Principal and IDOR.** The skeleton records who sends a request (anonymous or admin) on the
  request and gives a decorator to read it, so the auth spec only adds a user. Checks that a
  resource belongs to the user who asks (IDOR) come with the auth spec: there are no users yet, and
  every user-scoped route is admin-only, where the admin sees everything. A backlog item records
  that the auth spec owes them.
- **F16. A wrong token on a public route.** The request is served as anonymous, not answered 401:
  a stray header must not break public reads. Only `@AdminOnly()` routes reject a wrong token.

## Limits

- **F5. The admin token is temporary.** It goes away when auth lands, so it gets no quota tier of
  its own: admin routes count by their class (F6), and a request with a wrong token counts like any
  anonymous one, so guessing the token runs into the limit.
- **F6. Quota tiers in the api.** Three named tiers: read, write and expensive. Each has a short
  burst window and a minute window, with values from the environment. "Expensive" ships with its
  decorator for AI generations and photo upload, applied to at most one route now. While Redis is
  unreachable, counters fall back to process memory as before (0001 B12b).
- **F7. Edge limit.** nginx `limit_req` per client address on `/api/` and `/socket.io/`, set above
  the api's quotas: a coarse safety net that stops a flood before Node, including what the api's
  guard never counts (unknown routes, broken or oversized bodies, 0004 E49). The exact quotas stay
  in the api. Visitors behind one NAT share the edge limit; at that threshold this is accepted.
- **F17. nginx's 429.** A request over the edge limit answers 429 `TOO_MANY_REQUESTS` in the api's
  error format, not nginx's default 503 HTML page, so web handles one error format (as with 413,
  F12).
- **F32. A burst passes at once.** Added in T12 (owner, 2026-10-15): `limit_req` takes its burst
  with `nodelay`: requests within the burst are served at once, not spread over time, and the next
  one answers 429, so a page's parallel calls are not slowed. nginx's 429 sends no `Retry-After`: an
  `add_header` in its location would drop the server's headers, and the api's own 429 tells the
  exact wait.
- **F33. nginx's 502 and 504 in the api's format.** Added in T12 (owner, 2026-10-15): on `/api/`,
  nginx's own 502 (no copy of the api answers) and 504 answer 503 `SERVICE_UNAVAILABLE` in the
  api's format, as the api's own timeout does (F11); the api's errors pass unchanged. nginx's proxy
  read timeout on `/api/` is 60 s, above the api's longest answer (30 s at most, F27, and 1 s of
  Redis, F28).
- **F8. WebSockets.** nginx `limit_conn` per client address on `/socket.io/`, and a maximum message
  size in socket.io. Limits on socket messages still wait for the first real socket feature
  (0001 B12c).
- **F30. An upper bound on `SOCKET_MAX_MESSAGE_BYTES`.** Added in T11 (owner, 2026-10-15): the
  default is 64 KB (65 536 bytes); the api refuses to start with a value over 1 MB. nginx does not
  limit the size of WebSocket frames, so the api's limit is the only one and a typo must not lift it.
  Over long-polling a bigger message's request answers 413 and the session stays open (engine.io's
  behavior); the gateway does not see the message either way.
- **F31. No binary messages from clients.** Added in T11's review (owner, 2026-10-15): each binary
  attachment of a socket.io message passes the size limit on its own, and the parser holds them
  with no timeout until the last one arrives (up to 10), so one socket could hold about ten limits.
  The api's parser takes no attachments: a client message that announces one closes the
  connection. The server's own messages (pushes) may still carry binary data. A feature that needs
  binary data from clients allows one attachment (`maxAttachments: 1`) and decides its budget.
- **F34. `worker_connections` stays.** Added in T12 (owner, 2026-10-15): nginx keeps its image's
  1024 connections per worker (one worker per core); a socket takes two (client and api). With 10
  sockets per address (F8) and 50 requests in progress (F36), using them up through requests takes
  dozens of addresses at once. One address can still hold connections no nginx limit counts: those
  that have not sent a whole header and idle keep-alive ones. F36's timeouts bound each (10 s,
  15 s, none kept on the redirect servers), and a
  per-address connection limit in the server's firewall (backlog) closes it. Raising
  `worker_connections` needs our own `nginx.conf` and a higher `nofile` limit; nginx logs
  "worker_connections are not enough" when it runs out. Revisit with the first real socket feature
  (0001 B12c).
- **F35. socket.io only at `/socket.io/`.** Added in T12's review (owner, 2026-10-15): `/api/`
  strips its prefix, so `/api/socket.io/` reached socket.io's long-polling past the socket limits
  (F8). nginx answers any path under `/api/socket.io` with 404 `ROUTE_NOT_FOUND` in the api's
  format; no client uses it.
- **F36. Slow clients and liveness.** Added in T12's review (owner, 2026-10-15): nginx's limits
  count a request only once its header is read, and a body is read at the client's pace, so one
  address could hold many connections. `client_header_timeout`, `client_body_timeout` and
  `send_timeout` are 10 s (nginx's default 60 s), `keepalive_timeout` 15 s (the image's 65 s; 0 on
  the redirect-only servers, port 80 and `www`, as `limit_conn` does not count idle connections), and
  one address has at most 50 requests in progress on the whole site (`limit_conn`), sockets
  included; a 1 MB body is not cut by the body timeout, which counts each pause. `/api/health/live`,
  the one path into Node no limit counted, gets its own zone: 50 r/s, burst 100, five times the
  deploy's request loop from one address.
- **F37. web pages have no rate limit yet.** Added in T12's review (owner, 2026-10-15): `/` (pages,
  `/_next/static/`, `/media/`) stays outside `limit_req`; F36's connection limit applies. A page
  render costs more than an api request, but a page loads dozens of static files and Next
  prefetches the links in view, so a threshold needs the real catalog pages (0007), measured, with
  static files in their own locations. Accepted until then; in the backlog.
- **F22. A wrong token counts per route.** Added in T7's review (owner, 2026-10-15): the api's
  limit keeps a counter per route and client address (as `@nestjs/throttler` keys it), so F5's
  "guessing the token runs into the limit" holds per route; guessing across many admin routes is
  capped by the edge limit (F7). No separate counter of failed admin tokens: the token has at least
  32 characters and goes away with auth (F5).
- **F23. The minute window is checked first.** Added in T8's review (owner, 2026-10-15): a tier's
  minute window is checked before its burst window, so a client already over its minute quota is
  told the minute's wait in `Retry-After` (else, sending faster than its burst limit, it was told
  1 s). A request refused by the burst window counts against the minute quota too; when that request
  is the one that uses the quota up, it is still told 1 s and the next one gets the minute's wait. The guard
  also sets the standard `Retry-After`, as named throttlers set only `Retry-After-<name>`. A
  per-route `@Throttle()` names one of its tier's two throttlers, and `@SkipThrottle()` is allowed
  only on a listed class (health, the gateway); a test fails otherwise.

## Requests

- **F9. Security headers.** nginx adds them to every response of api and web:
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'` and a
  `Referrer-Policy`. A full Content Security Policy for web comes with its pages. Local development
  runs without nginx and so without these headers.
- **F38. Not on the redirect servers.** Added in T13 (owner, 2026-10-15): F9's headers are set in
  the main server only, so they cover api, web and nginx's own answers there. Port 80 and `www`
  answer only a 301 (port 80 also the ACME challenge and its health check): a redirect has nothing
  to frame or sniff, and its referrer goes to the same site. A scanner pointed at them reports the
  headers missing; if `www` ever serves content, it gets them.
- **F10. Request id.** nginx creates the id (`$request_id`), ignores one sent by the client, and
  passes it to api and web; `apiFetch` forwards it on web's calls to the api. The api writes it to
  its log lines, tags Sentry events with it and answers it in `X-Request-Id`. The error body does
  not change.
- **F11. Timeouts.** A request that runs longer than a time from the environment answers 503
  `SERVICE_UNAVAILABLE` in the api's format; no new error code. Node's server timeouts and nginx's
  proxy and keep-alive timeouts are set so the api answers first, not nginx with 504.
- **F27. The request timeout's registration and bound.** Added in T10 (owner, 2026-10-15): the
  timeout interceptor is registered with `useGlobalInterceptors` in `createHttpApp()`, so the server
  and every e2e app run it. The api refuses to start with a `REQUEST_TIMEOUT_MS` over 30 s, so a
  typo cannot let nginx's proxy timeout answer 504 first. `/health/*` are not exempt: their checks
  have timeouts of their own, well under the request timeout. No lower bound: a value too low makes
  `/health/ready` fail, and the deploy stops while the running copy keeps serving.
- **F28. A Redis command times out.** Added in T10's review (owner, 2026-10-15): the request timeout
  starts after the global guards, and the throttler's Redis call had no timeout of its own, so a
  Redis that accepts the connection but does not answer held the request until nginx answered 504.
  The shared client gets `commandTimeout` 1 s; the throttler then counts in memory. Its users today
  are the throttler and `/health/ready`; a blocking command or pub/sub gets a client of its own.
  Such a Redis keeps the client `ready`, so after a failed command the throttler counts in memory
  for 10 s and then lets one request try Redis again; only that request's success ends the
  fallback. The requests in flight when the outage starts wait up to 1 s; after the first failed
  command at most one request per 10 s waits, and timed-out commands do not pile up in ioredis's
  queue. Accepted: counters are not carried over when the storage switches, so around a switch a
  client may get up to two quotas of one window (as before this decision).
- **F29. Timeouts in Sentry and the log.** Added in T10's review (owner, 2026-10-15): every 5xx goes
  to Sentry, and a slow route requested again and again would spend the quota real errors need.
  The first timeout of a route (its handler) within 60 s in the process goes to Sentry; repeats go to
  the log as warnings. After the 503 the handler is still listened to: when it ends, a warning
  with the request id, the route, the duration and the outcome (succeeded, or the api's code and
  message of its error) is logged, since a late failure was seen nowhere.
- **F12. Body size.** The api's JSON body limit is 100 KB, set from the environment (today it is
  Express's implicit default). nginx accepts at most 1 MB on `/api/` (today 20 MB) and answers a
  larger body with the api's error format, 413 `PAYLOAD_TOO_LARGE`, not nginx's HTML page. The
  photo upload spec opens a larger limit for its own route. This replaces 0001 AC22's "a 10 MB
  upload is not rejected by nginx", which prepared for uploads that do not exist yet.
- **F24. An upper bound on `BODY_LIMIT`.** Added in T9's review (owner, 2026-10-15): the api
  refuses to start with a `BODY_LIMIT` over 1 MB (nginx's limit, F12), so a typo in the variable
  cannot lift the api's own limit.
- **F26. No form bodies.** Added in T9's review (owner, 2026-10-15): the api reads JSON bodies only;
  Nest's default parsers are off and only the JSON one with `BODY_LIMIT` is registered. Nothing in
  api or web sends `application/x-www-form-urlencoded`, and its parser (nested `a[b]=` keys, its
  own 100 KB limit outside `BODY_LIMIT`) was surface no route used. A form body is not read: the
  route sees an empty body. When a route needs form bodies, turn the urlencoded parser on for that
  route (or the api) with the same limit, and update this rule in `CLAUDE.md`. Photo upload is
  multipart, a parser of its own (F12).
- **F13. Client address.** The api takes the client address (and the request id, F10) from its
  headers only when the request carries a shared secret header; nginx and web's `apiFetch` both
  send it. Without it the api counts the connection's own address. The secret is a new environment
  variable: GitHub Environment `production`, the server's `.env` and `scripts/init-env.sh`. Today
  anything on the docker network can name any client address. Revised while writing the plan: a
  list of trusted subnets was dropped. The docker network's subnet is assigned by Docker, fixing it
  means recreating the network with the whole site down, and the api publishes no ports, so only
  the docker network reaches it anyway: the subnet check would add nothing to the secret.
- **F18. No production without the proxy secret.** Added in T4's review: an empty `PROXY_SECRET`
  trusts no request, so in production every visitor would share nginx's or web's quota while the
  deploy still looks healthy. The api refuses to start with `NODE_ENV=production` and an empty
  `PROXY_SECRET`, and CD stops before writing `.env` when the secret is missing. Done in T6, with
  CD and `scripts/ci-deploy-check.sh`, so no release runs the check without the secret in place.
  Settled in T6 (owner, 2026-10-15): the refusal is made by the HTTP server at start, not by the
  env schema the temporal-worker shares; the worker sends no HTTP and does not get the secret.
  Also settled in T6's review (owner, 2026-10-15): the secret is 32+ letters or digits only (api,
  web, CD), as it goes into nginx's config and the sourced `.env`; and since a copy from before
  0006 logs request headers in full, the secret is rotated after the first deploy with it and
  after any rollback to such a copy, once the site is back on a 0006 version (`deploy/README.md`).
  A rollback to the copy that still runs recreates it first when `.env` changed since it started,
  so a rotated secret reaches it (changes 0001 D6a's switch-only rollback in that case).
- **F19. Two different secrets.** Added in T4's review: `PROXY_SECRET` reaches web, which does not
  need the admin token; if the two were equal, a leak from web would open the admin routes. The
  api refuses to start when both are set and equal, without printing either value.
- **F20. web without the secret does not start in production.** Added in T5's review: F18 for
  web. With an empty `PROXY_SECRET` web's calls are not trusted and every visitor shares the web
  container's quota (0001 B12d), while the deploy looks healthy. Two layers, done in T6:
  `app.yml` passes it to web as `${PROXY_SECRET:?…}`, so compose refuses to start web without
  it and the running copy keeps serving; web's `getServerEnv` refuses an empty one with
  `NODE_ENV=production` (a backstop: env is read at request time, so this shows in logs and
  Sentry, and web's health check on `/` may not catch it). Revised in T6's review (owner,
  2026-10-15): it shows in web's logs only, as the greeting catches the error and renders its
  fallback; api call failures in web reaching Sentry is a backlog item.
- **F21. Secret rotation in two deploys.** Added in T6's review (owner, 2026-10-15): nginx is
  recreated with a new `PROXY_SECRET` before the migrations, so a deploy that then fails left the
  running copy on the old secret and every visitor of `/api/` in one quota until the next good
  deploy. The api also accepts an optional `PROXY_SECRET_NEXT` (same format, not equal to
  `ADMIN_API_TOKEN`; nginx and web never send it). Rotation: set `PROXY_SECRET_NEXT` to the new
  value and deploy; then make it `PROXY_SECRET`, clear `PROXY_SECRET_NEXT` and deploy. Done in
  T6b. Each `PROXY_SECRET` change and the first deploy with it recreate nginx: a few seconds
  down, accepted by the owner; PR 1 is merged at a quiet time (`.claude/rules/deploy.md`).
  Added in T6b's review (owner, 2026-10-15): `deploy.sh` enforces the order. When `.env`'s
  `PROXY_SECRET` differs from the running nginx's, it asks the serving api, before recreating
  nginx, whether it trusts the new secret (the secret over stdin, never printed); if not, the
  deploy stops with nothing changed. Skipped, with a log line, when nginx is not running or has no
  secret yet (the first deploy with 0006) or the serving copy (`.deploy-state`) is not healthy, so
  a down site can still be deployed; a running nginx whose secret cannot be read stops the deploy.
  A serving copy from before 0006 trusts no secret, so a rotation then waits until the site is back on 0006 (F18).

## Validation

- **F14. Cap on validation details.** `details` holds at most N entries (50 unless the plan shows a
  reason for another value). When more errors exist, the last entry is
  `{ field: '', code: 'TOO_MANY_ERRORS', message: '<k> more errors' }`. The shape of `details` stays;
  web gets one more code to know.
- **F25. Long field names are cut.** Added in T9's review (owner, 2026-10-15): an unknown field's
  name is echoed in its detail's `field` and `message`, and a body of one long key still answered a
  few times its size. A detail's `field` keeps at most 100 characters and its `message` at most 200;
  a cut one ends in `…`. The shape of `details` stays.

## Closing

- **F15. GitHub issue #29.** The issue "Подготовить Guards, Limiters, Pipes, Middleware" is closed
  by the last pull request of this spec: its description carries `Closes #29` on a line of its own
  under "Что сделано".
- **F39. Evidence that stops short of the criterion.** Added in T14 (owner, 2026-10-15). AC10: the
  CI check and the owner's flood send the other address's request right after the flood, not
  during it. AC14: no 5xx event has reached Sentry since the request id; a unit test of the
  middleware's `request_id` tag, added in T14, stands in for one. AC15: nginx's timeout above the
  api's is shown by configuration (`proxy_read_timeout 60s` against at most 31 s), not by a slow
  request; no check is added for it.

## Later

- The values of the quota tiers, the edge rate and burst, the connection limit, the timeouts and N
  were chosen with the plan (plan.md, "Values"); they are environment defaults, changed without a
  new decision.
