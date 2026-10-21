# 0017 account: tasks

Status: done (2026-10-21): all 16 criteria pass (record below). History, not instructions.
Accepted 2026-10-20; amended 2026-10-20 at the review of PR 1 (T4, T5, T6, T8, T10, T11); amended
2026-10-20 at T7 (T10: U22); amended 2026-10-21 at T12 (T13: `CLAUDE.md` and README).

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- The api tasks touch endpoints and input handling, so `security-reviewer` joins their reviews;
  the web tasks get `fsd-reviewer`, and `security-reviewer` where they render user data.
- A pull request holds either documents only or code: the review bot checks the two differently.
  So the documents (PR 1) and the closing (PR 3) are pull requests of their own, and all the code,
  api and web, is one (PR 2): the web tasks need `PATCH /me`, and one pull request means one
  review round and one deploy. Its cost: a large diff (the api e2e, `openapi.json`, the web tests),
  so the review bot sees more at once, and a longer-lived branch, rebased at each merge of spec
  0014 (`CLAUDE.md`, `catalog.ts`, `EVENTS.md`, `robots.ts`). Right after T6 the diff is measured
  and shown to the owner, before the web tasks (T9–T11) make it grow fastest: the owner may then
  split it (api, then web).
- If spec 0014's `app/robots.ts` (its T19) lands on `main` first, the branch of PR 2 is rebased and
  T9 adds its line to that file instead of creating it (plan §5).
- The pull request of PR 3 carries `Closes #72` under "Что сделано".

## PR 1 · `docs/0017-account` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (U1–U17).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add the account spec and its decisions`
- [x] **T2. Plan.** `plan.md`; U18–U19 recorded at the plan.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the account plan`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0017`
- 👤 merges PR 1.

## PR 2 · `feat/0017-account` · the api and the account pages

- [x] **T4. The name rule's own code (U19).** `IsPersonName` as one `ValidateBy` named
      `isPersonName` over an exported `isPersonName(value)`; `auth/auth-hooks.ts` uses that
      function; web's `DETAIL_TEXTS` gets `IS_PERSON_NAME`, and `IS_DATE_OF_BIRTH`'s text states the
      rule (plan §2, U20).
      Check: `rules.spec.ts` (each failure gives the one code, the rule accepts and refuses what it
      did), the users e2e and the auth hook's tests expect the new code; `error-text` test;
      `npm run verify`.
      Commit: `feat(api): answer one code for a bad person name`
- [x] **T5. Validation codes checked against web (U15).** The api test that collects every DTO's
      constraint names into the snapshot `api/validation-codes.json`; web's
      `error-text.contract.test.ts` fails on a code missing from `DETAIL_TEXTS` (plan §3). The
      backlog item "Texts of new validation rules" is removed.
      Check: the api test fails on a rule added to a DTO until `-u`, and on a known code missing;
      the web test fails with a text
      removed from `DETAIL_TEXTS` (both tried, then undone); `npm run verify`.
      Commit: `test(api): check validation codes against web's texts`
- [x] **T6. `PATCH /me` (U1, U2, U9).** `UpdateMeDto`, `MeService.update`, `MeController.update`
      through `signOutWhenGone`; `SIGNED_IN_HANDLERS`; `openapi.json` rewritten (plan §1).
      Check: database e2e of plan §1 (change and clear each field, `gender: null`, bad name and date,
      forbidden fields, empty body, 401 signed out, 401 with expired cookies for a deleted user)
      (AC9–AC11); `qa-tester` with `curl` and a session cookie from the fake provider;
      `npm run verify`. Then the diff of PR 2 so far is shown to the owner (see above).
      Commit: `feat(api): let a user edit their own data`
- [x] **T7. The current user in web.** `clientFetch` and `callApi` with a `null` schema for a 204;
      `entities/user`: `userKeys`, `useMe`, `updateMe`, `deleteMe`, `profileInitials`,
      `UserInitials` (plan §4).
      Check: web tests (a 204 resolves to `undefined`, any other status keeps today's path; the
      bodies and methods of the requests; initials from both names, one name, the email);
      `npm run verify`.
      Commit: `feat(web): read and change the current user`
- [x] **T8. The profile menu leads to the account (U6).** The kit's `MenuLinkItem` (Base UI's
      `Menu.LinkItem`; plan §5) and its section on `/ui-kit`;
      `shared/config/account-sections.ts`; the header's four items as links; the element
      `profile-menu.section` in the catalog, `EVENTS.md` regenerated.
      Check: kit tests (keyboard, a click navigates); header test (four links, hrefs, none
      `aria-disabled`) (AC2); `npm run verify`.
      Commit: `feat(web): link the profile menu to the account`
- [x] **T9. The account pages (U5–U7, U10, U12, U13).** `app/customer/` with the `noindex`
      layout; `widgets/account-shell` (menu, current section, invitation, narrow-screen list and
      way back); `_pages/customer`, `_pages/account-stubs`, `_pages/account-data` with its title only;
      `robots.txt`'s `/customer` (plan §5); the zone `account` with `account-menu.section`,
      `account-menu.back`, `account-invite.sign-in` in the catalog, `EVENTS.md` regenerated.
      Check: web tests of the shell (pending, signed out, signed in, current section) and of the
      stubs (AC1, AC6) and of the `metadata` (AC3); `qa-tester` at 1440 and 375 px: menu, list,
      way back, browser "Back", sign-in from `/customer/orders` and back on it, screenshots for the
      owner (AC1, AC4, AC5); `npm run verify`.
      Commit: `feat(web): add the account pages`
- [x] **T10. "Мои данные" (U2, U3, U8, U9, U11, U22).** `features/edit-profile`: `ProfileForm`, the date mask; `_pages/account-data`
      with `UserInitials`, loading and failed states; the session refresh after a save
      (`disableCookieCache`, plan §4); the user's queries removed at a sign-out (U22);
      `Account Data Saved` in the catalog.
      Check: unit tests of the date mask; form tests (filled from the user, "Сохранить" disabled
      until a change, only changed fields sent, cleared as `null`, no way back to no gender, 400
      details under fields, a 503 and a network error keep the values, the toast and the event;
      no `['users', 'me']` in the cache after a sign-out, none removed after a failed read)
      (AC7–AC10, AC12); `qa-tester`: save, reload, the header's name, the api stopped, attributes
      free of personal data (AC8, AC12, AC15); `npm run verify`.
      Commit: `feat(web): let a user edit their own data`
- [x] **T11. Account deletion (U4, U17).** `features/delete-account`; `track`'s `{ sendNow }`
      (a beacon, plan §5); `account-delete.open`,
      `account-delete.cancel`, `Account Deleted` in the catalog. The backlog loses "The "Мои
      данные" page" and gains "A deleted user's history in Mixpanel" (plan §8).
      Check: tests (cancel changes nothing; confirm calls `DELETE /me`, then `track` before
      `reset`, then the home page; `sendNow` passes the beacon options; a failure keeps the modal
      open with its text); `qa-tester`: delete, the home page signed out, a new user on the next
      sign-in, the events in the requests after consent, `Account Deleted` among them with the
      user's id (AC13, AC14); `npm run verify`.
      Commit: `feat(web): delete the account from its page`
- [x] **T12. Docs.** `CLAUDE.md` (the account pages, `PATCH /me`, the name code, the validation
      codes snapshot, `clientFetch` with no body, the first mutations, `MenuLinkItem`),
      `README.md`.
      Check: `npm run format:check`.
      Commit: `docs(docs): describe the account`
- 👤 merges PR 2.

## PR 3 · `docs/0017-close` · production checks and closing

- [x] **T13. Close the spec.** The production checks with the owner: a signed-out visit to
      `/customer/account`, the header's links, `noindex` and `robots.txt`, a save and a reload
      (AC1–AC3, AC8); the acceptance record below; every file gets `Status: done`; `0017-account`
      joins the list of specs in `CLAUDE.md`'s opening paragraph and README's «Завершены».
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0017`
- 👤 merges PR 3.

## Acceptance record

Production checks on 2026-10-21 on the deploy of `060cc07` (PR 2's merge, CI green; `/health/live`
answered `"version":"060cc07"`). The main session checked AC3 from the laptop with `curl`. The
owner checked AC1, AC2 and AC8 in a private window of their browser with a real Google account,
changed the first name and set it back, and compared the account pages at a wide and a narrow
width with Lamoda's (AC4, AC5). The local criteria rest on the checks of the tasks named and the
tests below. `npm run verify` on the closing commit passed (api 3598 tests, web 2232, guards and
scripts 599).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | Production: signed out, `/customer/account` showed the invitation in place of the section; its button opened the login modal; the Google sign-in came back to `/customer/account` with "Мои данные" shown. Locally: `account-shell.test.tsx` "replaces the content with the invitation when signed out (failed: %s)", "opens the login modal from the invitation and reports the click and the opening"; `login-modal.test.tsx` (`handlesReturnedError={false}`); T9's `qa-tester`.                                               |
| AC2  | pass   | Production: the profile menu showed the four sections enabled and led to `/customer/orders`, `/customer/stores`, `/customer/account`, `/customer/fittings`. Locally: `header-profile.test.tsx` "links the four sections to the account and leaves every item enabled (0017 AC2)"; `account-sections.test.ts`.                                                                                                                                                                                                                     |
| AC3  | pass   | Production: `curl` of `/customer` and its four sections answered 200 with `<meta name="robots" content="noindex, nofollow"/>`; `/robots.txt` has `Disallow: /customer`. Locally: `metadata.test.ts` "closes every account page to search engines".                                                                                                                                                                                                                                                                                |
| AC4  | pass   | Production: the owner compared the wide layout with Lamoda's account page. Locally: `account-shell.test.tsx` "lists the four sections in order with their links", "has no current link, a title and no back link without a section"; `customer-page.test.tsx`; T9's `qa-tester` at 1440 px.                                                                                                                                                                                                                                       |
| AC5  | pass   | Production: the owner checked the narrow layout. Locally: `account-shell.test.tsx` "has a back link to the list beside a section"; T9's `qa-tester` at 375 px (list, back link, the browser's "Back").                                                                                                                                                                                                                                                                                                                            |
| AC6  | pass   | Locally: `account-stubs.test.tsx` "the %s stub shows its title and that it is coming" (orders, stores, fittings).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC7  | pass   | Production: "Мои данные" filled from the owner's data (AC1, AC8). Locally: `profile-form.test.tsx` "is filled from the user", "shows the email as text, not as a field, and has no phone or password field"; `user-initials.test.tsx`; `initials.test.ts`; `account-data-page.test.tsx` "shows the form filled from /me once it is read".                                                                                                                                                                                         |
| AC8  | pass   | Production: "Сохранить" inactive until the first name changed; the save showed the toast, the header's menu showed the new name before a reload, and after a reload the page and the header kept it; the name was set back the same way. Locally: `profile-form.test.tsx` "is disabled until something changes, and again when the value is changed back", "puts the answer in the cache, shows a toast and counts the save", "refreshes the session when the first name was sent"; `refresh-session.test.ts`; T10's `qa-tester`. |
| AC9  | pass   | Locally: `me.e2e-spec.ts` "refuses %s as a name with IS_PERSON_NAME and saves nothing", "refuses %s as a date of birth with IS_DATE_OF_BIRTH" (400 `VALIDATION_FAILED`); `rules.spec.ts` (`IsPersonName`, `isDateOfBirth`); `date-mask.test.ts`; `profile-form.test.tsx` "says a date that does not exist, without a request", "shows a 400 under the fields it names, with no toast".                                                                                                                                            |
| AC10 | pass   | Locally: `me.e2e-spec.ts` "clears lastName, firstName, patronymic and dateOfBirth with null", "refuses gender null and keeps the row"; `profile-values.test.ts`; `profile-form.test.tsx` "sends null for cleared names and a cleared date", "cannot go back to no gender: choosing again keeps it, and the body never carries null".                                                                                                                                                                                              |
| AC11 | pass   | Locally: `me.e2e-spec.ts` "without a session answers 401 UNAUTHORIZED and sets no cookie", "refuses the field %s by name and saves nothing" (`email`, `phone`, `fittingProfileImageKey`, `id` and others).                                                                                                                                                                                                                                                                                                                        |
| AC12 | pass   | Locally: `profile-form.test.tsx` "shows a 503 in a toast and keeps what was typed", "shows a network error in a toast and keeps what was typed"; T10's `qa-tester` with the api stopped.                                                                                                                                                                                                                                                                                                                                          |
| AC13 | pass   | Locally: `delete-account.test.tsx` "cancel closes the modal and changes nothing", "confirming deletes /me, then tracks, then resets, then loads the home page", "a 401 (the account is already gone) resets and loads the home page without the event or a text"; `me.e2e-spec.ts` (`DELETE /me`); T11's `qa-tester` (delete, the home page signed out, a new user at the next sign-in).                                                                                                                                          |
| AC14 | pass   | Locally: `catalog.test.ts` (events and elements of U14), `events-doc.test.ts` "matches the catalog", `client.test.ts` "sends a beacon at once with sendNow, and only two arguments without it"; T11's `qa-tester` saw the events in the browser's requests after consent, `Account Deleted` among them.                                                                                                                                                                                                                           |
| AC15 | pass   | Locally: `profile-form.test.tsx` "is a block the recordings skip", "puts no typed value, name, date or email in any attribute, value included"; `user-initials.test.tsx`; `header-profile.test.tsx`; `account-shell.test.tsx` "renders no user data when signed in"; reviews of PR 2.                                                                                                                                                                                                                                             |
| AC16 | pass   | `npm run verify` on the closing commit and the CI of `060cc07` (the web image built with no api running).                                                                                                                                                                                                                                                                                                                                                                                                                         |
