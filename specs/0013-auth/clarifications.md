# 0013 auth: clarifications

Status: accepted (2026-10-16).

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
- **N2. Google only, plus guests.** The only provider is Google. Better Auth's anonymous sign-in
  gives guests (N9). Yandex ID, VK ID, Google One Tap, passkeys and email codes go to the backlog.
- **N3. Sessions live in PostgreSQL.** The session is a row next to `users`, so it survives a
  Redis restart and goes into the backups (spec 0012). The browser holds only an HttpOnly cookie;
  a short-lived signed copy of the session in a cookie spares a database read on most requests.
  Redis stays as it is: keeping sessions there would need AOF persistence, no eviction and backups,
  and a Redis failure would sign everyone out, where today it only loosens the rate limit.
- **N4. A session lasts 30 days and is extended by use.** Activity extends it at most once a day;
  30 days without a visit sign the user out.

## Users and access

- **N5. Phone is optional.** Google gives no phone number, so `users.phone` becomes optional and
  stays unique among the users who have one. The first name comes from Google's given name, or the
  part of the email before `@` when Google has none. No phone is asked for after sign-in.
- **N6. No avatar.** Google's profile picture is not stored or shown; the menu shows initials.
- **N7. The admin goes away.** The admin token was a stopgap until users could sign in (0004 E1,
  0006 F5). `ADMIN_API_TOKEN`, the `X-Admin-Token` header, the admin principal and everything built
  for them are removed; there is no admin role. A user guard takes the admin guard's place.
- **N8. Every route gets its access anew.** Routes for a user's own data (the current user, their
  fitting sessions and generations) need a signed-in user, guest or Google (the plan says which
  routes a guest may use), and serve only that user's data. Routes no user should call (catalog
  writes, the list of users, unscoped lists of fitting sessions and generations) stay in the code,
  closed to everyone. Someone else's resource answers 404 `NOT_FOUND`, as one that does not exist
  (closes the backlog item "IDOR checks with auth").

## Guests

- **N9. Guests try on without signing in.** A guest is a user without a Google account, created on
  the first action that needs an owner (not on every visit). A guest gets fewer generations than a
  signed-in user; the number comes with the generations spec. A guest idle for 30 days is deleted
  with their data.
- **N10. Signing in keeps a guest's data.** A guest who signs in with a Google account no user has
  yet becomes that user: same id, so their rows and their files under `keep/users/<id>/` (0011 M7)
  stay as they are. A guest who signs in with a Google account that already has a user has their
  fitting sessions and generations moved to that user; the newest fitting session stays the active
  one (0002 C15). Their files are copied into the user's folder, the keys in the database and the
  owner in the files' metadata are rewritten, and only then are the guest and the guest's folder
  deleted, reliably through Temporal like 0011 M11. Rejected: always creating a new user and
  copying (a copy on every guest sign-in); dropping a guest's data when the account exists (loses
  fittings made on another device).
- **N11. A user can delete their account.** `DELETE` of the current user removes the user, their
  sessions and their fitting data, and their files through 0011's user deletion (0011 M11). Its
  button comes with the "Мои данные" page (N12). Deleting idle guests (N9) goes through the same
  path: it deletes rows, and their files follow through 0011's workflow; it is not the daily file
  cleanup 0011 M11 rejected.

## Interface

- **N12. Login modal and profile menu.** The profile icon in the header opens a login modal with
  "Войти через Google" for a visitor who is not signed in and for a guest (with a line saying that
  their fittings are kept in the account). Sign-in returns to the page it started from. For a
  signed-in user the icon opens a dropdown styled after Lamoda's profile menu (the owner's
  screenshot of 2026-10-16 guides the look, not the content): a top block with a circle of initials
  and the name, no email; "Мои заказы", "Магазины", "Мои данные", "Мои примерки", drawn but inert
  like the header's icons in 0010 L5 (each gets its link with its page's spec); a divider; "Выйти"
  and "Выйти со всех устройств" (ends every session of the user). No lamoda club block, no barcode.
  The "Мои данные" page (name, email, editing, account deletion) is not in this spec.
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
  tasks that delete guests and accounts and copy a guest's files (N9, N10, N11) come after it is in
  `main`. 0011's checks that read files through an admin `GET` or write keys as the admin (0011 AC8,
  AC9, T7) are rewritten by this spec to use a signed-in user; its non-goal "the routes stay
  admin-only" holds until this spec lands.
- **N16. User ids stay uuids.** Better Auth creates users with the database's `uuidv7()` ids, as
  today: the id is part of every private file key (0011 M7).
