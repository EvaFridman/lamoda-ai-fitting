# 0004 CRUD api

Status: accepted (2026-10-09); amended the same day: the web part moved to spec 0005 (E30).
Decisions this spec relies on: [clarifications.md](clarifications.md) (referred to by their ids, e.g. E5).

## Goal

The database holds the catalog, users, fitting sessions and generations (spec 0002), but the api
serves none of it. This spec opens every table through the api, adds the product list with the
filters, sorting and filter counts the future catalog page needs (modelled on the lamoda.ru catalog,
E13–E17), and connects the api to Sentry the way `web` already is. Typed access to this data from
`web` is the next spec, 0005 (E30).

## In scope

- Create, read, update and delete for every table of the database (E2, E3): categories, brands,
  attributes and their values, products with their images, sizes and attribute values, users,
  fitting sessions, generations and the products of a generation.
- Lists in pages with the total count (E5).
- Products: a short form for lists and a full form for one product (E7); image addresses instead of
  storage keys and the price after the discount (E8, closes the backlog item "Catalog API").
- The product list filtered by category, brand, name, price, size in stock, attribute values (colour,
  material, style, …) and discount, sorted by new, price, discount or rating (E13–E15).
- Filter counts for the catalog page: how many products each category, brand, size and attribute
  value would give, the price range and the number of discounted products (E16, E17).
- Writing, and all access to users, fitting sessions and generations, only with an admin token; the
  catalog is readable by anyone (E1).
- User input rules: phone and email are normalized, age 14 or more (E10, closes the backlog item
  "Auth input rules").
- One error format for every error, with a machine-readable code that a client can turn into its own
  text (E18–E22).
- Sentry in the api and the Temporal worker: errors and a share of request traces, readable stack
  traces, no personal data (E23–E25).
- Backlog entries for what this spec leaves for later specs (E29, E30).

## Non-goals

- Login, user accounts and per-user access: a later auth spec. Until then the admin token is the
  only key (E1).
- Any change in `web`: its `entities` layer, a browser client for the api and the Russian error texts
  are spec 0005 (E30); the catalog and product pages come after it. `greeting` stays until then
  (E29).
- Colour swatches for colour values and a nested category tree (E29).
- File upload and storage of photos (backlog "File storage").
- Starting AI generations: the CRUD only records them (E12).
- Personal ranking ("picked for you") (E14).

## Acceptance criteria

### Access

- AC1. Without the admin token, a catalog `GET` (categories, brands, attributes, products, product
  filter counts) answers 200, and any write or any request to users, fitting sessions or generations
  answers 401 with code `UNAUTHORIZED`. With the token they work. With an empty token in the
  environment they answer 401 even when a token is sent.

### CRUD

- AC2. For every resource of E3 a record can be created, read, listed, partly updated and deleted
  through the api; Swagger at `/docs` lists every endpoint.
- AC3. A list returns `items` and `total`; `limit` and `offset` page through it; a `limit` over 100
  answers 400.
- AC4. A product in a list carries its brand, category, first image, price, discount, price after the
  discount and rating; one product also carries all images, sizes with stock and attribute values.
  Image fields are full addresses under `MEDIA_BASE_URL`.
- AC5. The price after the discount is rounded down to whole rubles: price 1 999.99 with discount 15
  gives 1 699.
- AC6. Deleting a brand, category, attribute or attribute value that is in use, or a product used in
  a generation, answers 409 `IN_USE`; deleting a product removes its images, sizes and attribute
  links; deleting a user removes their sessions and generations.
- AC7. A user created with phone `8 (999) 123-45-67` and email `Anna@Mail.RU` is stored as
  `+79991234567` and `anna@mail.ru`; a date of birth less than 14 years ago answers 400.
- AC8. Making a fitting session active archives the user's previous active session; a user never has
  two active sessions.
- AC9. A generation whose status, result and error disagree (e.g. `completed` without a result)
  answers 400 before reaching the database.

### Product list

- AC10. Each filter of E13 narrows the list; several values of one attribute widen it (OR), values of
  two attributes narrow it (AND); a size filter skips products where that size is out of stock.
- AC11. Each sort of E14 orders the list; the same request returns the same order every time.
- AC12. For a request with filters, the filter counts give, for every category, brand, size and
  attribute value, the number of products the list would return if that value were chosen as well;
  choosing one colour does not zero the counts of the other colours. The price range and the
  discounted count match the list.

### Errors

- AC13. Every error answers `{ error: { code, message, details } }` with the status and code of the
  table in E20: invalid body, broken JSON, bad id, missing reference, database rule violation, no
  token, unknown route, missing record, duplicate, record in use, body too large, too many requests,
  database unreachable, unexpected error. A 500 carries no internal details.
- AC14. Validation errors list each invalid field in `details`.

### Sentry

- AC15. An unexpected error in the api (and in the worker) reaches the api's Sentry project with the
  release, a stack trace that points to the TypeScript source, and no headers, cookies, bodies or
  user data; 4xx errors are not sent. With an empty DSN nothing is sent.

### Checks

- AC16. `npm run verify` passes, with tests for each criterion above that a test can check.

## Owner actions (Claude cannot do them)

- Create a Sentry project for the api.
- Add `ADMIN_API_TOKEN` and the api's `SENTRY_DSN` to the GitHub environment `production`; add the
  variables `MEDIA_BASE_URL` and the api's Sentry project name.
- Keep the admin token outside the repository and the chat.

## Assumptions

- The demo catalog of 0002 is enough to check filters and counts; no data is added to it.
- The catalog is small enough for counts to be computed on each request, without a cache.
- Prices stay below what a JSON number holds exactly (`Decimal(10,2)`).
