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
- E7. Product in a list: its own fields, brand (id, name; brands have no slug) and category (id,
  name, slug), the first image, price, discount, price after the discount, rating. One product adds
  all images, sizes with stock and attribute values. Other resources return their own fields and the ids of related rows.
- E8. Responses carry full image addresses built from `MEDIA_BASE_URL` and the key (backlog "Catalog
  API"), and the price after the discount, rounded down to whole rubles.
- E39. Categories and brands (T7) return only their own columns: no product count or product ids
  (a category's products come from the product list, counts from the filter counts). Categories are
  listed by `sortOrder`, then name, then id; brands by name, then id. `?isActive` takes only `true`
  or `false` (anything else is 400); without it the list has every category. `isActive` means the
  category is shown on the site (web builds its menu from `?isActive=true`). The category a visitor
  has chosen is not stored: web takes it from the page address by slug and highlights it there.
- E41. Writes of every resource: create answers 201 with the record, update 200 with the record,
  delete 204 with no body.
- E42. Attributes and their values (T8) return only their own columns: an attribute has no
  `values[]` (they come paged from `/attributes/:id/values`; the filters take them from the filter
  counts), a value adds `attributeId`. Attributes are listed by name, then id; values by value, then
  id. `/attributes/:id/values` with a missing attribute answers 404 `NOT_FOUND` on list and create.
  A value read, updated or deleted under an attribute it does not belong to answers 404
  `NOT_FOUND`. A value never moves to another attribute: an update takes only `value`, so
  `attributeId` in the body is 400. `null` and an empty body follow E40.

## Validation

- E9. Field rules follow the database rules of 0002 (C12) and are checked by the api first, so the
  caller gets a field-level error instead of a database error.
- E10. Users: phone input (`8 …`, `+7 …`, spaces, brackets, hyphens) is normalized to
  `+79XXXXXXXXX`; email is trimmed and lower-cased; age at least 14 (backlog "Auth input rules").
- E11. Fitting sessions: making a session active archives the user's other active session at the
  same time (0002 C15).
- E12. Generations: full CRUD for the admin; status, result and error must agree (0002 C12). Writing
  a generation does not start an AI workflow.
- E40. Categories: `isActive` is required on create (no default, as in the database). `description`
  is any text up to 5000 characters with no NUL (line breaks and outer spaces allowed); `null` on
  create means no description, in an update it clears it; `null` in any other field is 400. An update with an empty body answers 200 with
  the record unchanged.

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
- E34. nginx clears incoming `sentry-trace` and `baggage` at the server level, so for web too: a
  browser → web server trace is no longer joined, and no client sets the trace of web or the api
  (owner, 2026-10-10). `traceparent` and `tracestate` are cleared too.
- E35. The check that traces carry no Prisma error text runs in T5 on a temporary local route (not
  committed) with a local receiver of Sentry envelopes as the DSN, so all spans are visible and no
  real DSN is needed (owner, 2026-10-10).
- E36. T5 takes the backlog item "Sentry token scope": `SENTRY_AUTH_TOKEN` moves to the
  `production` environment, and the `images` job uses that environment only on a push to `main`
  (owner, 2026-10-10).
- E37. A failed source map upload does not fail the api image build, as in web: Sentry being down
  does not hold back a deploy; that release's stack traces stay compiled JS, and the CI log says so
  (owner, 2026-10-10).
- E38. nginx serves HTTP/1.1 only. With HTTP/2, every reload (two per deploy, and the 6-hour one
  for certificates) dropped a few requests: old workers close HTTP/2 connections that carry no
  request yet. Measured in CI over 60 reloads under a request loop (curl, a new connection per
  request): 19 failed of ~25k requests with HTTP/2, none with HTTP/1.1; `accept_mutex on` did not
  help. The cost: browsers load over up to 6 connections instead of one multiplexed one. The deploy
  check stays strict (no failed request). Bringing HTTP/2 back needs deploys without reloads:
  backlog (owner, 2026-10-10).

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
