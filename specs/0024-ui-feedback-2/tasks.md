# 0024 ui-feedback-2: tasks

Status: done (2026-10-30): all 32 criteria pass (record below). History, not instructions.
Accepted 2026-10-29.

## How the work flows

Review at phase boundaries (Z26.7, as spec 0023 Y10): each task is done in a fresh session with
its `spec-finder` brief, ends with `finish-task` (the task's own tests, `typecheck`, `lint`, the
reviewers) and is committed without a stop; `qa-tester` runs once per phase at its last task on
the phase's acceptance criteria; the phase ends with a clean install, the full `npm run verify`,
the push, the pull request and one stop with the summary. The one stop inside a phase is T17's
(the drop zone on `/ui-kit`, Z17). A task that shows the plan is wrong stops the work. Every UI
task re-reads its canvas board and the note's text first, and keeps `CLAUDE.md`, `catalog.ts`
and `EVENTS.md` true in its own commit (`npm --prefix web test -- -u` after a catalog change).

Pull requests: PR 1 the documents only; PR 2 part 1 (web only: the visible fixes ship without
waiting for part 2's api); PR 3 part 2 (api and web together: web's new calls need the api of the
same release); PR 4 the closing, which records the owner's checks on the deployed site.

## PR 1 · docs/0024-ui-feedback-2 · documents

- [x] **T1. The documents.** `spec.md`, `clarifications.md`, `plan.md`, `tasks.md`,
      `source/agentation-notes.md`. Check: `npm run format:check`. Commit:
      `docs(specs): add spec 0024 ui-feedback-2`.

## PR 2 · feat/0024-look-and-motion · part 1 (web)

- [x] **T2. One easing (plan §2.1; AC1, AC4).** `--ease-standard`, `--duration-long`, every
      movement on them (Drawer, Modal, Toast, Accordion, Switch, Checkbox, Chip, FavoriteToggle,
      ScrollRow), the Stylelint rule, `Tabs.Indicator`. Check: `npm --prefix web run lint:styles`,
      the kit's tests. Commit: `feat(web): one easing for every animation, a sliding tabs underline`.
- [x] **T3. The search row and the gallery (plan §2.1; AC3, AC5).** The phone search row's
      `0fr → 1fr` slide with the focus at the loupe's click (Z30), `GalleryViewer`'s smooth
      `scrollTo`. Check:
      `header-search-toggle.test.tsx`, `gallery.test.tsx`. Commit:
      `feat(web): slide the phone search row, glide the gallery viewer`.
- [x] **T4. Categories as a sheet on phones (plan §2.2; AC2).** `CatalogCategorySheet`,
      `CatalogCategoryList`'s `all` row and counts in `rows`, the W28 effect removed,
      `catalog.category-toggle`'s description. Check: `catalog-browser.test.tsx`,
      `catalog-category-list.test.tsx`. Commit: `feat(web): categories open as a sheet on phones`.
- [x] **T5. The buy box's button (plan §2.3; AC6).** `secondary` 48 for «Примерить», the
      disabled `secondary` style, `/ui-kit`. Check: `product-buy-box.test.tsx`, `button.test.tsx`.
      Commit: `feat(web): quiet grey «Примерить» in the buy box`.
- [x] **T6. Tab icons (plan §2.4; AC7).** `LamodaMark` in the kit's icons (the pin reuses it),
      `app/icon.svg`, `app/icon1.tsx` (the PNG fallback, Z31), `app/apple-icon.tsx`, the warm-up
      list. Check: `routes.test.ts`, `curl -I` of `/icon.svg`, `/icon1` and `/apple-icon` locally. Commit: `feat(web): tab icons with the «la» mark`.
- [x] **T7. The header's chips, badge and burger heading (plan §2.5; AC8, AC9).** Grey `SoonChip`
      at the count's position, the centred `CountBadge`, «Каталог» in the burger. Check:
      `header.test.tsx`, `count-badge.test.tsx`, `soon-chip.test.tsx`, `header-menu.test.tsx`.
      Commit: `feat(web): grey «скоро» chips, centred count, the burger's catalog heading`.
- [x] **T8. The room's accessory chip and wishes field (plan §2.6; AC10).** Check:
      `outfit-slot.test.tsx`, `fitting-room-drawer.test.tsx`. Commit:
      `feat(web): accessory slot's «скоро», taller wishes field`.
- [x] **T9. The window's texts and alignments (plan §2.7; AC11, AC15).** «Ваше фото, видите
      только вы», «в этом месяце» everywhere, the item cards' actions at the top, the wait screen's
      text sizes, `WaitItems` 72×96 and the one button text (`try-on.close`'s description). Check:
      `try-on.test.tsx`, `try-on-look.test.tsx`, `fitting-wait.test.tsx`, `limit-meter.test.tsx`,
      `fitting-error-card.test.tsx`. Commit:
      `feat(web): window texts, card actions at the top, larger wait thumbnails`.
- [x] **T10. `InfoTip` and the result's caption (plan §2.8, §2.9; AC13).** The kit's `InfoTip` (hover
      and tap), `SavedNote`'s `note`, the `.note` paragraphs removed, `/ui-kit`. Check:
      `info-tip.test.tsx`, `saved-note.test.tsx`. Commit:
      `feat(web): info tip in the kit, the result's caption as a tooltip`.
- [x] **T11. The look result in one layout (plan §2.8; AC12, AC14).** One markup for every width,
      the colour line's condition and no «один цвет», the heart with its tooltip, the bottom-aligned
      block, «Заменить» on the item cards with the room's `focusSlot`, «Хотите что-то поменять в
      образе?» on phones; `room.open`, `result.add-to-cart-all`, `result.item-colour` descriptions.
      Check: `look-result.test.tsx`, `look-item-row.test.tsx`, `try-on-look.test.tsx`,
      `fitting-room-drawer.test.tsx`. Commit:
      `feat(web): look result in one layout, «Заменить» on the item cards`.
- [x] **T12. The picker's removals (plan §2.10; AC16, AC17).** The replace list without the chosen
      photo, no «Перейти в «Мои фото»» (`try-on.my-photos` removed from the catalog), «Примерить
      на другом фото» with nothing preselected; `try-on.replace-photo`, `try-on.photo`,
      `result.other-photo` descriptions. Check: `try-on.test.tsx`, `catalog.test.ts`. Commit:
      `feat(web): picker without the photos link, the chosen photo and a preselection`.
- [x] **T13. The stores search's pause (plan §2.11; AC18).** `useDebounced` in `shared/lib`,
      500 ms, the clear at once. Check: `stores-view.test.tsx` with fake timers. Then the phase's
      end: `qa-tester` on AC1–AC18 (a phone, a tablet, a desktop; a mouse and touch emulation;
      reduced motion), a clean install, `npm run verify`, the push, PR 2. Commit:
      `feat(web): stores search after a pause`.

## PR 3 · feat/0024-try-on-flow · part 2 (api and web)

### api

- [x] **T14. Keeping a transient photo (plan §3.1; AC22).** `PUT` and `DELETE /me/photos/:id/keep`,
      the limit's 409, the default rule, markers, Swagger, `openapi.json`. Check:
      `me-photos.e2e-spec.ts`, `access-markers`, `openapi-snapshot`. Commit:
      `feat(api): keep a transient photo for later try-ons`.
- [x] **T14a. The fitting's photo kind (plan §3.1; Z42, Z43, AC22).** `photoTransient` in
      `FittingDto` (the photo's `transient`, `null` once it is gone) on every route that answers
      one, Swagger, `openapi.json`, `CLAUDE.md`'s fittings paragraph; web's `fittingSchema` and
      its tests' fittings (Z43). Check: `fittings-routes.e2e-spec.ts`, `openapi-snapshot`, web's
      `schemas.contract.test.ts`. Commit: `feat(api): the fitting's photo kind for the result's switch`.
- [x] **T15. Seen results (plan §3.2; AC30).** The migration (`seen_at`, the partial index),
      `POST /fittings/:id/seen`, `POST /fittings/seen`, `unseen` in `GET /me/fitting-quota`,
      markers, `openapi.json`. Check: `fittings.e2e-spec.ts`, `fitting-quota` tests, the
      snapshots. Commit: `feat(api): seen results and the unseen count`.

### web

- [x] **T16. The silent retry (plan §4.1; AC20).** `isStartRetryable`, the mutations' retry once
      after 1.5 s (no bare 500, Z27), its comment and `CLAUDE.md`'s line on writes naming the
      exception, `Fitting Start Retried` in the catalog. Check: `mutations.test.tsx`,
      `retry.test.ts`, `catalog.test.ts`. Commit: `feat(web): silent retry of a fitting's start`.
- [x] **T17. The drop zone (plan §4.5; AC29).** The hairline card on `/ui-kit`'s upload section
      and in the window's zone (texts, hover, dragging), the formats line with HEIC. Check:
      `upload-photo.test.tsx`. **Stop once** for the owner's look at `/ui-kit` and the window
      (Z26.7) before the commit. Commit: `feat(web): the hairline drop zone`.
- [x] **T18. HEIC and paste (plan §4.5; AC27, AC28).** `libheif-js` (checked first as
      `CONTRIBUTING.md` rule 3 asks: on npm, its repository, usage, recent releases, no install
      script), `heic.ts`, `accept` by
      pointer, the paste listener with `source: paste`, `format` on the upload events, the CSP's
      `'wasm-unsafe-eval'`. Check: `heic.test.ts`, `upload-photo.test.tsx`, `policy.test.ts`,
      `check:web-bundle`. Commit: `feat(web): HEIC and pasted photos in the try-on`.
- [x] **T19. The wait from the click and the sticky button (plan §4.1; AC19, AC21).** `onStart`,
      `PendingFitting`, the progress origin kept, the picker's sticky footer on phones,
      `Fitting Started`'s description. Check: `try-on.test.tsx`, `try-on-look.test.tsx`,
      `fitting-wait.test.tsx`. Commit:
      `feat(web): the wait from the click, sticky «Примерить» on phones`.
- [x] **T20. The save switch on the result (plan §4.2; AC22).** No switch in the picker,
      `SavePhotoSwitch` on both results (shown by `transients` or `photoTransient`, Z42),
      `keepPhoto`/`unkeepPhoto`, `transients` kept in step (the fitting's schema's `photoTransient`
      came with T14a, Z43), `result.save-photo`, `Photo Uploaded.saved`'s description. Check:
      `save-photo-switch.test.tsx`, `try-on.test.tsx`. Commit:
      `feat(web): save the try-on's photo from the result`.
- [x] **T21. The picture's actions (plan §4.3; AC23–AC25).** `ResultTiles` removed, the picture
      opens `ResultViewer`, the download and share icons with tooltips, `features/share-fitting`
      with the fetched-ahead blob, «Добавить к образу» in the right column; `result.picture`,
      `result.share`, `result.fullscreen` removed, `result.download` and `result.to-look`
      descriptions. Check: `result-media.test.tsx`, `use-fitting-share.test.ts`, `try-on.test.tsx`,
      `catalog.test.ts`. Commit: `feat(web): full screen by click, download and share over the picture`.
- [x] **T22. «Что поменять?» as a popover (plan §4.4; AC26).** `RegeneratePopover` with the
      backdrop and the rise, on every width; the descriptions. Check:
      `regenerate-popover.test.tsx`, `try-on-look.test.tsx`. Commit:
      `feat(web): «Что поменять?» rises over the result`.
- [x] **T23. The unseen badge (plan §4.6; AC30).** `unseen` in the quota schema, the seen writes
      from the results and the history page, the push's +1, the badges on the profile icon, the
      burger and both «Мои примерки», `profile-menu.open`. Check: `use-fitting-events.test.tsx`,
      `header-profile.test.tsx`, `header-menu.test.tsx`, `fittings-page.test.tsx`,
      `catalog.test.ts`. Then the phase's end: `qa-tester` on AC19–AC31 (a stubbed 503 for one
      attempt, Z27; a HEIC drop, a paste, touch emulation, a phone width), a clean install,
      `npm run verify`, the push, PR 3. Commit: `feat(web): badge of the results not yet seen`.

## PR 4 · docs/0024-close · closing

- [x] **T24. Closing.** The owner's checks on the site recorded (AC7 in three browsers, AC24 on
      an iPhone and a desktop, AC27 with a real HEIC); every file `Status: done`; the acceptance
      record below; `CLAUDE.md` and `README.md` in line with what was built. Check:
      `npm run format:check`. Commit: `docs(specs): close spec 0024`.

## Acceptance record

Checked 2026-10-30 after PR 3 (#125, `main` f9874d4) was merged and deployed; PR 1 (#121) and
PR 2 (#124, `main` 682e9a1) were merged and deployed before it. "Production" is
lamoda-ai-fitting.ru. The `qa-tester` runs are the phases' last tasks: T13 (AC1–AC18) and T23
(AC19–AC31: a stubbed 503 for one attempt, a HEIC drop, a paste, touch emulation, a phone width).

| AC   | Result | Evidence                                                                                                                                                                                                    |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | ✅     | T2, T3: `lint:styles` (Stylelint refuses other curves), the kit's tests; Z26.3 for the smooth scroll; T13's qa-tester.                                                                                      |
| AC2  | ✅     | T4: `catalog-browser.test.tsx`, `catalog-category-list.test.tsx`; T13's qa-tester at a phone width.                                                                                                         |
| AC3  | ✅     | T3: `header-search-toggle.test.tsx` (Z30: the field focused at the click); T13's qa-tester.                                                                                                                 |
| AC4  | ✅     | T2: the kit's `Tabs` tests (`Tabs.Indicator`); T13's qa-tester.                                                                                                                                             |
| AC5  | ✅     | T3: `gallery.test.tsx`; T13's qa-tester.                                                                                                                                                                    |
| AC6  | ✅     | T5: `product-buy-box.test.tsx`, `button.test.tsx` (with Z39, Z41); T13's qa-tester.                                                                                                                         |
| AC7  | ✅     | T6: `routes.test.ts`, `curl -I` of `/icon.svg`, `/icon1`, `/apple-icon` (Z31). The owner, 2026-10-30, on production in Chrome, Safari and Firefox: the icon on every page named, no 404 in the console.     |
| AC8  | ✅     | T7: `header.test.tsx`, `count-badge.test.tsx`, `soon-chip.test.tsx`, `header-menu.test.tsx` (the chip's place as Z39 amends it); T13's qa-tester.                                                           |
| AC9  | ✅     | T7: `header-menu.test.tsx`; T13's qa-tester.                                                                                                                                                                |
| AC10 | ✅     | T8: `outfit-slot.test.tsx`, `fitting-room-drawer.test.tsx`; T13's qa-tester.                                                                                                                                |
| AC11 | ✅     | T9: `try-on.test.tsx`, `try-on-look.test.tsx`, `fitting-wait.test.tsx`, `limit-meter.test.tsx`, `fitting-error-card.test.tsx` (Z33, Z37, Z38); T13's qa-tester.                                             |
| AC12 | ✅     | T11: `look-result.test.tsx`, `look-item-row.test.tsx`, `try-on-look.test.tsx`; T13's qa-tester.                                                                                                             |
| AC13 | ✅     | T10: `info-tip.test.tsx`, `saved-note.test.tsx`; T13's qa-tester.                                                                                                                                           |
| AC14 | ✅     | T11: `look-result.test.tsx`, `look-item-row.test.tsx`, `fitting-room-drawer.test.tsx` (Z8); T13's and T23's qa-tester (the column's bottom after T21).                                                      |
| AC15 | ✅     | T9: `fitting-wait.test.tsx`; T13's qa-tester at 320 px.                                                                                                                                                     |
| AC16 | ✅     | T12: `try-on.test.tsx`, `catalog.test.ts`; T13's qa-tester.                                                                                                                                                 |
| AC17 | ✅     | T12: `try-on.test.tsx` (Z34, Z35); the review fix of PR 3: `try-on-look.test.tsx` (Z50); T13's qa-tester.                                                                                                   |
| AC18 | ✅     | T13: `stores-view.test.tsx` with fake timers (Z36); T13's qa-tester.                                                                                                                                        |
| AC19 | ✅     | T19: `try-on.test.tsx`, `try-on-look.test.tsx`, `fitting-wait.test.tsx`; T23's qa-tester.                                                                                                                   |
| AC20 | ✅     | T16: `mutations.test.tsx`, `retry.test.ts`, `catalog.test.ts` (Z26.6, Z27, Z45, Z46); Z48; T23's qa-tester with a stubbed 503.                                                                              |
| AC21 | ✅     | T19: `try-on.test.tsx`; T23's qa-tester at a phone width.                                                                                                                                                   |
| AC22 | ✅     | T14: `me-photos.e2e-spec.ts`, `access-markers`, `openapi-snapshot`; T14a: `fittings-routes.e2e-spec.ts`, `schemas.contract.test.ts`; T20: `save-photo-switch.test.tsx`, `try-on.test.tsx`; T23's qa-tester. |
| AC23 | ✅     | T21: `result-media.test.tsx`, `try-on.test.tsx`, `catalog.test.ts`; T23's qa-tester with touch emulation.                                                                                                   |
| AC24 | ✅     | T21: `use-fitting-share.test.ts`. The owner, 2026-10-30, on an iPhone (Safari, Chrome) and a desktop (Chrome, Safari, Firefox): the share or Z13's fallback, never nothing.                                 |
| AC25 | ✅     | T21: `try-on.test.tsx`; the review fix of PR 3 (Z49); T23's qa-tester.                                                                                                                                      |
| AC26 | ✅     | T22: `regenerate-popover.test.tsx`, `try-on-look.test.tsx`; T23's qa-tester on a desktop and a phone width.                                                                                                 |
| AC27 | ✅     | T18: `heic.test.ts`, `upload-photo.test.tsx`, `policy.test.ts`, `check:web-bundle`; T23's qa-tester. The owner, 2026-10-30, with a real HEIC: chosen, dropped and pasted, OK.                               |
| AC28 | ✅     | T18: `upload-photo.test.tsx`; T23's qa-tester.                                                                                                                                                              |
| AC29 | ✅     | T17: `upload-photo.test.tsx`; the owner's look at `/ui-kit` (Z47); T23's qa-tester.                                                                                                                         |
| AC30 | ✅     | T15: `fittings.e2e-spec.ts`, the quota tests, the snapshots (Z44); T23: `use-fitting-events.test.tsx`, `header-profile.test.tsx`, `header-menu.test.tsx`, `fittings-page.test.tsx`; T23's qa-tester.        |
| AC31 | ✅     | `catalog.test.ts` and `EVENTS.md` regenerated at T12, T16, T21, T23 (Z25's removals); the estimate under 80 %.                                                                                              |
| AC32 | ✅     | `npm run verify` after a clean install at each phase's end and on the closing commit; the snapshots regenerated with T14, T14a, T15; CI green on #124, #125 and `main` f9874d4.                             |
