# 0019 AI fitting v1: clarifications

Status: accepted (2026-10-21).

The owner's decisions for this spec. Ids `A1`, `A2`, … are referred to by the spec, the plan and
code comments. A1–A13 are the owner's decisions given with the task, A14–A19, A21 and A22 the
answers to the questions of the design review, A20 and A23 onwards the assumptions the main
session took where neither covered a fork («Assumption, owner to confirm», A3): each is confirmed
or changed at the phase's review. All decisions below: owner, 2026-10-21, unless noted.

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
commit and one push per round.

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
and in GitHub, with the variable's exact name; then the first generation on production (the server
is in Russia, which OpenAI's supported countries do not include: check that `api.openai.com`
answers from it before the merge). Amended 2026-10-21 at the review of the documents: OpenAI
instead of fal.ai (the owner's choice; fal.ai's queue and models are dropped from the plan).

**A17. Model: GPT-Image-2, no second provider.** `FITTING_MODEL=gpt-image-2` (the edits endpoint,
quality medium); `gpt-image-2.5-sunburst` (OpenAI's newer editing model) is the alternative the
setting can name without a release. A technical failure (a timeout, a 5xx) is retried on the same
model; there is no fallback to another provider. Amended 2026-10-21: the fallback to Nano Banana
went with fal.ai (A4).

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
result changes nothing. `GET /me/fitting-quota` reads it. Added 2026-10-21 at the review of the
documents.

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
workflow). web disables the button while its request runs.

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
OpenAI call of a check gets `FITTING_CHECK_TIMEOUT_MS` (4000); a check that does not answer in time
makes the request answer 503 `SERVICE_UNAVAILABLE`, nothing stored, so the user retries. Moving the
photo check into the workflow (an asynchronous «checking» status) was weighed and left for later:
the canvas shows the check during the upload. Added 2026-10-21 at the review of the documents.

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
button. Assumption, owner to confirm with the spec (A13).

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
