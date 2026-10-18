# 0013 auth: clarifications

Status: accepted (2026-10-16); amended 2026-10-16 at the plan: no guests (N2, N9, N10 withdrawn),
the first name is optional (N5), Better Auth's own error format (N17), a 5-minute session cache
(N18); amended 2026-10-18 at the review of PR 1 (N31–N36); amended 2026-10-19 at T7 (N37–N39);
amended 2026-10-19 at T8 (N40–N44); amended 2026-10-19 at T9 (N45–N49); amended 2026-10-19 at T9a (N50).

The owner's decisions for this spec. Ids `N1`, `N2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-16.

## Library and sessions

- **N1. Better Auth inside the api.** Sign-in runs on Better Auth, mounted in the api; the browser
  reaches it at the site's own `/api/auth/…`, like every other api call. The api owns the users,
  the sessions and the access checks, so a request from the browser, from web's server and over the
  socket is recognised the same way. Rejected: Auth.js in web (the issue's first idea): since
  September 2025 it gets security fixes only, its v5 is still a beta, its default session is a JWT
  that cannot be revoked, and the api would not know the user without decrypting web's token or
  trusting a header from web. Rejected: sessions on web's server (a BFF): every browser call and the
  socket would have to pass through web, and web would need the database.
- **N2. Google only.** The only way to sign in is Google. Yandex ID, VK ID, Google One Tap,
  passkeys and email codes go to the backlog. Guests were part of this decision and are withdrawn
  (N9).
- **N3. Sessions live in PostgreSQL.** The session is a row next to `users`, so it survives a
  Redis restart and goes into the backups (spec 0012). The browser holds only an HttpOnly cookie;
  a short-lived signed copy of the session in a cookie spares a database read on most requests
  (N18). Redis stays as it is: keeping sessions there would need AOF persistence, no eviction and
  backups, and a Redis failure would sign everyone out, where today it only loosens the rate limit.
- **N4. A session lasts 30 days and is extended by use.** Activity extends it at most once a day;
  30 days without a visit sign the user out.

## Users and access

- **N5. Phone and first name are optional.** Google gives no phone number, so `users.phone` becomes
  optional and stays unique among the users who have one. Google's given name is kept when it
  passes the existing name rule (`IsPersonName()`, `common/validation/`) and left empty otherwise; the rule does not change. No
  phone or name is asked for after sign-in. (Amended at the plan: the fallback to the part of the
  email before `@` is dropped, since it rarely passes the rule.)
- **N6. No avatar.** Google's profile picture is not stored or shown; the menu shows initials.
- **N7. The admin goes away.** The admin token was a stopgap until users could sign in (0004 E1,
  0006 F5). `ADMIN_API_TOKEN`, the `X-Admin-Token` header, the admin principal and everything built
  for them are removed; there is no admin role. A user guard takes the admin guard's place.
- **N8. Every route gets its access anew.** Routes for a user's own data (the current user, their
  fitting sessions and generations) need a signed-in user and serve only that user's data; the
  lists of fitting sessions and generations list only the user's own. Routes no user should call
  (catalog writes, the routes of other users, writing generations, which the generation workflow
  does) stay in the code, closed to everyone. Someone else's resource answers 404
  `NOT_FOUND`, as one that does not exist (closes the backlog item "IDOR checks with auth").

## Guests

- **N9. Withdrawn: no guests.** Guests (Better Auth's anonymous sign-in, fewer generations, deleted
  after 30 idle days) were dropped at the plan: trying on needs a Google sign-in. Reason: a guest
  who later signs in into an existing account needs their files copied between owners' folders
  (0011 M7), and a guest who becomes a new account is not something Better Auth supports, so it
  would need custom rewiring of its users. (Owner, at the plan.)
- **N10. Withdrawn with N9.** No guest data moves on sign-in.
- **N11. A user can delete their account.** `DELETE` of the current user removes the user, their
  sessions and their fitting data, and their files through 0011's user deletion (0011 M11). Its
  button comes with the "Мои данные" page (N12).

## Interface

- **N12. Login modal and profile menu.** The profile icon in the header opens a login modal with
  "Войти через Google" for a visitor who is not signed in. Sign-in returns to the page it started
  from. For a signed-in user the icon opens a dropdown styled after Lamoda's profile menu (the
  owner's screenshot of 2026-10-16 guides the look, not the content): a top block with a circle of
  initials and the name, no email; "Мои заказы", "Магазины", "Мои данные", "Мои примерки", drawn but
  inert like the header's icons in 0010 L5 (each gets its link with its page's spec); a divider;
  "Выйти" and "Выйти со всех устройств" (ends every session of the user). No lamoda club block, no
  barcode. The "Мои данные" page (name, email, editing, account deletion) is not in this spec.
- **N13. Signed-in users in analytics.** After the visitor's consent (0008 J10) Mixpanel identifies
  a signed-in user by their user id only (no email or name) and forgets them on sign-out. Opening
  the login modal, signing in and signing out are events.

## Work

- **N14. A fake Google in tests and locally.** Tests and the local stack sign in through a fake
  OpenID provider instead of Google; production refuses that setting. The owner checks the real
  Google sign-in in production.
- **N15. In parallel with spec 0011.** This spec is worked on while 0011 (S3 storage) is in
  progress in another worktree. When the owner reports a 0011 merge, this branch is rebased on a
  fresh `main`. Users' files are deleted by 0011's pull request `feat/0011-storage` (its T8); the
  task that wires account deletion to it (N11) comes after it is in `main`. 0011's checks that
  read files through an admin `GET` or write keys as the admin (0011 AC8, AC9, T7) are rewritten by
  this spec to use a signed-in user; its non-goal "the routes stay admin-only" holds until this spec
  lands.
- **N16. User ids stay uuids.** Better Auth creates users with the database's `uuidv7()` ids, as
  today: the id is part of every private file key (0011 M7).

## Added at the plan

- **N17. `/api/auth/*` keeps Better Auth's error format.** Its errors answer `{ code, message }`,
  which Better Auth's browser client expects, not the api's `{ error: { code, message, details } }`;
  like `/health/*`, it is a documented exception. web shows its errors in Russian through
  `errorText`. (Amended at the review of PR 1: its 429 keeps the api's format, N32.) Rejected: rewrapping its answers (own code against every update of the library).
- **N18. The session cache lives 5 minutes.** A signed copy of the session in a cookie spares the
  database read for 5 minutes. So after "Выйти со всех устройств" the other browsers stay signed in
  for up to 5 minutes; this browser is signed out at once. The same holds for any sign-out (amended
  at T6): a copy of both cookies taken before it stays valid until its copy of the session expires,
  at most 5 minutes after it was issued; the session token alone is checked against the database.
  Rejected: no cache in the api (a database read on every request with a cookie) and a shorter one.

## Added at T4

- **N19. `qa-tester` reaches the fake Google.** Its guard and `--allowed-origins` also allow 4010
  and 4011 (the login page of each copy of the stack), and it may stop and start the `oidc`
  service, so it can sign in as any user and test the provider being down. Done in T4.
- **N20. The fake Google's port is `OIDC_HOST_PORT`.** Like the other host ports: default 4010, 4011
  in a second copy (README, "Вторая копия стека"). The container listens on the same port, so the
  issuer is one address; compose builds both `AUTH_FAKE_OIDC_*` addresses from it.
- **N21. `BETTER_AUTH_SECRET` is letters and digits only.** At least 32, as the proxy secret: the
  deploy sources the server's `.env`, where `$`, `"` or `;` would break or change the value.
- **N22. The production variables reach the deploy in T4.** The production rules of
  `assertServerEnv` start in T4, so the same task passes `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`
  and `GOOGLE_CLIENT_SECRET` to the api in `deploy/compose/app.yml` and gives
  `ci-deploy-check.sh` test values; otherwise CI's deploy check fails on every push until T9.
  `cd.yml`, `deploy/README.md` and removing `ADMIN_API_TOKEN` stay in T9.
- **N23. The fake Google redirects only to this machine; its memory growth is accepted.** It sends
  the browser only to http(s) addresses on `localhost`, `127.0.0.1` or `[::1]` (sign-in and
  `/endsession`), so a link from another site cannot carry a code away. Each refused or unfinished
  sign-in still leaves its nonce and PKCE challenge in `oauth2-mock-server`'s own memory until the
  process restarts: a page in the developer's browser could grow it. Accepted: the service listens
  on 127.0.0.1 only and never runs in production; closing it would mean wrapping the library's
  request handler.

## Added at T5

- **N24. Better Auth's schema check is off.** Better Auth 1.7 compares the Prisma schema with its
  full model and refuses every request while `users.image` and `sessions.ip_address` are missing.
  Neither is needed (no avatar, N6; no IP tracking, plan §2), so the check is off
  (`advanced.database.validateSchema: false`) and the hooks never write those fields. A schema that
  drifts after an update of Better Auth fails the auth e2e instead. Rejected: two columns that
  always stay null.
- **N25. Only the routes of sign-in, the session and signing out answer.** A list of the routes
  that answer (`/sign-in/social`, `/callback/google`, `/get-session`, `/sign-out`,
  `/revoke-sessions` for "Выйти со всех устройств", `ok`, `error`); every other path under
  `/api/auth` answers 404 `{ code: "NOT_FOUND", message }` before Better Auth sees it: changing the
  user (`/update-user` would write the name past the api's DTOs), linking and listing accounts,
  listing sessions (it answers the token of every session), Google's tokens (never kept), email and
  password, verification and deletion, and whatever an update adds. A user's data changes only
  through the api's own routes (`/me`). Rejected: Better Auth's `disabledPaths`, which matches exact
  paths only (a route with a parameter slips through).
- **N26. A failure inside Better Auth answers its own format too.** An error that is not Better
  Auth's own (a database error) answers 500 `{ code: "INTERNAL_SERVER_ERROR", message }`, so every
  answer of `/api/auth/*` has one format (N17; the 429 of its rate limit aside, N32). It is logged without the row and reported to Sentry,
  as AppExceptionFilter does for a 5xx. Its default (an empty 500 and the whole error, session token
  and user data included, printed with `console.error`) is off. Rejected: passing it to
  AppExceptionFilter, which would answer the api's format on this one path.
- **N27. Expired sign-in rows are deleted in this spec.** Every sign-in that is started and not
  finished leaves a `verifications` row, and expired sessions stay with their User-Agent: a
  schedule deletes both once a day (plan §12, task T9a). Rejected: a backlog item.
- **N28. `/api/auth` has the api's body limit and request timeout.** Better Auth is an Express
  route ahead of Nest, so neither the JSON parser nor `TimeoutInterceptor` reaches it; their copies
  on the route do: a JSON body over `BODY_LIMIT` answers 413 `PAYLOAD_TOO_LARGE`, a broken one 400
  `BAD_REQUEST`, and a request not answered within `REQUEST_TIMEOUT_MS` answers 503
  `SERVICE_UNAVAILABLE` (its work is not cancelled, its end is logged, the first timeout within a
  minute goes to Sentry), all in Better Auth's `{ code, message }`. So `/api/auth` needs no
  exception in `CLAUDE.md`'s limits. Rejected: nginx's 1 MB and 60 s alone.
- **N29. A session that cannot be read answers 503 (added at T6).** The request context reads the
  session ahead of the guards, out of `TimeoutInterceptor`'s reach. A read that fails (the
  database) or takes longer than 2 s answers 503 `SERVICE_UNAVAILABLE` in the api's format, which
  web's queries retry; a slow read is not cancelled. A request without a session cookie never reads
  it. At most 20 reads run at once in a process, slow ones past their timeout included; one more
  answers 503 at once, so abandoned reads cannot pile up in the database pool while it is down
  (the pool's own timeouts, for every route, are a backlog item). Only the first such 503 within a
  minute goes to Sentry, the rest to the log as warnings, as for timeouts (0006 F29). Rejected: 500
  (not retried), and treating the request as anonymous (a signed-in user would get 401 and look
  signed out).
- **N30. The request context reads the session on every request with a cookie, and only reads it
  (added at T6).** The principal is a plain value from the start of a request: guards, services,
  the error filter and Sentry read it on any route, public ones too. Accepted risk: the read runs
  ahead of the rate limit, so a user with a valid session cookie and no cached copy makes a database
  read per request beyond the api's quota, up to nginx's limit; without a valid signature nothing is
  read. The api never extends a session (`disableRefresh`): the refreshed cookies would have to ride
  on its answers. web's Better Auth client extends it through `/api/auth/get-session` (N4), so web
  reads the session through that client (T12). Rejected: reading it in the access guard on
  `@SignedIn()` routes only (an async principal, unknown on public routes, and a change of plan §4).

## Added at the review of PR 1

All decisions below: owner, 2026-10-18, on the review of the spec's pull request (#76).

- **N31. A deleted account stays signed in elsewhere for up to 5 minutes.** `DELETE /me` clears
  this browser's cookies, so it is signed out at once; another browser of the user keeps the cached
  copy of its session (N18) until it expires, and so does a copy of both cookies taken before the
  deletion. Meanwhile its principal names a user with no row: `GET /me`, `DELETE /me` and the
  writes that reference the user answer 401 `UNAUTHORIZED`, reads find nothing (empty lists, 404).
  No database read is added for it. AC12 is worded like AC4. Rejected: reading
  the user past the cache on every write and on `/me` (a read per write, against N18).
- **N32. The 429 of `/api/auth/*` keeps the api's format.** `authThrottle` answers 429 like the
  api's own rate limit, `{ error: { code, message, details } }` with `Retry-After`, as nginx's
  413, 429 and 502/504 (as 503) already do in front of `/api/auth/`; web reads both formats
  there. Every other answer of `/api/auth/*` keeps Better Auth's (N17, N26, N28). Rejected: a 429 in Better Auth's
  format (a second copy of the limit's answer).
- **N33. Better Auth is pinned to its latest patch on purpose.** An auth library with frequent
  security fixes is pinned to its latest release, never below 1.7.7 (the last 2026 advisory),
  even when it is only days old, against `CONTRIBUTING.md`'s preference. The pin stays exact and
  the same in api and web: the task that installs it in web (T12) takes the api's pin, and a bump
  moves both packages in one commit and runs the auth e2e (plan, Risks). `oauth2-mock-server` is a development tool, so its age does not matter.
- **N34. Sessions keep no User-Agent.** Nothing reads it, and with the user id it fingerprints a
  browser: the session hook drops it like the IP address (T7). The empty `sessions.user_agent`
  column goes in a later release (migrations stay compatible), a backlog item. Rejected: keeping it
  for a future list of devices (it comes back with that list).
- **N35. Starting a sign-in stays in the `expensive` tier.** Each one leaves a `verifications`
  row until the daily cleanup (N27), so its limit stays low; visitors behind one address (a shared
  network at a demo) who hit it get 429, and `THROTTLE_EXPENSIVE_*` raise it without a code change.
  Those limits are the tier's, shared with the `@Expensive()` routes (counters stay separate), so
  raising them for sign-in raises the quota of AI generations and photo uploads too; accepted.
  Rejected: tier `write`; separate variables for sign-in.
- **N36. The socket keeps a revoked session's user until it disconnects.** The gateway reads the
  user at the handshake (plan §7); a sign-out or a revoke does not close an open socket. The
  gateway carries no user data in this spec, so the generations spec decides how long that trust
  lasts (a backlog item).
- **N37. Account deletion: Temporal's retention now, the outbox with the photo upload** (owner,
  2026-10-19, at T7). With `DELETE /me` any user can delete their account, and the id of each one
  stays in `deleteFiles`' history, which production never expires: T9 checks the retention the
  production Temporal sets and sets it (about 7 days). The outbox of file deletion (an api killed
  between the delete's commit and the workflow's start leaves the files) matters only once users'
  folders hold files, which no route writes yet: it stays in the backlog, for the photo upload spec,
  before the first user's file. Rejected: both now (a migration and a table in PR 2 for folders
  that are empty); both later (deleted users' ids kept from the first deletion).
- **N38. A 401 of `/me` for a deleted user signs the browser out** (owner, 2026-10-19, at T7's
  review). `GET /me` and `DELETE /me` that find the user gone (N31) expire the session cookies in
  their answer, as `DELETE /me` does: get-session stops showing the browser signed in, and the
  token no longer makes a database read on every request for up to 30 days. Rejected: keeping them
  until they expire (N18 allows it, but nothing gains from it).
- **N39. Fitting sessions per user are limited with the generations spec** (owner, 2026-10-19, at
  T7's review). A signed-in user can create sessions within the `write` quota and nothing removes
  archived ones; a per-user limit goes to the backlog for the generations spec, which defines how
  sessions are used. Rejected: a limit now, before sessions have a use.

## Added at T8

- **N40. The socket refuses another site's page** (owner, 2026-10-19, at T8's review). socket.io's
  CORS binds long-polling only; a WebSocket opens from any page, and the browser sends the session
  cookie whenever the page is same-site. A new connection whose `Origin` is not `WEB_ORIGIN` is
  refused with 403 before its session is read; one without `Origin` (no browser) passes. Rejected:
  later, with the first handler that reads the user (the `SameSite=Lax` cookie covers other sites
  until then, not same-site ones).
- **N41. Extra CONNECT packets of one connection go to the backlog** (owner, 2026-10-19, at T8's
  review). The session is read once per connection, but every CONNECT a client sends while that
  read runs (up to 2 s) still becomes a socket, held until the connection closes: socket.io's own
  behavior, made longer by the read. A limit comes with the first real socket feature (0006 F8),
  added to the backlog when this spec closes. Rejected: refusing a second CONNECT now.
- **N42. Sockets take at most 5 of the 20 session reads** (owner, 2026-10-19, at T8's review; the
  number is the agent's). Sockets and HTTP share N29's cap; without a share, a wave of sockets
  (a slow database, nginx letting 10 handshakes a second through per address) could hold every
  slot, and HTTP requests of signed-in users would answer 503. A socket's read holds its slot until
  the read itself ends, as N29 counts; one more connects as anonymous at once, logged as a warning,
  never reported. Five, since the cached copy (N18) answers in milliseconds and leaves 15 to HTTP.
  Such a socket stays anonymous until it reconnects: harmless while no handler reads the user, so
  the generations spec decides it with N36 (refuse it for a retry, or read again on demand).
  Rejected: no share (the backlog).
- **N43. `WEB_ORIGIN` is an exact origin** (owner, 2026-10-19, at T8's review). CORS and the
  socket's Origin check (N40) compare it with the browser's `Origin` as a string, so a path, a
  trailing slash or a default port (`https://host/`, `https://host:443`) would refuse every browser
  while the site still loads. The api refuses to start unless the value equals its URL's origin.
  Rejected: normalising the value (a typo would pass unseen).
- **N44. Warnings about a socket's unread session: one line a minute** (owner, 2026-10-19, at T8's
  review). Refused sockets (N42) come as fast as nginx lets handshakes through, from many addresses
  at once; the adapter logs the first in a minute and counts the rest into the next line
  (`alsoSinceLastLine`). Reported failures (N29) are not affected. Rejected: a line per socket, as
  HTTP's 503 warnings have (HTTP requests are counted by the rate limit, handshakes are not).

## Added at T9

- **N45. Temporal's retention stays one day, set by every deploy** (owner, 2026-10-19, at T9).
  Checked on the server: `temporal server start-dev` registers `default` with a retention of 24
  hours, so production did expire histories, unlike N37's premise. 24 hours already keeps a deleted
  user's id shorter than the 7 days N37 named. `deploy.sh` sets it after the infrastructure is up,
  so a new image's default or a fresh volume cannot change it, and the CI deploy check reads it
  back. Rejected: 7 days (a week of ids for more time to look at a failure); a one-time command on
  the server (lost with the volume).
- **N46. AC6's search keeps the tests of the retired names** (owner, 2026-10-19, at T9). The
  tests that check the api ignores `X-Admin-Token` and a leftover `ADMIN_API_TOKEN` name them on
  purpose; T9's check finds only specs and those tests. Rejected: rewriting the tests to hide the
  names.
- **N47. CD checks `BETTER_AUTH_SECRET` before the server** (owner, 2026-10-19, at T9). The check
  that compared the proxy secrets with `ADMIN_API_TOKEN` (0006 F19) now refuses a
  `BETTER_AUTH_SECRET` that is not 32+ letters or digits (N21) or equals `PROXY_SECRET` or
  `PROXY_SECRET_NEXT`, and an empty `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`, as it does for the
  storage settings: otherwise only the new copy's start would fail. Rejected: only removing the old
  comparison.
- **N48. `deploy/README.md` says `SITE_DOMAIN` is a lower-case host in punycode** (owner,
  2026-10-19, at T9). `WEB_ORIGIN` is `https://${SITE_DOMAIN}` and must equal its own origin (N43),
  which lower-cases the host and writes it in punycode; a port, a path or a slash also fail. A
  line in the README, no CD check. Rejected: no note; a format check in CD.
- **N49. The production Google client has no localhost redirect** (owner, 2026-10-19, at T9's
  review). Testing it locally would put its secret into a local `.env` (CONTRIBUTING.md rule 4),
  and a localhost redirect lets any local process on port 3001 take a code issued for production.
  Locally the fake provider signs in; checking the real Google locally takes a separate client,
  `lamoda-ai-fitting-dev`, whose values stay in the local `.env`. Rejected: both redirects on one
  client (T9's first wording).
- **N50. The cleanup of expired sign-in rows** (owner, 2026-10-19, at T9a). The schedule
  `delete-expired-auth-rows` runs at 03:00 Europe/Moscow; the worker creates it at start, or brings
  an existing one to the code's settings at every start (the code is the source of truth; a pause
  set by hand stays). Batches of 1000 rows, no index on `expires_at` (small tables, one pass a day,
  no migration). The activity is retried from 1 s up to 1 minute apart, at most 25 attempts, so it
  gives up within the run's limit of 1 hour; what is left waits for the next day, and an
  overlapping run is skipped. Its failures reach Sentry through `sentryActivityInterceptor` (first
  and last attempt; the attempt limit is what lets it see the last one). The workflow is tested on
  the throwaway Temporal (0011 M16), not `@temporalio/testing` (T9a's wording). Rejected: 03:00
  UTC, every 24 hours from creation; leaving a differing schedule as it is; an index; retries
  without a limit.
