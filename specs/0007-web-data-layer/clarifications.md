# 0007 web data layer: clarifications

Status: open (2026-10-15).

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

## Contract

- **H12. Keeping schemas in sync.** Response schemas stay hand-written (0004 E26: no code
  generation, no shared package). A check in `npm run verify` keeps them in sync: the api's OpenAPI
  document is committed as a snapshot that the api's tests keep current, and a web test compares
  each web schema with its response in that document (fields, required, types, nullable, enum
  values).
- **H13. Strictness.** A field web does not know is dropped, so a newer api next to an older web
  during a deploy keeps pages working. An enum value web does not know fails the schema (and is
  reported, H9).

## Verification

- **H14. Dev page.** A hidden page, like `/ui-kit`, shows the layer at work: data loaded on the
  server and handed to the browser, a filter and pagination requested from the browser, error
  states. It works in production, is closed to indexing, is linked from nowhere and shows only the
  public catalog. It is removed with the catalog page spec.
- **H15. Greeting.** The greeting moves onto the new layer (Russian error text, Sentry instead of a
  console log). Its removal stays with the catalog page (backlog "Remove `greeting`").
