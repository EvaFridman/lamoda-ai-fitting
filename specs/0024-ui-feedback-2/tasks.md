# 0024 ui-feedback-2: tasks

Status: accepted (2026-10-29).

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
- [ ] **T6. Tab icons (plan §2.4; AC7).** `LamodaMark` in the kit's icons (the pin reuses it),
      `app/icon.svg`, `app/apple-icon.tsx`, the warm-up list. Check: `routes.test.ts`, `curl -I`
      of both locally. Commit: `feat(web): tab icons with the «la» mark`.
- [ ] **T7. The header's chips, badge and burger heading (plan §2.5; AC8, AC9).** Grey `SoonChip`
      at the count's position, the centred `CountBadge`, «Каталог» in the burger. Check:
      `header.test.tsx`, `count-badge.test.tsx`, `soon-chip.test.tsx`, `header-menu.test.tsx`.
      Commit: `feat(web): grey «скоро» chips, centred count, the burger's catalog heading`.
- [ ] **T8. The room's accessory chip and wishes field (plan §2.6; AC10).** Check:
      `outfit-slot.test.tsx`, `fitting-room-drawer.test.tsx`. Commit:
      `feat(web): accessory slot's «скоро», taller wishes field`.
- [ ] **T9. The window's texts and alignments (plan §2.7; AC11, AC15).** «Ваше фото, видите
      только вы», «в этом месяце» everywhere, the item cards' actions at the top, the wait screen's
      text sizes, `WaitItems` 72×96 and the one button text (`try-on.close`'s description). Check:
      `try-on.test.tsx`, `try-on-look.test.tsx`, `fitting-wait.test.tsx`, `limit-meter.test.tsx`,
      `fitting-error-card.test.tsx`. Commit:
      `feat(web): window texts, card actions at the top, larger wait thumbnails`.
- [ ] **T10. `InfoTip` and the result's caption (plan §2.8, §2.9; AC13).** The kit's `InfoTip` (hover
      and tap), `SavedNote`'s `note`, the `.note` paragraphs removed, `/ui-kit`. Check:
      `info-tip.test.tsx`, `saved-note.test.tsx`. Commit:
      `feat(web): info tip in the kit, the result's caption as a tooltip`.
- [ ] **T11. The look result in one layout (plan §2.8; AC12, AC14).** One markup for every width,
      the colour line's condition and no «один цвет», the heart with its tooltip, the bottom-aligned
      block, «Заменить» on the item cards with the room's `focusSlot`, «Хотите что-то поменять в
      образе?» on phones; `room.open`, `result.add-to-cart-all`, `result.item-colour` descriptions.
      Check: `look-result.test.tsx`, `look-item-row.test.tsx`, `try-on-look.test.tsx`,
      `fitting-room-drawer.test.tsx`. Commit:
      `feat(web): look result in one layout, «Заменить» on the item cards`.
- [ ] **T12. The picker's removals (plan §2.10; AC16, AC17).** The replace list without the chosen
      photo, no «Перейти в «Мои фото»» (`try-on.my-photos` removed from the catalog), «Примерить
      на другом фото» with nothing preselected; `try-on.replace-photo`, `try-on.photo`,
      `result.other-photo` descriptions. Check: `try-on.test.tsx`, `catalog.test.ts`. Commit:
      `feat(web): picker without the photos link, the chosen photo and a preselection`.
- [ ] **T13. The stores search's pause (plan §2.11; AC18).** `useDebounced` in `shared/lib`,
      500 ms, the clear at once. Check: `stores-view.test.tsx` with fake timers. Then the phase's
      end: `qa-tester` on AC1–AC18 (a phone, a tablet, a desktop; a mouse and touch emulation;
      reduced motion), a clean install, `npm run verify`, the push, PR 2. Commit:
      `feat(web): stores search after a pause`.

## PR 3 · feat/0024-try-on-flow · part 2 (api and web)

### api

- [ ] **T14. Keeping a transient photo (plan §3.1; AC22).** `PUT` and `DELETE /me/photos/:id/keep`,
      the limit's 409, the default rule, markers, Swagger, `openapi.json`. Check:
      `me-photos.e2e-spec.ts`, `access-markers`, `openapi-snapshot`. Commit:
      `feat(api): keep a transient photo for later try-ons`.
- [ ] **T15. Seen results (plan §3.2; AC30).** The migration (`seen_at`, the partial index),
      `POST /fittings/:id/seen`, `POST /fittings/seen`, `unseen` in `GET /me/fitting-quota`,
      markers, `openapi.json`. Check: `fittings.e2e-spec.ts`, `fitting-quota` tests, the
      snapshots. Commit: `feat(api): seen results and the unseen count`.

### web

- [ ] **T16. The silent retry (plan §4.1; AC20).** `isStartRetryable`, the mutations' retry once
      after 1.5 s (no bare 500, Z27), its comment and `CLAUDE.md`'s line on writes naming the
      exception, `Fitting Start Retried` in the catalog. Check: `mutations.test.tsx`,
      `retry.test.ts`, `catalog.test.ts`. Commit: `feat(web): silent retry of a fitting's start`.
- [ ] **T17. The drop zone (plan §4.5; AC29).** The hairline card on `/ui-kit`'s upload section
      and in the window's zone (texts, hover, dragging), the formats line with HEIC. Check:
      `upload-photo.test.tsx`. **Stop once** for the owner's look at `/ui-kit` and the window
      (Z26.7) before the commit. Commit: `feat(web): the hairline drop zone`.
- [ ] **T18. HEIC and paste (plan §4.5; AC27, AC28).** `libheif-js` (checked first as
      `CONTRIBUTING.md` rule 3 asks: on npm, its repository, usage, recent releases, no install
      script), `heic.ts`, `accept` by
      pointer, the paste listener with `source: paste`, `format` on the upload events, the CSP's
      `'wasm-unsafe-eval'`. Check: `heic.test.ts`, `upload-photo.test.tsx`, `policy.test.ts`,
      `check:web-bundle`. Commit: `feat(web): HEIC and pasted photos in the try-on`.
- [ ] **T19. The wait from the click and the sticky button (plan §4.1; AC19, AC21).** `onStart`,
      `PendingFitting`, the progress origin kept, the picker's sticky footer on phones,
      `Fitting Started`'s description. Check: `try-on.test.tsx`, `try-on-look.test.tsx`,
      `fitting-wait.test.tsx`. Commit:
      `feat(web): the wait from the click, sticky «Примерить» on phones`.
- [ ] **T20. The save switch on the result (plan §4.2; AC22).** No switch in the picker,
      `SavePhotoSwitch` on both results, `keepPhoto`/`unkeepPhoto`, `transients` kept in step,
      `result.save-photo`, `Photo Uploaded.saved`'s description. Check:
      `save-photo-switch.test.tsx`, `try-on.test.tsx`. Commit:
      `feat(web): save the try-on's photo from the result`.
- [ ] **T21. The picture's actions (plan §4.3; AC23–AC25).** `ResultTiles` removed, the picture
      opens `ResultViewer`, the download and share icons with tooltips, `features/share-fitting`
      with the fetched-ahead blob, «Добавить к образу» in the right column; `result.picture`,
      `result.share`, `result.fullscreen` removed, `result.download` and `result.to-look`
      descriptions. Check: `result-media.test.tsx`, `use-fitting-share.test.ts`, `try-on.test.tsx`,
      `catalog.test.ts`. Commit: `feat(web): full screen by click, download and share over the picture`.
- [ ] **T22. «Что поменять?» as a popover (plan §4.4; AC26).** `RegeneratePopover` with the
      backdrop and the rise, on every width; the descriptions. Check:
      `regenerate-popover.test.tsx`, `try-on-look.test.tsx`. Commit:
      `feat(web): «Что поменять?» rises over the result`.
- [ ] **T23. The unseen badge (plan §4.6; AC30).** `unseen` in the quota schema, the seen writes
      from the results and the history page, the push's +1, the badges on the profile icon, the
      burger and both «Мои примерки», `profile-menu.open`. Check: `use-fitting-events.test.tsx`,
      `header-profile.test.tsx`, `header-menu.test.tsx`, `fittings-page.test.tsx`,
      `catalog.test.ts`. Then the phase's end: `qa-tester` on AC19–AC31 (a stubbed 503 for one
      attempt, Z27; a HEIC drop, a paste, touch emulation, a phone width), a clean install,
      `npm run verify`, the push, PR 3. Commit: `feat(web): badge of the results not yet seen`.

## PR 4 · docs/0024-close · closing

- [ ] **T24. Closing.** The owner's checks on the site recorded (AC7 in three browsers, AC24 on
      an iPhone and a desktop, AC27 with a real HEIC); every file `Status: done`; the acceptance
      record below; `CLAUDE.md` and `README.md` in line with what was built. Check:
      `npm run format:check`. Commit: `docs(specs): close spec 0024`.

## Acceptance record

Filled at T24: one line per criterion, AC1–AC32, with the evidence (a test's name, a `qa-tester`
run, the owner's check and its date).
