# 0013 auth: tasks

Status: done (2026-10-19): all 15 criteria pass (record below). History, not instructions.
Accepted 2026-10-16; amended 2026-10-18 at the review of PR 1 (T7, T10, T12: N31–N34,
plan §10); amended 2026-10-19 after the rebase on 0011 (T10 before T7, AC12's files in T7, the `GET /me`
link check in T7); amended 2026-10-19 at T7 (Temporal's retention in T9, N37); amended 2026-10-19 at T9 (N45–N49); amended 2026-10-19 at T9a (N50; T9a's check on the throwaway Temporal).

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- Every task of PR 2 touches auth, endpoints or config, so `security-reviewer` joins each review;
  the web tasks get `fsd-reviewer`.
- At each merge of spec 0011 the owner reports, the open branch is rebased on a fresh `main` and
  the conflicts (env, compose, deploy, services, `openapi.json`) are resolved in the rebase (N15).
- The pull request of PR 4 carries `Closes #38` under "Что сделано".

## PR 1 · `docs/0013-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (N1–N16).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0013 auth and its decisions`
- [x] **T2. Plan.** `plan.md`; the spec amended and N17–N18 recorded at the plan, guests withdrawn.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0013 and amend its spec`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0013`
- 👤 merges PR 1.

## PR 2 · `feat/0013-auth-api` · sign-in and access in the api

- [x] **T3a. Old app images (not of this spec).** On 2026-10-16 the deploy of PR 1 failed: about
      45 old api and web images filled the server's disk. They were removed by hand, and
      `deploy.sh` now removes the app images no container uses, before the pull (with a registry)
      and after the switch; `ci-deploy-check.sh` checks it. Carried in this pull request by the
      owner's choice instead of a pull request of its own.
      Check: the function on probe images (unused removed; used, `:dev` and other images kept;
      nothing removed when the containers cannot be listed); CI's deploy check; on the server the
      first deploy logs `removed N app images`.
      Commit: `fix(deploy): remove app images no container uses`

- [x] **T4. Configuration and the fake provider.** `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
      `GOOGLE_CLIENT_SECRET`, `AUTH_FAKE_OIDC_URL`, `AUTH_FAKE_OIDC_PUBLIC_URL` in `env.ts` with
      `assertServerEnv`'s production rules and their tests, `.env.example`, `scripts/init-env.sh`,
      `api/vitest.config.ts`; `oauth2-mock-server@9.3.0` and `api/scripts/fake-oidc.mjs` with its
      login form; the `oidc` service in `docker-compose.yml`; `check:web-bundle` names (plan §8,
      §11). Added with the owner: `qa-tester`'s ports 4010/4011 and the `oidc` service (N19),
      `OIDC_HOST_PORT` (N20), letters and digits in `BETTER_AUTH_SECRET` (N21), the three production
      variables in `deploy/compose/app.yml` and `ci-deploy-check.sh` (N22).
      Check: env unit tests (AC14); `docker compose up -d --wait` healthy; the fake provider's
      discovery document answers on 4010; `npm run verify`.
      Commit: `feat(api): add the auth configuration and a fake openid provider`
- [x] **T5. Better Auth and the database.** `better-auth@1.7.10`; the `auth` migration and models;
      `api/src/auth/` (instance, hooks, module); the mount in `createHttpApp()` with
      `authThrottle`; `constraint-fields.ts`; nginx's `location /api/auth/`; web's development
      rewrite for `/api/auth/:path*` (plan §2, §3, §5, §9). First the risky part (plan "Risks"):
      the redirect flow through web's rewrite and the `null` first name; if either fails, stop
      and fix the plan with the owner.
      Check: e2e of the redirect flow through the fake provider (AC1's api part, AC2), cookie
      attributes and expiry (AC5), Better Auth's error body (AC11), the rate limit of
      `/api/auth`; a sign-in on the local stack at `localhost:3001/api/auth/…` creates a user;
      `nginx -t` on the template; `npm run verify`.
      Commit: `feat(api): sign in with google through better auth`
- [x] **T6. Principal and markers; the admin goes.** The async request context with the session
      principal and Sentry's user id; `@SignedIn()`, `@Closed()`, `AccessGuard`; `@AdminOnly()`,
      the admin principal, `X-Admin-Token`, `ADMIN_API_TOKEN` in `env.ts`, Swagger's admin scheme
      and pino's admin redaction removed; markers set on every controller (plan §6's access
      column); the access-markers test with `CLOSED_HANDLERS`; `test/support/sign-in.ts` and the
      test guard; every e2e moved off the admin token; `openapi.json` rewritten (plan §4).
      Check: access-markers test; e2e: 401 without a session on `@SignedIn()` routes, 401 with one
      on closed routes, catalog reads 200 (AC7, AC9); `rg -i 'admin'` in `api/src` and `api/test`
      finds nothing of the admin; `npm run verify`.
      Commit: `feat(api): replace the admin token with signed-in users`
- [x] **T7. Own data only, and the current user.** Owner-scoped services and DTOs for fitting
      sessions and generations; `MeController` (`GET /me`, `DELETE /me` clearing the cookies);
      nullable `phone` and `firstName` in `UserResponseDto`; 401 for a deleted user's cached
      session (N31); the session hook drops the User-Agent (N34); `mount-auth.ts`'s comment on
      the error format names the 429 exception (N32); `openapi.json`; web's contract tests and
      entity schemas follow (plan §6).
      Check: e2e with two users on every fitting session and generation route (AC8); `GET /me`,
      with a signed link for a photo key in the user's folder and a `null` link for one outside it
      (0011 M8, M25; plan §6);
      `DELETE /me` removes the rows, clears both cookies in its answer and the session token alone
      then answers 401; a cached copy (another session, or both old cookies) gets 401 on `GET /me`,
      `DELETE /me` and a write; `DELETE /me` starts the file deletion and the user's folder is empty
      afterwards (AC12); a new session has no User-Agent;
      `npm run verify`.
      Commit: `feat(api): serve each user only their own fittings`
- [x] **T8. The socket knows the user.** `io.use` in `SocketIoAdapter` (plan §7).
      Check: socket e2e with and without a cookie (AC10); `npm run verify`.
      Commit: `feat(api): recognise the signed-in user on the socket`
- [x] **T9. Deploy and docs of the api.** `ADMIN_API_TOKEN` out of `docker-compose.yml`,
      `deploy/compose/app.yml`, `cd.yml`, `ci-deploy-check.sh`, `scripts/init-env.sh` and
      `.env.example` (listed here at T6, when `env.ts` stopped reading it); the new variables in `cd.yml`
      (`app.yml` and the deploy check have them since T4, N22), checked by CD before the server
      (N47); the retention of production Temporal's namespace checked and set by `deploy.sh` to 24
      hours, read back by the deploy check (N37, added at T7; N45);
      `deploy/README.md` (Google console, secrets, removing the old one); `README.md` (local
      sign-in, no admin token); `CLAUDE.md` (access, request context, error format exception,
      stack table, env); `specs/backlog.md` (plan "Backlog").
      `deploy/README.md` also says `SITE_DOMAIN` is a lower-case host in punycode (N48).
      Check: `rg -i 'admin_api_token|x-admin-token'` finds only specs and the tests that check the
      retired names are ignored (AC6, N46); `npm run verify`.
      Commit: `docs(docs): describe sign-in and the end of the admin token`
- [x] **T9a. Expired sign-in rows are deleted (added at T5, N27).** A Temporal schedule, created by
      the worker at start if missing, runs once a day a workflow whose activity deletes
      `verifications` and `sessions` with `expires_at < now()` in batches (plan §12; time, update
      of a changed schedule, batches and retries: N50).
      Check: activity e2e on the database (expired rows go, live ones stay); workflow test on the
      throwaway Temporal (0011 M16, N50); `temporal-reviewer`; `npm run verify`.
      Commit: `feat(api): delete expired sessions and sign-in states`
- [x] **T10. 0011's checks without the admin token (done right after the rebase, before T7).**
      0011's admin-based e2e (`owner-check-links`, `file-deletion`, `file-deletion-close`; M8, M9,
      M11) rewritten for a signed-in user and the test guard (N15). The branch was rebased on
      `main` with all of 0011 (#77, #78) on 2026-10-19; the owner moved this task before T7 so the
      branch is green again first. `DELETE /me` gets the files from T7: `UsersService.delete`
      already starts their deletion (0011 M11).
      Check: 0011's link, key-folder and file-deletion checks pass; `npm run verify`.
      Commit: `test(api): run the storage checks as a signed-in user`
- 👤 before the merge: creates the Google OAuth client (redirect URI
  `https://lamoda-ai-fitting.ru/api/auth/callback/google` only, N49), puts `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET` into GitHub Environment `production`; merges
  PR 2; after the deploy deletes `ADMIN_API_TOKEN` there.

## PR 3 · `feat/0013-auth-web` · the login modal and the profile menu

- [x] **T11. The kit's menu.** `shared/ui/menu` on Base UI's Menu (items, disabled items,
      separator) and its section on `/ui-kit` (plan §10).
      Check: web tests (keyboard, `aria-disabled`); `qa-tester` on `/ui-kit`; `npm run verify`.
      Commit: `feat(web): add a menu to the ui kit`
- [x] **T12. Sign-in in the header.** `better-auth` in web at the api's exact pin (N33); `shared/auth`,
      `entities/session`, `features/auth` (`LoginModal`, sign-outs); the profile icon as a client
      component with the modal and the menu of N12; `errorText` for Better Auth's codes and for the
      api-format 429 and nginx answers of `/api/auth` (N32); `/privacy`'s line (plan §10). The
      session comes from Better Auth's client (`/api/auth/get-session`), which also extends it: the
      api never does (N30). `callbackURL` is a path from the router, never from the query (plan §10).
      Check: web tests of the icon's states, the menu's items and the name fallback (AC3), and that
      `callbackURL` starts with a single `/` for a pathname starting with `//`, `///` or `/\`, and
      ignores the query (`?next=//evil.example`);
      `qa-tester` on the local stack: sign-in through the fake provider and back to the same page
      (AC1), sign-out and sign-out everywhere with two browsers (AC4), screenshots of the menu for
      the owner; `npm run verify`.
      Commit: `feat(web): sign in with google from the header`
- [x] **T13. Analytics of sign-in.** `identify`, `reset` in `client.ts`; the events and elements in
      `events.ts`; the `sessionStorage` flag (plan §10), which also gates the `SignInFailed` report
      of a sign-in that came back with `error` (N54). The tracked handlers of "Выйти" and "Выйти со
      всех устройств" join their `onClick` in `SignOutItems`.
      Check: web tests of the calls with and without consent (AC13); `qa-tester` watches the
      requests; `npm run verify`.
      Commit: `feat(web): count sign-ins in analytics`
- [x] **T14. Docs of web.** `CLAUDE.md` (web's auth client, the header, analytics), `README.md`.
      Check: `npm run format:check`.
      Commit: `docs(docs): describe sign-in in web`
- 👤 merges PR 3.

## PR 4 · `docs/0013-close` · production checks and closing

- [x] **T15. Close the spec.** The production checks with the owner (a real Google sign-in, the
      menu, sign-out everywhere, `DELETE /me` through the api, 401 on closed routes, no admin
      token accepted), the acceptance record below, every file gets `Status: done`.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0013`
- 👤 merges PR 4.

## Acceptance record

Production checks on 2026-10-19 on the deploy of `2d15741` (PR 3's merge, CI green). The main
session checked from the laptop with `curl` (no cookie, a forged session cookie, `X-Admin-Token`),
read Temporal on the server (`ssh ai-fitting`, `temporal workflow list` and `describe` in the
Temporal container, read only) and read the events in Mixpanel. The owner signed in with a real
Google account in two browsers, A (Safari, private window, cookies accepted) and B (another
browser), and deleted the account from A's console with
`fetch('/api/me', { method: 'DELETE' })`, so no cookie left the browser. The local criteria rest
on the checks of the tasks named. `npm run verify` on the closing commit passed (api 2890 tests, web 1886, guards and scripts 589).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | Production: from `/privacy`, the profile icon opened "Войти через Google", a real Google account signed in and came back to `/privacy` signed in (user `01a153ee-…`). Locally: `auth.e2e-spec.ts` "the flow (AC1)" through the fake provider (email lower-cased, a name failing the rule stored as `null`, no avatar); `qa-tester` in the browser in T12                                                                                                                                                                                                                                                          |
| AC2  | pass   | Production: browser B signed in with the same Google account and `/api/me` answered the same `id` as A. `auth.e2e-spec.ts` "one user per email (AC2)": two sign-ins, one user, one account, two sessions                                                                                                                                                                                                                                                                                                                                                                                                          |
| AC3  | pass   | Production screenshot of the menu: a circle with "Е" and the name "Ева", no email; "Мои заказы", "Магазины", "Мои данные", "Мои примерки" greyed out; a divider; "Выйти" and "Выйти со всех устройств". Web tests `header-profile.test.tsx`, `session-user.test.tsx`, `sign-out-items.test.tsx` (items, `aria-disabled`, the "Профиль" fallback); `qa-tester`'s screenshots compared by the owner in T12                                                                                                                                                                                                          |
| AC4  | pass   | Production: "Выйти" in A: the icon opened the login modal and A's `/api/me` answered 401 `UNAUTHORIZED`, while B's still answered 200. After signing A in again, "Выйти со всех устройств" in A: A signed out at once, B's `/api/me` turned to 401 about 3 minutes later (within N18's 5). `auth.e2e-spec.ts` "ends with sign-out", "signing out everywhere" (no session and no session rows after either). The plan's test-clock e2e of the other session's 401 after the cache window was not written: the 5-minute bound rests on this production check and N31's cached-copy tests in `me.e2e-spec.ts`        |
| AC5  | pass   | Production: the sign-in start's `Set-Cookie` is `__Secure-lamoda.state=…; HttpOnly; Secure; SameSite=Lax` (`__Secure-` prefix: Secure enforced by the browser); A held `__Secure-lamoda.session_token` and `__Secure-lamoda.session_data` after the sign-in. `auth.e2e-spec.ts` "the session cookie and its life (AC5)": HttpOnly, SameSite=Lax, 30 days, expiry and extension with a moved clock                                                                                                                                                                                                                 |
| AC6  | pass   | Production: `GET /users`, `POST /products`, `DELETE /users/:id` with `X-Admin-Token` (either case) answer 401 `UNAUTHORIZED` "The route is closed". `rg -i 'admin_api_token\|x-admin-token'` outside `specs/` finds only `access.e2e-spec.ts` (both) and `env.spec.ts`, the tests of the retired names (N46); `api/openapi.json` has no `admin`; `ADMIN_API_TOKEN` deleted from GitHub after PR 2's deploy                                                                                                                                                                                                        |
| AC7  | pass   | Production without a cookie: `GET`/`DELETE /me`, the five fitting session routes, `GET` and `GET`/`DELETE :id` of `/ai-generations` answer 401 `UNAUTHORIZED` "Sign-in required", as `GET /me` with a forged session cookie; `GET /products`, `/products/facets`, `/brands`, `/categories` answer 200. `me.e2e-spec.ts` "without a session (AC7)"; `access.e2e-spec.ts` (T6)                                                                                                                                                                                                                                      |
| AC8  | pass   | T7: `fitting-sessions.e2e-spec.ts` and `ai-generations.e2e-spec.ts` with two users on every route: another user's row answers 404 `NOT_FOUND` like a missing id, lists hold only the user's rows                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC9  | pass   | Production: all five `/users` routes, `POST`/`PATCH /ai-generations`, `POST`/`PATCH`/`DELETE /products`, `POST /brands`, `/categories`, `/attributes` and `POST` of a product's images, variations and attribute values answer 401 "The route is closed". T6: `access.e2e-spec.ts` (closed routes 401 to a signed-in user), `access-markers.e2e-spec.ts`                                                                                                                                                                                                                                                          |
| AC10 | pass   | T8: `socket-principal.e2e-spec.ts` (the principal from the session cookie at the handshake)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC11 | pass   | Production: an unknown `/api/auth/unknown-route` and `POST /api/auth/sign-up/email` answer 404 `{"code":"NOT_FOUND","message":…}`; every refused api route above answers `{ error: { code, message, details } }`; a 2 MB body to `POST /api/auth/sign-in/social` gets nginx's 413 `{"error":{"code":"PAYLOAD_TOO_LARGE",…}}` (`application/json`). `auth.e2e-spec.ts` "the error format (AC11)"; `auth-throttling.e2e-spec.ts`: the 429 in the api format with `Retry-After`                                                                                                                                      |
| AC12 | pass   | Production: `DELETE /me` from A answered 204; A's `/api/me` answered 401, B's within about 3 minutes; B signed in again as a new user `01a153fe-…` (the old row was gone); Temporal shows `delete-files-user-01a153ee-c666-7477-aa84-f81ef1b6ee0c` `COMPLETED`. T7: `me.e2e-spec.ts` (rows gone, both cookies expired, a cached copy 401 per N31, the user's folder emptied)                                                                                                                                                                                                                                      |
| AC13 | pass   | Production, Mixpanel: `Signed In` ×3 and `Signed Out` ×2 from A (consent given), each with `$user_id` `01a153ee-…`, in the order of the steps; after each `Signed Out` the next `Signed In` came with a new `$device_id` (the identity was reset); without consent nothing was sent: B (no consent) sent no event, its sign-in as the new user `01a153fe-…` after the deletion included; the event and profile properties hold no email or name (only Mixpanel's own `$…` and `mp_…`). T13: `use-sign-in-analytics.test.tsx`, `client.test.ts` (calls with and without consent); `qa-tester` watched the requests |
| AC14 | pass   | T4: `env.spec.ts` (`assertServerEnv` refuses `AUTH_FAKE_OIDC_*` and a missing Google client id, secret or auth secret in production); production started with the real provider (AC1)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC15 | pass   | `npm run verify` on the closing commit; CI of `2d15741`, the code this record checks, green                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
