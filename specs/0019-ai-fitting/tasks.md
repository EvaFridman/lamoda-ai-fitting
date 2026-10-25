# 0019 AI fitting v1: tasks

Status: accepted (2026-10-21); amended 2026-10-24 (T14a added: A73).

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
- [ ] **T24a. web: the product page on phones (A87.1–3).** The kit's `Gallery`: the strip's
      slide height and Lamoda's dots; the buy box in the page's flow (the fixed bar, its hook and
      the body's padding go); the kit's `ScrollRow` with its `/ui-kit` example and
      `related-products` as one row on every width; the analytics of A87 for the row, if any.
      Check: web tests; `typecheck`, `lint` (A58); the phone and desktop by hand on the local
      stack.
      Commit: `feat(web): the product page on phones as lamoda's`
- [ ] **T24b. web: the header on phones (A87.4–7).** One row of the burger, the loupe, the logo
      and the icons below 600 px on every page; the search row; `HeaderMenu` (a left `Drawer`:
      «Войти» or the user's block, the account's sections, the sign-outs, «Все товары» and the
      categories); the session's hooks and the returned sign-in error mounted once on every width;
      the analytics of A87 for the menu; `CLAUDE.md`'s header paragraph.
      Check: web tests; `typecheck`, `lint` (A58); the phone and desktop by hand on the local
      stack.
      Commit: `feat(web): the header on phones as lamoda's`
- [ ] **T25. web: the header's icon and the drawer.** `entities/fitting-room`,
      `features/fitting-room` (the `LookToggle` actions, the slot rows' actions, the replace and
      remove toasts with «Вернуть»), the widget `fitting-room-drawer` (board 2: the slots, the
      colour per item and the size stub (A63.3), the wishes field, the sum, the stubs, «Очистить»,
      the loading and empty states; the texts of A62), the header's `FittingRoomButton` with its
      counter (A10, A12).
      Check: web tests; `qa-tester` on AC13, AC16; `npm run verify`.
      Commit: `feat(web): the fitting room in the header`
- [ ] **T26. web: looks.** «Примерить образ» → the try-on widget for a look (board 3.2), the look
      result (board 8: the items, the colours, the sum, the stubs, the sheet's «Какая именно?»
      step; A62), the colour change of one item (AC15), the cards' hanger made live with its
      tooltip (A62, A63.1) in the catalog and on the related products.
      Check: web tests; `qa-tester` on AC14, AC15; `npm run verify`.
      Commit: `feat(web): try a look on`
- [ ] **T27. web: history actions and compare.** «Примерить ещё раз» (the repeat of A7),
      compare two entries side by side (board 9, A41; the selection mode, «Чем отличаются», no
      «Заменить запись», A63.5), the actions menu and the phones' sheet, «Поделиться» disabled
      (A14, A63.6), the repeat's toast; the texts of A62.
      Check: web tests; `qa-tester` on AC17, AC18; `npm run verify`.
      Commit: `feat(web): repeat and compare fittings`
- [ ] **T28. Analytics of the fitting.** The rest of the zone `fitting` (the room, the look, the
      history), `EVENTS.md`, the budget.
      Check: `catalog.test.ts`; `npm run verify`.
      Commit: `feat(web): count the fitting room and look events`
- [ ] **T29. Close the spec.** The production checks with the owner (AC5, AC13, AC14, AC17, AC19,
      AC28 on production after the merge); the acceptance record below; 0016's record of AC5–AC10,
      AC14, AC15 in its `tasks.md`; every file gets `Status: done`; `CLAUDE.md`'s opening paragraph and README's list;
      the backlog items of A42 removed; 👤 decides whether `specs/principles.md` and `CLAUDE.md`
      name the phase-boundary review as an option (A2), and the commit records it.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0019`
- 👤 reviews and merges PR 5.

## Acceptance record

Filled in at T29.
