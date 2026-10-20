# 0017 account

Status: accepted (2026-10-20).

Issue #72. Decisions: `clarifications.md` (U1–U19).

## Goal

A signed-in user gets a personal account under `/customer`, modelled on Lamoda's account
pages: a side menu of sections and the section "Мои данные", where the user sees and edits their
own data and can delete their account. The other sections are stubs that later specs fill;
"Мои примерки" will hold the fitting history (spec 0016). The header's profile menu leads to these
pages.

## In scope

- Pages `/customer/account` ("Мои данные"), `/customer/orders` ("Мои заказы"), `/customer/stores`
  ("Магазины"), `/customer/fittings` ("Мои примерки") and `/customer` (only the menu: on a narrow
  screen, the list of sections) (U5, U6, U10).
- "Мои данные": a circle of initials, the fields last name, first name, patronymic, date of birth
  and gender, edited in place and saved with "Сохранить"; the email shown read-only (U2, U3, U8, U9).
- An api route that saves the signed-in user's own data (U1).
- "Удалить аккаунт" with a confirmation, through the existing `DELETE /me` (U4).
- The three other sections as stubs: the section's title and a "coming soon" text (U5).
- A signed-out visitor sees an invitation to sign in instead of any section (U7).
- The header's profile menu items become links to these pages (U6).
- The account pages closed to search engines (U12).
- Analytics events and tracked elements of these pages and of the header's profile menu (U14).
- Closes the backlog items "The "Мои данные" page" and "Texts of new validation rules"; adds one on
  users' history in Mixpanel (U15, U17).

## Non-goals

- Real orders, stores and fitting history; a "Возвраты" section (U6).
- Phone, password, avatar or photo upload (U2, U3).
- Changing the email (it comes from Google).
- Lamoda Club, reviews, gift cards, subscriptions, promo codes, payment methods, support chat (#74),
  breadcrumbs (U13).
- Reading the session or user data on the server (U11); the backlog item "The session cookie in
  `apiFetch`" stays.
- Deleting a deleted user's history in Mixpanel (U17).

## Acceptance criteria

### Access

- **AC1.** A signed-out visitor who opens any account page sees, in place of the section, an
  invitation to sign in with a button that opens the login modal; signing in through the fake
  provider brings them back to the same address, signed in, with the section shown.
- **AC2.** A signed-in user's profile menu in the header leads to `/customer/orders`,
  `/customer/stores`, `/customer/account` and `/customer/fittings` ("Мои заказы", "Магазины",
  "Мои данные", "Мои примерки"); the items are no longer marked disabled.
- **AC3.** Every account page answers with `noindex`, and `robots.txt` keeps `/customer` out.

### Layout

- **AC4.** On a wide screen every account page shows the side menu "Мои заказы", "Магазины",
  "Мои данные", "Мои примерки" in this order, the current one marked; `/customer` shows the menu
  alone, with nothing beside it. Its look follows Lamoda's account page (the owner compares
  `qa-tester`'s screenshots with the owner's screenshot of 2026-10-20).
- **AC5.** On a narrow screen `/customer` shows the list of sections; choosing one opens its
  address, which shows only that section with a way back to `/customer`; the browser's "Back"
  returns to the list too.
- **AC6.** "Мои заказы", "Магазины" and "Мои примерки" show their title and a text that the section is
  coming soon.

### Мои данные

- **AC7.** "Мои данные" shows a circle with the user's initials (no upload button), the fields
  "Фамилия", "Имя", "Отчество", "Дата рождения" (`ДД.ММ.ГГГГ`) and "Пол" ("Мужской", "Женский") filled
  from the user's data, and the email read-only. No phone or password.
- **AC8.** "Сохранить" is inactive until a field differs from the saved data. Saving stores the
  changes, shows a toast that the data is saved, and after a reload the page shows the new values;
  the header menu shows the new name.
- **AC9.** A name that fails the name rule, a date that is not a real date, is in the future, is
  before 1900-01-01 or makes the user younger than 14 is refused: the field shows a Russian error
  and nothing is saved. The api refuses the same values with 400 `VALIDATION_FAILED`.
- **AC10.** Clearing the last name, first name, patronymic or date of birth and saving stores it as
  empty; the gender, once chosen, can be changed but not cleared.
- **AC11.** The api route saves only the signed-in user's own data: a signed-out request answers
  401, and the body cannot change the email, phone, photo or another user.
- **AC12.** A failure of the save (the api stopped, a 5xx) shows a Russian error and keeps what the
  user typed.

### Account deletion

- **AC13.** "Удалить аккаунт" opens a confirmation that says what is deleted; cancelling changes
  nothing. Confirming deletes the account (`DELETE /me`), signs the browser out and opens the home
  page; signing in again with the same Google account creates a new user.

### Analytics and personal data

- **AC14.** The events and tracked elements of U14 are in the catalog and `EVENTS.md`, and arrive in
  Mixpanel locally after consent with no user data in their properties; `Account Deleted` arrives
  with the user's identity, before the SDK forgets it.
- **AC15.** Containers of personal data on these pages carry `mp-block`; no personal data is in an
  attribute.

### Build

- **AC16.** `npm run verify` passes; the web image builds with no api running.

## Owner actions (Claude cannot do them)

- Compare `qa-tester`'s screenshots with Lamoda's account page (AC4, AC5).
- Merge the pull requests; check AC1–AC3 and AC8 on production after the deploy.

## Assumptions

- `GET /me` and `DELETE /me` (spec 0013) stay as they are.
- The api's existing rules for names and dates of birth (`IsPersonName`, `IsDateOfBirth`) are the
  rules of the form.
- The ui-kit covers the page: `TextField`, `RadioGroup`, `Button`, `Modal`, `Toast`, `Link`,
  `Skeleton`; a component it lacks is added to the kit and to `/ui-kit`.
