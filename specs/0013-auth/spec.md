# 0013 auth

Status: done (2026-10-19): all 15 criteria pass ([tasks.md](tasks.md), acceptance record).
History, not instructions. Accepted 2026-10-16; amended 2026-10-16 at the plan: guests dropped (N9), the first name
is optional (N5), `/api/auth/*` keeps its own error format (N17), other browsers are signed out
within 5 minutes (N18); criteria renumbered. Amended 2026-10-18 at the review of PR 1: a deleted
account is signed out elsewhere within 5 minutes (AC12, N31), `/api/auth/*`'s 429 and nginx's
answers keep the api's format (AC11, N32).

Issue #38. Decisions: `clarifications.md` (N1–N56; N9 and N10 withdrawn).

## Goal

Nobody can sign in today: the api knows an anonymous visitor and an admin with a shared token, and
every route for users, fitting sessions and generations is admin-only (0004 E1, 0006 F3). The
fitting needs owners for its photos and results. This spec lets a visitor sign in with Google and
replaces the admin token with access by user: each user sees and changes only their own data.

## In scope

- Sign-in with Google, sign-out, and sign-out from every device (N2, N12, N18).
- Sessions in PostgreSQL, 30 days extended by use (N3, N4).
- Users without a phone or a first name; the first name from Google when it passes the rule (N5).
- Removing the admin token and its principal; a user guard; access set anew for every route;
  someone else's resource answers 404 (N7, N8; backlog "IDOR checks with auth").
- The current user's own routes: read, and delete the account with their files (N11).
- The header's profile icon: the login modal and the profile menu (N12).
- Mixpanel identifies signed-in users and counts sign-in events (N13).
- A fake OpenID provider for tests and the local stack (N14).
- Rewriting spec 0011's admin-based checks for signed-in users (N15).

## Non-goals

- Guests and trying on without signing in (N9).
- Other providers and sign-in methods: Yandex ID, VK ID, Google One Tap, passkeys, email codes (N2).
- The "Мои данные", "Мои заказы", "Магазины" and "Мои примерки" pages; editing one's own data (N12).
- An admin role or admin pages (N7).
- Storing Google's profile picture (N6).
- Email look-alikes (backlog): Google gives only addresses it has verified, so the check waits for
  a sign-in method where the user types their email.

## Acceptance criteria

### Sign-in

- **AC1.** On the local stack, clicking the profile icon while signed out opens a modal with
  "Войти через Google"; going through the fake provider (N14) brings the visitor back to the page
  they started on, signed in. A new Google account creates a user with the email from the provider,
  the given name when it passes the name rule (empty otherwise) and no phone.
- **AC2.** Signing in again with the same Google account does not create a second user.
- **AC3.** A signed-in user's profile icon opens the menu: initials and name at the top (no email;
  without a name, the email's first letter and "Профиль"), "Мои заказы", "Магазины", "Мои данные",
  "Мои примерки" (inert and marked disabled for assistive technology), a divider, "Выйти" and
  "Выйти со всех устройств". Its look follows Lamoda's profile menu; the owner compares
  `qa-tester`'s screenshots.
- **AC4.** "Выйти" ends this browser's session: the icon opens the login modal again and the
  current user's routes answer 401. "Выйти со всех устройств" does the same in this browser at once
  and in every other browser of the user within 5 minutes (N18).
- **AC5.** The session cookie is HttpOnly, Secure in production and SameSite=Lax; after 30 days
  without a visit the session no longer works, and a visit extends it.

### Access

- **AC6.** No route accepts `X-Admin-Token` any more, and `ADMIN_API_TOKEN` is gone from
  `.env.example`, the compose files and the deploy; the OpenAPI document has no admin scheme.
- **AC7.** Without a session, the current user's routes and the fitting session and generation
  routes answer 401 `UNAUTHORIZED`; catalog reads still answer anyone.
- **AC8.** User A requesting user B's fitting session or generation by id, reading it, changing it
  or deleting it, gets 404 `NOT_FOUND`, the same as for an id that does not exist; lists show only
  A's own rows.
- **AC9.** Catalog writes, the `/users` routes and generation writes answer 401 to everyone, a
  signed-in user too; the access-markers test fails on a route whose access is not declared.
- **AC10.** The socket gateway recognises a signed-in user from the same session cookie.
- **AC11.** An error of `/api/auth/*` answers Better Auth's `{ code, message }` with its status,
  except its 429 and nginx's own answers, which keep the api's format (N32); every other route
  keeps the api's error format (N17).

### Account

- **AC12.** Deleting the current user removes the user, their sessions, fitting sessions,
  generations and files; the user's routes answer 401 in this browser at once and in every other
  browser of the user within 5 minutes (N31).

### Analytics

- **AC13.** With consent given, signing in sends a sign-in event and identifies the user in
  Mixpanel by the user id; no event or profile property carries the email or name; signing out
  sends a sign-out event and resets the identity. Without consent nothing is sent.

### Build

- **AC14.** Production refuses to start with the fake provider configured (N14), and with the Google
  client id, secret or the auth secret missing.
- **AC15.** `npm run verify` passes; CI is green.

## Owner actions (Claude cannot do them)

- Create a Google Cloud OAuth client (web application): consent screen with the site's name and
  the `/privacy` page, redirect URIs for the local stack and for
  `https://lamoda-ai-fitting.ru/api/auth/callback/google` (exact paths come with the plan).
- Put the Google client id and secret and the auth secret into GitHub Environment `production`;
  delete `ADMIN_API_TOKEN` there after the deploy that stops using it.
- Sign in with a real Google account in production after the deploy (N14).
- Report each merge of spec 0011, above all of `feat/0011-storage`, so this branch can be rebased
  (N15).

## Assumptions

- Google sign-in is reachable for the site's visitors and from the production server.
- The site stays a demo (0008 J2): the `/privacy` placeholder text gets a line about sign-in data,
  with no legal review.
- Spec 0011's storage pull request (`feat/0011-storage`) is in `main` before this spec's task that
  deletes an account's files (N15).
- No user exists in production yet (the seed has none, 0002), so removing the admin and changing
  `users` moves no real data.
