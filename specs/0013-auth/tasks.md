# 0013 auth: tasks

Status: accepted (2026-10-16).

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

- [ ] **T4. Configuration and the fake provider.** `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
      `GOOGLE_CLIENT_SECRET`, `AUTH_FAKE_OIDC_URL`, `AUTH_FAKE_OIDC_PUBLIC_URL` in `env.ts` with
      `assertServerEnv`'s production rules and their tests, `.env.example`, `scripts/init-env.sh`,
      `api/vitest.config.ts`; `oauth2-mock-server@9.3.0` and `api/scripts/fake-oidc.mjs` with its
      login form; the `oidc` service in `docker-compose.yml`; `check:web-bundle` names (plan §8,
      §11).
      Check: env unit tests (AC14); `docker compose up -d --wait` healthy; the fake provider's
      discovery document answers on 4010; `npm run verify`.
      Commit: `feat(api): add the auth configuration and a fake openid provider`
- [ ] **T5. Better Auth and the database.** `better-auth@1.7.10`; the `auth` migration and models;
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
- [ ] **T6. Principal and markers; the admin goes.** The async request context with the session
      principal and Sentry's user id; `@SignedIn()`, `@Closed()`, `AccessGuard`; `@AdminOnly()`,
      the admin principal, `X-Admin-Token`, `ADMIN_API_TOKEN` in `env.ts`, Swagger's admin scheme
      and pino's admin redaction removed; markers set on every controller (plan §6's access
      column); the access-markers test with `CLOSED_HANDLERS`; `test/support/sign-in.ts` and the
      test guard; every e2e moved off the admin token; `openapi.json` rewritten (plan §4).
      Check: access-markers test; e2e: 401 without a session on `@SignedIn()` routes, 401 with one
      on closed routes, catalog reads 200 (AC7, AC9); `rg -i 'admin'` in `api/src` and `api/test`
      finds nothing of the admin; `npm run verify`.
      Commit: `feat(api): replace the admin token with signed-in users`
- [ ] **T7. Own data only, and the current user.** Owner-scoped services and DTOs for fitting
      sessions and generations; `MeController` (`GET /me`, `DELETE /me` clearing the cookies);
      nullable `phone` and `firstName` in `UserResponseDto`; `openapi.json`; web's contract tests
      and entity schemas follow (plan §6).
      Check: e2e with two users on every fitting session and generation route (AC8); `GET /me`;
      `DELETE /me` removes the rows and the old cookie answers 401 (AC12 without files);
      `npm run verify`.
      Commit: `feat(api): serve each user only their own fittings`
- [ ] **T8. The socket knows the user.** `io.use` in `SocketIoAdapter` (plan §7).
      Check: socket e2e with and without a cookie (AC10); `npm run verify`.
      Commit: `feat(api): recognise the signed-in user on the socket`
- [ ] **T9. Deploy and docs of the api.** `ADMIN_API_TOKEN` out of `docker-compose.yml`,
      `deploy/compose/app.yml`, `cd.yml`, `ci-deploy-check.sh`; the new variables in them;
      `deploy/README.md` (Google console, secrets, removing the old one); `README.md` (local
      sign-in, no admin token); `CLAUDE.md` (access, request context, error format exception,
      stack table, env); `specs/backlog.md` (plan "Backlog").
      Check: `rg -i 'admin_api_token|x-admin-token'` finds only specs (AC6); `npm run verify`.
      Commit: `docs(docs): describe sign-in and the end of the admin token`
- [ ] **T10. Account files (after `feat/0011-storage` is in `main`).** Rebase; `DELETE /me` goes
      through 0011's user deletion; 0011's admin-based e2e (M8, M9; its T7) rewritten for a
      signed-in user and the test guard (N15). If 0011 lands after PR 2 is merged, this task moves
      to PR 3.
      Check: e2e: `DELETE /me` starts the file deletion and the user's folder is empty afterwards
      (AC12); 0011's link and key-folder checks pass; `npm run verify`.
      Commit: `feat(api): delete an account's files with it`
- 👤 before the merge: creates the Google OAuth client (redirect URIs
  `http://localhost:3001/api/auth/callback/google` and
  `https://lamoda-ai-fitting.ru/api/auth/callback/google`), puts `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET` into GitHub Environment `production`; merges
  PR 2; after the deploy deletes `ADMIN_API_TOKEN` there.

## PR 3 · `feat/0013-auth-web` · the login modal and the profile menu

- [ ] **T11. The kit's menu.** `shared/ui/menu` on Base UI's Menu (items, disabled items,
      separator) and its section on `/ui-kit` (plan §10).
      Check: web tests (keyboard, `aria-disabled`); `qa-tester` on `/ui-kit`; `npm run verify`.
      Commit: `feat(web): add a menu to the ui kit`
- [ ] **T12. Sign-in in the header.** `better-auth@1.7.10` in web; `shared/auth`,
      `entities/session`, `features/auth` (`LoginModal`, sign-outs); the profile icon as a client
      component with the modal and the menu of N12; `errorText` for Better Auth's codes;
      `/privacy`'s line (plan §10).
      Check: web tests of the icon's states, the menu's items and the name fallback (AC3);
      `qa-tester` on the local stack: sign-in through the fake provider and back to the same page
      (AC1), sign-out and sign-out everywhere with two browsers (AC4), screenshots of the menu for
      the owner; `npm run verify`.
      Commit: `feat(web): sign in with google from the header`
- [ ] **T13. Analytics of sign-in.** `identify`, `reset` in `client.ts`; the events and elements in
      `events.ts`; the `sessionStorage` flag (plan §10).
      Check: web tests of the calls with and without consent (AC13); `qa-tester` watches the
      requests; `npm run verify`.
      Commit: `feat(web): count sign-ins in analytics`
- [ ] **T14. Docs of web.** `CLAUDE.md` (web's auth client, the header, analytics), `README.md`.
      Check: `npm run format:check`.
      Commit: `docs(docs): describe sign-in in web`
- 👤 merges PR 3.

## PR 4 · `docs/0013-close` · production checks and closing

- [ ] **T15. Close the spec.** The production checks with the owner (a real Google sign-in, the
      menu, sign-out everywhere, `DELETE /me` through the api, 401 on closed routes, no admin
      token accepted), the acceptance record below, every file gets `Status: done`.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0013`
- 👤 merges PR 4.

## Acceptance record

Filled in by T15.
