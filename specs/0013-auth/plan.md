# 0013 auth: plan

Status: accepted (2026-10-16); amended 2026-10-18 at the review of PR 1 (N29, N31–N36); amended
2026-10-19 at T7 (N37–N39); amended 2026-10-19 at T8 (§7, N40–N44); amended 2026-10-19 at T9
(Backlog, N45).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md) (N1–N49).

## 1. Library and versions (N1)

| Package              | Where        | Version  | Note                                                                                                                                                                                         |
| -------------------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `better-auth`        | `api`, `web` | `1.7.10` | Published 2026-10-15; past every 2026 advisory (the last fixed in 1.7.7). Pinned exactly in both packages: the api's server and web's client must speak the same version. No install scripts |
| `oauth2-mock-server` | `api` (dev)  | `9.3.0`  | The fake OpenID provider (N14). axa-group, ~250k downloads a week, published 2026-10-14, Node `^26` in its engines                                                                           |

`better-auth` brings `kysely`, `jose`, `better-call` and every adapter as dependencies; only
`better-auth/adapters/prisma` and `better-auth/plugins` (`genericOAuth`) are imported. Its peer
range takes `prisma` and `@prisma/client` `^7`. Telemetry is turned off in the config
(`telemetry: { enabled: false }`), not left to its default. `@thallesp/nestjs-better-auth` is not
used: its global guard and body parsers would replace ours (`AccessGuard`, `createHttpApp()`).

## 2. Database (N3, N5, N16)

One migration, `<timestamp>_auth`, compatible with the running release (it only adds and relaxes):

- `users`: `phone` and `first_name` drop `NOT NULL` (their CHECKs stay; a `NULL` passes them; the
  phone stays unique among the non-null); new `email_verified boolean NOT NULL DEFAULT false`.
- `sessions`: `id uuid` (`uuidv7()`), `token varchar UNIQUE`, `user_id` → `users` `ON DELETE
CASCADE`, `expires_at`, `user_agent varchar(512) NULL` (left empty from T7, N34), `created_at`, `updated_at`; index on
  `user_id`. No IP address column: Better Auth's IP tracking is off (`advanced.ipAddress.
disableIpTracking`), since it would read `X-Forwarded-For` without our proxy secret.
- `accounts`: `id`, `account_id`, `provider_id`, `user_id` → `users` cascade, the token columns
  Better Auth requires as optional (`access_token`, `refresh_token`, `id_token`, their expiry,
  `scope`, `password`) — always `NULL` here (§3), `created_at`, `updated_at`; `UNIQUE
(provider_id, account_id)`, index on `user_id`.
- `verifications`: `id`, `identifier`, `value`, `expires_at`, `created_at`, `updated_at` (OAuth
  state lives here).

`schema.prisma` gets the models `Session`, `Account`, `Verification` and the `User` changes, named
for Better Auth through `@map`. Better Auth's `user.fields` maps `name` → `firstName`;
`advanced.database.generateId: "uuid"` leaves every id to the database's `uuidv7()` (N16).
`constraint-fields.ts` gets the new unique constraints. The seed is untouched (no users).

## 3. Better Auth in the api (N1–N5, N17, N18)

`api/src/auth/`:

- `auth.ts`: `createAuth(env, prisma, logger)` builds the instance:
  - `baseURL: WEB_ORIGIN` (the site's origin; `basePath` stays `/api/auth`), `secret:
BETTER_AUTH_SECRET`, `trustedOrigins: [WEB_ORIGIN]`.
  - `database: prismaAdapter(prisma, { provider: 'postgresql' })`, model names `user`, `session`,
    `account`, `verification` mapped to our tables.
  - `session: { expiresIn: 30 days, updateAge: 1 day, cookieCache: { enabled: true, maxAge: 5
min } }` (N4, N18). Cookies: prefix `lamoda`, HttpOnly, SameSite=Lax, Secure when `WEB_ORIGIN`
    is https (`advanced.useSecureCookies`).
  - `socialProviders.google` with `prompt: 'select_account'` and `mapProfileToUser` giving `name:
given_name` (N5); or, when `AUTH_FAKE_OIDC_URL` is set, `genericOAuth` with `providerId:
'google'` pointing at the fake provider instead (N14). Same callback path either way:
    `/api/auth/callback/google`.
  - `databaseHooks.user.create.before` / `update.before`: lower-cases the email (the CHECK wants
    it) and sets `firstName` to `null` unless it passes the name rule of `common/validation/` (N5);
    `account.create.before` / `update.before` drop Google's tokens (we never call Google after
    sign-in).
  - `rateLimit: { enabled: false }`: its counter keys on `X-Forwarded-For` (§5 counts instead).
  - `logger` writes through the api's pino logger.
  - Email-and-password sign-in stays off (the default).
- `auth.module.ts`: provides `AUTH` (the instance) for `createHttpApp()`, the request context, the
  socket adapter and `MeService`.
- Mounting (in `createHttpApp()`, so every e2e app has it): after `useRequestContext` and CORS,
  before the JSON parser: `app.all('/api/auth/*splat', authThrottle, toNodeHandler(auth))`. The
  path keeps `/api/` because Better Auth matches it against its `baseURL`; nginx and web pass it
  unchanged (§9, §10). Its answers keep Better Auth's `{ code, message }` (N17, AC11), except
  `authThrottle`'s 429 (N32); no Nest filter sees them. (Amended at T5: the route also carries the request log, the allowlist of
  routes, its own JSON parser with `BODY_LIMIT` and request timeout, and an error handler; N25,
  N26, N28.)

## 4. Principal, guards and markers (N7, N8)

- `Principal = { kind: 'anonymous' } | { kind: 'user'; userId: string; sessionId: string }`.
- The request-context middleware becomes async: with a session cookie present it calls
  `auth.api.getSession({ headers })` (the 5-minute cookie cache answers most calls without the
  database); otherwise the principal is anonymous at once. A broken or expired cookie is
  anonymous, never an error. A read that fails or times out, or one more while 20 are running,
  answers 503 `SERVICE_UNAVAILABLE` (N29); `/api/auth/*` is not read here, Better Auth reads its own session (N26). Sentry's scope
  gets `user.id` (no email).
- Markers in `common/auth/`: `@Public()` (unchanged), `@SignedIn()` (needs a user, adds Swagger's
  cookie security `session`), `@Closed()` (answers 401 to everyone). `@AdminOnly()`, the admin
  principal, `X-Admin-Token`, `ADMIN_SECURITY` and the admin token comparison go away.
- `AccessGuard`: `public` passes; `user` needs `principal.kind === 'user'`; `closed` and no marker
  answer 401 `UNAUTHORIZED`.
- `test/access-markers.e2e-spec.ts`: every handler carries exactly one marker; `PUBLIC_HANDLERS`
  stays; a new list `CLOSED_HANDLERS` names the closed ones on purpose; no `@Public()` inside a
  `@Closed()` or `@SignedIn()` class; no `@Closed()`/`@SignedIn()` on a socket handler.
- Cross-site requests: the cookie is SameSite=Lax (no cookie on a cross-site POST), the api reads
  only JSON bodies (a cross-site JSON request needs a CORS preflight) and CORS allows only
  `WEB_ORIGIN`; Better Auth checks the `Origin` of its own POSTs against `trustedOrigins`.
- Tests reach closed routes through `createTestApp()`, which replaces `AccessGuard` with a test
  guard that treats `closed` as `user` (`test/support/`); the production module never has it.

## 5. Rate limits for `/api/auth` (N1)

- `authThrottle` (Express middleware, `throttling/`): counts the request with the shared throttler
  storage, keyed by the request context's client address (as the Nest guard does): GET and HEAD
  in tier `read`, `POST /sign-in/*` in `expensive` (N35), any other request in `write`; over the limit it
  answers 429 in the api's format with `Retry-After`, like the guard (N32).
- nginx: a `location /api/auth/` in the same `edge_api` zone (§9).

## 6. Routes (N8, N11; AC7–AC9, AC12)

| Controller                     | Routes                            | Access                                       |
| ------------------------------ | --------------------------------- | -------------------------------------------- |
| `MeController` (`api/src/me/`) | `GET /me`, `DELETE /me` (204)     | `@SignedIn()`                                |
| `UsersController`              | all five                          | `@Closed()`                                  |
| `FittingSessionsController`    | list, get, create, update, delete | `@SignedIn()`, own rows only                 |
| `AiGenerationsController`      | list, get, delete                 | `@SignedIn()`, own rows only                 |
| `AiGenerationsController`      | create, update                    | `@Closed()` (the generation workflow writes) |
| catalog controllers            | writes                            | `@Closed()`; reads stay `@Public()`          |

- Services take the owner's `userId`: a fitting session is found by `{ id, userId }`, a generation
  through its session's `userId`; a miss is 404 `NOT_FOUND`, for someone else's row too (AC8).
  Lists filter by the owner: `?userId` leaves `FittingSessionListQueryDto`; `?sessionId` of
  another user's session gives an empty list. `CreateFittingSessionDto` loses `userId` (the owner
  is the principal); a `userId` in the body is 400, as other unknown fields.
- `GET /me` answers `UserResponseDto` (`phone` and `firstName` now nullable). `DELETE /me` calls
  `UsersService.delete` (which also starts the deletion of the user's files, 0011 M11),
  which removes sessions and accounts by cascade, then clears the session cookies in its answer.
  Another browser's cached session names the deleted user for up to 5 minutes (N31): `GET /me`
  and `DELETE /me` finding no user and a write whose user reference fails (`RELATED_NOT_FOUND` on
  the user) answer 401 `UNAUTHORIZED`.
- The session hook stops keeping the User-Agent, as it does the IP address (N34).
- 0011's checks (M8, M9) written around admin requests are rewritten: a link comes from `GET /me`
  or the user's own generation; the key-folder check of M8 is tested on the closed writes through
  the test guard (§4) (N15).
- `api/openapi.json` is rewritten (`npm --prefix api test -- -u`); web's contract tests follow
  (`entities/user`, `fitting-session`, `generation`).

## 7. Socket (AC10)

`SocketIoAdapter` adds an `io.use` middleware: it reads the handshake's cookie through
`auth.api.getSession` and stores the principal in `socket.data.principal` (anonymous on any
failure; the connection is never refused for it). The gateway stays `@Public()`. The e2e test
connects with and without a cookie and checks `socket.data` through `fetchSockets()`.

Amended at T8: the read goes through the request context's session reader, one per app
(`SESSION_READER`), so sockets share N29's cap and timeout, with at most 5 of its 20 reads (the
reader's `share`, N42), and a failure the reader marks for Sentry is reported by the adapter. A
connection reads once, whatever number of CONNECT packets it sends (each would otherwise take a
slot of the cap). The middleware covers namespaces added later. A new connection whose `Origin` is
not `WEB_ORIGIN` is refused with 403 (N40); `WEB_ORIGIN` must be an exact origin (N43). Warnings
about unread sessions are logged at most once a minute (N44).

## 8. Configuration (N14; AC6, AC14)

| Variable                    | Local                                | Production      | Note                                                                        |
| --------------------------- | ------------------------------------ | --------------- | --------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`        | `scripts/init-env.sh` generates it   | GitHub secret   | At least 32 letters or digits (N21); must differ from the proxy secrets     |
| `GOOGLE_CLIENT_ID`          | empty                                | GitHub variable |                                                                             |
| `GOOGLE_CLIENT_SECRET`      | empty                                | GitHub secret   |                                                                             |
| `AUTH_FAKE_OIDC_URL`        | `http://oidc:4010` (compose service) | must be empty   | Server-side address of the fake provider                                    |
| `AUTH_FAKE_OIDC_PUBLIC_URL` | `http://localhost:4010`              | must be empty   | The browser's address of its login page                                     |
| `ADMIN_API_TOKEN`           | removed                              | removed         | Also from `init-env.sh`, `cd.yml`, `ci-deploy-check.sh`, `deploy/README.md` |

Locally 4010 is `OIDC_HOST_PORT`'s default (N20). `deploy/compose/app.yml` and the CI deploy check
get the three production variables in T4, with the rules that require them (N22).

`assertServerEnv` (production only) refuses a set fake provider and an empty secret, client id or
client secret (AC14). The worker does not need these. `check:web-bundle` also fails on the names
`BETTER_AUTH_SECRET` and `GOOGLE_CLIENT_SECRET`. pino's redaction drops `x-admin-token` and keeps
`cookie` and `set-cookie`.

## 9. nginx and web's local proxy

- nginx: `location /api/auth/ { limit_req zone=edge_api burst=40 nodelay; proxy_pass http://api;
… }`: no URI part, so the path reaches the api as `/api/auth/…`. It repeats the `/api/`
  location's headers and error pages (the template's rule for locations with their own
  `add_header`).
- web, development: `rewrites()` gets `/api/auth/:path*` → `${API_URL}/api/auth/:path*` ahead of
  the general `/api/:path*` rule. The image is rebuilt after the change.

## 10. web (N12, N13; AC1, AC3, AC4, AC13)

- `shared/auth`: `authClient = createAuthClient()` from `better-auth/react` (same origin, base
  path `/api/auth`), and `useSession()`. The session it returns is parsed with a zod schema
  (`entities/session`) before use, like every api answer. Its errors map to Russian texts in
  `errorText` (N17).
- `shared/ui/menu`: a `Menu` on Base UI's Menu (items, disabled items, separator), with its section
  on `/ui-kit`.
- `features/auth`: `LoginModal` (the kit's `Modal`, one button "Войти через Google",
  `signIn.social({ provider: 'google', callbackURL: <current path and query> })`) and the sign-out
  actions (`signOut`, `revokeSessions` + `signOut`). `callbackURL` is always a path on the site
  built from the router (`usePathname()`, `useSearchParams()`) and normalised to start with a
  single `/` (every leading run of `/` and `\` becomes a single `/`); it is never taken from a query
  parameter (no open redirect).
- `widgets/header`: the profile icon becomes a client component: no session → it opens
  `LoginModal`; a session → the `Menu` of N12 (initials circle, name or "Профиль", four inert items
  with `aria-disabled`, separator, the two sign-outs), its top block with `mp-block`. While the
  session loads the icon is drawn as today. Pages stay static: the session is read in the browser.
- Analytics: `client.ts` gets `identify(userId)` and `reset()`; `events.ts` gets `Login Opened`,
  `Signed In`, `Signed Out` (no properties) and the tracked elements of the modal and the menu.
  `Signed In` and `identify` fire once after the redirect back (a flag in `sessionStorage` set
  before leaving for Google); `identify` also runs on any page load with a session, after consent.
- `/privacy`: a placeholder line about the Google account data kept (email, given name).
- `apiFetch` does not forward cookies yet: no page reads user data on the server in this spec. The
  first one adds it (backlog).

## 11. Fake OpenID provider (N14)

- `api/scripts/fake-oidc.mjs`: `oauth2-mock-server` on port 4010 plus a small login form at
  `/authorize`: email and given name fields, then the standard code flow; the token and userinfo
  claims carry what was typed, with `email_verified: true`. Run by a compose service `oidc` (the
  api image, `profiles` none, only in `docker-compose.yml`); `qa-tester` can sign in as any user
  (its ports 4010 and 4011, N19).
- The api's `genericOAuth` uses explicit endpoints: authorization at the public address, token and
  userinfo at the server address (one discovery URL cannot serve both).
- e2e: the fake server starts in-process; one test walks the whole redirect flow, the rest sign in
  through `test/support/sign-in.ts`, which creates a user and a session through Better Auth's
  internal adapter and returns the signed cookie.

## 12. Expired sign-in rows (N27; added at T5)

- A Temporal schedule, created by the worker at start if missing, runs a workflow once a day whose
  activity deletes `verifications` and `sessions` rows with `expires_at < now()`, in batches. Its
  task is T9a.

## Dependencies

`better-auth@1.7.10` (api, web) and `oauth2-mock-server@9.3.0` (api, dev) are checked by
`CONTRIBUTING.md`'s rules: public repositories, heavy use, releases this week (Better Auth ships
patches every few days; the pin is moved on purpose, N33). Neither needs an install script.

## Backlog

- Remove: "IDOR checks with auth" (done, N8).
- Add: other providers and sign-in methods (N2); guests (N9, with the reasons it was dropped);
  `apiFetch` forwarding the session cookie for the first server-rendered page with user data; the
  "Мои данные" page with editing and account deletion (N11, N12); dropping the empty
  `sessions.user_agent` column (N34); the socket keeping a revoked session's user until it
  disconnects, for the generations spec to decide (N36).
- Remove: "Users' ids in Temporal history" (the retention is set in T9, N37, N45).
- Add: a limit of fitting sessions per user, for the generations spec (N39).
- Add: a limit on the sockets one connection opens while its session is read, with the first
  real socket feature (N41).
- Change: "Outbox for file deletion" is done with the photo upload spec, before the first user's
  file (N37).
- Keep: "Email look-alikes" (spec non-goal).

## Docs

- `CLAUDE.md`: access (markers, principal, test guard), request context (session), error format
  exception for `/api/auth/*`, Better Auth in the stack table, env, web's auth client, the header.
- `README.md`: local sign-in through the fake provider, Swagger's cookie, no admin token.
- `deploy/README.md`: the Google console setup, secrets, removing `ADMIN_API_TOKEN`.

## Risks

- **Better Auth behind the proxy.** It builds URLs from `baseURL` and the forwarded host; a
  mismatch breaks the callback. The first api task signs in locally through both nginx-like
  (`/api/auth/` unchanged) and web's rewrite before anything else is built on it.
- **Name mapping.** `name` is required in Better Auth and nullable here; the `create.before` hook
  writes `null`. If the adapter refuses, the first task finds out and the plan changes with the
  owner.
- **Test churn.** Every database e2e signs in with the admin token today; all move to
  `sign-in.ts` and the test guard. Done in one task per module group to keep commits reviewable.
- **Version churn.** Better Auth releases often; a bump runs the auth e2e before merging.
- **0011 in parallel.** Both touch env, compose, deploy, users/generations services and
  `openapi.json`; conflicts are textual and resolved at each rebase (N15).

## How each criterion is verified

| AC   | Check                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | e2e of the redirect flow through the fake provider; `qa-tester` in the browser on the local stack                                                                                                                                                              |
| AC2  | e2e: two sign-ins of one account, one user row                                                                                                                                                                                                                 |
| AC3  | web tests of the menu (items, `aria-disabled`, name fallback); `qa-tester` screenshots, owner compares                                                                                                                                                         |
| AC4  | e2e: sign-out → 401; revoke-sessions → the other session's cookie answers 401 after the cache window (test clock)                                                                                                                                              |
| AC5  | e2e: `Set-Cookie` attributes; expiry and extension with a moved clock                                                                                                                                                                                          |
| AC6  | `rg` for the admin names in the repo; OpenAPI snapshot without `admin`                                                                                                                                                                                         |
| AC7  | e2e without a cookie on each `@SignedIn()` route; catalog reads still 200                                                                                                                                                                                      |
| AC8  | e2e with two users on every fitting session and generation route                                                                                                                                                                                               |
| AC9  | e2e: closed routes 401 with a signed-in user; access-markers test                                                                                                                                                                                              |
| AC10 | socket e2e (§7)                                                                                                                                                                                                                                                |
| AC11 | e2e: a refused `/api/auth/*` request's body, its 429's body; an api error's body                                                                                                                                                                               |
| AC12 | e2e: `DELETE /me`, then rows gone, both cookies cleared in its answer and the session token alone 401; a cached copy (another session, or both old cookies): `GET /me`, `DELETE /me` and a write 401 (N31); files: `DELETE /me` empties the user's folder (T7) |
| AC13 | web tests of the analytics calls; `qa-tester` watches the requests with and without consent                                                                                                                                                                    |
| AC14 | env unit tests of `assertServerEnv`                                                                                                                                                                                                                            |
| AC15 | `npm run verify`; CI                                                                                                                                                                                                                                           |

## Pull requests

1. `docs/0013-spec`: spec, clarifications, plan, tasks.
2. `feat/0013-auth-api`: database, Better Auth, principal and markers, routes, socket, config,
   fake provider, tests, nginx, docs of the api.
3. `feat/0013-auth-web`: the kit's `Menu`, the login modal, the profile menu, analytics, privacy,
   web's local proxy, docs of web.
4. `docs/0013-close`: production checks (the owner's real Google sign-in) and closing.
