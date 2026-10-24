# 0019 AI fitting v1: clarifications

Status: accepted (2026-10-21).

The owner's decisions for this spec. Ids `A1`, `A2`, … are referred to by the spec, the plan and
code comments. A1–A13 are the owner's decisions given with the task, A14–A19, A21 and A22 the
answers to the questions of the design review, A20 and A23–A45 the assumptions the main
session took where neither covered a fork («Assumption, owner to confirm», A3): each is confirmed
or changed at the phase's review; A20, A24, A26, A43 and A45 were confirmed at the review of PR 1,
whose decisions are A46 and A47 and the amendments of A2, A4, A20, A32 and A45. All decisions
below: owner, 2026-10-21, unless noted.

## Order and documents

**A1. One spec, four phases.** Items 1–4 of spec 0016's roadmap become this one spec instead of four
(0016 S20). Four phases, four pull requests of code after the documents' one, in this order:
photos → generation → the product page,
which closes issue #69 → try-on, looks and history. Phases 1 and 2 start at once; phase 3 starts
from a fresh `main` after spec 0014 (the catalog, whose cards lead to `/products/<id>`) is merged.
If 0014 is not merged by the end of phase 2, the work stops and the owner is told.

**A2. The owner reviews at phase boundaries.** Not after every task: for this spec the rule «after a
task, stop and wait for the owner's OK» (`CLAUDE.md`, «How work is done») is replaced. Inside a
phase: a task, then `finish-task` whole (`test-writer`, `verify`, `qa-tester`, the reviewers), then
its commit, then the next task. At the end of a phase: a clean install and `verify`, the push, the
pull request in the owner's format, then a stop with a summary: what was done, what the agents
found, which assumptions were taken. The review bot's rounds go through `apply-review`, one fix
commit and one push per round. Confirmed 2026-10-21 at the review of PR 1: this mode stays an
exception recorded here, since this is the first spec that uses it; whether `specs/principles.md`
and `CLAUDE.md` name it as an option is decided at the close of the spec.

**A3. A fork none of the decisions cover takes the most cautious option.** Less behaviour, nothing
irreversible; it is recorded here as «Assumption, owner to confirm» and listed in the phase's
summary. A fork that changes users' data, money or access stops the work for the owner's answer.

**A13. Analytics by the `analytics` agent.** The events and tracked elements of every phase's pages
are proposed by the agent under spec 0015's rules, the clicks on the cart and favourites stubs among
them (a metric for the pitch to Lamoda), and the owner approves them with this spec (`plan.md` §9).

## Product

**A5. Ten try-ons a month per user.** The size comes from the environment
(`FITTING_MONTHLY_LIMIT`, 10); the counter is visible. No overall budget fuse (0016 S13). Amended
2026-10-21 at the review of the documents: 10 instead of 20.

**A6. Regeneration: the first one per result is free.** «Хотите что-то поменять?» on a result makes a
new result; the first regeneration of each result spends nothing, the next ones spend a try-on
each. The canvas assumed every regeneration free («допущение — уточнить»); this decides it.

**A7. A repeat opens the last result.** The same photo, the same items and the same colours (and,
with A16, the same text) are a repeat: the last such result in the history opens, regenerations
included, and the limit is not spent. A deleted result is not a repeat.

**A8. Size, scene and measurements are not in this spec.** The size in the picture, the scene and
the garment measurement tables come in the next spec with their own design; 0016's AC12 and AC13
stay with it.

**A9. The product page's purchase is a stub.** «Добавить в корзину» and «В корзину» are stub
buttons: there is no cart; the Lamoda Club row is removed. «В избранное» and «Всё в избранное» on
the results are stubs too: there are no favourites. «С этим товаром выбирают» comes from the
catalog by a simple rule (items of other categories) with «Добавить к образу». Reviews, questions,
the model's measurements under the photos and the delivery terms are removed; the rating stays.

**A10. Mobile: only the fitting room's icon.** The header shows the «Примерочная» icon with its
counter; the canvas's tab bar is not built and goes to `backlog.md`.

**A11. A result that is ready while the user is elsewhere.** A toast «Примерка готова» with a link
on whatever page of the site is open (the socket of spec 0013 carries it); with the site closed, the
result waits in the history.

**A12. The fitting room lives on the server.** One per account, visible on every device, up to five
items, one per slot, as in the canvas. No guests (0013 N9): signed out, «Примерить» and «К образу»
open the sign-in window.

## Models and the key

**A4. OpenAI directly, one key, the models behind one adapter.** The generation runs on OpenAI's
Images API with GPT-Image-2 (0016 S7), the model chosen by a setting; the other two models of S7
(Gemini's Nano Banana, Seedream) are not connected in this spec: the adapter keeps a place for
another provider. The key is the environment variable `OPENAI_API_KEY` (OpenAI's own name): the
owner sets it in the working copy's `.env` and in the GitHub Environment `production`; it never
enters the chat and `.env` is never read. The variable goes through the deploy (the server's `.env`
is written from GitHub) and into `.env.example` with a comment. Tests and CI never call OpenAI: the
adapter is replaced by a fake, and the real model runs only where the key is set, that is on
production for users and, if the owner wants, once by hand before the merge. Before the first real
generation (the end of phase 2) the work stops: the owner is asked whether the key is set locally
and in GitHub, with the variable's exact name; then the first generation on production. The server
is in Russia, which OpenAI's supported countries do not include: before phase 2 starts the owner
checks that `api.openai.com` answers from it (`GET /v1/models` without a key: a 401 means it is
reachable, a 403 the region block), so no generation code is written for a provider the server
cannot reach; a 403 stops the work for the owner's decision on the route. Amended 2026-10-21 at
the review of the documents: OpenAI instead of fal.ai (the owner's choice; fal.ai's queue and
models are dropped from the plan); amended at the review of PR 1: the reachability check before
the start of phase 2, not before its merge.

**A17. Model: GPT-Image-2, no second provider.** `FITTING_MODEL=gpt-image-2` (the edits endpoint,
quality medium); `gpt-image-2.5-sunburst` (OpenAI's newer editing model) is the alternative the
setting can name without a release. A technical failure (a timeout, a 5xx) is retried on the same
model; there is no fallback to another provider. Amended 2026-10-21: the fallback to Nano Banana
went with fal.ai (A4). Amended 2026-10-23 by A67: a timeout or a 5xx of the generation is not
retried, since OpenAI may have billed it.

**A15. The photo check and the moderation go through OpenAI too.** The five refusal reasons of the
canvas (too dark, not full length, more than one person, a child, no person) are the answer of a
small vision model (`FITTING_VISION_MODEL`, `gpt-6-luna`) in JSON through the Responses API; the
photo and the result are also checked by OpenAI's free moderation endpoint
(`omni-moderation-latest`, the image categories sexual, violence and self-harm), and the generation
model's own refusal counts as moderation. The user's photo therefore reaches one more model;
neither check spends a try-on. The owner weighed the photo check only, and no external checks in
this spec. Amended 2026-10-21: OpenAI's endpoints instead of fal.ai's (A4).

**A16. The free-text fields stay, behind a safety check.** «Пожелания к образу» (200 characters, the
fitting room) and the regeneration comment (300) are kept. Before a generation the text goes
through the moderation endpoint (all its text categories) and is classified by the same small
model as the photo check (A15) with a fixed system prompt: allowed are wishes about the fit,
the styling and the chosen items; refused is anything about other people, nudity, minors, violence,
politics or anything unrelated to the try-on. A refused text answers 400 with the error code
`PROMPT_REFUSED` (a code of its own, with its Russian text in web) and spends nothing; an allowed text enters the prompt only as a quoted «the user's
wishes» block after the fixed instructions, and the result still passes the NSFW check (A15). A
different text is a different try-on for A7. The owner weighed chips only, with no free text.

## Design review (answers of 2026-10-21)

**A14. «Поделиться» is shown disabled.** The button stays on the results and in the history as in
the canvas, inactive; the public link with its revoke goes to `backlog.md` («Share link of a
result»). The owner weighed the public page in phase 4, and sharing the file through the browser.

**A18. Slots by category.** `categories` get a `slot` column (top, bottom, outerwear, shoes,
accessory, or none), set by a migration for the demo catalog: t-shirts, hoodies and dresses → top;
jeans → bottom; outerwear → outerwear; shoes → shoes. The accessory slot is shown empty with its
caption (there is no accessories category); a product of a category without a slot shows no
«К образу». The owner weighed a sixth «dress» slot that empties top and bottom, and a room without
slots.

**A19. «Мои фото» is a fifth account section.** `/customer/photos` after «Мои примерки» in
`shared/config/account-sections.ts`, the account's menu, the header's profile menu and the
analytics enum `section` (this supersedes 0017 U5, U6 and U14 on the number of sections; 0017's
files stay as they are). The owner weighed a tab inside
`/customer/fittings`.

**A21. The old routes: the writes of sessions close, the rest stays.** `POST` and `PATCH
/fitting-sessions` become `@Closed()`: the server keeps one active fitting session per user and
creates it itself at the first try-on, which is the per-user limit backlog «Fitting sessions per
user» (0013 N39) asked for. The reads and deletes of `/fitting-sessions` and the routes of
`/ai-generations` stay as they are; removing them goes to `backlog.md`. The owner weighed removing
them in phase 2 and leaving them untouched.

**A22. Phase 3 after spec 0018's PR 2.** The product page's catalog part is read through the page
cache (`'use cache: remote'`, 0018 V15) and the page names where its warm-up addresses come from
(0018 V8), so phase 3 starts once 0018's page cache (its T7) is on `main`, after 0014 as A1 says. If
it is not by the end of phase 2, the work stops and the owner is told. The owner weighed building
the page without the cache and letting 0018 add it.

## Assumptions, owner to confirm

**A20. The month's spend is kept apart from the results.** Counting the limit from the history's
rows would let a deleted result (A25) give its try-on back. A table `fitting_quota` (`user_id`,
`month`, `used`) holds the spend: the start transaction locks the user's row, refuses at the limit
and adds one; a generation that fails, is refused or times out takes one back (A26); a deleted
result changes nothing. `GET /me/fitting-quota` reads it. Taking one back is idempotent: the
workflow's `complete` moves the row out of `pending`/`processing` with a conditional update and
takes the unit back in the same transaction only when that update changed the row, so a retried
activity changes nothing. Added 2026-10-21 at the review of the documents; amended at the review
of PR 1 (idempotency).

**A23. The active fitting session holds the generations.** A try-on belongs to the user's one
active `FittingSession` (0002 C15), which the server creates at the first try-on; `ai_generations`
also gets `user_id` so reads need no join. The closed route keeps 1–20 products
(`MAX_GENERATION_PRODUCTS`); the new route takes 1–5 (A12).

**A24. A one-time photo is a transient saved photo.** With the save switch off the upload stores
the photo like a saved one (its own row and key, A31) but marked transient: it is not among the
five, not shown in «Мои фото», and the generation that uses it deletes it when it ends; one left
unused is deleted after an hour by the housekeeping schedule. So `POST /fittings` always takes a
`photoId`, the server names every key, and the fingerprint (A7, A32) works the same for both kinds.
Every generation references its photo by `photo_id`: no snapshot per generation, `user_image_key`
becomes nullable, and deleting a photo keeps the results (the canvas: «Результаты примерок в
истории останутся»). This resolves the retention item of backlog «Photo upload limits»: there are
no old snapshots to expire. Amended 2026-10-21 at the review of the documents: one description
instead of three.

**A25. Deleting a history entry is a hard delete.** The row goes with its product links, the files
through `deleteFiles`; a deleted result is therefore never found as a repeat (A7), and the try-on
it spent stays spent (A20). No soft delete.

**A26. The limit is a calendar month in Moscow time.** The renewal date is the first of the next
month («снова с 1 ноября»). A try-on reserves its unit in `fitting_quota` (A20) inside the start
transaction, with the user's
row locked, so two parallel starts cannot pass the limit; a generation that fails, is refused or
times out releases it, a completed one keeps it; the first regeneration of a result is free (A6).

**A27. Progress is an estimate.** OpenAI's Images API answers when the picture is done and gives
no progress. The waiting screen shows the canvas's stages by the elapsed time against the median
duration of the user's last completed generations (25 s before any) and a percent capped at 95
until the result is there; the estimate of the time left comes from the same median.

**A28. One call per generation, with heartbeats.** A Temporal activity makes the one synchronous
call to the edits endpoint with the generation's time limit as its timeout, heartbeating on a timer
while it waits; a cancellation aborts the request. No webhook and no polling exist for this API.
Amended 2026-10-21: replaces fal.ai's queue polling (A4).

**A29. Images go to OpenAI as files in the request.** The photo and up to five product photos are
re-encoded to JPEG of at most 1536 px and sent as the multipart `image[]` fields of the edits
request (data URLs for the checks); no signed link of the bucket leaves the project, and the local
stack works without a public bucket.

**A30. «Сделать фото» is the file input with `capture`.** The same input with `capture="user"`
opens the camera on a phone and the file picker elsewhere; no `getUserMedia`.

**A31. Photo limits.** JPG, PNG and WebP up to `FITTING_PHOTO_MAX_BYTES` (20 MB); HEIC is not
accepted (iOS converts to JPEG when the input's `accept` leaves HEIC out, as the canvas's «HEIC» is
dropped from the hint); `sharp` re-encodes to WebP of at most 2048 px and drops the metadata; at
most five saved photos, the first saved one is the default. The nginx limit of 20 MB applies to the
upload route only (0006 F12).

**A32. Twice the same click starts one generation.** `POST /fittings` finds a running generation of
the user with the same fingerprint (photo, items, colours, text) and answers it instead of starting
another; a request retried after the request timeout meets the committed row the same way (backlog
«Long writes after a timeout»: the route answers at once with the row, the work runs in the
workflow). web disables the button while its request runs. The lookup before the transaction is
only a fast path: it is repeated inside the start transaction after the user's row is locked, so
two parallel requests cannot both insert, and a partial unique index on `(user_id, fingerprint)`
over the running statuses guards it in the database. Amended 2026-10-21 at the review of PR 1
(the race of two parallel requests).

**A33. The stubs' behaviour.** «Добавить в корзину», «В корзину», «Всё в корзину», «В избранное»
and «Всё в избранное» are enabled, send their tracked click and show the toast «В прототипе нет
корзины и избранного»; the favourite toggle does not stay pressed. The rating shows the stars and
the number, with no review count (the schema has none). «Таблица размеров», «Идёт размер в размер»
and «Размер на модели» are not rendered (A8).

**A34. The failure toast too.** The canvas's toast of a failed generation («Примерка … не удалась.
Лимит не списан.», «Повторить») is sent through the same push as «Примерка готова» (A11).

**A35. A revoked session keeps its socket.** The push carries only ids and a status, no personal
data, so the trust of 0013 N36 stays as it is and the backlog item «A revoked session on an open
socket» is not taken; the socket joins the user's room at the handshake. Clients send the gateway
nothing new, so the socket rate limit of 0001 B12c still waits for a feature that reads client
messages; «CONNECT packets per connection» stays in the backlog as well.

**A36. «С этим товаром выбирают».** The six newest products of other active categories that have a
slot (products have no active flag of their own; a product of an inactive category is «inactive»),
the product itself left out; cached with the page's catalog part.

**A37. Signed links stay out of reports.** A photo or result renders only as an image's `src`;
Sentry's breadcrumbs drop URLs with `X-Amz-Credential`, Mixpanel's recording keeps blocking images
and the containers get `mp-block` (backlog «Signed links in reports», taken).

**A38. An outbox for file deletions.** Before the first user's file (backlog «Outbox for file
deletion», 0013 N37): a delete writes its folders into `file_deletions` in its own transaction,
`FileDeletion` starts the workflow after the commit and marks the row, and a Temporal schedule
starts the rows left unstarted every ten minutes.

**A39. Heartbeats.** The generation's activities and `deletePrefix` heartbeat with a heartbeat
timeout, so a cancelled workflow stops a paid call and a dead worker is noticed (backlog
«Heartbeats for long activities», taken). «Temporal history backup» stays in the backlog.

**A40. The product card keeps taking its address.** `CatalogProductCard` keeps its `href` prop
(0009 K15); the pages build `/products/<id>` as spec 0014 does (backlog «Product card link»,
closed by phase 3 with no change to the card).

**A41. Not in this spec.** Cropping a photo («Обрезать это фото»), reporting a wrong check
(«Мы ошиблись? Сообщить»), comparing as an overlay («Наложением»; «Рядом» is built), the avatar
teaser («Создать свой аватар · скоро», not rendered) and the tab bar (A10) go to `backlog.md`.

**A44. The push travels through the counters' Redis.** The worker publishes a finished fitting on a
pub/sub channel of `REDIS` (the rate-limit counters' instance), not of `REDIS_CACHE`, which 0018
V4 keeps for caches only. A channel holds no key, so `noeviction` and the memory limit do not
apply; readiness already depends on this Redis; a lost message costs nothing (the waiting screen
polls). `CLAUDE.md`'s sentence on the two Redis gains the channel at the phase's close. Added
2026-10-21 at the review of the documents.

**A45. The checks inside a request have a short time limit.** The photo check runs inside `POST
/me/photos` and the text check inside `POST /fittings`, both under `REQUEST_TIMEOUT_MS`. Each
check's calls (the vision model and the moderation endpoint) run in parallel under one deadline,
`FITTING_CHECK_TIMEOUT_MS` (4000) for the whole check; a check that does not answer in time
makes the request answer 503 `SERVICE_UNAVAILABLE`, nothing stored, so the user retries. The
upload's own time is not under `REQUEST_TIMEOUT_MS`: nginx buffers the request body before the
api sees it (`proxy_request_buffering` is on by default), so the handler's 10 s hold `sharp`, the
check and the bucket write, and the api refuses to start when the check's deadline is above half
of `REQUEST_TIMEOUT_MS`. Moving the photo check into the workflow (an asynchronous «checking»
status) was weighed and left as the fallback if production shows 503s: the canvas shows the check
during the upload. Added 2026-10-21 at the review of the documents; amended at the review of PR 1
(the calls in parallel, one deadline).

## Analytics

**A43. The entries of `plan.md` §9, with the agent's ten questions answered the cautious way.**
Six events and forty-one elements as proposed; `Fitting Refused` stays apart from `Fitting
Failed`; no `Look Item Added` and no `Product Viewed` (the hanger's clicks, `Fitting Started`
and the SDK's page view carry them); `tried_on` on the purchase stubs and `signed_in` on
«Примерить» stay (the pitch's «cart after a try-on»; page state, not the person); a repeat sends
`Fitting Completed` with `duration: 0` and `counts_against_limit: false`; the disabled
«Поделиться» sends nothing; `buy-box.tried-on` and `room.fill` stay since the note and the empty
slot are links in the canvas; the api answers the model's short name so `model` can be a property;
`section` gains `photos` and `sdkPerVisit` becomes 14; deletions are tracked on the confirming
button. Confirmed 2026-10-21 at the review of PR 1 (A13).

## Review of PR 1 (2026-10-21)

The review bot's notes on the documents; the owner's answers are A46, A47, the amendments of A2,
A4, A20, A32 and A45, and the split of T14 in `tasks.md`.

**A46. The consent names OpenAI, and `/privacy` describes the fitting photos.** The processing
consent of the first upload (AC2) says that the photo is sent to OpenAI (USA) for the check and the
generation and is not used for training; the page `/privacy` (0008) gets a paragraph on the
fitting photos and results: what is stored, where it goes, when it is deleted (phase 1, T7).
Rejected: a general consent text with no provider named and `/privacy` unchanged.

**A47. A cancelled generation stays spent.** `DELETE /fittings/:id` of a running generation cancels
the workflow and keeps the try-on spent: the model call may already have been made, and a free
cancel would let a user cancel before the result and retry at no cost. web offers no deletion of a
running
generation; the api answers 204 as for a finished one. Rejected: taking the unit back on a cancel.

## Phase 1 work (2026-10-21)

Forks met while coding, taken the cautious way (A3): «Assumption, owner to confirm», listed in
the phase's summary. The owner confirmed A48, A50, A51 and A52 on 2026-10-22 and amended A49.

**A48. The check deadline's bound is checked at the server's start, not in the schema.** The
rule of A45 (`FITTING_CHECK_TIMEOUT_MS` at most half of `REQUEST_TIMEOUT_MS`) lives in
`assertServerEnv`, which `server.ts` runs in every environment, not in the zod schema: the
schema's floor of 1000 ms would otherwise refuse the e2e that lower `REQUEST_TIMEOUT_MS` to 100
or 200 ms (spec 0006, 0013), and the worker has no requests to bound. Assumption, owner to
confirm (T3).

**A49. Only production reaches OpenAI.** `createAiProvider` returns `OpenAiProvider` only with
`NODE_ENV=production` and a key; development, tests and CI get `FakeAiProvider` whatever key the
environment holds, and a key set outside production is ignored with a warning at start. So a key
left in a shell or a local `.env` can never make a local stack or Vitest reach OpenAI (AC27), and
the real model runs only on the site: the local check by hand with a real key that A4 and the
spec's owner actions allowed is dropped; the first real generation is the one on production after
the merge of phase 2. Decided by the owner on 2026-10-22 (the assumption of T3, «tests always get
the fake, development with a key the real one», was narrowed to production only).

**A50. A malformed text classification counts as allowed.** As the photo check's malformed
verdict counts as ok (plan §3), a verdict of the text model that cannot be read counts as allowed
with a warning: the safety line of a wish is the moderation endpoint (A16) and the result's
moderation (A15), the classification keeps the prompt on topic. The warning names the answer's
`status` and incomplete reason, so a cap too low for a reasoning model shows in the log.
Assumption, owner to confirm (T3).

**A51. The deploy check starts the production image with a placeholder key.**
`scripts/ci-deploy-check.sh` sets `OPENAI_API_KEY=deploy-check-openai-api-key`, since the
production api and worker refuse an empty one (AC27); with it the real provider is built, and the
check calls no route or workflow that reaches OpenAI. The production values of `FITTING_*` are
the defaults of `deploy/compose/app.yml` and `worker.yml`, changed by a commit, not GitHub
variables; `cd.yml` passes only the key. Assumption, owner to confirm (T3).

**A52. One deadline and one retry layer per call, chosen by the caller.** `AiCallOptions` carries
`timeoutMs` (an activity's budget instead of `FITTING_CHECK_TIMEOUT_MS`, which is a request's,
A45) and `retry` (false leaves the repeats to the activity's retry policy, plan §4, so a paid
generation runs once per attempt); a cancelled activity rethrows its signal's reason. Which of the
two the `generate` activity uses is decided at T10/T11. Assumption, owner to confirm (T3, from
the temporal review).

**A53. The fake provider refuses a photo by its colour.** The photo check runs on sharp's WebP
(plan §5), where no byte of the upload survives, so the byte marker `refuse:<reason>` (plan §3)
cannot reach it through `POST /me/photos`. The fake provider therefore also reads a solid-colour
image as a refusal, one colour per reason (`REFUSAL_COLOURS` in `ai-provider.ts`: black `dark`,
red `not_full`, green `many_people`, blue `child`, yellow `no_person`, magenta `moderation`); a
real photo is never one colour, so an honest one passes. The e2e and a check by hand make such
images with `api/test/support/photos.ts`; the text marker stays for prompts and for a check called
with raw bytes. Assumption, owner to confirm (T4).

**A54. The upload's order and its transaction.** `POST /me/photos` counts the saved photos
before any model call (a sixth saved one is 409 `LIMIT_REACHED` without spending a check), then
runs sharp, then the check, then one transaction that locks the user's row (`SELECT … FOR UPDATE`;
no row is 401, as `/me`), counts again (final, A31), writes the object into the bucket and then the
row. The object is written inside the transaction under its own limit of 3 s (`PUT_TIMEOUT_MS`,
below the transaction's 5 s), so a failed or slow bucket write is aborted and leaves no row and, as
a rule, no object (an abort between the body sent and the answer may leave one), answered 503; a
row that fails after the write (a database rule) leaves an object too. Such an object is cleared
by the user's folder deletion (spec 0011 M7). The user's row is also read before the check, so a
gone user costs no model call. The first saved photo, or the first after the default was deleted,
is the default. Assumption, owner to confirm (T4; the write's limit and the early read from the
code review).

**A55. The upload's refusals.** A missing `photo` part, a body that is not `multipart/form-data`
and a file that is not a readable JPG, PNG or WebP (HEIC, GIF, SVG, TIFF, a truncated image, one
decoding to over 50 megapixels) all answer 400 `VALIDATION_FAILED` with the detail
`IS_IMAGE` on `photo` (AC4: one text for the user, «Нужно изображение JPG, PNG или WebP»); a
part other than `photo` and `save` answers `WHITELIST_VALIDATION`, as the DTOs do, and a `save`
other than `true`/`false` answers `IS_BOOLEAN`; a body busboy cannot parse answers
`VALIDATION_FAILED` «The body cannot be read», as body-parser's errors do. A refusal of the check
is the detail `PHOTO_REFUSED` on `photo` with the reason in its message («photo was refused:
child»), the moderation's one included; its text «Фото не подходит для примерки» is the fallback,
the screens of board 5 read the reason (T7). `LIMIT_REACHED`'s text: «Достигнут лимит, больше
добавить нельзя». A check that fails for any other reason than its deadline (OpenAI down, a
refused key) answers the same 503 as a timeout, with nothing stored. Accepted for the prototype
(from the reviews): an upload holds its 20 MB in the api's memory while it is read, and a PNG or
WebP of up to 50 megapixels (a 48 MP phone photo) decodes to about 150 MB for the time of the
request; the `expensive` tier limits one address, not the process, so many addresses at once can
fill the container's memory (a semaphore as the facet slots' is the fallback). Assumption, owner
to confirm (T4).

**A56. The upload signs a gone user out.** `POST /me/photos` goes through the same
`signOutWhenGone` as `/me` (0013 N31, N38): a deleted user's cached session gets 401 with the
session cookies expired. Plan §5 did not say; the helper moved from `MeController` to
`me/sign-out-when-gone.ts` for both controllers. Assumption, owner to confirm (T4).

**A57. The deploy check's upload checks.** `ci-deploy-check.sh` sends a 2 MB body to
`/api/me/photos` and expects the api's 401 (nobody signed in; the body is not read), which shows
nginx let it through, and a 21 MB body, which nginx refuses with 413 in the api's format; `/api/`
keeps its 1 MB check. Assumption, owner to confirm (T4).

**A58. The full `verify` runs once per phase.** Inside a phase a task ends with `typecheck`,
`lint` and the task's own tests (the unit specs and the database e2e it touched, as `test-writer`
runs them), not with the whole `npm run verify`: here it takes 6–8 minutes, needs this copy's
api, web and worker stopped (Docker on the Mac is at its limit; the stack was OOM-killed during
T4), and at T4 four runs found only the rebase's leftovers. The full `verify` runs at the end of
the phase, after the clean install, and in the pre-push hook, so nothing reaches the pull request
unchecked; a breakage between tasks is then fixed once, before the push. `test-writer` and the
reviewers stay per task: the tests of a task guard it while the next one changes the same module
(T4's found two bugs before T5–T7 built on them). `qa-tester` runs once per phase, at its last
task, on the phase's acceptance criteria as a whole (phase 1: AC1–AC4 at T7), since the tasks of
a phase overlap in what it checks and its runs are the heaviest on the stack. Decided by the
owner on 2026-10-22, during T4; the brief of `spec-finder` stays per task (a brief for the whole
phase would be loaded again in every task's session).

**A59. The photo routes and the outbox's details.** Where plan §4–§5 did not say, T5 took the
cautious side. `GET /me/photos` lists the saved photos oldest first (the order they were uploaded,
the id second), a gone user gets an empty array (0013 N31: a read finds nothing). `PATCH
/me/photos/:id` takes `{ isDefault: true }` only (`false` is refused with the detail `IS_IN`, an
existing code): the default is moved, never cleared. `DELETE /me/photos/:id` makes no other photo
the default; the next saved upload is (A54), so after deleting the default a user with other
photos has none preselected until they choose or upload one. A transient photo is invisible to all
three routes (404 on PATCH and DELETE, as another user's or a missing one): it belongs to its
generation and the housekeeping. PATCH and DELETE lock the user's row as the upload does (a gone
user is 401 with the cookies expired, A56; two changes of the default at once cannot both pass the
one-default index). A photo's deletion goes through the outbox with its key as the prefix:
`isDeletablePrefix` accepts a folder of 0011 M7 or one photo's key, and `deletePrefix` lists the
bucket by it, so the key's file name must be exactly `<uuid>.webp` (`isUserPhotoKey`): a shorter
name would also match the keys it starts (from the security review). A failed workflow start is a
warning in the log, not a Sentry event (0011 M32 reported a loss; now the schedule starts the row
within about eleven minutes, and a Temporal outage shows in `/health/ready`); a deletion the
workflow could not finish (a refused prefix, M33) keeps its row with `startedAt` set as the trace,
and the schedule does not restart it. The housekeeping takes 100 rows of each kind per run, leaves
outbox rows younger than a minute to the api that wrote them, and starts `deleteFiles` from an
activity through the worker's own client (`Context.current().client`) with the api's id and
`USE_EXISTING` (a child workflow cannot take that policy); one row whose start keeps failing stops
none of the others (the run fails after every batch, as `deleteFiles` does, M33), and the run's
timeout is 8 minutes, below the interval, so a cut run never makes the next one skipped.
`deletePrefix` heartbeats before each request to the storage under a heartbeat timeout of 1 minute
and a `startToCloseTimeout` of 10 minutes (one request ends within 45 s by the client's own
limits, 15 s times its three attempts, so the timeout fires only for a dead worker; a long folder
that heartbeats is no longer cut at 30 s). Assumption, owner to confirm (T5).

**A60. The photo screens and their analytics in detail.** The texts follow the canvas's boards 4,
5 and 10; the tips are two lists without the canvas's example photos (web keeps no files of its
own), the refusal screen shows no preview of the refused photo and no «Примерка не списана» line
(no fittings in phase 1), and the crop, «Мы ошиблись? Сообщить» and the avatar teaser are not
rendered (A41). The consent is a `localStorage` key per user, `fitting-photo-consent:<userId>`,
written when a file is chosen with both boxes checked, so another person signed in on a shared
device gives their own (the owner chose it over plan §7's one per browser at the security review,
2026-10-23); the processing consent reads «Даю согласие на обработку фото
для примерки: фото передаётся в OpenAI (США) для проверки и создания примерки», and the line
under it says the photos are not used for training and links `/privacy`. A file over 20 MB is
refused in the browser before its upload. At five saved photos the upload button is off with a
note, the api's `LIMIT_REACHED` stays the backstop; «Удалить» and «Сделать основным» are text
buttons, not the canvas's icon. Upload, default and delete are `useMutation`s with no retry and
`gcTime: 0` (amended 2026-10-23: the example photos, as the canvas's pictograms, the refused
photo's preview and board 10's controls return by A63.8); a 404 of the last two (the photo deleted
elsewhere) reads the list again without an
error. Analytics (plan §9 named the entries, not their values): `Photo Uploaded` (`saved`
boolean, `source` `file`/`camera`, `place` `photos` (the try-on adds its value in phase 2),
`first` boolean: the upload that gave the consents), `Photo Refused` (`reason` the api's codes
plus `other`, `source`, `place`, `first`), elements `photos.upload`, `photos.camera`,
`photos.set-default`, `photos.delete` (the confirming button), `sdkPerVisit` 12 → 13 for the one
page. The CSP's `img-src` takes `<origin>/<bucket>/keep/users/` from web's own
`S3_PUBLIC_ENDPOINT` (set to `S3_ENDPOINT` in production, whose host signed links carry there) and
`S3_BUCKET`: a path, not the storage's whole origin, which every client's buckets share. web's
Sentry drops spans and breadcrumbs holding `X-Amz-` or `/keep/users/` (the browser's tracing names
a span after each image with its whole link, A37). Assumption, owner to confirm (T7).

**A61. A broken body of a successful answer is not retried.** The OpenAI client retries a network
error before the answer's headers, but a body of a 200 that breaks while it is read is answered at
once as `malformed_answer` (the caller's 503), not retried: in phase 2 the same client calls
`/v1/images/edits`, where a retry after a 200 would pay for a second image. Revisited with the
generation's activity retries in phase 2. Decided by the owner on 2026-10-23 (review of PR 2).

**A62. The canvas's details per phase.** On 2026-10-23, after phase 1 merged, the canvas was read
board by board against this spec, the plan and the tasks. Boards 2–12 and the components of board
13 were already in them; what follows are the texts and states the boards draw that the tasks did
not name. They are binding as the canvas's texts are (spec «Entry points, flows, texts and
states follow the canvas»), with the sample numbers replaced as «Canvas and decisions» says.

- _Board 3, the picker (T15):_ the subtitle «Изображение приблизительное: модель ещё учится»; the
  photo with the lock plate «Видите только вы»; the strip of saved photos with the badge «По
  умолчанию» on the default one (the boards say «по умолчанию» and «основное»: one word, the one
  `PhotoThumb` already shows on «Мои фото»), the tile «+ Новое», and the link «Управлять» to «Мои
  фото»; the switch «Сохранить фото для следующих примерок» with its caption on («Касается нового
  фото. Выключите — фото используется один раз и удалится после примерки») and off («Выключено:
  фото используется один раз и удалится после примерки. Результат останется в истории»); the state
  3.3 while a new photo uploads («Загружаем и проверяем фото…» over the dimmed photo, «Примерить»
  disabled); the `LimitMeter` «Осталось N примерок в этом месяце»; the line «Фото не используются
  для обучения моделей · Как мы храним фото» linking `/privacy`; for a look (3.2, T26) the
  `ItemsStrip` with «Образ · N вещей», the sum, the link «Изменить» to the room and the meter text
  «Образ целиком — 1 примерка · осталось N».
- _Board 5 in the try-on (T15):_ the refusal screens gain the notice «Примерка не списана · осталось
  N» (phase 1 has no quota); the reason texts of A55 and T7 stay.
- _Board 6, the wait (T15):_ the loader is the user's photo blurred with the sweeping dots
  (`TryOnLoader`; no animation under `prefers-reduced-motion`); the stage list «Проверили фото»,
  «Определили позу и фигуру», «Надеваем <вещь>», «Прорисовываем детали» (done ✓ / current with a
  spinner / next in grey) on desktop, the current stage alone on phones; the percent and «Осталось
  около N секунд»; the notice «Можно закрыть страницу — результат сохранится в истории. Пришлём
  уведомление, когда будет готово.»; the button «Закрыть и продолжить покупки» (phones: «Свернуть»);
  the toast «Примерка готова: <вещь>» with the item's thumbnail and «Открыть»; for a look the
  `ItemsStrip` under the progress.
- _Board 7, the result (T15):_ the `AiLabel` «Сгенерировано ИИ» on the image and the caption
  «Изображение приблизительное, могут быть неточности в посадке, длине и цвете.» under it; the line
  «Сохранили в историю примерок · <date>» (the link opens the history); the four `ResultActions`
  tiles «Поделиться» (disabled, A14), «Скачать», «Во весь экран», «К образу»; the item block with
  the size select and the stubs (A33); `ColorTryOn` «Примерить другой цвет · в один клик, на этом же
  фото» with the states current (outlined), tried (a ✓ badge, «Уже примерено»: opens at once, free),
  generating (a spinner over it, the other colours disabled with «Пока идёт примерка, другие цвета
  недоступны») and the caption «Новый цвет — 1 примерка. Цвета с галочкой уже примерены: откроются
  сразу и бесплатно.»; while a colour generates the meter says «Списали 1 примерку · осталось N» and
  a line «<Цвет> вариант сохранён в истории»; the link «Примерить на другом фото» back to the
  picker; the button «Хотите что-то поменять в образе?» (the same label on boards 7 and 8; A6
  quotes it short) opening the sheet «Что поменять?» («Отметьте, что
  получилось неточно — учтём при новой попытке.», the chips «Лицо», «Фигура», «Вещь», «Фон»,
  «Другое», the comment «Комментарий, по желанию» with «N / 300», the button «Перегенерировать» and
  the caption «Новый результат появится отдельной записью в истории.» followed by A6's wording of
  the cost).
- _Boards 11 and 12 (T15):_ «Примерить» disabled with the caption «Примерки снова будут доступны
  <date>» (the buy box) or «Примерки закончились · снова с <date>» (phones); the limit card
  «Примерки на этот месяц закончились» / «Новые N примерок появятся <date>.» / «История и
  примерочная работают как обычно: можно смотреть прошлые результаты и собирать образ заранее.»
  with the buttons
  «Открыть историю примерок» and «Перейти в примерочную», on phones a meter «0 из N»; the error card
  А (a timeout) «Не получилось примерить» / «Сервис примерки не ответил вовремя. Так бывает при
  большой нагрузке — попробуйте ещё раз через минуту.» with «Попробовать ещё раз» and «Закрыть»,
  the card Б (moderation) «Не можем показать результат» / «Изображение не прошло автоматическую
  проверку. Чаще всего помогает другое фото — в полный рост и в простой одежде.» with the grey
  plate «Результат скрыт» in the image's place and the buttons «Попробовать ещё раз» and «Другое
  фото»; both with the notice «Примерка не списана · осталось N».
- _Board 9, the history (T16, T27):_ the subtitle «N примерок · фото видите только вы»; the tabs
  «Все», «Одна вещь», «Образы»; a card with the small «ИИ» badge, up to three item thumbnails and
  «+N», the kind badge «Образ» or «Перегенерация», the item and colour for one item, the date
  («Сегодня, 14:06», else the day); the actions menu «Открыть», «Примерить ещё раз», «Поделиться»
  (disabled), «Скачать», «Удалить» (red); the selection mode «Выбрано N из 2» with «Отмена» and
  «Сравнить»; the toast of a repeat «Такая примерка уже есть — открыли готовый результат. Лимит не
  потрачен.» with «Открыть»; the `LimitMeter` under the side menu of `widgets/account-shell`
  («Осталось N из M примерок», «Обновится <date>»); the empty state «Здесь появятся ваши
  примерки» / «Каждый результат сохраняется автоматически: к нему можно вернуться, сравнить с
  другим или поделиться.» with «Выбрать вещь для
  примерки»; on phones the actions sheet (with «Сравнить с другой»); the compare page «← История
  примерок», «Сравнение», the two columns with «В корзину», «Открыть» and the favourite stub, the
  aside «Чем отличаются» (Цвет, Фото, Цена), on phones «Отличается» / «Фото» and the buttons «<Цвет>
  в корзину» per column.
- _Board 1, the product page (T20, T21):_ the `LimitMeter` under the buy box's buttons («Осталось N
  примерок в этом месяце»; at three or fewer «Осталось N — мало» in the caution colour, AC19; at
  zero «Закончились · снова с <date>»); after «К образу» the button reads «В образе» (pressed, a
  ✓); the toast «<Вещь> в примерочной: <слот>» with «Открыть»; `TriedOnNote` «Вы это примеряли» /
  «<date> · <цвет>» with «Смотреть»; the related cards carry the hanger and the heart as the
  catalog's do (A63).
- _Board 2, the room (T24, T25):_ the subtitle «N из 5 вещей · по одной в каждом слоте. Образ
  целиком — одна примерка.»; a slot row with the kind, the item, the price, the colour select and
  the size stub (A63), «В корзину» and «Убрать»; an empty slot with its caption («Слот свободен:
  сумка, шарф или головной убор» for the accessory) and the link «Подобрать в каталоге»; the
  `PromptField` «Пожелания к образу · по желанию» with the placeholder «Например: заправить рубашку
  в юбку, тренч накинуть на плечи», the caption «Учтём при генерации. Не меняет вещи и их цвета.»
  and «N / 200»; the footer «Сумма образа» with the sum, «Примерить образ», «Всё в корзину», the
  meter and «Очистить примерочную»; the replace toast «Заменили <слот>: <вещь> вместо <вещи>» with
  «Вернуть» for 5 s, the remove toast «<Вещь> убран из примерочной» with «Вернуть»; the loading
  state («Загружаем вещи…», skeleton rows, «Примерить образ» busy); the empty state «В примерочной
  пока пусто» / «Нажмите «Добавить к образу» на товаре — вещи соберутся здесь, и вы примерите их
  вместе за одну примерку.» with «Перейти в каталог» and a disabled «Примерить образ» (phones: the
  five dashed slot cells); on phones the colour sheet «Цвет <вещи>» with «Готово».
- _Board 8, the look result (T26):_ «Примерка образа», «N вещи · сохранено в истории · <date>»;
  three tiles (no «К образу»); «Вещи образа» with the caption «Смена цвета одной вещи перегенерирует
  весь образ на этом же фото» and a `LookItemRow` per item (thumbnail, name, price, `MiniSwatches`,
  «В корзину», the favourite stub; «один цвет» for an item with one); «Сумма образа»; «Всё в корзину
  · N вещи» and «Всё в избранное» (stubs); «Хотите что-то поменять в образе?» whose sheet adds the
  step «Какая именно?» with an item chip per item; the link «Заменить вещь в примерочной»; the
  inline state «Перегенерируем образ: <вещь> <цвет>» with the progress and «около N секунд · 1
  примерка»; on phones the `ItemsStrip`, «Вещи образа» as a screen of its own.
- _Hover (T15, T26):_ the canvas draws two hover states: the hanger `LookToggle` turns from grey to
  black with the tooltip «Добавить к образу» (board 13 says «К образу»: the longer one, as the
  button's label), and a `ResultActions` tile darkens to the tertiary background. The catalog card's
  own hover is A63's.
- _Board 14:_ the transition map matches the plan; its table «Когда тратится лимит» marks the
  regeneration «0 (допущение — уточнить)», which A6 decided: the sheet's caption says the first one
  is free and the next ones spend one try-on each.
- _Phase 1 against boards 4, 5 and 10:_ T7 cut, by A60, the example photos of the tips, the refused
  photo's preview and board 10's icon controls; A63 brings them back in T9a. The canvas's example
  «photos» are seven vector pictograms (SVG, 1.3–2.5 KB each, no raster, scripts or links), the
  canvas's assets `12f5a6ba…`, `cf994a3d…`, `ea627c52…`, `39c27dbd…`, `8bf2d6f8…`, `b258266e…`,
  `c633502c…` (in the order of board 4's captions), so they become inline SVG components in
  `features/upload-photo`, as the kit's icons are: web keeps no files of its own.

**A63. Decisions of the canvas review.** The owner decided on 2026-10-23:

1. _The catalog card carries both actions of the canvas:_ the hanger `LookToggle` in the photo's
   top left corner and the heart in its top right, so 0009 K10's one `action` slot becomes two
   corners. The heart is a stub (A33: enabled, tracked, the toast «В прототипе нет корзины и
   избранного», never stays pressed); the hanger opens the fitting feature (adds the item to the
   room, AC13). The card itself gets a hover on pointer devices (`@media (hover: hover)`): the
   kit's `--shadow-box`, as `SearchField` has, plus the photo scaled to 1.03 inside its frame,
   both over `--duration-slow` (the tokens zero it under `prefers-reduced-motion`). Lamoda's own
   hover (the sizes and a photo slideshow) has no data here.
2. _«Примерить» on the product page is board 13's `TryOnButton`:_ `Button` primary, size 56, with
   the sparkle icon, in the buy box and never over the photo; its states default, loading and
   disabled (the limit). «К образу» stays the outline button next to it. Board 1's secondary 40
   pair («Примерить» and «К образу» under «Добавить в корзину») is superseded.
3. _The room's slot rows show the canvas's size select as a stub:_ a `Select` with the sizes of
   the product's size attribute when it has one, else the placeholder «Размер», sent nowhere (A8
   keeps size out of the generation).
4. _The picker preselects the default photo_ (AC3), not the last used one as board 3's hint says;
   the hint «Последнее использованное фото выбирается автоматически» is not rendered.
5. _«Заменить запись» on the compare page is dropped._
6. _«Поделиться» stays disabled (A14):_ the share sheet of board 7.4 («Поделиться примеркой», the
   link's preview, «Скопировать ссылку», «Отправить в мессенджер», «Скачать изображение») is not
   built; it joins the backlog item «Share link of a result».
7. _«нет в наличии» on a colour (boards 2.2 and 13) is not drawn:_ the catalog has no stock.
8. _Phase 1's screens are brought to the canvas first thing in phase 2_ (T9a): the tips with the
   pictograms of A62, the refused photo's preview (from the chosen file, in the browser; «Фото
   скрыто» for `child`), «Мои фото» as `SavedPhotoCard` (the badge «По умолчанию», the radio
   «Сделать основным», the trash icon button «Удалить фото N», the dashed «Добавить фото» card with
   «в полный рост, один человек», the delete modal with the thumbnail; on phones rows and a sheet),
   and on phones the tips as a screen of their own with «Понятно» before the consent screen 4.2
   («Загрузите фото в полный рост», «Мы сохраним его, чтобы в следующий раз примерка шла в два
   нажатия. Фото видите только вы.»). The texts of A60 stay. The two corners and the hover of 1
   come with the product page (T21, the hanger inert there), the live hanger with T26.

**A64. One bottom sheet in the kit; spec 0020 runs alongside.** Spec 0020 (the catalog on phones,
its documents merged 2026-10-23) extends the kit's `Drawer` for its filters sheet (`fullHeight`,
`onBack`, `headerAction`, `closable`) and wants one form of the sheet (its W8). The owner decided on
2026-10-23: plan §7's `Sheet` is not a component of its own but the kit's `Drawer` with
`side="bottom"`, a grip and no × (`closable={false}`, the same prop and meaning as 0020's T6);
`Drawer` gains `description`, `media` (a picture left of the heading, board 10.2), `grip` and
`initialFocus` for it (T9a). The two specs run in parallel: whichever lands second on a shared file
(the kit's `drawer.tsx`, `icons.tsx` and `index.ts`, `/ui-kit`, `CatalogProductCard` with T21 vs
0020's T11, `analytics/catalog.ts` with its budget, `sdkPerVisit` and the monthly estimate
recomputed together) merges the other's change. Both use the same widths: phones below 600 px
(`PHONE_QUERY`, `@/shared/config`, for the browser's `useMediaQuery`; 0020 writes it in CSS), the
account shell and the filters sheet below 1024 px.

**A65. The fittings migration's open details (T9).** Plan §2 leaves these to the migration; the
owner confirmed them on 2026-10-23 and added the owner keys at T9's review: a generation's session,
photo and parent reference `(id, user_id)` of their tables (a unique key on each), so the database
refuses someone else's photo, result or session, and only `photo_id` or `parent_id` goes NULL when
the photo or the parent is deleted (`ON DELETE SET NULL (column)`); a row without `user_id` (the
previous release's) may have no photo and no parent (a CHECK), and its session keeps the plain key.
The keys do not follow an update of an owner (`ON UPDATE NO ACTION`), and the code writes the
four ids only as scalars, `userId` the principal's, never through Prisma's `connect`/`disconnect`
of these relations (which copy or clear `user_id`). The release that makes `user_id` NOT NULL runs
the same backfill from the session first.
`counts_against_limit` is `NOT NULL DEFAULT true`
(a try-on counts unless the start or `complete` says otherwise, A6, A20; the closed route's rows
spend nothing either way, since the spend lives in `fitting_quota`); `user_id` cascades from
`users`, as `session_id` already does through the session; `regeneration_reasons` defaults to an
empty list with a CHECK against NULL (the outbox's `prefixes` rule); `fingerprint` is lower-case hex
and `prompt_text` trimmed and not empty, by CHECKs; no trigger fills `user_id` on rows the previous
release inserts during a deploy (only its closed route writes any), while this release's closed
route writes its session's user, so the NOT NULL release needs no step in between; its rows keep
`kind` NULL. The old routes'
`AiGenerationResponseDto` lists its own fields only, so the new columns stay off
`/ai-generations` and `/fitting-sessions`; its `userImageKey` becomes nullable, and the closed
route's status check counts a stored failure code as `failed`'s reason. `constraint-fields.ts`
names the running-duplicate index by the fingerprint's inputs (`photoId`, `items`, `promptText`),
a colour's FK by `items` and the reasons' CHECK by `reasons` (`StartFittingDto` and the
regeneration's body, plan §5).

**A66. The image model's details (T10).** Plan §3 leaves these open. `AiProvider.generate(job)`
sends again only what never reached OpenAI (A67), and runs under `FITTING_TIMEOUT_SECONDS`
unless the caller names its own `timeoutMs`; the model's refusal (a 400 with `error.code`
`moderation_blocked` or `content_policy_violation`, or an answer with no image) is a result
`{ ok: false, reason: 'moderation' }`, not an error, and a timeout or any other failure is thrown
as `AiProviderError` for the activity to map (`model_timeout`, `provider_error`). The answer's
picture is checked only by `storeResult`'s sharp (T11): one it cannot read is `provider_error`.
A job carries 1 to 5 items (A29; both providers throw a plain `Error` before the request
otherwise, a caller's bug that T11's activity does not retry). A
regeneration's comment is its own field and its own prompt line after the wishes, so a
regeneration keeps the parent's wishes too; a fixed line after both says they never change the
person, the background or the items. The prompt tells the model to take only the item from a
catalog photo, never the person wearing it. The
fake provider's picture is the person's photo cut to 1024×1536, not a file under
`api/test/fixtures/` (plan §3): the dev image has no `test/`, and the local stack shows the user's
own photo as the result. A marker `fail:moderation`, `fail:provider_error` or `fail:timeout` in the
wishes or the comment gets that failure from the fake (the prompt check lets `fail:` through), so a check by hand
reaches every failure screen. The regeneration reasons are `face`, `figure`, `item`, `background`,
`other` (the chips «Лицо», «Фигура», «Вещь», «Фон», «Другое»; `REGENERATION_REASONS` in
`ai/prompts.ts`). The prompt is English, follows the structure of OpenAI's try-on example in its
image prompting guide (each image numbered with its role; the task; what stays unchanged: face,
expression, hairstyle, skin tone, body, pose, background, angle and framing; the result's light
matched to image 1, no accessories or text added). Plan §3's «a full-length picture» becomes «the
framing of image 1»: the photo check already passed a full-length photo, and demanding head to
feet would fight the kept framing on a photo it let through when unsure. A part of the body an
item leaves uncovered keeps the original clothing (a T-shirt over a dress). The prompt quotes every catalog name, the wishes and the comment as a
JSON string, so a text cannot close its quote. The owner confirmed the fake's picture and markers
on 2026-10-23; the rest is an assumption, owner to confirm at the phase summary.

**A67. One generation, one payment.** The owner decided on 2026-10-23 (T10's review): a try-on is
never paid twice. OpenAI does not say whether a 5xx or a timed-out edits request is billed, and its
Images API has no idempotency key, so a repeat cannot be told from a new picture. The edits call
is therefore sent again only when it surely never reached OpenAI: a connection that did not open
(DNS, refused, unreachable, the connect timeout) or a 429 of the rate limit (not
`insufficient_quota`), up to three attempts within the generation's deadline; a 5xx, a timeout, a
connection lost after the request was sent or a broken 200 body ends the fitting as
`provider_error` or `model_timeout`, not counted against the limit, and the user starts it again.
The activity `generate` runs once (`maximumAttempts: 1`), so a worker lost mid-call does not send
it again either (T11). This amends A17 and plan §4's «retry twice more». The paid checks (the
vision model) keep their three attempts on a 5xx: they cost a fraction of a cent (the owner's
answer). Checked against OpenAI's documentation the same day: the edits endpoint has no
`moderation` parameter (only `/v1/images/generations` does; plan §3 listed it, now removed, the
default filtering applies) and `gpt-image-2` refuses `input_fidelity` (its inputs are always high
fidelity), so neither is sent; `safety_identifier` (a hashed user id for OpenAI's abuse
monitoring) is not sent for now (the owner).

**A68. The workflow's activities (T11).** The owner decided on 2026-10-23: no image goes through
Temporal's history (its payloads are limited to 2 MB, and the photos are personal data), so
plan §4's `loadInputs` and `storeResult` are steps of `generate`, which reads the photo and the
items' first images from the bucket (`StorageService.get`), makes the one paid call and writes
the re-encoded result to the generation's folder; `moderate` reads it from there, and
`complete` sets `result_image_key` only for a completed fitting; a failed one's file is deleted
first (`discardResult`). The workflow's arguments, results and failures carry ids, codes and
OpenAI's request id only. The owner also decided: the workflow does not check the text again
(`checkPrompt` goes; `POST /fittings` checks it, A45), and `notify` comes with T13 (the workflow
ends with `complete` until then; the phase ships in one pull request, so no workflow version is
needed). Assumptions, owner to confirm at the phase summary: `generate`'s `startToCloseTimeout`
is `FITTING_TIMEOUT_SECONDS` + 60 s (plan §4 said + 30 s; the reads, sharp and the write sit
inside it), passed by the api in the workflow's arguments (`timeoutSeconds`), since workflow code
reads no environment, and the model's deadline is that same value (not the worker's own
setting), so `generate` passing its time limit is `model_timeout` too; `generate` claims the paid
call by setting `started_at` once (a conditional update), so a second run of one row (a reset by
hand, a duplicate start) pays nothing and ends `provider_error`; `generate` and `moderate` are
cancelled with `WAIT_CANCELLATION_COMPLETED`, so a result is never written after its discard;
the fitting's end (`discardResult`, `complete`) runs outside the cancellation whatever step was
cancelled, and only the workflow's own cancellation counts as one (an activity cancelled by a
worker's shutdown is `provider_error`, unspent); a failure's text and cause reach the history
and Sentry only for the errors whose text is known to hold no user input (`AiProviderError`,
`StorageError`, the activity's own); the photo's key is checked against the row's user folder
before it is read; a model's refusal is a result, not an `ApplicationFailure`, so it reaches
no Sentry, while a timeout and a failure do (once, `maximumAttempts: 1`); `markProcessing` and
`complete` are retried without limit (a fitting that never ends would keep its unit and its
fingerprint), `moderate` three times, `discardResult` five (a file left behind goes with the
generation's folder when its row is deleted); a cancelled workflow discards a written result and
calls `complete` with the unit kept outside the cancellation, so a row still there (a cancel by
hand) ends `failed` `provider_error` with `error_message` `cancelled` and stays spent, as A47's
delete does (T12's delete removes the row before it cancels); the housekeeping leaves a
transient photo alone past its hour while a running generation of the last 24 hours uses it (a
stuck row keeps it no longer; amended by A69: `complete` no longer deletes it); the quota's month is the Moscow month of the row's
`created_at` (`fittings/quota-month.ts`, which T12's start uses too); a regeneration's
`prompt_text` is its comment and its wishes are the original try-on's (the first ancestor
without a parent, none when that one is deleted; T12 may store them otherwise); the items go to
the model in the order of their product ids.

**A69. The owner's answers to T11's review (2026-10-23).** (1) A result refused by the
moderation gives its unit back, as A20 says, though the paid call was made. (2) A stop of the
worker (a deploy replaces it in place) waits for running activities as long as a generation may
take: `shutdownGraceTime` is the longest setting's limit, `FITTING_TIMEOUT_SECONDS_MAX` (600 s)
plus 60 s (`generateTimeLimitSeconds`), not the worker's own, since a fitting started by a newer
api may carry a longer one; a quiet worker exits at once. `deploy/compose/worker.yml` sets
`stop_grace_period: 12m`, above it, so a deploy no longer cuts a paid call; polling stops at
once, so new fittings wait in Temporal's queue meanwhile, and the deploy waits too (up to 11
minutes): CD's job limit goes from 30 to 45 minutes (amends 0018 V11), since a job cancelled
while compose stops the old worker would leave none until the next deploy. (3) A transient photo
stays while the try-on is open, so a regeneration from its result can use it: `complete` does not
delete it (amends A24's «the generation that uses it deletes it when it ends»); closing the
try-on deletes it (a route of T12 that the widget of T15 calls), and the housekeeping deletes one
whose last generation ended more than an hour ago, or one never used, an hour after its upload (a
closed tab sends nothing). A regeneration from the history of a fitting whose transient photo is
gone is refused by T12. The owner chose «closing the try-on window» over an hour after the last
generation and over keeping the photo as long as its results. The housekeeping locks the users of
its candidate photos (`FOR UPDATE`, as a start locks its user) and checks the photos again before
it deletes them, so a regeneration started meanwhile keeps its photo; T12's start locks the
user's row before it reads the photo (A20) and refuses a photo that is gone.

**A70. The fittings routes' open details (T12).** The owner decided on 2026-10-24:
(1) Closing the try-on calls `DELETE /me/photos/transient/:id` (204): it deletes only a transient
photo of the user (the row and its outbox entry in one transaction, the user's row locked, as
`DELETE /me/photos/:id`); a saved, someone else's or a missing photo is 404; a photo a running
generation uses stays for the housekeeping and the route still answers 204, so a window closed
during the wait loses nothing (AC10). (2) Each row is whole on its own: `prompt_text` is the
wishes on every row (a regeneration copies its parent's), and a new nullable column `comment`
(varchar(300), trimmed and not empty, a CHECK) holds a regeneration's comment; `generate` reads
both from the row, not from the ancestors (amends A68). A regeneration's fingerprint is its
parent's (the photo, the items, the wishes), so a repeat (A7) finds a regeneration too and two
regenerations of one result at once start one (A32). (3) A regeneration of a fitting whose photo
is gone answers 409 with a new code `PHOTO_GONE`; one of a result that is not completed (running or
failed) answers 409 `NOT_COMPLETED`; both have their Russian texts in web. (4) `single` takes one
item, `look` two to five; the wishes are at most 200 characters (A16; the column stays 300), the
comment 300. The detail `HAS_SLOT`: an item's category has no slot; `DISTINCT_SLOTS`: two items of
a look share a slot. (5) The free regeneration of A6 is a flag on the result, a new column
`free_regeneration_used` (boolean, false): the start of a free one sets it in the start
transaction, so deleting that regeneration gives nothing back; a free regeneration that fails, is
refused or times out clears it in `complete` with the same conditional update that gives a paid
one's unit back (A20); a cancelled one keeps it (A47). Only a try-on's own result has a free
regeneration (decided at T12's security review: a regeneration is a result too, so «the first of
each result» made a chain of free ones): a regeneration is created with the flag set, and its
regenerations spend a try-on each (amends A6). At the code review (6) a fitting still running an
hour after its start (an api lost between the commit and the workflow's start) is ended `failed`
`provider_error` by the housekeeping with its try-on given back, since it would keep its unit and
block its fingerprint; a workflow that comes back later finds it ended and pays nothing; (7) one
generation of a try-on's family (the try-on and its regenerations share the fingerprint) runs at a
time: a regeneration while another of the family runs answers the running one, its reasons and
comment dropped; (8) the 409 `LIMIT_REACHED` names the renewal only in its message: web reads
`renewsAt` from `GET /me/fitting-quota`. Assumptions, owner to confirm at the
summary: `stage` is `queued` (pending), `generating` (processing) or `done` (ended);
`estimatedSeconds` is the median of the user's last ten completed fittings' durations, 25 s before
any (A27); a regeneration keeps its parent's `kind`; a failed start of the workflow ends the row
`failed` `provider_error` with its unit (or flag) given back, logged and sent to Sentry with the
id only (plan §4).

## Canvas and decisions

Where the canvas differs from the decisions above, the decision wins:

- The limit texts say 40 («Осталось 11 из 40», «Новые 40 примерок»): the number is the
  environment's (A5), 10 by default.
- «Перегенерация не списывает примерку» on the regeneration sheet: the first one per result (A6).
- The profile side menu of boards 9 and 10 («Мои данные», «История примерок», «Мои фото»,
  «Избранное», «Выйти») is the account shell of spec 0017 with its sections; «Мои примерки» is the
  history and «Мои фото» the fifth section (A19).
- The phone screens' own headers (back arrow, a share icon, «Свернуть») are the site's header
  (0010) and the modal's or sheet's own controls; the tab bar is not built (A10).
- The header's city («Укажите ваш населённый пункт») and the cart icon are as the site has them
  (0010); the fitting room's icon joins them (A12).
- «Таблица размеров» and the size advice are not rendered (A8); «HEIC» leaves the hint (A31).
- The fingerprint of a repeat includes the free text (A7, A16); a look's «Пожелания» therefore make
  a new try-on when they change.
- Board 1's «Примерить» as a secondary 40 button: board 13's primary `TryOnButton` (A63.2). The
  picker's hint about the last used photo: the default is preselected (A63.4). «Заменить запись» on
  the compare page: dropped (A63.5). The share sheet 7.4: not built (A14, A63.6). «нет в наличии»
  on a colour: not drawn (A63.7). The default photo's badge: «По умолчанию» on every screen
  (A62).
- The catalog card's two corners (the hanger and the heart) and its hover: A63.1, over 0009 K10.

## Backlog

**A42. Taken by this spec.** «Product card link» (A40), «Photo upload limits» (A24, A31), «Outbox
for file deletion» (A38), «Signed links in reports» (A37), «Long writes after a timeout» (A32),
«Heartbeats for long activities» (A39), «Fitting sessions per user» (A21) and «Cache warm-up on
deploy»'s rule for new pages as far as the product page is concerned (A22; the item itself is spec
0018's). Each is removed from `specs/backlog.md` by the commit that closes it. Left there: «A
revoked session on an open socket» and «CONNECT packets per connection» (A35), «Temporal history
backup» (A39), «The session cookie in `apiFetch`» (nothing of the user renders on the server, 0017
U11), «Deletions after a restored copy» (the outbox of A38 gives the restore its list of
deletions; removing files no row refers to stays a restore-time step of 0012, not a feature of
this spec), «Deleted users in backups», «Guests». Added: «Share link of a result» (A14), «Mobile tab bar»
(A10), «Photo crop», «Report a wrong photo check», «Compare as an overlay», «Avatar teaser» (A41),
«Old fitting routes» (A21), «The other models of 0016 S7» (A4).
