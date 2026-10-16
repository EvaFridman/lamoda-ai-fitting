# 0013 auth

Status: accepted (2026-10-16).

Issue #38. Decisions: `clarifications.md` (N1–N16).

## Goal

Nobody can sign in today: the api knows an anonymous visitor and an admin with a shared token, and
every route for users, fitting sessions and generations is admin-only (0004 E1, 0006 F3). The
fitting needs owners for its photos and results. This spec lets a visitor sign in with Google, lets
a guest try on without signing in and keep their fittings when they do, and replaces the admin
token with access by user: each user sees and changes only their own data.

## In scope

- Sign-in with Google, sign-out, and sign-out from every device (N2, N12).
- Guests: created when an action needs an owner, fewer generations, deleted after 30 idle days
  with their files; on sign-in a guest becomes the new account, or their data and files move to
  an existing one (N9, N10).
- Rewriting spec 0011's admin-based checks for signed-in users (N15).
- Sessions in PostgreSQL, 30 days extended by use (N3, N4).
- Users without a phone; the first name from Google (N5).
- Removing the admin token and its principal; a user guard; access set anew for every route;
  someone else's resource answers 404 (N7, N8; backlog "IDOR checks with auth").
- The current user's own routes: read, and delete the account (N11).
- The header's profile icon: the login modal and the profile menu (N12).
- Mixpanel identifies signed-in users and counts sign-in events (N13).
- A fake OpenID provider for tests and the local stack (N14).

## Non-goals

- Other providers and sign-in methods: Yandex ID, VK ID, Google One Tap, passkeys, email codes (N2).
- The "Мои данные", "Мои заказы", "Магазины" and "Мои примерки" pages; editing one's own data (N12).
- An admin role or admin pages (N7).
- The number of guest generations and the generation routes themselves (N9: the generations spec).
- Storing Google's profile picture (N6).
- Email look-alikes (backlog): Google gives only addresses it has verified, so the check waits for
  a sign-in method where the user types their email.

## Acceptance criteria

### Sign-in

- **AC1.** On the local stack, clicking the profile icon while signed out opens a modal with
  "Войти через Google"; going through the fake provider (N14) brings the visitor back to the page
  they started on, signed in. A new Google account creates a user with the email and first name
  from the provider and no phone.
- **AC2.** Signing in again with the same Google account does not create a second user.
- **AC3.** A signed-in user's profile icon opens the menu: initials and name at the top (no email),
  "Мои заказы", "Магазины", "Мои данные", "Мои примерки" (inert and marked disabled for assistive
  technology), a divider, "Выйти" and "Выйти со всех устройств". Its look follows Lamoda's profile
  menu; the owner compares `qa-tester`'s screenshots.
- **AC4.** "Выйти" ends this browser's session: the icon opens the login modal again and the
  current user's routes answer 401. "Выйти со всех устройств" does the same for every browser the
  user signed in from.
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
- **AC9.** Catalog writes, the list of users and the unscoped lists answer 401 to everyone, a
  signed-in user too; the access-markers test fails on a route whose access is not declared.
- **AC10.** The socket gateway recognises a signed-in user from the same session cookie.

### Guests

- **AC11.** A guest created through the api gets a session cookie and can use the routes the plan
  allows guests; the profile icon opens the login modal with the line about keeping fittings.
- **AC12.** A guest who signs in with a Google account no user has yet becomes that user: the same
  user id, the same fitting sessions, generations and file keys.
- **AC13.** A guest who signs in with a Google account that already has a user sees their fittings
  added to that user's, the newest one active; the moved generations' files are in the user's
  folder, their links open, and writing their keys back is accepted (0011 M8). The guest user and
  the guest's folder no longer exist.
- **AC14.** A guest idle for more than 30 days is deleted with their data and files; a guest active
  within 30 days is kept.

### Account

- **AC15.** Deleting the current user removes the user, their sessions, fitting sessions,
  generations and files; the next request with the old cookie answers 401.

### Analytics

- **AC16.** With consent given, signing in sends a sign-in event and identifies the user in
  Mixpanel by the user id; no event or profile property carries the email or name; signing out
  sends a sign-out event and resets the identity. Without consent nothing is sent.

### Build

- **AC17.** Production refuses to start with the fake provider configured (N14), and with the Google
  client id, secret or the auth secret missing.
- **AC18.** `npm run verify` passes; CI is green.

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
- Spec 0011's storage pull request (`feat/0011-storage`) is in `main` before this spec's tasks
  that delete or copy files (N15).
- No user exists in production yet (the seed has none, 0002), so removing the admin and changing
  `users` moves no real data.
