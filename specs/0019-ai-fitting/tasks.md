# 0019 AI fitting v1: tasks

Status: accepted (2026-10-21).

Implements [plan.md](plan.md). 👤 marks a step only the owner can do.

## How the work flows

- One pull request per phase (A1), merged with "Rebase and merge" once CI is green; the next
  branch starts from a fresh `main`. The work is done in the worktree `../lamoda-ai-fitting-0019`,
  which has no Docker stack of its own: a task that needs a running stack (`qa-tester`, a check by
  hand) asks the owner which copy's stack to use.
- The owner reviews at phase boundaries (A2). Inside a phase each task is: a brief from
  `spec-finder`, a time estimate, the code, `finish-task` whole, one commit that ticks its box, then
  the next task in a fresh session (or after `/clear`). At the end of a phase: a clean `npm ci` in
  the root and in each package, `npm run verify`, the push, the pull request in the owner's format,
  and a stop with the summary (what was done, what the agents found, the assumptions taken).
- `security-reviewer` joins every task that touches routes, input, env, compose, nginx, CI or the
  worker; `temporal-reviewer` every task that touches `api/src/temporal`, the workflow or its
  starts; `fsd-reviewer` every web task.
- A new fork is taken the cautious way and recorded in `clarifications.md` as «Assumption, owner to
  confirm» (A3); a fork about users' data, money or access stops the work.
- A task that closes a backlog item removes it from `specs/backlog.md` in its commit (A42), and
  brings `CLAUDE.md` and `README.md` in line with what it changes.
- Phase 2 ends with the owner's real check (A4): the main session asks whether `OPENAI_API_KEY` is
  set in GitHub (and locally, if the owner wants a check by hand), the owner checks that
  `api.openai.com` answers from the server, then the first generation runs on production after
  the merge. Tests and CI never reach OpenAI.
- Phase 3 starts after spec 0014 is merged and spec 0018's page cache is on `main` (A1, A22); if
  either is not by the end of phase 2, the work stops and the owner is told.
- The pull request of phase 3 carries `Closes #69` under "Что сделано".

## PR 1 · `docs/0019-ai-fitting` · documents

- [x] **T1. Spec, clarifications, plan and tasks.** `spec.md`, `clarifications.md` (A1–A45),
      `plan.md` (the analytics entries of §9 from the `analytics` agent), this file; 0016's S20;
      the new items of `specs/backlog.md`.
      Check: owner's acceptance of each file; `npm run format:check`.
      Commit: `docs(specs): add spec 0019 ai fitting`
- 👤 merges PR 1.

## PR 2 · `feat/0019-photos` · photos

- [ ] **T2. Migrations: user photos, slots, the deletion outbox.** `user_photos` with its partial
      unique index and CHECKs, `categories.slot` with the demo catalog's values, `file_deletions`
      (plan §2); `constraint-fields.ts` rows; the migration e2e.
      Check: `prisma migrate dev` on an empty and on a seeded database; `npm run verify`.
      Commit: `feat(api): add user photos, category slots and the file deletion outbox`
- [ ] **T3. The OpenAI module and its settings.** `api/src/ai/`: settings from env
      (`OPENAI_API_KEY`, `FITTING_*`), `OpenAiClient`, the `AI_PROVIDER` token with the real and
      the fake implementation, `PhotoChecker`, `PromptChecker`, `ModerationChecker`;
      `assertServerEnv` for api and worker; `.env.example`, `docker-compose.yml`,
      `deploy/compose/app.yml`, `cd.yml`, `check-web-bundle.mjs`, `deploy/README.md` (plan §3,
      §10).
      Check: unit tests of the client and the checkers on recorded answers; the env spec; CI's
      bundle check with the new pattern; `npm run verify`.
      Commit: `feat(api): add the openai client, the checkers and their settings`
- [ ] **T4. Upload a photo.** `POST /me/photos` (`@Expensive()`, multipart, `sharp`, the photo
      check with its time limit (A45), `save=false` for a transient photo (A24),
      `StorageService.put`), its DTOs and errors: the code `LIMIT_REACHED` and the detail codes
      `PHOTO_REFUSED` and `IS_IMAGE` with their texts in web's `ERROR_TEXTS`/`DETAIL_TEXTS`; the
      nginx location with the 20 MB limit, the access-markers list, `openapi.json` (plan §5).
      Check: database e2e for a good photo, each refusal, a non-image, an oversized body, a
      sixth photo, a timed-out check; `ci-deploy-check.sh` in CI; `npm run verify`.
      Commit: `feat(api): upload a fitting photo with its check`
- [ ] **T5. List, default and delete; the outbox.** `GET /me/photos`, `PATCH /me/photos/:id`,
      `DELETE /me/photos/:id` and `DELETE /me` with `FileDeletion` through `file_deletions`, the
      schedule `fitting-housekeeping` (unstarted deletions, transient photos older than an hour);
      `deletePrefix` heartbeats (A38, A39); backlog items removed.
      Check: database e2e of the routes, of a deletion whose start fails and is retried by the
      schedule, and of `DELETE /me` leaving no photo in the bucket (AC28); `npm run verify`.
      Commit: `feat(api): list, choose and delete fitting photos through the deletion outbox`
- [ ] **T6. web: the photo entity and the kit's additions.** `entities/user-photo` (schemas, keys,
      hooks, contract test), the kit's `FileInput`, `Notice`, `StateCard` and icons with their
      `/ui-kit` sections (plan §7).
      Check: web tests of the hooks and components; `npm run verify`.
      Commit: `feat(web): add the photo entity, the file input and the notice`
- [ ] **T7. web: upload and «Мои фото».** `features/upload-photo` (board 4: hints, consents,
      the input with `capture`, the refusal screen of board 5), the page `/customer/photos`
      (board 10: the grid, the default, the deletion modal), the fifth account section (A19), the
      zone `fitting` with its area `photos` in `catalog.ts` and `EVENTS.md` (plan §9).
      Check: web tests of the flow (consent gate, a refusal, a deletion), `qa-tester` on AC1–AC4;
      `npm run verify`.
      Commit: `feat(web): add photo upload and the my photos page`
- [ ] **T8. Close phase 1.** `CLAUDE.md` (photos, the ai module, env, nginx), `README.md`; the
      clean install and `verify`; the summary for the owner.
      Check: `npm run verify` after `npm ci`; AC1–AC4 and AC27 have evidence.
      Commit: `docs(docs): describe fitting photos`
- 👤 reviews and merges PR 2.

## PR 3 · `feat/0019-generation` · generation

- [ ] **T9. Migrations: generations and the fingerprint.** The new columns of `ai_generations`
      (plan §2), `generation_products.attribute_value_id` and `slot`, the extended status CHECK,
      `user_image_key` nullable, the backfill of `user_id`.
      Check: the migration e2e on old rows; `npm run verify`.
      Commit: `feat(api): extend generations for fittings`
- [ ] **T10. The image model and the prompts.** `gptImage2` behind `ImageModel` (the edits
      request, the answer parsing, the model's refusal), `prompts.ts`, the fake provider's result
      image (A17).
      Check: unit tests of the request shape and the answer parsing on recorded fixtures;
      `npm run verify`.
      Commit: `feat(api): add the image model and the fitting prompt`
- [ ] **T11. The workflow `generateFitting`.** Activities (plan §4) with heartbeats, the workflow,
      the worker module, `workflows.spec.ts`, the database e2e with stub activities (completed,
      failed, moderated, timed out, cancelled, retried).
      Check: the e2e; `temporal-reviewer`; `npm run verify`.
      Commit: `feat(api): generate a fitting in a temporal workflow`
- [ ] **T12. Fittings routes, the limit and repeats.** `POST /fittings` (the quota row of A20,
      the fingerprint, the prompt check with its time limit, the start), `GET /fittings`
      (`CursorPaginated`), `GET /fittings/:id`, `POST /fittings/:id/regenerate`,
      `DELETE /fittings/:id`, `GET /me/fitting-quota`; `POST`/`PATCH /fitting-sessions` closed
      (A21); the code `PROMPT_REFUSED` and the detail codes `HAS_SLOT`, `DISTINCT_SLOTS` with
      their web texts; the access-markers lists; `openapi.json` and `validation-codes.json`.
      Check: database e2e for the limit at its edge, in parallel and after a deleted result, a
      repeat, a running duplicate, a refused and a timed-out text check, a regeneration free then
      paid, someone else's row; `npm run verify`.
      Commit: `feat(api): start, read and delete fittings within the monthly limit`
- [ ] **T13. api: the push.** `FittingNotifier` on the counters' Redis (A44), the gateway's room
      `user:<id>` and `fitting:finished`, the worker's `notify` (plan §6).
      Check: the socket e2e (own room, another user receives nothing, anonymous receives nothing);
      `npm run verify`.
      Commit: `feat(api): push a finished fitting to its user`
- [ ] **T14. web: the try-on of one item.** `entities/fitting`, the features `start-fitting`,
      `regenerate-fitting`, `try-colour` and `fitting-events` (the toast of A11, A34) with
      `@/shared/realtime` (`socket.io-client`, the dev rewrite), the widget `try-on` (boards 3,
      5, 6, 7, 11, 12 for one item: the picker, the wait with its estimate, the result with the
      colours, the regeneration sheet, the limit and error screens), the kit's `ProgressBar`,
      `Sheet`, `CountBadge`, `Chip`/`ChipGroup` with their `/ui-kit` sections; mounted from
      `/customer/fittings?product=<id>` until the product page exists (not tracked, removed in
      T19).
      Check: web tests of each screen, of the polling and of the toast; `qa-tester` on AC5–AC12,
      AC19, AC20;
      `npm run verify`.
      Commit: `feat(web): try an item on in the browser`
- [ ] **T15. web: the history list.** `/customer/fittings` (board 9 without compare: the tabs, the
      cards, open, delete, the empty state), the analytics zone `fitting` (its first entries).
      Check: web tests; `qa-tester` on AC17's list and deletion; `npm run verify`.
      Commit: `feat(web): list the fitting history`
- [ ] **T16. Close phase 2.** `CLAUDE.md`, `README.md` (the fitting, the models, the push); the
      clean install and `verify`; the summary; 👤 the reachability of `api.openai.com` from the
      server, then the first generation on production after the merge (A4).
      Check: `npm run verify` after `npm ci`; one real generation on production.
      Commit: `docs(docs): describe fitting generation`
- 👤 reviews and merges PR 3; sets the secret `OPENAI_API_KEY` before it.

## PR 4 · `feat/0019-product-page` · the product page (after 0014 and 0018's page cache)

- [ ] **T17. api: related products and the last fitting.** `GET /products/:id/related` (A36,
      `@Public()`) and `GET /products/:id/fittings/last` (`@SignedIn()`); the lists and the
      snapshot.
      Check: database e2e; `npm run verify`.
      Commit: `feat(api): related products and the last fitting of a product`
- [ ] **T18. web: the route, metadata and cache.** `app/products/[id]`, `_pages/product` with
      `generateMetadata`, the JSON-LD, the breadcrumbs, the 404, the cached catalog reads and the
      warm-up source (0018 V8), the sitemap's products (plan §8).
      Check: web tests of the metadata and the 404; the warm-up list check; `npm run verify`.
      Commit: `feat(web): add the product page`
- [ ] **T19. web: the gallery, the buy box and the try-on entry.** `widgets/product-gallery`,
      `widgets/product-buy-box` (rating, price, colour and size, the stubs of A33, `TryOnActions`,
      the limit meter, «Вы это примеряли»), the kit's `Gallery` with its `/ui-kit` section; the
      try-on widget opens from the page and its temporary entry of T14 is removed.
      Check: web tests; `qa-tester` on AC21, AC24, AC5 from the page; `npm run verify`.
      Commit: `feat(web): the product page's gallery and buy box`
- [ ] **T20. web: «О товаре» and «С этим товаром выбирают».** The description and attributes
      block, `widgets/related-products` with the cards' hanger (inert until phase 4) and the
      «В корзину» stubs.
      Check: web tests; `npm run verify`.
      Commit: `feat(web): the product page's details and related products`
- [ ] **T21. Analytics of the product page.** The zone `product` in `catalog.ts`, `EVENTS.md`,
      the tracked elements of the stubs and the try-on entry (plan §9).
      Check: `catalog.test.ts`, the budget; `npm run verify`.
      Commit: `feat(web): count the product page's clicks`
- [ ] **T22. Close phase 3.** `CLAUDE.md`, `README.md`; the clean install and `verify`; the
      summary; the pull request carries `Closes #69`; backlog «Product card link» removed.
      Check: `npm run verify` after `npm ci`; AC21–AC24 have evidence.
      Commit: `docs(docs): describe the product page`
- 👤 reviews and merges PR 4.

## PR 5 · `feat/0019-fitting` · looks, the fitting room and history

- [ ] **T23. api: the fitting room.** `fitting_room_items` and its migration (cascade from the
      user); `GET`, `PUT /:slot`, `DELETE /:slot`, `DELETE` of `/me/fitting-room`; the access
      lists; `openapi.json`.
      Check: database e2e (replace answers the replaced item, a category without a slot is refused,
      someone else's room is invisible, `DELETE /me` leaves no room item, AC28); `npm run verify`.
      Commit: `feat(api): keep a fitting room per user`
- [ ] **T24. web: the header's icon and the drawer.** `entities/fitting-room`,
      `features/fitting-room` (the `LookToggle` actions, the slot rows' actions, the replace and
      remove toasts with «Вернуть»), the widget `fitting-room-drawer` (board 2: the slots, the
      colour per item, the wishes field, the sum, the stubs, «Очистить»), the header's
      `FittingRoomButton` with its counter (A10, A12).
      Check: web tests; `qa-tester` on AC13, AC16; `npm run verify`.
      Commit: `feat(web): the fitting room in the header`
- [ ] **T25. web: looks.** «Примерить образ» → the try-on widget for a look (board 3.2), the look
      result (board 8: the items, the colours, the sum, the stubs), the colour change of one item
      (AC15), the hanger on the related products and the catalog's cards.
      Check: web tests; `qa-tester` on AC14, AC15; `npm run verify`.
      Commit: `feat(web): try a look on`
- [ ] **T26. web: history actions and compare.** «Примерить ещё раз» (the repeat of A7),
      compare two entries side by side (board 9, A41), the actions menu, «Поделиться» disabled
      (A14).
      Check: web tests; `qa-tester` on AC17, AC18; `npm run verify`.
      Commit: `feat(web): repeat and compare fittings`
- [ ] **T27. Analytics of the fitting.** The rest of the zone `fitting` (the room, the look, the
      history), `EVENTS.md`, the budget.
      Check: `catalog.test.ts`; `npm run verify`.
      Commit: `feat(web): count the fitting room and look events`
- [ ] **T28. Close the spec.** The production checks with the owner (AC5, AC13, AC14, AC17, AC19,
      AC28 on production after the merge); the acceptance record below; 0016's record of AC5–AC10,
      AC14, AC15 in its `tasks.md`; every file gets `Status: done`; `CLAUDE.md`'s opening paragraph and README's list;
      the backlog items of A42 removed.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0019`
- 👤 reviews and merges PR 5.

## Acceptance record

Filled in at T28.
