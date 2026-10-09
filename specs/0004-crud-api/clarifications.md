# 0004 CRUD api: clarifications

Status: in progress (2026-10-09).

Decisions made by the owner on 2026-10-09. Each line is final unless the owner changes it here. The
model for the product list is the lamoda.ru catalog: the owner's screenshots and a page saved from
the browser, shown in the chat and not stored in the repository (the saved page holds the owner's
personal data).

## Access and scope

- E1. Catalog reads (categories, brands, attributes, products, product filter counts) are public.
  Every write, and every request to users, fitting sessions and generations, needs an admin token in
  a request header, compared with a value from the environment. An empty value closes these
  requests entirely. Real auth comes with its own spec.
- E2. Every table of 0002 is covered.
- E3. Resources: users, categories, brands, products, attributes, fitting sessions, generations. The
  parts of a product (images, sizes, attribute values) and the values of an attribute are nested
  under their owner. The products of a generation are set together with the generation.
- E4. Updates are partial; deletes are real (no soft delete); deleting a row other rows depend on
  answers "in use" (the database's restrict rules, 0002 C8).
- E31. The admin token is empty or at least 32 characters with no spaces; anything else stops the
  api at startup, so a weak production value cannot go unnoticed (decided during T3).
- E32. `qa-tester` checks AC1 live only without a token and with a wrong one: it cannot read `.env`
  or run commands in a container, so it never holds the local token. The right token is covered by
  the e2e specs, which use a known test token (decided during T3).

## Responses

- E5. Lists are paged by limit and offset and return the items and the total. Default page 60
  (as on lamoda), maximum 100.
- E6. Money and rating are JSON numbers.
- E7. Product in a list: its own fields, brand and category (id, name, slug), the first image, price,
  discount, price after the discount, rating. One product adds all images, sizes with stock and
  attribute values. Other resources return their own fields and the ids of related rows.
- E8. Responses carry full image addresses built from `MEDIA_BASE_URL` and the key (backlog "Catalog
  API"), and the price after the discount, rounded down to whole rubles.

## Validation

- E9. Field rules follow the database rules of 0002 (C12) and are checked by the api first, so the
  caller gets a field-level error instead of a database error.
- E10. Users: phone input (`8 …`, `+7 …`, spaces, brackets, hyphens) is normalized to
  `+79XXXXXXXXX`; email is trimmed and lower-cased; age at least 14 (backlog "Auth input rules").
- E11. Fitting sessions: making a session active archives the user's other active session at the
  same time (0002 C15).
- E12. Generations: full CRUD for the admin; status, result and error must agree (0002 C12). Writing
  a generation does not start an AI workflow.

## Product list

- E13. Filters: category, brand, name search, price range on the price before the discount (owner's
  choice), size, attribute values, "only with a discount". Several values per filter.
- E13a. Attribute values: OR within one attribute, AND across attributes (black or white, and
  evening).
- E13b. A size counts only while it is in stock.
- E14. Sorting: new (default; there is no personal ranking), price up, price down, by discount, by
  rating. Ties are broken in a fixed order, so pages do not repeat or skip products.
- E15. Filters and sorting apply to the price before the discount, as E13.
- E16. Filter counts in this spec, as on lamoda: for every category, brand, size in stock and
  attribute value, the number of products with that value added to the current filters; each filter
  is counted without its own chosen values. Also the price range, the number of discounted products
  and the total.
- E17. Counts are public and use the same filters as the list.

## Errors

- E18. The api has its own error handling: one handler for every error, and named error types for
  the api's own cases.
- E19. Only errors have an envelope: `{ error: { code, message, details } }`; successful responses
  are the data itself.
- E20. Typical errors, status and code:

  | Case                          | Status | Code                   |
  | ----------------------------- | ------ | ---------------------- |
  | Invalid body or query         | 400    | `VALIDATION_FAILED`    |
  | Broken JSON                   | 400    | `BAD_JSON`             |
  | Bad id in the path            | 400    | `INVALID_ID`           |
  | Reference to a missing row    | 400    | `RELATED_NOT_FOUND`    |
  | Database rule violation       | 400    | `CONSTRAINT_VIOLATION` |
  | No or wrong admin token       | 401    | `UNAUTHORIZED`         |
  | Unknown route                 | 404    | `ROUTE_NOT_FOUND`      |
  | Missing record                | 404    | `NOT_FOUND`            |
  | Duplicate of a unique value   | 409    | `ALREADY_EXISTS`       |
  | Record in use                 | 409    | `IN_USE`               |
  | Body too large                | 413    | `PAYLOAD_TOO_LARGE`    |
  | Too many requests             | 429    | `TOO_MANY_REQUESTS`    |
  | Database or Redis unreachable | 503    | `SERVICE_UNAVAILABLE`  |
  | Anything else                 | 500    | `INTERNAL_ERROR`       |

  Invalid content is 400, not 422: one status, the code tells the cases apart.

- E21. `details` lists errors per field: field, code, message.
- E22. `message` is English, for developers; web shows Russian text chosen by `code`, and a general
  text for an unknown code. Health check responses keep their format (the deploy reads them).

## Sentry

- E23. The api and the Temporal worker report to their own Sentry project (not web's).
- E24. Errors and 10% of request traces; release = the commit, as in web; no user data, headers,
  cookies or bodies; an empty DSN turns it off. Only 5xx errors are reported.
- E25. Source maps are uploaded at build time when the token is present, so stack traces point to the
  TypeScript source.
- E33. Limits of Sentry's Developer plan (5k errors and 5M spans a month, shared with web) shape
  what is sent. 503 `SERVICE_UNAVAILABLE` is a 5xx and is reported. `/health/*` requests are not
  traced (compose polls liveness every 5 seconds); other requests keep 10%. A failed activity is
  reported on its first attempt and on its last one (attempts used up or not retryable), not on
  every retry. No rate limit on the api's DSN in Sentry. The 10% is fixed, not taken from an
  incoming `sentry-trace` header (anyone could have every request traced), so a web → api trace may
  be partial; 429 responses are not traced; traces go as whole transactions
  (`traceLifecycle: 'static'`), so they pass the same cleanup as errors. `sendDefaultPii` of the
  plan does not exist in Sentry 11: `dataCollection` turns the data off, as in web.

## web (moved to spec 0005 by E30)

Made for this spec and kept as the starting point of spec 0005, which may change them.

- E26. A slice per entity: category, brand, product, attribute, user, fitting session, generation;
  each with its types and response checks written by hand (no code generation, no shared package).
- E27. Catalog entities (category, brand, product, attribute, product filter counts) load data on the
  server and in the browser (hooks over a browser client). Users, fitting sessions and generations
  get types only: the admin token never reaches web. web does not write data in this spec.
- E28. `web` keeps calling the api from the server only through its server client (CLAUDE.md); the
  browser client calls the public catalog through the site's own `/api` path.

## Later

- E29. Backlog entries: remove `greeting` (page widget, entity, `/hello` and their tests) with the
  catalog page spec; colour swatches for colour values (a new column and its data, added by a
  migration because the seed never changes existing rows) with the catalog page spec; a nested
  category tree.
- E30. The web part (E22's Russian texts, E26–E28 and the backlog item "`apiFetch` paths") leaves
  this spec for its own spec 0005, right after this one and before the catalog page; 0005 gets more
  tasks of its own and no pages. This spec changes only the api, its deploy and its documentation.
