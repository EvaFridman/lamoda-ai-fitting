# 0019 AI fitting v1: tasks

Status: done (2026-10-25): all 30 criteria pass (record below); accepted 2026-10-21, amended
2026-10-24 (T14a added: A73). History, not instructions.

Implements [plan.md](plan.md). 👤 marks a step only the owner can do.

## How the work flows

- One pull request per phase (A1), merged with "Rebase and merge" once CI is green; the next
  branch starts from a fresh `main`. The work is done in the worktree `../lamoda-ai-fitting-0019`,
  which runs its own stack (compose project `ai-fitting-0019`, ports 9000/9001, A78); `qa-tester`
  and checks by hand use it.
- The owner reviews at phase boundaries (A2). Inside a phase each task is: a brief from
  `spec-finder`, a time estimate, the code, `finish-task` whole, one commit that ticks its box, then
  the next task in a fresh session (or after `/clear`). A task's check is `typecheck`, `lint` and
  its own tests (the unit specs and the database e2e it touched), not the whole `npm run verify`;
  `test-writer` and the reviewers run per task, `qa-tester` once per phase, at its last task, on
  the phase's acceptance criteria (A58). At the end of a phase: a clean `npm ci` in
  the root and in each package, `npm run verify`, the push, the pull request in the owner's format,
  and a stop with the summary (what was done, what the agents found, the assumptions taken).
- `security-reviewer` joins every task that touches routes, input, env, compose, nginx, CI or the
  worker; `temporal-reviewer` every task that touches `api/src/temporal`, the workflow or its
  starts; `fsd-reviewer` every web task.
- A new fork is taken the cautious way and recorded in `clarifications.md` as «Assumption, owner to
  confirm» (A3); a fork about users' data, money or access stops the work.
- A task that closes a backlog item removes it from `specs/backlog.md` in its commit (A42), and
  brings `CLAUDE.md` and `README.md` in line with what it changes.
- OpenAI is reached through a proxy on a VPS abroad (A73, replacing A4's check without a key):
  T14a sets it up, and every deploy checks `GET /v1/models` with the key through it. Phase 2 ends
  with the owner's real check: the main session asks whether `OPENAI_API_KEY` and
  `OPENAI_PROXY_URL` are set in GitHub, then the first generation runs on production after the
  merge. Tests and CI never reach OpenAI.
- Phase 3 starts after spec 0014 is merged and spec 0018's page cache is on `main` (A1, A22); if
  either is not by the end of phase 2, the work stops and the owner is told.
- The pull request of phase 3 carries `Closes #69` under "Что сделано".

## PR 1 · `docs/0019-ai-fitting` · documents

- [x] **T1. Spec, clarifications, plan and tasks.** `spec.md`, `clarifications.md` (A1–A47),
      `plan.md` (the analytics entries of §9 from the `analytics` agent), this file; 0016's S20;
      the new items of `specs/backlog.md`.
      Check: owner's acceptance of each file; `npm run format:check`.
      Commit: `docs(specs): add spec 0019 ai fitting`
- 👤 merges PR 1.

## PR 2 · `feat/0019-photos` · photos

- [x] **T2. Migrations: user photos, slots, the deletion outbox.** `user_photos` with its partial
      unique index and CHECKs, `categories.slot` with the demo catalog's values, `file_deletions`
      (plan §2); `constraint-fields.ts` rows; the migration e2e.
      Check: `prisma migrate dev` on an empty and on a seeded database; `npm run verify`.
      Commit: `feat(api): add user photos, category slots and the file deletion outbox`
- [x] **T3. The OpenAI module and its settings.** `api/src/ai/`: settings from env
      (`OPENAI_API_KEY`, `FITTING_*`), `OpenAiClient`, the `AI_PROVIDER` token with the real and
      the fake implementation, `PhotoChecker`, `PromptChecker`, `ModerationChecker`;
      `assertServerEnv` for api and worker; `.env.example`, `docker-compose.yml`,
      `deploy/compose/app.yml`, `cd.yml`, `check-web-bundle.mjs`, `deploy/README.md` (plan §3,
      §10).
      Check: unit tests of the client and the checkers on recorded answers; the env spec; CI's
      bundle check with the new pattern; `npm run verify`.
      Commit: `feat(api): add the openai client, the checkers and their settings`
- [x] **T4. Upload a photo.** `POST /me/photos` (`@Expensive()`, multipart, `sharp`, the photo
      check with its time limit (A45), `save=false` for a transient photo (A24),
      `StorageService.put`), its DTOs and errors: the code `LIMIT_REACHED` and the detail codes
      `PHOTO_REFUSED` and `IS_IMAGE` with their texts in web's `ERROR_TEXTS`/`DETAIL_TEXTS`; the
      check's two calls in parallel under one deadline (A45); the nginx location with the 20 MB
      limit, the access-markers list, `openapi.json` (plan §5).
      Check: database e2e for a good photo, each refusal, a non-image, an oversized body, a
      sixth photo, a timed-out check; `ci-deploy-check.sh` in CI; `npm run verify`.
      Commit: `feat(api): upload a fitting photo with its check`
- [x] **T5. List, default and delete; the outbox.** `GET /me/photos`, `PATCH /me/photos/:id`,
      `DELETE /me/photos/:id` and `DELETE /me` with `FileDeletion` through `file_deletions`, the
      schedule `fitting-housekeeping` (unstarted deletions, transient photos older than an hour);
      `deletePrefix` heartbeats (A38, A39); backlog items removed.
      Check: database e2e of the routes, of a deletion whose start fails and is retried by the
      schedule, and of `DELETE /me` leaving no photo in the bucket (AC28); `npm run verify`.
      Commit: `feat(api): list, choose and delete fitting photos through the deletion outbox`
- [x] **T6. web: the photo entity and the kit's additions.** `entities/user-photo` (schemas, keys,
      hooks, contract test), the kit's `FileInput`, `Notice`, `StateCard` and icons with their
      `/ui-kit` sections (plan §7).
      Check: web tests of the hooks and components; `npm run verify`.
      Commit: `feat(web): add the photo entity, the file input and the notice`
- [x] **T7. web: upload and «Мои фото».** `features/upload-photo` (board 4: hints, consents,
      the input with `capture`, the refusal screen of board 5), the page `/customer/photos`
      (board 10: the grid, the default, the deletion modal), the consent text naming OpenAI and
      the paragraph of `/privacy` (A46), the fifth account section (A19), the zone `fitting` with
      its area `photos` in `catalog.ts` and `EVENTS.md` (plan §9).
      Check: web tests of the flow (consent gate, a refusal, a deletion), `qa-tester` on AC1–AC4;
      `npm run verify`.
      Commit: `feat(web): add photo upload and the my photos page`
- [x] **T8. Close phase 1.** `CLAUDE.md` (photos, the ai module, env, nginx), `README.md`; the
      clean install and `verify`; the summary for the owner.
      Check: `npm run verify` after `npm ci`; AC1–AC4 and AC27 have evidence; 👤 an upload from
      an iPhone by hand, if one is at hand (A31's HEIC).
      Commit: `docs(docs): describe fitting photos`
- 👤 reviews and merges PR 2.

## PR 3 · `feat/0019-generation` · generation

- [x] **T9a. web: the photo screens as the canvas draws them** (runs before T9, A63.8).
      `PhotoTips` with the seven pictograms of A62 as inline SVG components (board 4: two
      «хорошо» and five «плохо» tiles with
      the ✓/✕ marks, the «Коротко» list; on phones the tips screen with «Понятно», then the consent
      screen 4.2), the refusal screen's preview of the chosen file (board 5; «Фото скрыто» for
      `child`), «Мои фото» as `SavedPhotoCard` (board 10: the badge «По умолчанию», the radio
      «Сделать основным», the trash icon button, the dashed «Добавить фото» card, the delete modal
      with the thumbnail; on phones rows and a `Sheet`), the kit's `Sheet` with its `/ui-kit`
      section (plan §7). The texts of A60 and T7's tests' subjects stay.
      Check: web tests of the three screens (the pictograms render, the preview is an object URL
      revoked on unmount, the controls keep their actions); `qa-tester` on AC2 and AC3's defaults;
      `npm run verify`.
      Commit: `feat(web): draw the photo screens as the canvas does`
- [x] **T9. Migrations: generations and the fingerprint.** The new columns of `ai_generations`
      (plan §2), the partial unique index on `(user_id, fingerprint)` over the running statuses
      with its row in `constraint-fields.ts` (A32), `generation_products.attribute_value_id` and
      `slot`, the extended status CHECK, `user_image_key` nullable, the backfill of `user_id`.
      Check: the migration e2e on old rows; `typecheck`, `lint` and the task's tests (A58).
      Commit: `feat(api): extend generations for fittings`
- [x] **T10. The image model and the prompts.** `gptImage2` behind `ImageModel` (the edits
      request, the answer parsing, the model's refusal), `prompts.ts`, the fake provider's result
      image (A17).
      Check: unit tests of the request shape and the answer parsing on recorded fixtures;
      `npm run verify`.
      Commit: `feat(api): add the image model and the fitting prompt`
- [x] **T11. The workflow `generateFitting`.** Activities (plan §4) with heartbeats, the workflow,
      the worker module, `workflows.spec.ts`, the database e2e with stub activities (completed,
      failed, moderated, timed out, cancelled, retried, `complete` retried after a partial run).
      Check: the e2e; `temporal-reviewer`; `npm run verify`.
      Commit: `feat(api): generate a fitting in a temporal workflow`
- [x] **T12. Fittings routes, the limit and repeats.** `POST /fittings` (the quota row of A20,
      the fingerprint with its second lookup inside the transaction, A32, the prompt check with
      its time limit, the start), `GET /fittings`
      (`CursorPaginated`), `GET /fittings/:id`, `POST /fittings/:id/regenerate`,
      `DELETE /fittings/:id` (a running one keeps its spend, A47), `GET /me/fitting-quota`;
      `POST`/`PATCH /fitting-sessions` closed (A21); the code `PROMPT_REFUSED` and the detail
      codes `HAS_SLOT`, `DISTINCT_SLOTS` with their web texts; the access-markers lists;
      `openapi.json` and `validation-codes.json`.
      Check: database e2e for the limit at its edge, in parallel and after a deleted result, a
      repeat, a running duplicate and two parallel starts of one fingerprint, a refused and a
      timed-out text check, a regeneration free then paid, a running one deleted, someone else's
      row; `npm run verify`.
      Commit: `feat(api): start, read and delete fittings within the monthly limit`
- [x] **T13. api: the push.** `FittingNotifier` on the counters' Redis (A44), the gateway's room
      `user:<id>` and `fitting:finished`, the worker's `notify` (plan §6).
      Check: the socket e2e (own room, another user receives nothing, anonymous receives nothing);
      `npm run verify`.
      Commit: `feat(api): push a finished fitting to its user`
- [x] **T14. web: the fitting entity, the realtime client and the kit's additions.**
      `entities/fitting` (schemas, keys, the hooks with the polling, the contract test),
      `@/shared/realtime` (`socket.io-client`, the dev rewrite, plan §6), the kit's
      `ProgressBar`, `CountBadge`, `Chip`/`ChipGroup` with their `/ui-kit` sections (`Sheet` came
      with T9a); `TryOnButton`'s three states (A63.2) as a `Button` example. From T13's review
      (A71): the connection opens again when another user signs in without an end seen in
      between (where `useDropUserQueries` resets), since the socket keeps its room until it
      closes (A35); a push is only a signal to read the fitting again through the api, never a
      result or a status shown as it came; a second push of the same `generationId` shows no
      second toast (`notify` may publish twice).
      Check: web tests of the hooks, of the connection opening and closing with the session (and
      again on another user), and of the components; `npm run verify`.
      Commit: `feat(web): add the fitting entity, the realtime client and the kit's additions`
- 👤 rents the proxy VPS (1 CPU, 1 GB, Germany or the Netherlands) and checks from it by hand that
  `GET /v1/models` with the key answers 200 (A73).
- [x] **T14a. api, deploy: OpenAI through the proxy** (runs before T15, A73). The playbook
      `deploy/ansible/openai-proxy.yml` and the inventory group `openai_proxy` (Squid: only
      `CONNECT api.openai.com:443`, basic auth, no `Via` or `X-Forwarded-For`, no cache, a log of
      the connection only; ufw: SSH and the proxy's port from the production server only);
      `OPENAI_PROXY_URL` (`config/env.ts`, `assertServerEnv`, `assertWorkerEnv`, `.env.example`,
      `docker-compose.yml`'s `x-api-env`, `deploy/compose/app.yml` and `worker.yml`, `cd.yml`'s
      writer and format check, `check-web-bundle`'s list); `undici` 8.12.2 or later as a direct
      dependency, its `fetch` and `ProxyAgent` in `OpenAiClient`, OpenAI only; the proxy's
      refusals unsent (A67) and `provider_error`; `ai/check-openai.ts` run by `deploy.sh` before
      the warm-up, skipped on a rollback and by `SKIP_OPENAI_CHECK=1` (the Environment's
      variable, `ci-deploy-check.sh`, whose case 3f sees it fail); `CLAUDE.md` and
      `deploy/README.md` (the VPS,
      the playbook, the secret, the check in place of A4's `curl`, the way round).
      Check: unit specs of the env (required in production, ignored elsewhere, the address in no
      error), of the client (the dispatcher on OpenAI's requests only; a 407 unsent and
      `provider_error`; no password in an error or a log line) and of the check script;
      `check-web-bundle`'s test case; `ansible-playbook openai-proxy.yml --syntax-check`;
      `security-reviewer`; 👤 runs the playbook, sets `OPENAI_PROXY_URL` in GitHub and checks
      `curl -x` from the production server (200 with the key; another host refused).
      Commit: `feat(api): reach openai through a proxy abroad`
- [x] **T15. web: the try-on of one item.** The features `start-fitting`, `regenerate-fitting`,
      `try-colour` and `fitting-events` (the toast of A11, A34), the widget `try-on` (boards 3,
      5, 6, 7, 11, 12 for one item: the picker, the wait with its estimate, the result with the
      colours, the regeneration sheet, the limit and error screens, each with the texts and states
      A62 lists for its board, the default photo preselected, A63.4, the tiles' hover); mounted
      from `/customer/fittings?product=<id>` until the product page exists (not tracked, removed
      in T20).
      Its screens' analytics (plan §9, A74).
      Check: web tests of each screen, of the polling and of the toast; `typecheck`, `lint`
      (A58, A74: `qa-tester` on its ACs runs at T16).
      Commit: `feat(web): try an item on in the browser`
- [x] **T16. web: the history list.** `/customer/fittings` (board 9 without compare: the subtitle,
      the tabs, the cards with their badges and thumbnails, open, delete, the empty state, the
      `LimitMeter` under `AccountShell`'s side menu; A62), the analytics zone `fitting` (its first
      entries).
      Check: web tests; `typecheck`, `lint`; `qa-tester` on AC5–AC12, AC19, AC20 (T15's try-on)
      and AC17's list and deletion (A74).
      Commit: `feat(web): list the fitting history`
- [x] **T17. Close phase 2.** `CLAUDE.md`, `README.md` (the fitting, the models, the push); the
      clean install and `verify`; the summary; 👤 the first generation on production after the
      merge (A4; the deploy's check through the proxy passed, A73).
      Check: `npm run verify` after `npm ci`; one real generation on production.
      Commit: `docs(docs): describe fitting generation`
- 👤 reviews and merges PR 3; sets the secrets `OPENAI_API_KEY` and `OPENAI_PROXY_URL` before it.

## PR 4 · `feat/0019-product-page` · the product page (after 0014 and 0018's page cache)

- [x] **T18. api: related products and the last fitting.** `GET /products/:id/related` (A36,
      `@Public()`) and `GET /products/:id/fittings/last` (`@SignedIn()`); the lists and the
      snapshot.
      Check: database e2e; `npm run verify`.
      Commit: `feat(api): related products and the last fitting of a product`
- [x] **T19. web: the route, metadata and cache.** `app/products/[id]`, `_pages/product` with
      `generateMetadata`, the JSON-LD, the breadcrumbs, the 404 (`proxy.ts`, A81), the cached
      catalog reads and the warm-up source `products` (0018 V8), the sitemap's products with the
      api's `updatedAt`, the warm-up's pause before product pages (plan §8, A81; the grid's
      prefetch stays off, A81.5).
      Check: web tests of the metadata and the 404; the warm-up list check; `npm run verify`.
      Commit: `feat(web): add the product page`
- [x] **T20. web: the gallery, the buy box and the try-on entry.** `widgets/product-gallery`,
      `widgets/product-buy-box` (rating, price, colour and size, the stubs of A33, the primary
      `TryOnButton` with «К образу» beside it (A63.2) and its «В образе» state, the limit meter
      with its three texts, «Вы это примеряли»; A62), the kit's `Gallery` with its `/ui-kit`
      section; the
      try-on widget opens from the page and its temporary entry of T15 is removed.
      Check: web tests; `qa-tester` on AC21, AC24, AC5 from the page; `npm run verify`.
      Commit: `feat(web): the product page's gallery and buy box`
- [x] **T21. web: «О товаре» and «С этим товаром выбирают».** The description and attributes
      block, `widgets/related-products` with the «В корзину» stubs; `CatalogProductCard`'s two
      corners (the hanger, inert until T26, and the heart stub) and its hover (A63.1), which the
      catalog's cards get at the same time.
      Check: web tests; `npm run verify`.
      Commit: `feat(web): the product page's details and related products`
- [x] **T22. Analytics of the product page.** The zone `product` in `catalog.ts`, `EVENTS.md`,
      the tracked elements of the stubs and the try-on entry (plan §9).
      Check: `catalog.test.ts`, the budget; `npm run verify`.
      Commit: `feat(web): count the product page's clicks`
- [x] **T23. Close phase 3.** `CLAUDE.md`, `README.md`; the clean install and `verify`; the
      summary; the pull request carries `Closes #69`; backlog «Product card link» became
      «Catalog card prefetch» in T20 (A82.1).
      Check: `npm run verify` after `npm ci`; AC21–AC24 have evidence.
      Commit: `docs(docs): describe the product page`
- 👤 reviews and merges PR 4.

## PR 5 · `feat/0019-fitting` · looks, the fitting room and history

- [x] **T24. api: the fitting room.** `fitting_room_items` and its migration (cascade from the
      user); `GET`, `PUT /:slot`, `DELETE /:slot`, `DELETE` of `/me/fitting-room`; the access
      lists; `openapi.json`.
      Check: database e2e (replace answers the replaced item, a category without a slot is refused,
      someone else's room is invisible, `DELETE /me` leaves no room item, AC28); `npm run verify`.
      Commit: `feat(api): keep a fitting room per user`
- [x] **T24a. web: the product page on phones (A87.1–3, A88).** The kit's `Gallery`: the strip's
      slide height and Lamoda's dots; the buy box in the page's flow (the fixed bar, its hook and
      the body's padding go); the kit's `ScrollRow` with its `/ui-kit` example and
      `related-products` as one row on every width; the analytics of A87 for the row, if any.
      Check: web tests; `typecheck`, `lint` (A58); the phone and desktop by hand on the local
      stack.
      Commit: `feat(web): the product page on phones as lamoda's`
- [x] **T24b. web: the header on phones (A87.4–7).** One row of the burger, the loupe, the logo
      and the icons below 600 px on every page; the search row; `HeaderMenu` (a left `Drawer`:
      «Войти» or the user's block, the account's sections, the sign-outs, «Все товары» and the
      categories); the session's hooks and the returned sign-in error mounted once on every width;
      the analytics of A87 for the menu; `CLAUDE.md`'s header paragraph.
      Check: web tests; `typecheck`, `lint` (A58); the phone and desktop by hand on the local
      stack.
      Commit: `feat(web): the header on phones as lamoda's`
- [x] **T25. web: the header's icon and the drawer.** `entities/fitting-room`,
      `features/fitting-room` (the `LookToggle` actions, the slot rows' actions, the replace and
      remove toasts with «Вернуть»), the widget `fitting-room-drawer` (board 2: the slots, the
      colour per item and the size stub (A63.3), the wishes field, the sum, the stubs, «Очистить»,
      the loading and empty states; the texts of A62), the header's `FittingRoomButton` with its
      counter (A10, A12).
      Check: web tests; `qa-tester` on AC13, AC16; `npm run verify`.
      Commit: `feat(web): the fitting room in the header`
- [x] **T26. web: looks.** «Примерить образ» → the try-on widget for a look (board 3.2), the look
      result (board 8: the items, the colours, the sum, the stubs, the sheet's «Какая именно?»
      step; A62), the colour change of one item (AC15), the cards' hanger made live with its
      tooltip (A62, A63.1) in the catalog and on the related products.
      Check: web tests; `qa-tester` on AC14, AC15; `npm run verify`.
      Commit: `feat(web): try a look on`
- [x] **T27. web: history actions and compare.** «Примерить ещё раз» (the repeat of A7),
      compare two entries side by side (board 9, A41; the selection mode, «Чем отличаются», no
      «Заменить запись», A63.5), the actions menu and the phones' sheet, «Поделиться» disabled
      (A14, A63.6), the repeat's toast; the texts of A62.
      Check: web tests; `qa-tester` on AC17, AC18; `npm run verify`.
      Commit: `feat(web): repeat and compare fittings`
- [x] **T28. Analytics of the fitting.** The rest of the zone `fitting` (the room, the look, the
      history), `EVENTS.md`, the budget.
      Check: `catalog.test.ts`; `npm run verify`.
      Commit: `feat(web): count the fitting room and look events`
- 👤 reviews and merges PR 5.

## PR 6 · `docs/0019-close` · closing the spec (after PR 5 is deployed, A96)

- [x] **T29. Close the spec.** The production checks with the owner (AC5, AC13, AC14, AC17, AC19,
      AC28 on production after the merge); the acceptance record below; 0016's record of AC5–AC10,
      AC14, AC15 in its `tasks.md`; every file gets `Status: done`; `CLAUDE.md`'s opening paragraph and README's list;
      the backlog items of A42 removed; 👤 decides whether `specs/principles.md` and `CLAUDE.md`
      name the phase-boundary review as an option (A2), and the commit records it.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0019`
- 👤 reviews and merges PR 6.

## Acceptance record

Checked on 2026-10-25. The local criteria rest on the Vitest tests named (api's database e2e
under `api/test/database/`, web's next to their code under `web/src`) and on the `qa-tester` runs
of the phases' last tasks (A58): T7 (AC1–AC4), T9a (AC2, AC3), T16 (AC5–AC12, AC17, AC19, AC20),
T20 (AC5, AC21, AC24), T25 (AC13, AC16), T26 (AC14, AC15), T27 (AC17, AC18). The first real
generation on production passed with the owner after PR 3 (#106, A4). PR 5 (#108, `main`
6a81c99) was deployed by CI run 40219706455; after it the owner checked on production
(https://lamoda-ai-fitting.ru) AC5, AC13 (a second browser for the count), AC14 and AC17 (a
second browser for the history), AC19 up to the caution colour of the counter and the meter
(the limit itself by tests: reaching it would spend the owner's month) and AC28 by deleting an
account, its bucket folder left empty by the e2e named. This branch also carries 891b854, the
last fix of PR 5's review (`CLAUDE.md`'s sentence on the room writes' reads and a reset of
`useRoomActions`' state for its tests; no change of behaviour), checked
by its tests and this `verify`. `npm run verify` after a clean install on the closing commit
passed (api 4618 tests, web 5030, guards and scripts 677; `check:web-bundle` and `check:web-shells`
green).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1  | pass   | T7's `qa-tester`. `me-photos.e2e-spec.ts` "stores a good JPEG as WebP and answers 201 with the photo (AC1)", "answers 400 PHOTO_REFUSED with the reason and stores nothing" (each reason), "answers 204, removes the row and the file, and the link answers 404 (AC1)"; `photo-image.spec.ts` "drops the metadata: no EXIF, ICC profile or orientation".                                                                                                                                                           |
| AC2  | pass   | T7's and T9a's `qa-tester`. `upload-photo.test.tsx` "opens the tips and the two consents, and keeps both pickers off until both are checked"; `photo-tips.test.tsx` "draws seven tiles, each with its caption and a decorative pictogram"; `privacy-page.test.tsx` "says fitting photos go to OpenAI, are not used for training and can be deleted".                                                                                                                                                               |
| AC3  | pass   | T7's `qa-tester`. `me-photos.e2e-spec.ts` "answers 409 LIMIT_REACHED for the sixth saved photo and stores nothing more", "makes the first saved photo the default and not the second"; `try-on.test.tsx` "opens as «Онлайн-примерка» with the default photo chosen and the item shown" (the default, not the last used, A63.4).                                                                                                                                                                                    |
| AC4  | pass   | `me-photos.e2e-spec.ts` "answers 400 IS_IMAGE for a text file and stores nothing (AC4)", "answers 413 PAYLOAD_TOO_LARGE for a 21 MB body and stores nothing (AC4)"; `photo-upload.spec.ts` "answers 413 PAYLOAD_TOO_LARGE for a file over the limit"; every deploy's `scripts/ci-deploy-check.sh` "a 2 MB upload" (401) and "a 21 MB upload" (413) through nginx (A57).                                                                                                                                            |
| AC5  | pass   | Production with the owner (above); T16's and T20's `qa-tester`. `fittings-routes.e2e-spec.ts` "starts a pending fitting, spends one try-on and starts its workflow (AC5)"; `try-on.test.tsx` "shows a completed fitting as a result with the colours and the regeneration (AC5, AC7, AC8)"; `mutations.test.tsx` "reads the lists and the quota again but not the started fitting".                                                                                                                                |
| AC6  | pass   | T16's `qa-tester`. `me-photos.e2e-spec.ts` "lists the saved photos oldest first with signed links, and not the one-time ones (AC3)"; `try-on.test.tsx` "deletes the one-time photo when the window closes"; `fittings-routes.e2e-spec.ts` "deletes a one-time photo, queues its file and answers 204"; `housekeeping.e2e-spec.ts` "deletes a transient photo older than an hour with its file and keeps the rest (A24)" (one a running fitting uses goes with the housekeeping, A70).                              |
| AC7  | pass   | By tests: every demo product has one colour (A76). `fittings-routes.e2e-spec.ts` "makes a new try-on for another colour, another text or another photo", "opens the same result for free, with repeated true"; `color-try-on.test.tsx` "tries a colour on the same photo, with the colour of the tile, and passes the answer on (AC7)"; `fingerprint.spec.ts` "does not depend on the order of the items".                                                                                                         |
| AC8  | pass   | T16's `qa-tester`. `fittings-routes.e2e-spec.ts` "makes the first regeneration free: parent set, no unit, the parent’s flag used", "spends a try-on on the second regeneration of the same result"; `regenerate-sheet.test.tsx` "sends the reasons and the trimmed comment, then passes the new fitting on (AC8)".                                                                                                                                                                                                 |
| AC9  | pass   | T16's `qa-tester`. `fittings-routes.e2e-spec.ts` "refuses a refused text with 400 PROMPT_REFUSED, stores nothing and spends nothing"; `regenerate-sheet.test.tsx` "shows a refused comment under the field and spends nothing (AC9)".                                                                                                                                                                                                                                                                              |
| AC10 | pass   | T16's `qa-tester` through the fake provider's delay. `fitting-wait.test.tsx` "shows the first stage, zero percent and the time left of the estimate"; `try-on.test.tsx` "closes the window from the wait while the fitting goes on"; `use-fitting-events.test.tsx` "says the try-on is ready, naming the item, with «Открыть» (AC10)"; `queries.test.ts` "polls a running fitting every 3 s".                                                                                                                      |
| AC11 | pass   | T16's `qa-tester` (`fail:*` of the fake, A66). `try-on.test.tsx` "shows the error card of a failed fitting and retries it with the same photo and colour (AC11)"; `fitting-error-card.test.tsx` "retries from «Попробовать ещё раз» and tracks the click"; `generate-fitting-workflow.e2e-spec.ts` "ends a timed out generate as model_timeout"; `fitting-activities.e2e-spec.ts` "discards a result the moderation flagged and gives the unit back".                                                              |
| AC12 | pass   | T16's `qa-tester`. `fittings-routes.e2e-spec.ts` "answers the running fitting of an identical request with 200 and counts one try-on", "makes one row and one unit of two parallel identical requests"; `start-fitting-button.test.tsx` "starts one fitting when it is clicked twice at once (AC12)".                                                                                                                                                                                                              |
| AC13 | pass   | Production with the owner, two browsers (above); T25's `qa-tester`. `me-fitting-room.e2e-spec.ts` "replaces an occupied slot and answers the replaced item", "the accessory slot takes no product: MATCHES_SLOT"; `use-room-actions.test.tsx` "«Вернуть» puts the previous item back in its colour, silently, and sends room.undo"; `header-room.test.tsx` "shows the count of the room in its name (AC13)".                                                                                                       |
| AC14 | pass   | Production with the owner (above); T26's `qa-tester`. `fittings-routes.e2e-spec.ts` "starts a look of two items of different slots"; `try-on-look.test.tsx` "starts the look with the default photo, the room’s items in their colours and no wishes (AC14)", "lists the items with links to their products, prices and the sum of the look".                                                                                                                                                                      |
| AC15 | pass   | By tests, as AC7 (A92.3); T26's `qa-tester` for the screen. `try-on-look.test.tsx` "regenerates the whole look on the same photo with only that colour changed and the same wishes" (one `POST /fittings` with the look's items); `fittings-routes.e2e-spec.ts` "answers a colour change with the wishes of the result it came from sent again".                                                                                                                                                                   |
| AC16 | pass   | T25's `qa-tester`. `queries.test.ts` (`entities/category`) "maps the id of each category that has a slot to it"; `product-grid.test.tsx` "shows the hanger only on cards of a category that has a slot (AC16)"; `product-buy-box.test.tsx` "is not shown without a slot, signed in or out (AC16)"; `to-look-button.test.tsx` "asks a visitor to sign in and changes nothing (AC16)".                                                                                                                               |
| AC17 | pass   | Production with the owner, a second browser (above); T16's and T27's `qa-tester`. `fittings-routes.e2e-spec.ts` "lists the user’s fittings newest first, with the total on the first batch", "deletes a finished fitting without touching a workflow" (the outbox row); `history-card.test.tsx` "shows the result, the «ИИ» badge, the item with its colour and the date"; `fitting-history.test.tsx` "an earlier result says the limit was not spent, and its «Открыть» opens it".                                |
| AC18 | pass   | T27's `qa-tester`. `fitting-compare.test.tsx` "shows two columns with the result inside a recorded-off block and the AI label"; `fitting-compare-page.test.tsx` "is titled «Сравнение» under «Мои примерки» with a way back to the history"; `fitting-history.test.tsx` "asks for each kind and tracks the change", "shows the empty list with a link to the catalog and tracks its click".                                                                                                                        |
| AC19 | pass   | Production with the owner up to the caution colour (above); T16's `qa-tester`. `fittings-routes.e2e-spec.ts` "refuses the third start with 409 LIMIT_REACHED and inserts no row (AC6)" (the renewal date in the message), "refuses a start with new wishes at the limit with 409, without calling the check"; `product-buy-box.test.tsx` "is turned off at no tries left (AC19)" («Закончились · снова с …», A82.5); `limit-meter.test.tsx` "turns to the caution look at three tries left or fewer, not at four". |
| AC20 | pass   | T16's `qa-tester`. `fittings-routes.e2e-spec.ts` "deletes a running fitting, queues its files, keeps the unit spent and cancels the workflow" (A47), "does not spend a try-on on a repeat or a running duplicate (A7, A32)"; `fitting-activities.e2e-spec.ts` "refunds once however many times it runs"; the refusals of AC1, AC9 and AC11 above spend nothing.                                                                                                                                                    |
| AC21 | pass   | T20's `qa-tester`. `product-page.test.tsx` "shows «О товаре» with the description and the article (AC21)"; `product-proxy.test.ts` "rewrites an unknown product to the not-found path, without reading a category", "rewrites the product of an inactive category".                                                                                                                                                                                                                                                |
| AC22 | pass   | `metadata.test.ts` (`_pages/product`) "sets a full title, the description, the base and the canonical address"; `json-ld.test.ts` "has the schema.org context and the product with its breadcrumbs"; `sitemap.test.ts` "adds a page per product after the categories, dated by its update time".                                                                                                                                                                                                                   |
| AC23 | pass   | `server-queries.page.test.ts` (`entities/product`) "reads /products/:id/related through the page cache, without the visitor"; `routes.test.ts` (`_app/warmup`) "puts the product pages where /products/[id] sits in the list"; `product-page.e2e-spec.ts` "answers the six newest products of other categories, newest first, to an anonymous visitor".                                                                                                                                                            |
| AC24 | pass   | T20's `qa-tester`. `tried-on-note.test.tsx` "is a link to the fitting with «Вы это примеряли», the date, the colour and «Смотреть»"; `product-page.e2e-spec.ts` "answers the completed fitting of the product with its signed result link"; `queries.test.ts` (`entities/fitting`) "reads GET /api/products/<id>/fittings/last with a signal".                                                                                                                                                                     |
| AC25 | pass   | `socket-fitting-push.e2e-spec.ts` "pushes exactly the generation, kind and status to the sockets of its user", "sends nothing to another signed-in user's socket or an anonymous one"; `push.test.ts` "drops extra fields, so no link or text is carried".                                                                                                                                                                                                                                                         |
| AC26 | pass   | `history-card.test.tsx` "puts the result link only into the image src, inside an mp-block container"; `sentry-signed-links.test.ts` "drops a span whose url.full lacks the query but has keep/users in the path"; `strip-attributes.test.ts` "strips the fitting parameter from the addresses of $set_once and $set", "drops the compare page ids a and b from the addresses and the query".                                                                                                                       |
| AC27 | pass   | `check-web-bundle.test.mjs` "fails on the env name OPENAI_API_KEY (spec 0019 AC27)"; `env.spec.ts` "refuses production with an empty OPENAI_API_KEY, naming the variable"; `ai-provider.spec.ts` "gives the OpenAI provider only in production with a key"; CI sets no key (A49).                                                                                                                                                                                                                                  |
| AC28 | pass   | Production with the owner, an account deleted (above). `me.e2e-spec.ts` "answers 204 and removes the user with every row that depends on them", "empties the folder of the user and keeps another user files", "removes the saved photos’ files and the outbox row of a deleted account (AC28)"; `me-fitting-room.e2e-spec.ts` "leaves no fitting room row of the user and keeps another user’s".                                                                                                                  |
| AC29 | pass   | `catalog.test.ts` "lists exactly the known events", "gives each event its zone and type", "keeps the catalog within every limit"; the elements of plan §9 as narrowed by A75, A83.10, A90.9 and A94.3.                                                                                                                                                                                                                                                                                                             |
| AC30 | pass   | `npm ci` in the root and each package, then `npm run verify` on the closing commit (above); the web image built by CI run 40219706455 with no api.                                                                                                                                                                                                                                                                                                                                                                 |
