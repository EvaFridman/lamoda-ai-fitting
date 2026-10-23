# 0019 AI fitting v1: plan

Status: accepted (2026-10-21).

How [spec.md](spec.md) is built. Decisions: [clarifications.md](clarifications.md) (A1–A47).
New dependencies, checked on npm on 2026-10-21: api `sharp` 0.35.5 (lovell/sharp, prebuilt
binaries, no install script) and `busboy` 1.6.0 (mscdex/busboy); web `socket.io-client` 4.8.4
(the api's socket.io is 4.8.x; the same minor). OpenAI is called with Node's `fetch`, no SDK.

## 1. Pull requests and release order

| PR  | Branch                   | What                                                                  |
| --- | ------------------------ | --------------------------------------------------------------------- |
| 1   | `docs/0019-ai-fitting`   | spec, clarifications, plan, tasks; 0016 S20; the backlog's new items  |
| 2   | `feat/0019-photos`       | photos: migrations, the OpenAI module, upload, «Мои фото», the outbox |
| 3   | `feat/0019-generation`   | generation: models, workflow, routes, limit, push, try-on of one item |
| 4   | `feat/0019-product-page` | the product page (#69), after 0014 and 0018's page cache              |
| 5   | `feat/0019-fitting`      | the fitting room, looks, history actions, closing                     |

PR 2 and 3 start from today's `main`; PR 4 and 5 from the `main` that holds 0014 and 0018's T7
(A1, A22). Migrations are additive (`specs/principles.md`): every release runs with the previous
one's schema.

## 2. Data model (A18, A21, A23–A26, A38)

- **`prisma/schema.prisma`, migration «fitting photos» (PR 2).**
  - enum `OutfitSlot { top bottom outerwear shoes accessory }` → `outfit_slot`; `Category.slot`
    nullable; the migration sets `top` for `t-shirts`, `hoodies`, `dresses`, `bottom` for `jeans`,
    `outerwear` and `shoes` for those slugs (A18). The seed sets the same for a missing row.
  - `UserPhoto`: `id` uuidv7, `userId` (cascade), `imageKey` varchar(255) with 0002 C22's CHECK,
    `isDefault`, `transient` (A24), `width`, `height`, `createdAt`; `@@unique([userId], where:
raw("is_default"))` (the same partial index pattern as fitting sessions, 0002 C21: code always
    adds `isDefault: true`) and `@@index([userId])`. At most five non-transient per user: counted
    inside the upload's transaction with the user's row locked (A31).
  - `FittingQuota` (`fitting_quota`): `userId`, `month` (`YYYY-MM` in Moscow time), `used`;
    `@@id([userId, month])` (A20). Written only by the start transaction and by `complete`.
  - `FileDeletion` (`file_deletions`): `id`, `kind` (`user | session | generation | photo`),
    `rowId`, `prefixes` text[], `createdAt`, `startedAt` nullable (A38).
- **Migration «fittings» (PR 3).** `AiGeneration` gains `userId` (nullable, backfilled from the
  session, indexed with `createdAt desc`; NOT NULL comes in a later release, since the previous
  release's code inserts rows without it, `specs/principles.md`), `kind` enum `FittingKind {
single look }` (nullable for the same reason, read as `single`),
  `photoId` (FK `user_photos`, set null), `parentId` (self FK, set null), `promptText`
  varchar(300), `regenerationReasons` text[] (values from the enum of A16's chips, checked in the
  DTO), `countsAgainstLimit` boolean, `failureCode` enum `FittingFailure { photo_dark
photo_not_full photo_many_people photo_child photo_no_person prompt_refused model_timeout
moderation provider_error }` nullable, `providerRequestId` varchar(100), `fingerprint`
  char(64) indexed with `userId` and, as a partial unique index over `status IN ('pending',
'processing')`, guarding the running duplicate (A32; `@@unique([userId, fingerprint], where:
raw(...))` with the schema's preview feature `partialIndexes`, as the active session's index of
  0002 C21, so the schema keeps it, and like that one it looks like a full key to the generated
  client: queries never rely on it without the status filter; a row in `constraint-fields.ts`),
  `startedAt`, `finishedAt`; `userImageKey` nullable (A24). The
  status CHECK becomes: completed → result and no failure; failed → `failure_code` or
  `error_message`; pending/processing → neither. `GenerationProduct` gains `attributeValueId`
  (FK, restrict) and `slot`, both nullable. `MAX_GENERATION_PRODUCTS` stays for the closed route
  (A23).
- **Migration «fitting room» (PR 5).** `FittingRoomItem`: `userId`, `slot`, `productId`
  (cascade), `attributeValueId` nullable, `createdAt`; `@@unique([userId, slot])`.
- **`common/errors/constraint-fields.ts`** gets a row per new constraint; the CHECKs live in the
  migrations only.
- The fingerprint (A7, A32): sha256 of `photoId` (a transient photo has one too, A24; once it is
  deleted nothing repeats it), the items sorted by product id with their attribute value id, and
  the trimmed text. A repeat lookup is `userId + fingerprint + status completed`, newest first.

## 3. OpenAI: the client, the model and the checks (A4, A15–A17, A28, A29)

- **`api/src/ai/ai-settings.ts`.** `AI_SETTINGS` token from env: `OPENAI_API_KEY`,
  `FITTING_MODEL`, `FITTING_VISION_MODEL`, `FITTING_TIMEOUT_SECONDS`, `FITTING_CHECK_TIMEOUT_MS`
  (A45), `FITTING_MONTHLY_LIMIT`, `FITTING_PHOTO_MAX_BYTES`. `assertServerEnv` (api) and the
  worker's start refuse an empty
  `OPENAI_API_KEY` in production; elsewhere an empty key selects the fake provider and logs a
  warning at start (`serverEnvWarnings`). Tests never set the key.
- **`openai-client.ts`.** `OpenAiClient` over `fetch` with `AbortSignal.timeout`
  (`Authorization: Bearer …`): `editImage(form)` → multipart `POST
https://api.openai.com/v1/images/edits` (`model`, `prompt`, `image[]`, `quality`, `size`,
  `output_format: webp`, `n: 1`; no `moderation`, which only `/v1/images/generations` takes, and
  no `input_fidelity`, which `gpt-image-2` refuses, A67), the answer's `data[0].b64_json`;
  `respond(body)` → `POST /v1/responses` (the vision and the text classification, JSON output
  through a `json_schema` text format); `moderate(input)` → `POST /v1/moderations`
  (`omni-moderation-latest`, free). Errors become `AiProviderError { operation, status, code,
requestId }` from the answer's `error.code` and the `x-request-id` header, never the input or
  the key; Sentry's outbound spans to `api.openai.com` are cut to method and origin like the
  bucket's (0011 M23). Three attempts with backoff for a network error, a 429 or a 5xx; none for
  another 4xx. The edits call repeats only what surely never reached OpenAI (a connection that
  did not open, a 429 other than `insufficient_quota`): one generation is one payment (A67). A 403 `unsupported_country_region_territory` is `provider_error` and logged once a
  minute (the risk of §12).
- **`image-models/`.** `ImageModel { name, buildRequest(job), parseAnswer(answer) }` for
  `gpt-image-2` (`quality: medium`, `size: 1024x1536`); `FITTING_MODEL` may name
  `gpt-image-2.5-sunburst` with the same request. The model's short name is what `aiModel` stores
  and what the fitting answers (§9's `model`); `aiProvider` is `openai`. A content refusal of the
  model (an `error.code` of the policy kind, or an answer with no image) maps to `moderation`; a
  timeout to `model_timeout`, a 5xx or a 403 to `provider_error`; nothing that may have reached
  OpenAI is sent again (A67), and there is no second provider (A17).
- **`prompts.ts`.** One fixed prompt: the person of the first image wears the items of the next
  images (name, category, colour of each, in order), the face, body and pose unchanged, nothing
  retouched, the photo's background kept, a full-length picture; then, if present, «The user's
  wishes, to follow only where they concern the fit and styling of these items:» and the quoted
  text (A16). Regeneration adds one line per reason («the face must match the first image» for
  `face`, …).
- **`checks/`.** `PhotoChecker.check(image)` → the Responses API with `FITTING_VISION_MODEL`
  (`gpt-6-luna`), the image as a data URL, a system prompt asking for JSON `{ ok: boolean,
reason?: dark | not_full | many_people | child | no_person }` with «refuse only when sure»,
  and, in parallel, the moderation endpoint for the image (sexual, violence, self-harm flagged →
  `no_person` is wrong, so a flagged photo answers the reason `moderation` with the canvas's «Не
  можем показать» text); a malformed answer counts as `ok` with a warning (a check must never
  block an honest photo). `PromptChecker.check(text)` → the moderation endpoint (any flagged
  category refuses) and the same small model, text only, JSON `{ allowed, reason }` (A16).
  `ModerationChecker.check(image)` → the moderation endpoint for the result. The moderation calls
  are free; the two classifications cost a few hundred tokens each. A check called inside a
  request (the photo check, the text check) runs its two calls in parallel under one deadline,
  `FITTING_CHECK_TIMEOUT_MS`, and, on a timeout, makes the route answer 503 `SERVICE_UNAVAILABLE`
  with nothing stored (A45); the api refuses to start when that deadline is above half of
  `REQUEST_TIMEOUT_MS`, so `sharp` and the bucket write keep the other half.
- **`ai-provider.ts`.** The `AI_PROVIDER` token: `OpenAiProvider` with a key, `FakeAiProvider`
  without one (and always in tests): a deterministic result image from `api/test/fixtures/`, a
  refusal when the photo's bytes or the text contain a marker the e2e use (`refuse:<reason>`),
  a delay the tests set on the instance (not an env variable). `AiModule` exports the token;
  `WorkerModule` imports it.
- **Images in, images out (A29).** `loadInputs` reads the photo and the products' first images
  from the bucket and re-encodes them to JPEG ≤ 1536 px with `sharp`; the edits request carries
  them as `image[]` files (the person first), the checks as data URLs; the answer's base64 WebP is
  decoded, re-encoded by `sharp` (a fixed size, no metadata) and stored with `StorageService.put`
  (WebP only, 0011).

## 4. The workflow `generateFitting` (A26–A28, A32, A39)

- **Start.** `FittingsService.start` commits the row (status `pending`, the limit reserved) and
  then `WorkflowStarter.start('generateFitting', { workflowId: fittingWorkflowId(generationId),
args: [{ generationId, timeoutSeconds }] })` (`timeoutSeconds` is `FITTING_TIMEOUT_SECONDS`,
  A68); a failed start marks the row failed with `provider_error` and releases
  the unit, logged and sent to Sentry with the id only (as `FileDeletion` does).
- **Activities** (`temporal/activities/fitting.activities.ts`, built by `createActivities` with
  `AI_PROVIDER`, `StorageService`, `PrismaClient`; T13 adds the publisher): `markProcessing`,
  `generate` (reads the photo and the items' first images from the bucket and re-encodes them,
  A29, makes the one call to the edits endpoint with `FITTING_TIMEOUT_SECONDS` as its timeout,
  re-encodes the picture and writes it to the generation's folder, A68; heartbeating the elapsed
  time every 10 s on a timer while it runs, `heartbeatTimeout` 30 s, `startToCloseTimeout` =
  `FITTING_TIMEOUT_SECONDS` + 60 s; on cancellation aborts the request), `moderate` (reads the
  result from the bucket), `discardResult`, `complete`, and `notify` (T13). No image and no text of
  the user goes through the workflow's history: the activities pass ids and codes only (A68). The
  text was checked by `POST /fittings` (A45), so the workflow does not check it again (A68).
  `generate` runs once (`maximumAttempts: 1`,
  A67): the client repeats only a request that never reached OpenAI, and anything else (a 5xx, a
  timeout, a connection lost after the request was sent, a worker lost mid-call) ends the fitting
  `provider_error` or `model_timeout`, not counted against the limit, since OpenAI may have billed
  that picture and has no idempotency key; the timeout and the failures are
  `ApplicationFailure.nonRetryable` with the failure code as `type`, the model's refusal is a
  result (`moderation`), so it reaches no Sentry.
- **Workflow.** Marks `processing`; runs the chain; on any end calls `complete`
  (status, `countsAgainstLimit` false unless completed and the quota's unit taken back then (A20),
  a transient photo's row and file deleted through the outbox (A24), `finishedAt`)
  and `notify` (T13). A failed fitting's written result is deleted first (`discardResult`).
  `complete` is idempotent: it moves the row out of `pending`/`processing` with a
  conditional update and takes the unit back in the same transaction only when that update
  changed the row, so a retried activity changes nothing (A20). A cancelled workflow (the row
  deleted, A47) discards a written result and calls `complete` with the unit kept, outside the
  cancellation: a row that is gone changes nothing, one still there ends `failed` and stays spent. Added to `workflows.spec.ts`; the e2e drives it
  with stub activities as `delete-files-workflow.e2e-spec.ts` does.
- **`deletePrefix`** gets `heartbeat()` per batch and a `heartbeatTimeout` (A39).
- **The outbox (A38).** `FileDeletion.startFileDeletion` becomes: the caller's transaction inserts
  `file_deletions`; after the commit the service starts the workflow and sets `startedAt`; the
  schedule `fitting-housekeeping` (every 10 min, overlap SKIP, created like
  `delete-expired-auth-rows`) runs `housekeeping`, which starts every row older than a minute with
  `startedAt` null and deletes transient photos older than an hour (A24). Rows are deleted when
  the workflow completes (an activity at the end of `deleteFiles`).

## 5. api routes (A5–A7, A12, A16, A21, A24, A31–A33, A36)

All `@SignedIn()` unless noted; every new handler joins `SIGNED_IN_HANDLERS` or `PUBLIC_HANDLERS`
of `test/access-markers.e2e-spec.ts`; `openapi.json` and `validation-codes.json` are rewritten with
`-u` in the task that changes them.

- **`me/photos` (PR 2).** `POST /me/photos` (`@Expensive()`): multipart read by `busboy` on this
  route only (0006 F26: the api's parsers stay off), one file field `photo`, a `save` field
  (`true` by default; `false` marks the row transient, A24); the stream is cut at `FITTING_PHOTO_MAX_BYTES` (413
  `PAYLOAD_TOO_LARGE`); `sharp` reads the metadata (a non-image is 400 `VALIDATION_FAILED`,
  detail `IS_IMAGE`), rotates by EXIF, resizes to ≤ 2048 px, writes WebP without metadata; the
  photo check runs on the WebP, its two calls in parallel under one deadline (A45; a refusal is
  400 `VALIDATION_FAILED`, detail code `PHOTO_REFUSED` with `reason` in the message's code
  form); the row and the object are written
  (key `userPhotoKey(userId)`), the sixth saved photo is 409 `LIMIT_REACHED` (the code and its
  web text come with this route, PR 2). Answer 201 `UserPhotoDto { id, url (signed), isDefault,
transient, width, height, createdAt }`. `GET /me/photos` (a plain array of the saved ones, at
  most five: a deliberate exception to `Paginated<T>`), `PATCH /me/photos/:id` (`{ isDefault:
true }`), `DELETE /me/photos/:id` (204; the generations' `photoId` goes null; the file through
  the outbox). `DELETE /me` writes the user's folders into the outbox in its transaction (A38).
- **`fittings` (PR 3).** `POST /fittings` (`@Expensive()`), `StartFittingDto { photoId, items:
[{ productId, attributeValueId? }] (1–5), kind, promptText? (≤ 300) }` (a transient photo is a
  `photoId` like any other, used once, A24):
  the items' categories must have slots and, for a look, distinct ones; the colour must belong to
  the product (400 `RELATED_NOT_FOUND`); the repeat lookup (A7) answers 200 with the existing
  result and `repeated: true`; a running generation with the same fingerprint answers 200 with
  it (A32); the prompt check (A16, 400 `PROMPT_REFUSED`); then one transaction: lock the user's
  row, look again for a running generation with the same fingerprint (A32: the first lookup is a
  fast path; two parallel requests serialize on the lock and the second answers the first's row),
  read or create this month's `fitting_quota` row (409 `LIMIT_REACHED` with `renewsAt` at
  the limit, else `used + 1`, A20), create the active session if none, insert the generation and
  its products; after the commit start the workflow; answer 201 `FittingDto`. `GET
/fittings?kind=&cursor=&limit=` answers `CursorPaginated<FittingDto>` with the cursor DTO of the
  products' listing (`common/pagination/cursor-paginated.ts`, newest first by `createdAt`, id),
  `GET /fittings/:id` (`FittingDto { id, kind, status, stage, failureCode,
countsAgainstLimit, model, items[{ productId, name, brand, imageUrl, price, finalPrice,
attributeValueId, colour }], photoId, resultUrl (signed), createdAt, startedAt, finishedAt,
estimatedSeconds }`), `POST /fittings/:id/regenerate` (`@Expensive()`, `{ reasons[],
comment? }`; free when the parent has no child yet, A6; it goes through the same start
  transaction as `POST /fittings`, with the user's row locked and the lookup of a running
  generation of the same fingerprint, so a second regenerate while the first runs answers 200
  with the running row, A32), `DELETE /fittings/:id` (204, a running
  one is cancelled through the Temporal handle and keeps its unit spent, A47; the files through
  the outbox), `GET
/me/fitting-quota` (`{ limit, used, left, renewsAt }`). `POST` and `PATCH /fitting-sessions`
  get `@Closed()` and move to `CLOSED_HANDLERS` (A21).
- **Products (PR 4).** `GET /products/:id/related` (`@Public()`, `read` tier): six newest
  products of other active categories with a slot (A36), as `ProductListItemDto[]`; `GET
/products/:id/fittings/last`: the user's newest completed fitting that holds the product, or 404.
- **Fitting room (PR 5).** `GET /me/fitting-room` (`{ items: [{ slot, product, attributeValueId,
colour }], count, sum }`), `PUT /me/fitting-room/:slot` (`{ productId, attributeValueId? }`;
  the product's slot must equal `:slot`; answers the new state and `replaced` with the previous
  item for «Вернуть»), `DELETE /me/fitting-room/:slot`, `DELETE /me/fitting-room` (204).
- **Errors.** New codes in `error-codes.ts`: `LIMIT_REACHED` (409, PR 2) and `PROMPT_REFUSED`
  (400, PR 3); new detail codes `PHOTO_REFUSED` and `IS_IMAGE` (PR 2), `HAS_SLOT` and
  `DISTINCT_SLOTS` (PR 3). The api task that adds a code adds its Russian text to web's
  `ERROR_TEXTS`/`DETAIL_TEXTS` in the same commit (the contract tests fail otherwise, as 0017 T4
  did). Swagger: `@ApiErrors` on the routes that answer them.

## 6. Realtime (A11, A34, A35, A44)

- **api.** `RealtimeGateway.handleConnection` joins a `user` principal to the room
  `user:<userId>`; `FittingNotifier` (in `realtime/`) subscribes a dedicated ioredis client (a
  subscriber needs its own connection) of `REDIS_URL`, the counters' Redis (A44: a channel holds
  no key), to the channel `fitting-events` and emits `fitting:finished { generationId, kind,
status }` to the room; the worker's `notify` publishes the same JSON with its own client. A
  lost message costs nothing: the waiting screen polls. No client-to-server message is added, so
  the gateway's rate limit of 0001 B12c still waits (A35).
- **web.** `shared/realtime` (`socket.io-client`, kept in socket.io's minor line as
  `socket.io-parser` is, path `/socket.io`, `withCredentials`, transports
  polling then websocket, reconnection on) opens one connection per tab while the session is
  `signed-in` and closes it on `signed-out`; `features/fitting-events` (`useFittingEvents`,
  mounted by the header next to `useSignInAnalytics`) invalidates `fittingKeys.all` and shows
  `showToast` with «Открыть» (a link to the result) or, for `failed`, «Повторить» (A34). Locally
  `next.config.ts` adds a `/socket.io/:path*` rewrite to `API_URL` (long-polling only; nginx
  upgrades in production).

## 7. web: slices and the kit (the `fsd` skill)

- **entities.** `user-photo` (schemas, `userPhotoKeys`, `useMyPhotos`, `uploadPhoto`, which
  passes `clientFetch` a timeout of its own, `UPLOAD_TIMEOUT_MS` (120 s) in place of the 15 s,
  since the browser's timer covers the body's upload too: `clientFetch` gains an optional
  `timeoutMs`; `setDefaultPhoto`, `deletePhoto`, `PhotoThumb`), `fitting` (schemas of
  `FittingDto` and the
  quota, `fittingKeys`, `useFitting` with polling while pending or processing, `useFittings`
  (infinite), `useFittingQuota`, `startFitting`, `regenerateFitting`, `deleteFitting`, the display
  components `AiLabel`, `LimitMeter`, `ItemsStrip`, `HistoryCard`), `fitting-room` (schemas,
  `useFittingRoom`, `putRoomItem`, `removeRoomItem`, `clearRoom`, `OutfitSlotRow`,
  `MiniSwatches`), `product` (existing; gains `ProductColourPicker` and `LookToggle` in its `ui`,
  display-only per 0009 K7; `CatalogProductCard`'s one `action` slot becomes two corners, the
  hanger top left and the heart top right, and the card gets its hover, the kit's `--shadow-box`
  and the photo scaled to 1.03 inside its frame on pointer devices, A63.1). The unused
  `entities/generation` schemas are replaced by `fitting`.
- **features** (each a leaf: a feature imports no feature, the `fsd` skill). `upload-photo` (the
  first-upload screen with the tips (the canvas's seven pictograms as inline SVG components, A62)
  and the two consents kept in `localStorage` per user (A60), the processing one naming OpenAI,
  A46, the file input with `capture`, the refusal screen with the chosen file's preview, A63.8),
  `start-fitting` (the photo picker, the start
  request, the waiting screen with its estimate, the limit and error cards), `regenerate-fitting`
  (the reasons sheet), `try-colour`, `fitting-room` (the hanger toggles, the slot rows' actions,
  the replace and remove toasts with «Вернуть»), `fitting-events`, `delete-fitting`,
  `compare-fittings` (the selection), `product-stubs` (the cart and favourites buttons of A33 with
  their toast).
- **widgets** (compose the features). `header` gains `FittingRoomButton` (the hanger with
  `CountBadge`, between «Избранное» and «Корзина»; on phones the only extra icon, A10) rendered
  inside the existing `<Suspense>` because it reads the session; `try-on` (the modal: the
  picker, the wait, the result of one item or a look with the colours, the stubs, the regeneration
  sheet, the limit and error screens, in one place that owns the flow's state), `fitting-room-drawer`
  (board 2), `product-gallery`, `product-buy-box`, `related-products`, `fitting-history`,
  `fitting-compare`, `my-photos`.
- **pages.** `_pages/product` (`app/products/[id]/page.tsx`, `generateMetadata`),
  `_pages/fittings` (`/customer/fittings`), `_pages/photos` (`/customer/photos`),
  `_pages/fitting-compare` (`/customer/fittings/compare`); `_pages/privacy` gets its paragraph on
  the fitting photos and results (A46). All but the product page are account
  pages inside `AccountShell` (0017), browser-only (U11) and `noindex` through the existing
  `/customer` layout; `robots.ts` already disallows `/customer`.
- **kit.** New: `CountBadge`, `ProgressBar`, `FileInput`, `Gallery`, `Sheet` (the mobile bottom
  sheet: the kit's `Drawer` from the bottom with a grip and no ×, A64), `StateCard`, `Notice`, `Chip`/`ChipGroup` (the reason chips), icons
  `Hanger`, `Sparkle`, `Camera`, `Upload`, `Download`, `Fullscreen`, `Refresh`, `Lock`, `Compare`.
  Each gets its `/ui-kit` section. `TryOnButton` is the kit's `Button` primary 56 with the sparkle
  icon and the states default, loading and disabled (A63.2), shown as a `Button` example; the
  hanger's tooltip uses the kit's `Tooltip`. The canvas's fitting-specific components
  (`PhotoPicker`,
  `TryOnLoader`, `ResultActions`, `ColorTryOn`, `LookItemRow`, `CompareView`, `PhotoTips`,
  `ConsentBlock`, `OutfitSlot`, `SavedPhotoCard`, `TriedOnNote`) live in their slices.
- **Personal data (A37).** A photo or a result renders only as `src` of `next/image`
  (`unoptimized`, no `priority`) or `<img>`; its container carries `mp-block`; no signed link in
  an attribute, a title or a data attribute; web's `instrumentation-client.ts` (its
  `beforeBreadcrumb`) and `shared/api/sentry-before-send.ts` drop breadcrumbs and events whose
  URL carries `X-Amz-Credential`, api's `sentry.options.ts` does the same for its spans;
  `strip-attributes.ts` is re-checked for the new pages.

## 8. The product page and SEO (#69, A22, A36, A40)

- `app/products/[id]/page.tsx` re-exports `ProductPage` and `generateProductMetadata` from
  `_pages/product/server`. The catalog part (the product, its related products, its category for
  the breadcrumbs) is read inside a cached function (`'use cache: remote'` with `cacheLife` from
  `PAGE_CACHE_REVALIDATE_SECONDS`, 0018 V15) through `cachedApiFetch`: no visitor address, no
  request id, no proxy secret; `await connection()` stays in the caller, inside `<Suspense>`.
  Everything about the visitor (the session, the quota, «Вы это примеряли», the fitting room's
  state of this product) is read in the browser (0017 U11, 0018 V2).
- A missing product, or one whose category is inactive (products have no flag of their own, A36),
  calls `notFound()`; the 404 page is the app's.
- `generateMetadata`: title «<Бренд> <название> — купить в Lamoda AI Fitting», description from
  the product's own description cut to 160 characters, `alternates.canonical`
  `/products/<id>`, Open Graph with the first photo; JSON-LD `Product` (name, image, brand,
  description, `offers` with the final price in RUB and availability from the variations'
  stock) and `BreadcrumbList`, rendered as `<script type="application/ld+json">` like 0014's.
- `sitemap.ts` gains the products: read page by page from `GET /products` with the same cached
  client, `lastModified` from `updatedAt`. The warm-up list (0018 V8) names the page's address
  source: the first products of every active category.
- The page's analytics: zone `product` (§9).

## 9. Analytics (A13, A43)

The `analytics` agent proposed the entries below under spec 0015's rules; the owner approves them
with this spec. They enter `catalog.ts` and `EVENTS.md` in the phase that ships their page
(photos in PR 2, the try-on and the history in PR 3, the product page in PR 4, the room and looks
in PR 5), each commit regenerating `EVENTS.md`.

- **Zones.** `product` («Страница товара», areas `buy-box`, `related`) and `fitting`
  («Примерка», areas `photos`, `try-on`, `result`, `room`, `history`, `fitting-toast`).
- **Events** (zone `fitting`): `Photo Uploaded` (`saved`, `source`, `place`, `first`),
  `Photo Refused` (`reason`, `source`, `place`, `first`), `Fitting Started` (`kind`, `source`,
  `items`, `repeated`, `with_prompt`), `Fitting Completed` (`conversion`; `kind`, `model`,
  `duration`, `counts_against_limit`, `repeated`), `Fitting Failed` (`kind`, `reason`, `model`,
  `duration`), `Fitting Refused` (`kind`, `reason`: `limit_reached | prompt_refused`). The
  results' events are sent when the tab first learns the status, once per generation per tab.
- **Elements.** `product`: `buy-box.add-to-cart` and `buy-box.favourite` (each with `tried_on`,
  the pitch's «cart after a try-on»), `buy-box.try-on` (`signed_in`), `buy-box.to-look` (`slot`,
  `action`), `buy-box.tried-on`, `related.card` (`position`), `related.add-to-cart`,
  `related.to-look`. `fitting`: `photos.upload`, `photos.camera`, `photos.set-default`,
  `photos.delete`, `try-on.photo`, `try-on.start`, `try-on.retry`, `try-on.close`,
  `result.download`, `result.fullscreen`, `result.try-colour`, `result.regenerate-open`,
  `result.reason`, `result.regenerate`, `result.add-to-cart`, `result.favourite-all`,
  `result.item-colour`, `room.open`, `room.fill`, `room.remove`, `room.undo`, `room.try-on`,
  `room.add-to-cart-all`, `room.clear`, `history.tab`, `history.open`, `history.repeat`,
  `history.compare`, `history.delete`, `history.choose-item`, `fitting-toast.open`,
  `fitting-toast.retry`. Properties are enums, numbers or booleans only: no id, link, text,
  measurement or anything about the person.
- **Changed.** `section` of `profile-menu.section` and `account-menu.section` gains `photos`
  (A19); `sdkPerVisit` goes from 10 to 14 (four more pages' views and heatmap clicks).
- **Budget.** 21.07 events per visit, 63 219 a month: 7.9 % of the free plan's 1 M, far below the
  80 % the rules allow.
- **Decided with A43:** `Fitting Refused` stays separate from `Fitting Failed`; no
  `Look Item Added` event (the hanger clicks and `Fitting Started` carry it); no `Product Viewed`
  (the SDK's page view covers it); a repeat sends `Fitting Completed` with `duration: 0` and
  `counts_against_limit: false`; the disabled «Поделиться» sends nothing; `buy-box.tried-on` and
  `room.fill` exist only if the note and the empty slot are clickable (they are, per the canvas);
  deletions are tracked on the confirming button, as `account-delete` does.

## 10. Environment, nginx and deploy (A4, A5, A31)

- **Variables** (each in `config/env.ts` with its spec, `.env.example` with a comment,
  `docker-compose.yml`'s `x-api-env`, `deploy/compose/app.yml` for the api and the worker):
  `OPENAI_API_KEY` (secret, empty = the fake provider; required in production by the api and the
  worker), `FITTING_MODEL` (`gpt-image-2`), `FITTING_VISION_MODEL` (`gpt-6-luna`),
  `FITTING_MONTHLY_LIMIT` (10, 1–1000), `FITTING_TIMEOUT_SECONDS` (180, 30–600),
  `FITTING_CHECK_TIMEOUT_MS` (4000, 1000–10 000; at most half of `REQUEST_TIMEOUT_MS`, checked at
  start, A45), `FITTING_PHOTO_MAX_BYTES` (20 971 520, at most 50 MB).
  `REQUEST_TIMEOUT_MS` is untouched: no route waits for the image model, only for the checks, and
  nginx buffers a request body before the api sees it (`proxy_request_buffering` is on by
  default), so a slow upload is not under it. Locally the `next dev` rewrite streams the body
  without that guarantee: a slow upload of a large file there may answer 503, which is accepted
  for development and will not surprise a local check.
- **`cd.yml`.** `OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}` in the `.env` writer and in the
  format check list (no spaces or shell characters); `deploy/README.md` gets `gh secret set
OPENAI_API_KEY --env production`, the model variables, the upload limit and the reachability
  check of `api.openai.com` from the server (a 403 with `unsupported_country_region_territory`
  means the route is the owner's decision, §12).
- **`scripts/check-web-bundle.mjs`.** The pattern `OPENAI_API_KEY` joins the list, with a test
  case.
- **nginx** (`deploy/nginx/templates/default.conf.template`): `location = /api/me/photos` with
  `client_max_body_size 20m` (`FITTING_PHOTO_MAX_BYTES` and this value move together), the same
  proxy settings and the api's 413 format; `client_body_timeout` stays 10 s (a 20 MB upload on a
  slow line is cut by nginx's pauses, 0006 F36: acceptable for a prototype, noted in
  `deploy/README.md`). `ci-deploy-check.sh` checks the location answers 413 above the limit.
- **Images.** `sharp` lands in the api image through `npm ci` in the builder stage (its platform
  binaries as optional dependencies); `api/Dockerfile`'s runtime stage copies `node_modules` as
  today, so nothing changes; `README.md` says a Mac with Apple silicon runs the api in Docker
  (linux/arm64 binaries), as now.
- **Sentry** (api): the ai client's spans are cut to method and origin; a failed generation sends
  the kind and the failure code, never the prompt or an image.

## 11. How each criterion is checked

- **AC1–AC4** (photos): database e2e of `POST /me/photos` with a real `sharp` run on fixture
  images (a good photo, each refusal through the fake provider's marker, a text file, a 21 MB
  body, a sixth photo); `DELETE` then `GET` of the signed link; web tests of the consent gate and
  the refusal screen; `ci-deploy-check.sh` for nginx; `qa-tester` on the chosen stack.
- **AC5–AC8, AC10, AC11** (try-on): the workflow e2e with stub activities (completed, failed,
  moderated, timed out, retried, cancelled); routes e2e (a colour already tried answers the
  existing result; the first regeneration free, the second paid); web tests of the screens with
  `fetchMock`; the socket e2e (a push to the own room only); `qa-tester` through the fake
  provider's delay; one real generation on production with the owner (A4).
- **AC9** (text refused): e2e with the fake prompt checker; on production with the owner, one
  harmless and one refused text.
- **AC12** (one generation per click): e2e of two parallel `POST /fittings` with the same body
  (one row), and of a second request after the first committed.
- **AC13–AC16** (room and looks): routes e2e (replace answers the replaced item, a category
  without a slot refused, distinct slots in a look); web tests of the drawer and the toggle;
  `qa-tester` on two browsers for the counter.
- **AC17, AC18** (history): e2e of the repeat (same fingerprint → same row, the counter unchanged;
  a deleted row → a new generation); web tests of the tabs, the compare page and the empty state;
  `qa-tester` in a second browser for AC17's «another browser».
- **AC19, AC20** (limits): e2e at the edge of `FITTING_MONTHLY_LIMIT` (set to 2 in the test),
  in parallel, after a failed generation, after a repeat, after a deleted result (still spent,
  A20); web tests of the disabled button and the caution colour.
- **AC21–AC24** (product page): web tests of the page with a stubbed api (render, 404, metadata,
  JSON-LD), the warm-up list check of 0018, the sitemap test; `qa-tester` on the page; the cache
  checked as 0018's AC3 is (a second request served from Redis, nothing of the visitor in it).
- **AC25–AC27** (realtime and safety): the socket e2e; a web test that renders a result and
  asserts no signed link outside `src` and `mp-block` on the container; `check-web-bundle`'s
  test for `OPENAI_API_KEY`; the env spec for production without the key.
- **AC28** (account deletion): the existing `DELETE /me` e2e extended with photos, generations
  and room items, then the bucket's listing of the user's folder empty after `deleteFiles`.
- **AC29** (analytics): `catalog.test.ts`'s exact lists and budget; web tests that each tracked
  element calls `track` with the declared properties.
- **AC30**: `npm run verify` after a clean install; the web image built in CI with no api.

## 12. Risks

- **GPT-Image-2 is slow and sometimes refuses.** Up to two minutes per picture; the timeout is
  180 s, and only a request that never reached OpenAI is sent again (A67): a 5xx or a timeout
  ends the fitting unspent, and the user starts it again. A refusal of an honest photo
  by the model's policy shows the moderation screen: measured with the owner on production, and
  `FITTING_MODEL` can switch to `gpt-image-2.5-sunburst` without a release.
- **The vision check is probabilistic.** «Refuse only when sure» and a malformed answer counting
  as ok keep honest photos through; a wrong refusal costs the user nothing (AC20). The texts of
  board 5 are fixed per reason. So the photo check is a quality filter, not the safety line: that
  is the moderation of the photo and of the result (A15).
- **OpenAI from Russia.** OpenAI does not list Russia among its supported countries and has
  blocked API traffic from unsupported regions since July 2024 (a 403
  `unsupported_country_region_territory`). The owner checks `api.openai.com` from the server
  before phase 2 starts (A4), so no generation code is written for a provider the server cannot
  reach; a 403 there stops the work until the owner decides on a route (0016 S7's risk: an
  intermediary, a server elsewhere), which is outside this spec.
- **Order of 0014 and 0018.** Phase 3 waits for both (A1, A22); phases 1 and 2 touch `CLAUDE.md`,
  `catalog.ts`, `account-sections.ts` and the access-markers lists, which 0014's branch touches
  too: the rebase is expected, and for `catalog.ts` (41 new elements) and the markers' lists it
  may be sizeable, so the close of phase 3 sets time aside for it.
- **`sharp` in the image.** Native binaries per platform; `npm ci` in CI and in the builder stage
  resolve them for linux/amd64. If `npm ci` needs an install script for them, the commit says so.
- **Request sizes.** Six JPEGs of ≤ 1536 px are about 2–3 MB per edits request, well under
  OpenAI's limits; the api's own `BODY_LIMIT` does not apply to outbound calls.
- **The counters' Redis as a message bus.** A channel holds no key, so the memory limit and
  `noeviction` do not touch it; a restart drops in-flight messages, which the waiting screen's
  polling covers (A44).
- **Checks inside requests.** A slow vision model makes uploads answer 503 (A45): the timeout and
  the model are settings; if production shows it often, the check moves into the workflow (a
  change of A45, not of the data).

## 13. Docs closed with the spec

- `CLAUDE.md`: the opening paragraph lists `0019-ai-fitting`; new sections for the ai module and
  its env, the photos route and its nginx limit, the fittings routes, the limit, the workflow,
  the push, the account's fifth section, the product page and its cache; the socket bullet's
  «rate limiting comes with the first real feature» stays (A35); the `socket.io-client` line
  says its range stays in socket.io's minor line, as `socket.io-parser`'s does.
- `README.md`: the fitting in «Что умеет», `OPENAI_API_KEY` in the quick start («пусто —
  заглушка»).
- `deploy/README.md`: the secret, the variables, the nginx limit, the reachability check.
- `specs/0016-ai-fitting/tasks.md`: the record of AC5–AC10, AC14 and AC15 from this spec's
  acceptance record; `specs/backlog.md`: the items of A42.
