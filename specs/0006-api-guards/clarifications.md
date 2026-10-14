# 0006 api guards, limiters, pipes and middleware: clarifications

Status: open (2026-10-15).

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
- **F8. WebSockets.** nginx `limit_conn` per client address on `/socket.io/`, and a maximum message
  size in socket.io. Limits on socket messages still wait for the first real socket feature
  (0001 B12c).

## Requests

- **F9. Security headers.** nginx adds them to every response of api and web:
  `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'` and a
  `Referrer-Policy`. A full Content Security Policy for web comes with its pages. Local development
  runs without nginx and so without these headers.
- **F10. Request id.** nginx creates the id (`$request_id`), ignores one sent by the client, and
  passes it to api and web; `apiFetch` forwards it on web's calls to the api. The api writes it to
  its log lines, tags Sentry events with it and answers it in `X-Request-Id`. The error body does
  not change.
- **F11. Timeouts.** A request that runs longer than a time from the environment answers 503
  `SERVICE_UNAVAILABLE` in the api's format; no new error code. Node's server timeouts and nginx's
  proxy and keep-alive timeouts are set so the api answers first, not nginx with 504.
- **F12. Body size.** The api's JSON body limit is 100 KB, set from the environment (today it is
  Express's implicit default). nginx accepts at most 1 MB on `/api/` (today 20 MB) and answers a
  larger body with the api's error format, 413 `PAYLOAD_TOO_LARGE`, not nginx's HTML page. The
  photo upload spec opens a larger limit for its own route. This replaces 0001 AC22's "a 10 MB
  upload is not rejected by nginx", which prepared for uploads that do not exist yet.
- **F13. Client address.** The api takes the client address (and the request id, F10) from its
  headers only when the request carries a shared secret header; nginx and web's `apiFetch` both
  send it. Without it the api counts the connection's own address. The secret is a new environment
  variable: GitHub Environment `production`, the server's `.env` and `scripts/init-env.sh`. Today
  anything on the docker network can name any client address. Revised while writing the plan: a
  list of trusted subnets was dropped. The docker network's subnet is assigned by Docker, fixing it
  means recreating the network with the whole site down, and the api publishes no ports, so only
  the docker network reaches it anyway: the subnet check would add nothing to the secret.

## Validation

- **F14. Cap on validation details.** `details` holds at most N entries (50 unless the plan shows a
  reason for another value). When more errors exist, the last entry is
  `{ field: '', code: 'TOO_MANY_ERRORS', message: '<k> more errors' }`. The shape of `details` stays;
  web gets one more code to know.

## Closing

- **F15. GitHub issue #29.** The issue "Подготовить Guards, Limiters, Pipes, Middleware" is closed
  by the last pull request of this spec: its description carries `Closes #29` on a line of its own
  under "Что сделано".

## Later

- The values of the quota tiers, the edge rate and burst, the connection limit, the timeouts and N
  were chosen with the plan (plan.md, "Values"); they are environment defaults, changed without a
  new decision.
