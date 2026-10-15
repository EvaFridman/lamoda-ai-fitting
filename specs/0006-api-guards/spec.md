# 0006 api guards, limiters, pipes and middleware

Status: done (2026-10-15): all 17 criteria pass, three with evidence that stops short (F39;
`tasks.md`, "Acceptance record"). History, not instructions.
Decisions this spec relies on: [clarifications.md](clarifications.md) (referred to by their ids, e.g. F1).

## Goal

Harden the api's request path before login and photo upload land: who may call a route, how much a
client may send, and what a request leaves behind for finding it later.

Today a route is open unless someone remembers `@AdminOnly()`; one quota covers every route; any
container on the docker network can name any client address; nginx passes 20 MB bodies and any
request rate to Node; there are no security headers, no request id and no timeouts of our own; and a
body of many unknown fields answers about twelve times its size in validation details.

After this spec a route is closed unless it says otherwise, quotas differ by the cost of a route,
nginx stops floods and oversized bodies before Node, the client address cannot be forged from inside,
and every request carries one id through nginx, web, the api's logs and Sentry.

## In scope

- Access closed by default, with `@Public()` and `@AdminOnly()` as the only ways to open a route, and
  the principal (anonymous or admin) readable by handlers (F3, F4).
- Quota tiers read, write and expensive in the api (F5, F6).
- Edge rate limit and socket connection limit in nginx, with nginx's 429 in the api's error format;
  message size limit in socket.io (F7, F8, F17).
- Body size limits in the api and nginx, with nginx's 413 in the api's error format (F12).
- Security headers in nginx (F9).
- Request id from nginx through web and the api to logs, Sentry and the response (F10).
- Request timeout in the api, and Node and nginx timeouts that agree (F11).
- Trusted client address: a secret header from nginx and web (F13).
- Cap on validation details (F14).
- Backlog: the four items of F2 leave it; an IDOR item for the auth spec is added (F4).
- Issue #29 is closed by the last pull request (F15).

## Non-goals

- Login, sessions, user accounts, and checks that a resource belongs to the user who asks (IDOR):
  the auth spec (F3, F4). The admin token stays the only key (0004 E1).
- Authentication of socket connections and limits on socket messages (0001 B12c).
- A full Content Security Policy for web's pages (F9).
- Photo upload and its larger body limit (F12).
- The database pool size, `statement_timeout` and the cap on the product list's `offset` (backlog
  "Cache for filter counts" and "Product list cost").
- Changes to the error format other than the `TOO_MANY_ERRORS` entry (F10, F14).

## Acceptance criteria

### Access

- AC1. A route that carries neither `@Public()` nor `@AdminOnly()` answers 401 `UNAUTHORIZED` to every
  request, and a test that walks every route of the app fails when one carries neither (F3).
- AC2. Every route open today stays open without a token (public catalog reads, `/health/*`), and
  every admin route still answers 401 with no token or a wrong one (0004 AC1, E57).
- AC3. A handler reads the principal of its request: anonymous with no token or a wrong one, admin
  with the right one; a wrong token on a public route is served, not answered 401 (F4, F16).

### Quotas

- AC4. Read, write and expensive routes have separate quotas: a client over its write quota gets 429
  `TOO_MANY_REQUESTS` on writes while its reads still answer (F6).
- AC5. Each tier answers 429 both past its burst and past its minute limit (F6).
- AC6. Admin requests count against the quota of their class, with the right token and with a wrong
  one (F5).
- AC7. With Redis stopped, the quotas still answer 429 when exceeded (0001 B12b).

### Client address

- AC8. Through nginx, and through web's server-side calls, two visitors with different addresses get
  separate quotas (0001 B12d).
- AC9. A request to the api from inside the docker network that sends `X-Forwarded-For` without the
  shared secret is counted by its connection address: changing `X-Forwarded-For` does not give it a
  fresh quota (F13).

### Edge

- AC10. A flood from one address to `/api/` past the edge rate gets 429 `TOO_MANY_REQUESTS` in the
  api's error format from nginx, including requests to unknown routes and with broken JSON, while a
  visitor at a normal pace from another address is served (F7, F17).
- AC11. A body over 1 MB to `/api/` answers 413 `PAYLOAD_TOO_LARGE` in the api's error format; a JSON
  body over 100 KB and under 1 MB answers the same from the api (F12).
- AC12. One address cannot hold more `/socket.io/` connections than the set limit, and a socket
  message over the set size does not reach the gateway (F8).

### Headers, request id, timeouts

- AC13. Responses of the api and of web on the public domain carry `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: frame-ancestors 'none'` and a `Referrer-Policy` (F9).
- AC14. Every response through nginx carries an `X-Request-Id`; one sent by the client is replaced.
  The same id is on the api's log line for the request, on its Sentry event when it fails with 5xx,
  and on the api calls web makes while serving a page (F10).
- AC15. A request that runs longer than the api's timeout answers 503 `SERVICE_UNAVAILABLE` in the
  api's format, and nginx does not answer 504 for it first (F11).

### Validation

- AC16. A body with more validation errors than the cap answers 400 with the cap's number of entries
  in `details` followed by one `TOO_MANY_ERRORS` entry that counts the rest (F14).

### Records

- AC17. `CLAUDE.md` describes access closed by default, the request id and the new environment
  variables; `.env.example` lists every new variable; the backlog has lost the four items of F2 and
  gained the IDOR item (F2, F4).

## Owner actions (Claude cannot do them)

- Add the proxy secret (F13) to GitHub Environment `production`.
- Review and merge the pull requests; the last one closes issue #29 (F15).
- After the deploy, check AC10–AC14 against the public domain where Claude has no access.

## Assumptions

- nginx is the only proxy in front of the app: no CDN or load balancer before it, so its view of the
  client address is the real one.
- The api publishes no ports: only containers on the docker network reach it (F13).
- Visitors behind one NAT share one edge limit; at a threshold above the api's quotas this is
  acceptable (F7).
- The limits' values are chosen in the plan; they are not part of this spec.
