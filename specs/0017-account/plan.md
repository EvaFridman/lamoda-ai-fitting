# 0017 account: plan

Status: accepted (2026-10-20); amended 2026-10-20 at the tasks (pull requests, §11) and at the
review of PR 1 (§1 `gender`, §3, §4, §5 the beacon, `MenuLinkItem` and U20, §6, §12).

How [spec.md](spec.md) is built. Decisions: [clarifications.md](clarifications.md) (U1–U20).
No new dependencies.

## 1. api: `PATCH /me`

- `MeController.update` (`PATCH /me`, `@SignedIn()` from the class) answers 200 with
  `UserResponseDto`, through the same `signOutWhenGone` as `get` and `delete`: a deleted user's
  cached session gets 401 and expired cookies (0013 N31, N38).
- Body `UpdateMeDto` (`me/dto/update-me.dto.ts`), its own class, not `UpdateUserDto`: only
  `lastName`, `firstName`, `patronymic`, `dateOfBirth` and `gender`, each optional.
  - The three names: `@IsOptional() @IsPersonName()`; `null` clears (U9). `firstName` may be
    cleared here, unlike `UpdateUserDto` (0004 E47): since 0013 N5 the column is nullable and
    Better Auth's `name` may be empty.
  - `dateOfBirth`: `@IsOptional() @IsDateOfBirth()`; `null` clears.
  - `gender`: `@ValidateIf((_, value) => value !== undefined) @IsEnum(Gender)`: left out it is
    not checked, `null` fails `IsEnum` with 400 (U9: chosen once, never cleared). Not
    `@IsOptional()`, which lets `null` through.
  - Any other field (`email`, `phone`, `fittingProfileImageKey`, `id`) is refused by
    `createValidationPipe()`'s whitelist like every unknown field (AC11). An empty body answers 200
    unchanged (E40).
- `MeService.update(userId, dto)` calls `UsersService.update(userId, dto)` and turns its 404 into
  `gone()`, as `get` does. No new Prisma code.
- Quota: a PATCH is the `write` tier (3/s, 60/min per route), enough for a form.
- `test/access-markers.e2e-spec.ts`: `'MeController.update'` joins `SIGNED_IN_HANDLERS`.
  `api/openapi.json` is rewritten (`npm --prefix api test -- -u`).
- e2e (`test/database/me.e2e-spec.ts`): a signed-in user changes and clears each field; a bad name
  or date, `gender: null` and each forbidden field answer 400 `VALIDATION_FAILED` with the field;
  signed out answers 401; another user's row is never touched (the route has no id); a deleted
  user answers 401 with expired cookies.

## 2. The name rule's code (U19)

`IsPersonName` (`common/validation/rules.ts`) becomes one `ValidateBy({ name: 'isPersonName' })`
whose check is the current one (a string, `PERSON_NAME_MIN_LENGTH`–`PERSON_NAME_MAX_LENGTH`
characters, `PERSON_NAME`), with the current English message. The detail code is then
`IS_PERSON_NAME`. The check becomes an exported `isPersonName(value)`, which `auth/auth-hooks.ts`
uses for Google's given name in place of its own copy of the same test (0013 N5).
web's `DETAIL_TEXTS` gets `IS_PERSON_NAME: 'От 2 до 50 букв, между ними можно пробел, дефис или
апостроф'`. Tests: `rules.spec.ts` (each failure gives the one code), the users and me e2e expect
the new code.

## 3. Validation codes checked against web (U15)

Closes the backlog item "Texts of new validation rules" (0007 H28).

- An api unit test reads class-validator's metadata storage for every DTO class of the app (it
  imports `AppModule` first, since only an imported DTO registers its rules, and fails if a known
  code such as `IS_DATE_OF_BIRTH` is missing, so the list cannot shrink unnoticed), turns
  each constraint name into the `details` code the error filter answers (`isDateOfBirth` →
  `IS_DATE_OF_BIRTH`) and compares the sorted list with a committed snapshot,
  `api/validation-codes.json`: a new rule fails the test until `npm --prefix api test -- -u`
  rewrites it, as `openapi.json`.
- web's `error-text.contract.test.ts` reads that file through `@/shared/contract` and fails on a
  code with no entry in `DETAIL_TEXTS`.

## 4. web: data and requests

- **`clientFetch` without a body.** A 204 now fails as `schema`. `clientFetch` (and `callApi`) take
  `null` in place of a schema and then resolve to `undefined` on a 204, without reading the body;
  any other status keeps today's path. The JSON body of a write is passed as `init`
  (`body: JSON.stringify(...)`, `Content-Type: application/json`) by the caller.
- **`entities/user`**:
  - `api/keys.ts` `userKeys.me`;
  - `api/queries.ts` `meQueryOptions`, `useMe()` (`clientFetch('/me', userSchema)`);
  - `api/me-requests.ts` `updateMe(body)` (PATCH) and `deleteMe()` (DELETE, `null` schema);
  - `lib/initials.ts` `profileInitials(user)`: the first letters of the first and last name
    ("ЕФ"), else of the one there is, else of the email (U3);
  - `ui/user-initials.tsx` `UserInitials`: the large circle of the screenshot, `mp-block`.
- **Mutations.** The first ones in web: TanStack Query's `useMutation`, no retry (its default; a
  write is not repeated by itself). On success the answer goes into the cache with `setQueryData`,
  so the page does not read `/me` again.
- **Session after a save.** The header shows Better Auth's `name` (= `firstName`), whose signed copy
  lives 5 minutes (0013 N18). After a save that changes `firstName` the browser reads the session
  once with Better Auth's cookie cache skipped (`getSession({ query: { disableCookieCache: true } })`
  through `callAuth`), which also refreshes the copy (AC8). Checked in Better Auth 1.7.10 at the
  review of PR 1: `get-session` takes `disableCookieCache`, reads the database and writes the
  cookie cache again. Then `authClient.$store.notify('$sessionSignal')` makes `useSession` read
  it: a `get-session` call is not among the routes that signal the session hook (owner's OK at
  T10).
- **Cache after a sign-out (U22).** When the session becomes `signed-out` and not `failed`, the
  browser removes the queries of `userKeys.all` (`queryClient.removeQueries`).
- No user data is read on the server (U11); every account page renders its data in the browser,
  inside `<Suspense>`.

## 5. web: pages and layout

Routing (`web/app/customer/`): `layout.tsx` holds only `metadata` (`robots: { index: false,
follow: false }`, titles) and `{children}`; `page.tsx`, `account/page.tsx`, `orders/page.tsx`,
`stores/page.tsx`, `fittings/page.tsx` re-export pages from `_pages`.

- **`widgets/account-shell`**: `AccountShell({ section, children })`, used by every page.
  - The four sections in order (U6) from `shared/config/account-sections.ts`: `section` key
    (`orders`, `stores`, `data`, `fittings`, the analytics enum), title, href.
  - The side menu: links (`Link` of the kit), the current one marked with `aria-current="page"` and
    the grey of the screenshot (styled in the widget; the kit's `Link` has no active state).
  - Session: `pending` → `Skeleton`s; `signed-out` (a failed read too) → the invitation
    (U7): a title, a line of text and a `Button` that is `LoginModal`'s trigger (the modal builds
    the callback from the current address, so the sign-in comes back here); `signed-in` → the
    section.
  - Layout: content 1200 px wide like the header, menu column on the left, as in the screenshot.
    Below 1024 px (the header's breakpoint, 0010 L6): `/customer` (`section` absent) shows the menu
    as a full-width list; a section hides the menu and shows a "‹ Личный кабинет" link back to
    `/customer` above its title (U10). One DOM, switched by CSS, so no layout flicker.
- **`_pages/customer`**: `/customer`, the shell with no section (U5).
- **`_pages/account-data`**: `/customer/account`, title "Мои данные", `UserInitials`,
  `ProfileForm`, `DeleteAccount`. While `/me` loads: `Skeleton`s; a failed read: `errorText` and a
  "Повторить" button.
- **`_pages/account-stubs`**: `OrdersPage`, `StoresPage`, `FittingsPage`: the title and
  "Раздел скоро появится" (U5).
- **`features/edit-profile`**: `ProfileForm({ user })`.
  - Fields (`TextField`): "Фамилия", "Имя", "Отчество" in one row (three columns, one below
    1024 px), "Дата рождения" under them; "Пол": `RadioGroup` "Мужской", "Женский" (none checked
    while `gender` is `null`; once checked, no way back to none, U9); "E-mail" as text, not a
    field (U2). The whole form is `mp-block`.
  - Date mask (`lib/date-mask.ts`): only digits reach the field, dots are put in by the mask, at
    most `ДД.ММ.ГГГГ`; a full value turns into `YYYY-MM-DD`. The browser checks only that a full
    date is a real one ("Введите дату полностью" / "Такой даты нет"); the range (1900, 14 years) is
    the api's, its 400 shown under the field with `IS_DATE_OF_BIRTH`'s text, which states the rule
    (U20).
  - "Сохранить" (`Button`, primary) is disabled while the values, trimmed, with empty = `null`,
    equal the saved ones, and `loading` while saving (U8). Only changed fields are sent.
  - Success: `showToast({ title: 'Данные сохранены' })`, `track('Account Data Saved', {})`, the
    session refresh of §4.
  - 400 `VALIDATION_FAILED`: each detail's `detailText` under its field. Any other failure:
    `showToast({ title: errorText(e), tone: 'error' })` and `reportFailure`; the typed values stay
    (AC12).
- **`features/delete-account`**: `DeleteAccount`.
  - "Удалить аккаунт": a `<button>` styled as the kit's `Link`, the `Modal`'s trigger.
  - The modal: title "Удалить аккаунт?", the text of U18, footer "Удалить" (primary,
    `loading`) and "Отмена" (`ModalClose`).
  - Confirm: `deleteMe()`; then `track('Account Deleted', {}, { sendNow: true })`, `reset()`, and
    `window.location.assign('/')`: a full load, so no cached query or session copy of the deleted
    user survives in the tab. A failure shows `errorText` in the modal and keeps it open.
  - The SDK sends events in batches, so an event tracked just before a full load may wait in its
    queue. `track` (`shared/analytics/client.ts`) gets an optional third argument `{ sendNow }`
    that passes `{ transport: 'sendBeacon', send_immediately: true }` to the SDK: the browser
    delivers a beacon even while the page unloads. Only `Account Deleted` uses it.
- **Header (`widgets/header`)**: the four items become links (AC2). The kit's `MenuItem` has no
  link form: the kit gets `MenuLinkItem` (Base UI's `Menu.LinkItem`, in 1.8.0, rendering
  `next/link`), with its example on `/ui-kit`. A widget does not import another widget, so the section list lives in
  `shared/config/account-sections.ts` (not in `account-shell`'s `config`), read by both.
- **`robots.txt`**: no `app/robots.ts` exists yet; spec 0014's T19 creates it (`/ui-kit`,
  `/healthz`, the sitemap). Whichever lands first creates the file, the other adds its lines at
  rebase; 0017's line is `disallow: /customer`.

## 6. Analytics

The entries of U14 go into `catalog.ts`, `EVENTS.md` is regenerated, `catalog.test.ts`'s exact
lists grow:

- zone `account` ("Личный кабинет"), areas `account-menu`, `account-data`, `account-delete`,
  `account-invite`;
- events `Account Data Saved`, `Account Deleted`;
- elements `profile-menu.section` (zone `auth`), `account-menu.section`, `account-menu.back`,
  `account-invite.sign-in`, `account-delete.open`, `account-delete.cancel`; `section` is the enum
  `orders`, `stores`, `data`, `fittings`.

Where they are sent: `useTrackedElement` on each link and button above; `Account Data Saved` after
the PATCH succeeded; `Account Deleted` after the DELETE succeeded and before `reset()`. The
invitation's button also sends `LoginModal`'s own `Login Opened`. Budget: 31 989 events a month,
3.2 % of the free plan's 1 M, 4.0 % of the 80 % budget.
`account-data` has no element yet (U14: "Сохранить" is not tracked); it is declared for the zone's
description and later fields.

## 7. Personal data

`mp-block` on `UserInitials`, the form and the email; no value in an attribute (`TextField` keeps
the value only in the input, which recordings mask). Names and the email never reach Sentry: a
`ValidationError`'s details carry codes and field names only.

## 8. Backlog

- Removed: "The "Мои данные" page", "Texts of new validation rules" (with the commits that close
  them).
- Added: "A deleted user's history in Mixpanel" (U17): before real users, delete it through
  Mixpanel's API on account deletion and say so in `/privacy`; next to "Deleted users in backups".

## 9. How each criterion is checked

| AC       | Check                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1      | web test of `AccountShell` signed out (invitation, `LoginModal` opens); `qa-tester`: sign in through the fake provider from `/customer/orders`, back on it |
| AC2      | header test: four links with their hrefs, none `aria-disabled`                                                                                             |
| AC3      | web test of the layout's `metadata`; `curl` of each page shows `noindex`; `/robots.txt` once it exists                                                     |
| AC4, AC5 | `qa-tester` at 1440 and 375 px (menu, list, back link, browser "Back"); the owner compares screenshots                                                     |
| AC6      | web test of the stubs                                                                                                                                      |
| AC7      | web test of `ProfileForm` and `UserInitials`; `qa-tester` screenshot                                                                                       |
| AC8      | form test (disabled until changed, toast, cache); `qa-tester`: save, reload, header name                                                                   |
| AC9      | api e2e (each refused value); form test (400 details under fields); date-mask unit test                                                                    |
| AC10     | api e2e (clear to `null`, `gender: null` refused); form test (cleared fields sent as `null`)                                                               |
| AC11     | api e2e (401 signed out, forbidden fields 400)                                                                                                             |
| AC12     | form test with a 503 and a network error; `qa-tester` with the api stopped                                                                                 |
| AC13     | `DeleteAccount` test (cancel, confirm, order of `track` and `reset`); `qa-tester`: delete, home page signed out, sign in again → new user                  |
| AC14     | `catalog.test.ts`, `EVENTS.md`; `qa-tester` sees the events in the browser's requests after consent                                                        |
| AC15     | review; `qa-tester` checks attributes of the account pages for personal data                                                                               |
| AC16     | `npm run verify`; `docker compose build web` with api stopped                                                                                              |

## 10. Texts

The owner's texts are U18 (the invitation, the stub, the toast, the deletion modal, the way back)
and U19's name text (§2), U20's date text.

## 11. Pull requests

A pull request holds documents only or code (the review bot checks them differently):

1. Documents: the spec, the clarifications, this plan and the tasks.
2. Code, api and web together: `PATCH /me`, the name rule's code and the validation codes check
   (§1–§3), then `clientFetch` without a body, `entities/user`, `MenuLinkItem`, the shell and
   pages, the form, deletion, header links, analytics, `robots`, CLAUDE.md and README.
3. Documents: the production checks and the spec's closing.

## 12. Risks

- `Account Deleted` lost to the full load after deletion (§5): sent by beacon; `qa-tester` sees it
  arrive in T11.
- `robots.ts` written by two specs at once (§5): a rebase conflict, resolved by hand.
- `IS_PERSON_NAME` replaces four codes on the closed `/users` routes too (U19): their e2e change
  with it; no client uses them.
- A `firstName` cleared to `null` leaves Better Auth's `name` empty: the header already shows
  "Профиль" then (0013 AC3).
