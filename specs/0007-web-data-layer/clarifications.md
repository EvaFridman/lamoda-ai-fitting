# 0007 web data layer: clarifications

Status: done (2026-10-15). History, not instructions.

The owner's decisions for this spec. Ids `H1`, `H2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-15.

## Order

- **H1. Number and order.** This spec is 0007 (0005 G2), written while spec 0006 is in progress in a
  second worktree. Its documents need nothing from 0006. Its tasks that read api errors (`ApiError`,
  the error dictionary) start after 0006 PR 2 merges; the browser client's acceptance in production
  waits for 0006 PR 3 (nginx on `/api/`). Shared files are rebased by 0006 F1: the branch that
  merges later rebases onto `main`.
- **H2. Four pull requests.** PR 1: these documents, with the two backlog commits already on the
  branch. PR 2: the server side: the `shared/api` split, `buildPath`, `ApiError` with `code` and
  `details`, the error dictionary, Sentry reporting, the entity schemas, the contract test, and the
  greeting moved onto it. PR 3: the browser client, the query hooks, the server-to-browser handoff
  and the dev page. PR 4: acceptance in production after PR 3 is deployed, the acceptance record and
  `Status: done`; it closes issue #28. (Revised while writing the plan: the production criteria can
  only be checked after PR 3 is deployed, as in 0006.)

## Scope

- **H3. Entities.** Each of the seven entities gets a slice in `web/src/entities`: category, brand,
  product, attribute, user, fitting session, generation. Catalog entities (categories, brands,
  products with their images, variations and attribute values, attributes with their values, and
  the product filter counts) load on the server and in the browser. Users, fitting sessions and
  generations get schemas and types only, with no loaders: their routes are admin-only and the admin
  token never reaches web (0006 F19). Their loaders come with the auth spec. web writes no data.
- **H16. A second public entry for server-only code.** Any slice, and any `shared` segment, may
  have a `server.ts` next to its `index.ts`: a second public entry that holds only server-only
  exports (`@/shared/api/server`, `@/entities/product/server`). `index.ts` stays safe to import from
  the browser. The FSD rules (the `fsd` skill, `fsd-reviewer`, `.claude/README.md`) and `CLAUDE.md`
  change with it. (Added while writing the plan; the backlog item said the rules must allow it.)
  Settled in T4: server-only exports leave only through `server.ts`, so `shared/config`
  (`getServerEnv`) and `shared/redis` (`getRedis`) move there in T5 too; a segment or slice with
  only server-only exports has only a `server.ts`. "Safe in the browser" counts what `index.ts`
  exports directly: no module that imports `server-only`, no re-export of `server.ts`. Server
  components of widgets and pages stay in `index.ts`, and `next build` catches a client component
  that imports them. `server.ts`, and what it re-exports, holds no `'use server'`: server actions
  would be public endpoints and need their own decision.
- **H4. Backlog items taken.** "Web data layer" (including its sub-point on `apiFetch` paths) and
  "api call failures in Sentry". The commit that closes each removes it from `specs/backlog.md`.

## Transport

- **H5. Server-to-browser handoff.** A page loads its first data on the server and hands it to the
  browser's query cache, so the browser does not request the same data again on load. Later changes
  (a filter, the next page) are requested from the browser.
- **H6. The browser's api address.** The browser calls the site's own `/api` path in every
  environment. In local development web forwards `/api/*` to the api service; in production nginx
  does. No public api address variable and no cross-origin calls. Accepted: in local development
  all browser calls share the web container's quota.
- **H7. Freshness.** Catalog data in the browser counts as fresh for 60 s (the current default).
  Server-side reads happen on every request; no page cache.
- **H22. Refetch triggers.** The browser does not refetch when the window regains focus: the
  catalog changes rarely and each refetch counts against the read quota. It does refetch after the
  network comes back, so an error or old data does not stay on screen. Accepted: prices and stock
  seen in a tab left open stay as they were until the next navigation or the 60 s of H7 pass and
  something requests them again. (Added after 0006 PR 2 merged.)

## Errors

- **H8. Texts.** Russian text for each api error code, including 0006's `PAYLOAD_TOO_LARGE` and
  `SERVICE_UNAVAILABLE`, and for each `details` code, including `TOO_MANY_ERRORS` (0006 F14). An
  unknown code gets a general text.
- **H9. Sentry.** An unreachable api, a timeout, a response that does not match the schema and a
  5xx answer are reported to web's Sentry project, from the server and from the browser, grouped
  once per cause (the kind of failure and the route, not the page view or the id in the path). 4xx
  and 429 answers are not reported.
- **H10. Retries.** Server-side calls are never retried. The browser retries a request at most
  twice, with a pause, and only after a network error or a 503; never after a 4xx or a 429.
- **H11. Too many requests.** A 429 shows its own text (wait and try again) and is not retried.
- **H17. A refused path.** A path refused before any request is an `ApiError` with a fifth `kind`,
  `path`: a `buildPath` param that is empty, `.` or `..` (`encodeURIComponent` leaves dots alone and
  URL parsing treats `%2E%2E` as `..` too) or not well-formed unicode, a template param left without
  a value, a malformed template, and a path whose origin is not the api's. It gets the general text
  (T9) and is not reported to Sentry (T10): a refused param comes from the visitor's input, like a
  4xx, and the other causes are literals in the code that tests catch. (Added in T5.)
- **H23. 401 on a public route.** Catalog reads are `@Public()` (0006 F3), and a wrong token on a
  public route is served as anonymous (0006 F16), so a 401 there means a route lost its marker: an
  api bug that `test/access-markers.e2e-spec.ts` should already stop. It gets the general text and,
  unlike other 4xx (H9), is reported to Sentry. Revisit in the auth spec, where a 401 becomes an
  ordinary answer (a session ended). (Added after 0006 PR 2 merged.)
- **H24. Retrying a 503.** H10 stands: the browser retries a 503 too. web cannot tell a timeout's
  503 from another one (both are `SERVICE_UNAVAILABLE`), and the api does not cancel a handler that
  timed out (0006 F11), so a slow read retried twice can run three times at once for one visitor.
  Accepted for reads; the risk to the filter counts is in the backlog ("Cache for filter counts").
  On `/api/` nginx answers its own 502 and 504 (a blue-green switch, no copy of the api) as 503
  `SERVICE_UNAVAILABLE` in the api's format (0006 F33), so the browser retries them too: a short
  switch passes on a retry. Its 504 does not reach the browser, which gives up at 15 s, before
  nginx's 60 s. (Added after 0006 PR 2 merged; revised after 0006 PR 3.)
- **H25. `Retry-After`.** web does not read it: the 429 text stays "wait a little" (H11). Only the
  api's own 429 carries it; nginx's 429 does not (0006 F32). Showing the wait when the header is
  there is in the backlog. (Added after 0006 PR 2 merged; revised after 0006 PR 3.)
- **H26. Where a 503 shows.** The server's `apiFetch` gives up at 5 s, before the api's 10 s
  timeout, so a slow api reaches a server-rendered page as a timeout, never as a 503. AC3's 503 is
  shown from the browser (`clientFetch` waits 15 s, nginx 60 s), in production, or locally with a
  stubbed answer. Locally there is no nginx: with the api stopped, the dev rewrite answers instead
  of the api, likely with a 500 page, so the browser shows the general text and does not retry,
  where production gets a 503. T11 checks what the rewrite answers and T13's check follows it.
  (Added after 0006 PR 2 merged; revised after 0006 PR 3. Checked in T11: with the api container
  stopped the rewrite answers at once 500 `text/plain` "Internal Server Error".)
- **H27. An answer without the envelope.** On `/api/` nginx answers its own 413, 429 and 502/504
  (as 503) in the api's format (0006 F12, F17, F33). Any other answer without the envelope (another
  nginx page, the local dev rewrite) gets the text of the api code its status stands for, as a
  fallback: 413 → `PAYLOAD_TOO_LARGE`, 429 → `TOO_MANY_REQUESTS`, 502/503/504 →
  `SERVICE_UNAVAILABLE`; any other status gets the general text. An answer with the envelope keeps
  its code's text, except 429, which always gets its own (H11). (Added in T9; revised after 0006
  PR 3.)
- **H28. `details` codes not checked against the api.** The OpenAPI document types a detail's
  `code` as a plain string, so a new api validation rule gets the general detail text and no check
  notices. Accepted while web has no forms; the check is in the backlog. (Added in T9.)
- **H29. A failure that is not an `ApiError`.** Web's own env refused (0006 F20) or a bug in web's
  code is caught by the same component as an api failure, before any request reaches the response
  step. The component reports it to Sentry, always, once per error name per 60 s, and renders the
  general text; the page still answers 200. (Added in T10.)
- **H30. An error answer whose body is cut short.** The status has arrived, so it stays an `http`
  error without a code: its text and its retry follow the status (a cut 4xx is not retried, H10)
  and only a 5xx or 401 is reported. Rare, as error bodies are small. (Added in T10.)
- **H31. Browser options on the server.** A slice's browser options and its server options keep
  the same names (plan §5), so a server component can import the browser ones by mistake.
  `clientFetch` called where there is no page origin (`location`) throws a plain `Error` named
  `ClientFetchOnServer` that names the fix, before any request: a bug in web, so the page reports
  it like any other (H29), in a Sentry group of its own, not as an `ApiError` (a `path` error is
  not reported, H17). (Added in T12.)

## Contract

- **H12. Keeping schemas in sync.** Response schemas stay hand-written (0004 E26: no code
  generation, no shared package). A check in `npm run verify` keeps them in sync: the api's OpenAPI
  document is committed as a snapshot that the api's tests keep current, and a web test compares
  each web schema with its response in that document (fields, required, types, nullable, enum
  values).
- **H13. Strictness.** A field web does not know is dropped, so a newer api next to an older web
  during a deploy keeps pages working. An enum value web does not know fails the schema (and is
  reported, H9).
- **H18. Where the contract helper lives.** A `shared` segment of its own, `shared/contract`
  (`@/shared/contract`), used only by tests: a segment keeps the two public entries of H16, and
  `shared/api` keeps no test code. ESLint refuses an import of it outside `*.test.ts(x)`. (Added
  in T6.)
- **H19. Which side of a schema is compared.** The input side: the api's JSON is what web's schema
  parses. Response schemas hold no `.catch()` (it hides what the check and H13 must see), no
  `.default()` (an optional input against a required field) and no transforms (data stays plain
  JSON for the handoff, plan §4); dates are ISO strings (`z.iso.datetime()`), never
  `z.coerce.date()`, which the check cannot compare. The contract check reports `.catch()`,
  `.default()`, `.transform()` and `z.coerce.date()`; `z.preprocess` and codecs it does not see. A
  list is checked against its route's response, so the `{ items, total }` wrapper is covered too.
  (Added in T6.)
- **H20. Enums web sends.** A request value web copies from the api, so far the product list's
  `sort` options, is checked too: the contract test compares the copy with the enum of that query
  parameter in the OpenAPI document, so an option the api renames or drops turns `verify` red
  instead of a 400 in production. (Added in T7.)
- **H21. One row by id.** Categories, brands and attributes also load one by id
  (`/categories/:id`, `/brands/:id`, `/attributes/:id`), beyond plan §5's list, so a later page
  does not need a change of the entities. (Added in T7.)

## Verification

- **H14. Dev page.** A hidden page, like `/ui-kit`, shows the layer at work: data loaded on the
  server and handed to the browser, a filter and pagination requested from the browser, error
  states. It works in production, is closed to indexing, is linked from nowhere and shows only the
  public catalog. It is removed with the catalog page spec.
- **H15. Greeting.** The greeting moves onto the new layer (Russian error text, Sentry instead of a
  console log). Its removal stays with the catalog page (backlog "Remove `greeting`").
- **H32. AC6 checks names, not the value.** `check:web-bundle` searches `.next/static` for
  `x-proxy-secret` and `PROXY_SECRET`. The value of `PROXY_SECRET` reaches no build (`verify` and
  CI build without it, images take no secrets, Next inlines only `NEXT_PUBLIC_`), so AC6's "value"
  holds by that, not by a search. A value a server component passes to a client one reaches the
  browser at request time, which no bundle check sees: guarding it with React's taint is a backlog
  item ("Taint the proxy secret"), not part of 0007. (Owner, 2026-10-15, after T14's review.)
- **H33. The bundle check runs only in `verify`.** Not again in `web/Dockerfile`: the names it
  searches come from the sources, the same in both builds, and the image's own difference (inlined
  `NEXT_PUBLIC_*` values) is not what it searches. A secret under a `NEXT_PUBLIC_` name needs
  changes to the Dockerfile and `images.yml`, seen in review, and CLAUDE.md keeps `PROXY_SECRET`
  off `NEXT_PUBLIC_`. (Owner, 2026-10-15, after T14's review.)
