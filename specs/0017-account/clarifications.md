# 0017 account: clarifications

Status: accepted (2026-10-20); amended 2026-10-20 at the plan (U18, U19).

The owner's decisions for this spec. Ids `U1`, `U2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-20.

## Мои данные

**U1. The data is edited, not only shown.** A new api route saves the signed-in user's own data
(spec 0013 N8: a user's routes serve only their own data).

**U2. Which fields.** Last name, first name, patronymic, date of birth and gender are edited. The
email is shown read-only: it comes from Google. The phone is not shown: Google gives none and there
is no way to confirm a number, so a "Подтверждён" mark would mislead. No password field: there is
no sign-in by password.

**U3. No avatar.** The circle of initials stays, as in Lamoda's screenshot, without the upload
button (0013 N6: no avatar is stored or shown).

**U4. Account deletion on "Мои данные".** "Удалить аккаунт" opens a modal with a confirmation;
confirming deletes the account through `DELETE /me` (0013 N11), signs the browser out and opens the
home page. The modal says what is deleted (the data, fittings and photos) and that backup copies
keep it up to 7 days (0012 P14); its exact text is the owner's, at the plan.

## Pages and navigation

**U5. Addresses and stubs.** As on Lamoda: `/customer/account` is "Мои данные",
`/customer/orders` "Мои заказы", `/customer/stores` "Магазины", `/customer/fittings`
"Мои примерки". `/customer` has no section of its own, as Lamoda's is empty: it shows only the menu,
which on a narrow screen is the list of sections (U10). Since every section has an address, the
browser's "Back" works and the SDK's page views show which section was opened (U14). A stub shows
the section's title and a text that it is coming soon.

**U6. The menu.** The side menu has "Мои заказы", "Магазины", "Мои данные", "Мои примерки" in this
order, the same names as the header's profile menu (0013 N12); no "Возвраты", in either menu. The
header menu's four items become links to these pages.

**U7. A signed-out visitor.** Every account page, the stubs too, shows an invitation to sign in in
place of the section, with a button that opens `LoginModal`; the sign-in comes back to the same
address. No redirect.

**U13. Not taken from Lamoda.** Lamoda Club, reviews, gift cards, subscriptions, promo codes,
payment methods and the support chat (issue #74) are left out; no breadcrumbs.

## Behaviour

**U8. Editing as on Lamoda.** The fields are always editable; "Сохранить" is inactive until a field
differs from the saved data; a save shows a toast; errors show under their fields.

**U9. Field rules.** Names follow the existing name rule (`IsPersonName`, up to 50 characters). A
filled name or date can be cleared and is then stored as empty. The date of birth is typed in a
text field with the mask `ДД.ММ.ГГГГ`, a real date from 1900-01-01, at least 14 years before today
(the api's `IsDateOfBirth`). The gender, once chosen, can be changed but not cleared.

**U10. A narrow screen as on Lamoda's mobile site.** `/customer` shows the list of sections; a
section opens at its own address on its own, with a way back to `/customer`.

**U11. The data is loaded in the browser.** The page reads the session and `/me` in the browser
(`clientFetch`), as the header does; nothing about the user is read on the server. The owner
weighed server rendering (the session cookie forwarded by `apiFetch`): no loading placeholder,
but a new way to pass the session to the api, answers to keep out of shared caches, a second
place that reads the session, and little gain on a closed page. The backlog item
"The session cookie in `apiFetch`" stays for a page that needs it.

## Search engines and analytics

**U12. Closed to search engines, tracked.** Every account page is `noindex` and `robots.txt` keeps
`/customer` out. The pages send analytics events (U14).

**U14. Events and tracked elements** (proposed by the `analytics` agent, chosen by the owner).
A new zone `account` ("Личный кабинет") with the areas `account-menu` (the side menu, the narrow
screen's list of sections and its way back), `account-data` ("Мои данные"), `account-delete`
(account deletion) and `account-invite` (the invitation to sign in). One property `section`, an
enum `orders`, `stores`, `data`, `fittings`, names a section in both menus.

- Events:
  - `Account Data Saved`: zone `account`, `interaction`, no properties, sent after the api saved
    the data (not on the click); `perVisit` 0.01.
  - `Account Deleted`: zone `account`, `interaction`, no properties, sent after `DELETE /me`
    succeeded and before the SDK forgets the user (as `Signed Out`); `perVisit` 0.001. No
    `Signed Out` is sent with it: `Signed Out` means a sign-out only.
- Elements (`Element Clicked` / `Element Hovered`; clicks, hovers per visit):
  - `profile-menu.section` (the existing area of zone `auth`), `navigation`, `section`: the header
    menu's four items as one element; 0.04, 0.06.
  - `account-menu.section`, `navigation`, `section`; 0.05, 0.06.
  - `account-menu.back`, `navigation`, the narrow screen's way back; 0.01, 0.005.
  - `account-invite.sign-in`, `interaction`, the invitation's sign-in button; 0.01, 0.01.
  - `account-delete.open`, `interaction`, "Удалить аккаунт"; 0.003, 0.005.
  - `account-delete.cancel`, `interaction`, the confirmation's cancel button; 0.002, 0.002. A
    closing by Esc or the backdrop is counted as opened minus deleted, with no event of its own.
- One element with `section` per menu, not one per item: a breakdown by `section` compares the
  sections, and splitting it later would break its history.
- No "section opened" event: every section has an address (U5), so the SDK's page views show it.
- Not tracked: field edits and focus (noise; `Account Data Saved` records the result), validation
  errors (an "under 14" or "before 1900" error reveals the age), field values and which fields
  changed, save and delete failures (they go to Sentry), "Сохранить" as an element (it repeats
  `Account Data Saved`), the invitation, toasts and stubs being shown.
- Budget: 31 185 events a month before, 31 989 after, 4.0 % of the free plan.

## Backlog

**U15. Backlog items this spec closes.** "The "Мои данные" page" (editing the name, deleting the
account with a confirmation). "Texts of new validation rules": this is the first form, so it adds
the api test that compares the rule names its DTOs use with the list web's texts are checked
against.

**U16. Issue.** The account page is issue #72 (not #70, which is spec 0015's).

## Added at the plan

**U18. Texts.** The invitation: "Войдите, чтобы открыть личный кабинет", button "Войти". A stub:
"Раздел скоро появится". The toast: "Данные сохранены". The deletion modal: title
"Удалить аккаунт?", text "Мы удалим ваши данные, историю примерок и фотографии. Резервные копии
хранятся до 7 дней, затем удаляются и они. Отменить удаление нельзя.", buttons "Удалить" and
"Отмена". The narrow screen's way back: "Личный кабинет".

**U19. The name rule gets a code and a text of its own.** `IsPersonName` answers one detail code,
`IS_PERSON_NAME`, for any failure (not a string, too short, too long, a wrong character) instead of
the generic `IS_STRING`, `MIN_LENGTH`, `MAX_LENGTH` and `MATCHES`, so a name field shows a text that
says what a name may hold. The rule itself does not change (0013 N5). Every DTO with a name answers
the new code, the closed `/users` routes too.

**U17. A deleted user's history in Mixpanel stays.** After `DELETE /me` the user's events stay in
Mixpanel under their id. Deleting them through Mixpanel's API is not in this spec: it goes into the
backlog next to "Deleted users in backups", to be done, and stated in `/privacy`, before real
users.
