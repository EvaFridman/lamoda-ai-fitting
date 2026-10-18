# 0013 auth: clarifications

Status: accepted (2026-10-16); amended 2026-10-16 at the plan: no guests (N2, N9, N10 withdrawn),
the first name is optional (N5), Better Auth's own error format (N17), a 5-minute session cache
(N18).

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
  passes the existing name rule (0004 E10) and left empty otherwise; the rule does not change. No
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
  `errorText`. Rejected: rewrapping its answers (own code against every update of the library).
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
  answer of `/api/auth/*` has one format (N17). It is logged without the row and reported to Sentry,
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
