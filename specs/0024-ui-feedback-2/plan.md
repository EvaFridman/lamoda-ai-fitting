# 0024 ui-feedback-2: plan

Status: accepted (2026-10-29); its own choices are Z26 of [clarifications.md](clarifications.md),
confirmed with it, and Z12 is amended there (the housekeeping's real rule).

Decisions: `Z1`… of [clarifications.md](clarifications.md); notes `R1`–`R14`, `K1`–`K4`,
`T1`–`T14`, `H1`–`H2`, `D1` of [source/agentation-notes.md](source/agentation-notes.md). Paths:
`web` = `web/src`, `api` = `api/src`. One new dependency, `libheif-js` (§8).

## 1. Overview

Part 1 is web only: motion tokens and the easing of every animated component, the category sheet
on phones, the buy box's button, the favicon, the header's chips and badges and the burger's
heading, the room's accessory chip and wishes field, the texts and alignments of the try-on window
and both results, the look result's layout, the picker's three removals and the stores search's
pause.

Part 2 touches both. api: a transient photo can be kept (`PUT /me/photos/:id/keep`) and let go
again, and completed results have a "seen" mark with two writes and a count in the quota (one
migration, a nullable column and an index: the previous release runs on it). web: the optimistic
start with the silent retry and the sticky button, the save switch on the result, the picture's
actions (full screen by click, download and share icons, a working share), the regeneration
popover, HEIC and paste and the new drop zone, and the unseen badge.

Device rules stay spec 0023 Y13's: `COARSE_POINTER_QUERY` and `MOUSE_QUERY` where the pointer
decides, `PHONE_QUERY` and `@media` where the width does.

## 2. Part 1: web

### 2.1 Motion (Z2; K2, K4, H3, R2)

- `shared/styles/tokens.scss`: `--ease-standard: cubic-bezier(0.45, 0, 0.55, 1)` and
  `--duration-long: 0.4s` next to `--duration-fast` and `--duration-slow`; the reduced-motion
  block zeroes the new duration too.
- Every `transition` and `animation` of movement takes `var(--ease-standard)`: the `Drawer`
  (backdrop, popup transform, the nested step-back; `--duration-long` for a bottom sheet and a
  side drawer, `[data-swiping]` stays at 0), the `Modal`'s popup and `.animated` height, the
  `Toast`'s slide (its own bezier goes), the `Accordion`'s height, `Switch`, `Checkbox`, `Chip`,
  `FavoriteToggle`, `ScrollRow`, `Tabs`; opacity-only fades keep `ease`; the `linear` loops of
  `Spinner`, `Skeleton`, `Radio` and `TryOnLoader` stay. A Stylelint rule
  (`declaration-property-value-disallowed-list` on `transition`, `transition-timing-function`,
  `animation`, `animation-timing-function`: no `cubic-bezier(`, `ease-in`, `ease-out`,
  `ease-in-out` literals) keeps it so; `linear` and `ease` stay allowed.
- `Tabs` (`shared/ui/tabs`): Base UI's `Tabs.Indicator` under the list, positioned by its
  `--active-tab-left` and `--active-tab-width`, `transition: left, width` over `--duration-slow`;
  the tabs' own `border-bottom` goes. The list keeps `flex-wrap`; a wrapped row still gets a
  correct indicator since the vars come from the active tab's box.
- The header's search row on phones (`widgets/header`, `header-search-toggle.tsx`,
  `header.module.scss` `.search`): below 600 px the row is a grid cell whose
  `grid-template-rows` goes `0fr → 1fr` with `overflow: hidden`, over `--duration-slow`; its
  `visibility` turns on at the start of an opening and off at the end of a closing; `display:
none` goes. The field is focused at the loupe's click, `preventScroll`, while the row grows, so
  iOS opens the keyboard (Z30). With `q` on load the row renders open
  without a transition (the server-rendered state, no `data-animate` until the first toggle).
- `GalleryViewer` (`shared/ui/gallery/gallery-viewer.tsx`): `go()` scrolls with
  `scrollTo({ left, behavior: 'smooth' })`, as `ScrollRow`'s arrows do with `scrollBy`; the
  browser's own curve, the one exception to the easing (Z26.3).

### 2.2 Catalog category sheet on phones (Z3; K3)

`_pages/catalog/ui/catalog-browser.tsx`: below 600 px `CatalogCategoryToggle` opens a
`CatalogCategorySheet` (`_pages/catalog/ui`, the kit's `Sheet`, title «Категории») instead of the
in-flow list; the W28 scroll effect and `phoneCategoriesId` go. The sheet's body is
`CatalogCategoryList layout="rows"` given a first row «Все товары» (a new `all` prop: href and
count, the page's unfiltered total) and counts on the rows (`rows` shows them in grey, as the
sidebar does); the chosen row keeps `aria-current`. A row is a link with `categoryHref`
(the query kept); the page's change unmounts the sheet. `catalog.category-toggle` sends
`expanded: true` only (the sheet closes by swipe, backdrop or choice). The toggle's chevron
follows the sheet's open state.

### 2.3 Buy box (Z4; R1)

`widgets/product-buy-box/ui/product-buy-box.tsx`: the three «Примерить» renders become
`variant="secondary" size={48}`; `.tryOn`/`.toLook` keep `flex: 1; min-width: max-content`;
`ToLookButton` 48 beside it. `shared/ui/button/button.module.scss`: `.secondary:hover` keeps
`--color-background-tertiary`; `.secondary:disabled` gets `--color-background-secondary` with
`--color-text-secondary` text and no hover change, so the disabled one (the limit) differs from the
hovered one by its text colour and its stillness. `/ui-kit`'s button section shows `secondary`
48 next to `primary` 48 and the disabled one. At PR 2's review (Z39) the buy box's «Примерить»
gets `--color-border-active` as its border, hovered too; disabled at the limit (not while
loading) it keeps only its fill. Then (Z41) its fill is `--color-background-tertiary`,
`brightness(0.95)` on hover, the disabled one the kit's lighter fill.

### 2.4 Favicon (Z5; K1)

`web/app/icon.svg`: a 32×32 black square (`--color-text` as a literal `#000`) with the «la» mark's
two paths of `widgets/stores-map/ui/store-pin.tsx` in white, scaled to 20 px; the paths move into
`shared/ui/icons` (`LamodaMark`) and the pin imports them from there. `web/app/apple-icon.tsx`:
180×180 PNG through `ImageResponse` (as `_pages/catalog/ui/preview-image.tsx`), the same mark on
black, static; `web/app/icon1.tsx` the same at 32×32, the PNG fallback (Z31). No `public/`, no
binary file. `_app/warmup/routes.ts`: `/icon.svg`, `/icon1` and `/apple-icon` in `EXCLUDED`
(«static metadata files, no api»). `proxy.ts` matches them as pages;
harmless.

### 2.5 Header (T8, T9, T10, T14)

- `SoonChip` (`shared/ui/soon-chip`): background `--color-background-tertiary`, text
  `--color-text-secondary`; `header.module.scss` `.soon` moves to the count badge's position
  (`top: 4px; right: 2px`, `fitting-room-button.module.scss`'s). At PR 2's review (Z39) it moves
  higher and further right, `top: 0; right: -4px`.
- `CountBadge` (`shared/ui/count-badge`): `display: inline-flex; align-items: center;
justify-content: center; padding: 0 4px; font-variant-numeric: tabular-nums; line-height: 1`,
  so «1» and «2» sit in the middle; its test checks the box is 18 px and the text centred.
- `HeaderMenu` (`widgets/header/ui/header-menu.tsx`): after the profile list (or «Войти») one
  hairline (the catalog list's `border-top` stays, the duplicate `margin-top` hairline of the
  section above goes), then a heading «Каталог» (caption, `--color-text-secondary`,
  `padding: 24px 0 8px`), then «Все товары» and the categories.

### 2.6 Fitting room drawer (Z6; T12, T13)

`entities/fitting-room/ui/outfit-slot.tsx` `EmptySlotRow`: with no `href` it renders `SoonChip`
after the title (the accessory), `aria-hidden` as in the header; the «+» box stays inert.
`widgets/fitting-room-drawer/ui/room-wishes.tsx`: `rows={5}`, `field-sizing: content` with
`min-height` of five lines and `max-height` of eight (`line-height × n + padding`), then
`overflow-y: auto`; browsers without `field-sizing` (Firefox) keep the five-line minimum with a
scroll (no JS auto-grow).

### 2.7 Texts and alignments of the window (T1, T6, T7, R7, R8, R9, R12)

- `widgets/try-on/ui/photo-picker.tsx` `.private`: «Ваше фото, видите только вы».
- «в этом месяце»: `try-on.tsx:335` «Образ целиком — 1 примерка · осталось N в этом месяце»,
  `look-result.tsx:195` «Образ — 1 примерка · осталось N в этом месяце», `fitting-result.tsx`'s
  «Списали 1 примерку · осталось N в этом месяце» / «Осталось N в этом месяце»,
  `photo-picker.tsx:154` and `fitting-error-card.tsx:80` «Примерка не списана · осталось N в этом
  месяце»; `triesLeftText`'s «мало» and «закончились» forms stay. `triesLeftOfText` (the history's
  aside) ends in «в этом месяце» too, its «закончились» form unchanged (Z38, at T13's QA).
- `item-row.module.scss`, `picker-item-actions.module.scss`, `look-subject.module.scss`,
  `look-result.module.scss` (`.rowCart`): `align-items: flex-start` and `align-self: flex-start`,
  the actions on one line at the card's top (`display: flex; gap: 8px`). Below 360 px of the look
  result's column «В корзину» is the bag icon beside the heart and «Заменить» goes under the text
  (Z37, at T13's QA). At PR 2's review (Z40) the single result's item card is `ItemRow` (60×80,
  40×54 on a phone; its `size` prop and 72×96 go) whose `action` holds `CartStubButton` 32 body-s
  (`result.add-to-cart`, kind `single`) and `FavoriteStub` 32, the size's stub under it, no 56 px
  buttons; the stub is a 32 px `Select` in body-s, as wide as its text, under the card's text
  (Z41).
- `look-item-row.tsx`: with one colour nothing renders in the colour slot; `look-result.tsx`: the
  line «Смена цвета одной вещи…» renders only when `items.some(colours.length > 1)` (the rows
  already read `useProduct`; the parent reads the same queries through a small
  `useLookColours(items)` so the line and the rows agree).
- `features/start-fitting/ui/fitting-wait.tsx`: `.progressHead` gets `gap: 12px`, `.stepNow`
  body-s with `min-width: 0; overflow-wrap: anywhere`, the percent `flex: none`; a `WaitItems` row
  (72×96 thumbnails, 8 px gaps, every item, the single item's with its name and colour beside it,
  on every width) replaces the 48×64 image and `ItemsStrip`; the button reads «Закрыть и
  продолжить покупки» on every width (`try-on.close`'s description changes).

### 2.8 Look result's layout (R5, R6, R10, R11, R13, R14)

`widgets/try-on/ui/look-result.tsx` and `fitting-result.tsx`:

- One markup for every width: the phone's `ItemsStrip`, the «Вещи образа» drawer and the phone
  buttons go; below 800 px the grid is one column (picture, saved note, items, buttons), from 800
  px two. The right column is `display: flex; flex-direction: column`; the block after the list
  (the sum, the cart row, «Хотите что-то поменять в образе?», the meter) has `margin-top: auto`,
  so on a desktop its bottom meets the picture's bottom (R11).
- `SavedNote` (`entities/fitting/ui/saved-note.tsx`) takes `note`: after the link an
  `InfoTip` (new in the kit, §2.9) with «Изображение приблизительное, могут быть неточности в
  посадке, длине и цвете.»; the `.note` paragraphs of both results go.
- The cart row: «Добавить образ в корзину» (56) and a `FavoriteStub` 56 with
  `aria-label="Добавить образ в избранное"` wrapped in the kit's `Tooltip` «Добавим в избранное
  все вещи образа» (hover; on a touch device the tooltip is not shown, the stub's toast says what
  happens); untracked, as before.
- `LookItemRow` gets «Заменить» (a `LinkButton`, body-s) in its actions; it calls
  `onReplace(slot)` → `LookResult`'s `onOpenRoom(slot)` → `TryOn` closes and
  `openRoom({ slot })`; `entities/fitting-room`'s store keeps `focusSlot`, and
  `FittingRoomDrawer` scrolls that `OutfitSlotRow` into view on open and clears it. `room.open`
  keeps `source: result`. The link «Заменить вещь в примерочной» goes.
- «Хотите что-то поменять в образе?» renders in the flow on every width (it was only in the
  desktop column and the phone drawer), so phones get it (R13); the popover is §4.4.

### 2.9 The kit's `InfoTip`

`shared/ui/info-tip`: a 16 px «!» in a circle (`InfoIcon`), a `<button aria-label>` wrapped in
Base UI's `Tooltip` for a mouse and, under `COARSE_POINTER_QUERY`, a `Popover` of the same look
opened by a tap (Base UI's `Tooltip` has no touch opening), closed by a tap outside or Escape.
Shown on `/ui-kit`. At PR 2's review (Z39) the trigger's `delay` is 100 ms.

### 2.10 Picker's removals (T3, T5, H2)

`widgets/try-on/ui/photo-picker.tsx`: the replace window's `thumbs` leave out the chosen photo
(so one saved photo, chosen, gives no list and the window shows the pickers only); `MyPhotosLink`
and its `try-on.my-photos` go (the catalog entry too). `try-on.tsx`: «Примерить на другом фото»
sets `picking` and `chosenId = null` with a flag `noPreselect`, so the picker shows the empty zone
and no saved photo selected; `StartFittingButton` disabled until a choice. The first open keeps
the default preselected (spec 0019 A63.4).

### 2.11 Stores search (Z9; S2)

`_pages/stores/ui/stores-view.tsx`: `text` stays the field's value; a `useDebounced(text, 500)`
(`shared/lib`) feeds `matchStores` and the map; `''` applies at once (the clear button and an
emptied field). `useSearchedEvent` keeps its second from the debounced value. At T13 (Z36) the
hook replaces spec 0026's 300 ms timer: its `atOnce` takes an empty text and one restored before
hydration; `Stores Searched` keeps its second on the typed text, as before.

## 3. Part 2: api

### 3.1 Keeping a transient photo (Z12)

`me/photos`: `PUT /me/photos/:id/keep` (`@SignedIn()`, write tier, `signOutWhenGone`): in one
transaction lock the user's row, find the user's photo (missing, another user's: 404; already
saved: 200 unchanged), count the saved ones (five: 409 `LIMIT_REACHED`), set `transient = false`
and, with no default photo, `is_default = true` (the upload's rule); answer `UserPhotoDto`.
`DELETE /me/photos/:id/keep` (204): the same lock, a saved photo of the user back to
`transient = true` and `is_default = false` (a missing or transient one: 404); the housekeeping
and the window's close delete it as any transient photo. `PATCH /me/photos/:id` stays
`isDefault` only. Both go into `SIGNED_IN_HANDLERS`, Swagger (`@ApiErrors` 409 on the `PUT`) and
`openapi.json`. The housekeeping's rule is unchanged: a transient photo goes an hour after its
last generation ended (Z12 amended), so a result opened later finds it gone (§4.2).

### 3.2 Seen results (Z18)

- Migration: `ai_generations.seen_at timestamptz NULL`; a partial index
  `(user_id) WHERE status = 'completed' AND seen_at IS NULL AND kind IS NOT NULL`.
- `POST /fittings/:id/seen` (`@SignedIn()`, write tier, 204): sets `seen_at = now()` on the
  user's completed fitting where null (another's or missing: 404; not completed: 204, nothing).
  `POST /fittings/seen` (204): every unseen completed fitting of the user. Neither reads marks
  anything: `GET /fittings/:id` is polled and prefetched (the push's `fetchQuery`), so a read
  cannot mean "opened".
- `GET /me/fitting-quota` answers `unseen` (the count of the partial index's rows) beside `limit`,
  `used`, `left`, `renewsAt`; `FittingQuotaDto`, `openapi.json`, web's `fittingQuotaSchema`.
- `access-markers`, `throttle-markers` and the snapshots updated; `fittings.e2e-spec` covers the
  two writes and the count.

## 4. Part 2: web

### 4.1 The optimistic start, the silent retry and the sticky button (Z10, Z11; R12, T2)

- `entities/fitting/api/mutations.ts`: the start, the look start and the regeneration get
  `retry: (count, error) => count < 1 && isStartRetryable(error)` and `retryDelay: 1500` (Z26.6);
  `isStartRetryable` (`shared/api/retry.ts`): kind `network` or `timeout`, or `http` 502/503/504;
  a 429 and a bare 500 are not (Z27). Its comment says why this write may repeat against spec 0017
  plan §4's "a write is not repeated by itself": the api answers the running fitting of the same
  fingerprint (spec 0019 A32), so a lost answer starts no second generation; `CLAUDE.md`'s line
  on writes names the exception. `trackFittingRefused` and `reportFailure` stay in `onError`, after the last
  attempt. `Fitting Start Retried` is sent from `onSettled` when `failureCount > 0`, with `cause`
  (the first failure's kind or status class) and `outcome` (§6).
- `widgets/try-on/ui/try-on.tsx`: `StartFittingButton` and `StartLookButton` take `onStart`
  (called before `mutate`): `TryOn` sets `starting = { at: Date.now(), items, kind }` and shows
  `FittingWait` with a pending fitting shape (`features/start-fitting`'s `PendingFitting`: items,
  kind, `createdAt` the click time, `estimatedSeconds` from the quota's last median as before);
  `onSuccess` sets `fittingId` and keeps `starting.at` as the progress origin (`useRunningProgress`
  and `fittingProgress` take an `origin` the window passes; a fitting opened from elsewhere keeps
  its `createdAt`), so the percent does not restart; `onError` clears `starting` and shows the
  picker with its `startError` notice or the limit card as today. The same for the colour change
  and the regeneration (their wait over the result starts at the click).
- Sticky button: `photo-picker.module.scss` below 600 px, the footer (`StartFittingButton` and
  the meter) `position: sticky; bottom: 0; background: var(--color-background); padding: 12px 0
calc(12px + env(safe-area-inset-bottom))`, inside the modal's scroll container, which is the
  phone's whole window; the content's end keeps 8 px above it.

### 4.2 The save switch on the result (Z12; T4)

- `photo-picker.tsx`: `saveSwitch` goes from the zone and the replace window; `UploadPhoto`'s
  `save` is `false` in the window (`Photo Uploaded.saved` false from the window).
- `fitting-result.tsx` and `look-result.tsx`: `SavePhotoSwitch` (`features/upload-photo`) in the
  right column above the item cards, rendered when the fitting's photo is in the window's
  `transients` or `useMyPhotos` shows it `transient: true`. The answer is taken once, as soon as
  it is known (at once from `transients`, else when `useMyPhotos` has loaded; nothing renders
  while it loads), and kept in the component's state (`ownPhoto`) for the result's lifetime, never
  recomputed after the switch's own keep or unkeep, so the switch stays
  after its own keep and can be turned off and on again. On mount with the switch on it calls
  `keepPhoto(id)` once (`PUT …/keep`); a 409 shows it off and disabled with no text (Z29); a 404
  shows «Фото уже удалено» in its place; a kept photo leaves
  `transients` (so the window's close does not delete it) and joins `userPhotoKeys.all`. Turning
  it off calls `unkeepPhoto(id)` (`DELETE …/keep`): the photo is transient again and back in
  `transients`, deleted when the window closes or by the housekeeping (Z26.4). The element is
  `result.save-photo` with `saved`.
- `entities/user-photo`: `keepPhoto`, `unkeepPhoto` requests; `widgets/my-photos` unchanged.

### 4.3 The picture's actions: full screen, download, share (Z13, Z14; R3, R4, H1)

- `ResultTiles` goes. `ResultPicture` (`result-media.tsx`): the frame is a `<button>` that opens
  `ResultViewer`: the kit's `GalleryViewer` with one photo, `lens={false}` (the signed link only
  in `<img src>`, the container `mp-block`), no arrows or counter with one photo, × and Escape;
  the browser's `requestFullscreen` goes (iPhone Safari has none for a `div`). The element is
  `result.picture`.
- Over the picture, bottom right, two round `IconButton`s «Скачать» and «Поделиться» in a group
  shown on hover (`MOUSE_QUERY`: `opacity 0 → 1` over `--duration-fast`, also on focus-within)
  and always on a touch device; each in a `Tooltip`. The download is `useFittingImageDownload`
  as before (`result.download`).
- Share (`features/share-fitting`, `useFittingShare`): `fetchFittingImage(id)`
  (`entities/fitting/api/download.ts`, refactored out of `downloadFittingImage`) gives the blob
  and the file name; with `navigator.canShare?.({ files: [file] })` it calls
  `navigator.share({ files: [file], title: 'Моя примерка' })` (an `AbortError` is a cancel,
  nothing shown); otherwise it saves the file as the download does and shows «Файл сохранён —
  отправьте его из галереи». To keep Safari's user activation, the blob is fetched ahead: on the
  picture's first `pointerenter` with a mouse, and when the result opens on a touch device, kept
  in the hook's state for the result's lifetime. `result.share` sends `method`.
- The single result's «К образу» tile goes; `LookTile` becomes `ToLookButton`-like
  («Добавить к образу» / «В образе», outline 48) in the right column's `.buy` row after
  `FavoriteToggle`, wrapping on a narrow window; `result.to-look` stays.

### 4.4 The regeneration popover (R13)

`features/regenerate-fitting/ui/regenerate-sheet.tsx` → `RegeneratePopover`: Base UI `Popover`
anchored to «Хотите что-то поменять…», `side="top"`, `align="start"`, the panel as wide as the
right column (at most 440 px, on a phone the window's width less 32 px), with a `Popover.Backdrop`
dimming the window (`rgba(0,0,0,0.32)`), rising from `translateY(8px)` with a fade over
`--duration-slow` and `--ease-standard`; inside, the hint, «Какая именно?» chips for a look, the
comment field and «Перегенерировать» as today; Escape, the backdrop and × close it. Base UI flips
it below the button when the space above is short. Elements `result.regenerate-open` and
`result.regenerate` stay.

### 4.5 HEIC, paste and the drop zone (Z15, Z16, Z17; D1)

- `features/upload-photo/lib/heic.ts`: `isHeic(file)` (type `image/heic`/`image/heif` or the
  extension `.heic`/`.heif` with an empty type) and `heicToJpeg(file)`: `await import('libheif-js/wasm-bundle')`, decode the primary image to RGBA, draw it on a canvas, `toBlob('image/jpeg', 0.92)`,
  a `File` named `<name>.jpg`; EXIF orientation is applied by libheif's `display()` as the
  decoder reports it. `UploadPhoto`'s `send`/`drop` run it before the size check (the JPEG's size
  counts) with the zone's text «Готовим фото…» and the pickers disabled meanwhile; a decoder
  failure says «Не удалось прочитать HEIC — попробуйте JPG». `PHOTO_ACCEPT` adds
  `image/heic,image/heif` only under `MOUSE_QUERY` (Z26.2: iOS converts to JPEG itself when the
  input does not ask for HEIC, which is faster than the wasm decoder on a phone; a HEIC dropped
  or pasted on any device is decoded). `isPhotoType` accepts them; `WRONG_TYPE_TEXT` and the
  tips' line name HEIC. CSP: `script-src` gets `'wasm-unsafe-eval'` on every page
  (`shared/csp/policy.ts`, its test), the first loosening of the site's policy since spec 0014: it
  allows WebAssembly to compile and no script `eval`; the try-on window opens on the product
  pages, the history and from the room, so a per-path policy would not hold. The code's comment
  says so.
- Paste: `UploadPhoto` with `appearance="zone"` listens to `paste` on `document` while mounted;
  an `image/*` item of the clipboard becomes a `File` and goes through `drop()`'s path with
  `source: 'paste'` (the consents first if not given); a paste into a focused text field or with
  no image does nothing.
- The zone (Z17): `.zoneEmpty` is the hairline card: `border: 1px solid var(--color-border)`,
  white, centred column; a 56 px hairline circle with a thin «+» (`PlusIcon` 24, stroke 1.5),
  «Загрузите своё фото» (headline-s), «Перетащите, вставьте Ctrl+V или выберите файл» (body-s,
  secondary; on a touch device «Выберите файл или сделайте фото»), the `FileInput bare` as the
  link «Выбрать файл» (touch: the two tiles, hairline style), the caption «JPG, PNG, WebP, HEIC ·
  до 20 МБ» at the bottom. `:hover` blackens the circle; `.dragging` blackens the border, fills
  the card `--color-background-secondary` and scales the circle 1.1 over `--duration-fast` with
  `--ease-standard`. The card's size is the `PhotoFrame`'s. Shown on `/ui-kit`'s upload section.

### 4.6 The unseen badge (Z18, Z26.1; T11)

- `entities/fitting`: `fittingQuotaSchema` gets `unseen`; `markFittingSeen(id)` and
  `markAllFittingsSeen()` requests; `useUnseenCount()` reads the quota.
- `features/fitting-events` `useFittingEvents`: on a push of a completed fitting not shown, before
  the toast, `setQueryData(quota, unseen + 1)` (the invalidation that follows reads the real
  count).
- `widgets/try-on`: `FittingResult`/`LookResult` call `markFittingSeen` once per completed
  fitting id they render (a mutation with no retry; a failure is logged, not shown) and set the
  quota's `unseen` down by one when the fitting was unseen. `_pages/fittings`: on mount
  `markAllFittingsSeen()` and `unseen = 0` in the cache.
- `widgets/header`: `HeaderProfile`'s icon gets `CountBadge` with `unseen` (`9+` past nine),
  `profile-menu.open` sends `signed_in` and `unseen` (the badge's value, 10 for «9+», Z28); `SectionLink` «Мои примерки» shows the same
  count; on phones (the icon hidden) the burger's `IconButton` carries the badge and `HeaderMenu`'s
  «Мои примерки» row the count (Z26.1). Signed out nothing.

## 5. Risks

- **The header reads the quota on every page.** The badge (§4.6) makes a signed-in visitor's
  every page load read `GET /me/fitting-quota` (the read tier, the cache shared with
  `LimitMeter`'s key), where only the product page and the history read it before. One small read
  per load; the first-request measurement after a deploy (spec 0018) may show it.

- **Safari and `navigator.share` after an `await`.** Safari refuses a share outside the user's
  activation; the blob is fetched ahead (§4.3), and a refusal (`NotAllowedError`) falls back to
  the download with the toast, so the click never ends in nothing. Checked by the owner on an
  iPhone (owner actions).
- **The wasm decoder on a phone.** A 12 MP HEIC decodes in 2–5 s on a mid-range phone and the
  chunk is about 2 MB; the file input on touch devices does not ask for HEIC (Z26.2), so the path
  is taken only by a drop or a paste. The zone says «Готовим фото…» meanwhile.
- **A transient photo gone before the result is opened.** The housekeeping deletes it an hour
  after the generation ended; a result opened from the history or a late toast shows «Фото уже
  удалено» instead of the switch (Z12 amended). Opening the result right after the generation,
  the usual way, keeps it at once.
- **The silent retry and `@Expensive()`.** The expensive tier allows one request a second
  (`THROTTLE_EXPENSIVE_BURST` 1) and ten a minute; a repeat exactly a second later can land in
  the same window and answer 429, which is not repeated. So the repeat waits 1.5 s (Z26.6), and
  a 429 shows the error card whose «Попробовать ещё раз» is the user's repeat.
- **`Tabs.Indicator` and wrapped tabs.** The indicator follows the active tab's box, so a wrapped
  row works; the first render has no transition (Base UI renders it after measuring).
- **The search row's `0fr → 1fr`** needs the row's content to be the grid cell's child with
  `min-height: 0`; Safari 16+ animates it. Older browsers get an instant open.
- **Popover inside the modal.** Base UI's `Popover` portals to the body above the `Modal`; the
  modal's focus trap must let it through (Base UI handles nested floating elements; checked in
  `try-on.test.tsx` with the keyboard).
- **`field-sizing`** is not in Firefox: the field keeps five lines and scrolls; no JS fallback.

## 6. Analytics (the `analytics` agent's proposal of 2026-10-29, Z26.5)

Removed: `try-on.my-photos`, `result.fullscreen` (its history ends; the picture's click is a
new element). Unchanged but described anew: `room.open` (`source: result` is «Заменить» on the
item card), `try-on.close` (one button text), `result.download` (an icon over the picture),
`result.to-look` (a button in the right column), `result.regenerate-open` / `result.regenerate`
(a popover), `result.add-to-cart-all`, `result.item-colour`, `result.other-photo`,
`try-on.replace-photo`, `try-on.photo`, `photos.upload`, `catalog.category-toggle` (only
`expanded: true` now), `catalog.category` (the sheet's rows), `profile-menu.section`, the zones'
descriptions (`auth`, `catalog`, `fitting`).

New:

| Entry                             | Zone / area             | Type          | Properties                                                                                                                       | Estimate                   |
| --------------------------------- | ----------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| event `Fitting Start Retried`     | `fitting`               | `service`     | `kind`, `source` (as `Fitting Started`), `cause` (`network`, `timeout`, `server`), `outcome` (`started`, `refused`, `failed`)    | 0.001 / visit              |
| element `result.picture`          | `fitting` / `result`    | `interaction` | —                                                                                                                                | 0.008 clicks, 0.015 hovers |
| element `result.share`            | `fitting` / `result`    | `interaction` | `method` (`system`, `download`)                                                                                                  | 0.004, 0.005               |
| element `result.save-photo`       | `fitting` / `result`    | `interaction` | `saved` (boolean)                                                                                                                | 0.003, 0.003               |
| element `profile-menu.open`       | `auth` / `profile-menu` | `interaction` | `signed_in` (boolean), `unseen` (number 0–10, 10 for «9+», Z28)                                                                  | 0.12, 0.15                 |
| `Photo Uploaded`, `Photo Refused` |                         |               | `source` + `paste`; new `format` (`jpeg`, `png`, `webp`, `heic`: the chosen file's own format, before the conversion), five each |                            |

Not tracked: the «!» tooltip, the look's heart, the viewer's close, the optimistic wait by itself,
the sticky button. Budget after: 39.635 events a visit, 118 905 a month, 11.9 % (the sdk's 17 a
visit unchanged). `catalog.test.ts`'s lists and `EVENTS.md` change in the same commits.

## 7. Acceptance criteria → checks

| AC   | Check                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | the Stylelint rule in `verify`; `drawer`, `modal`, `toast`, `tabs` tests read the computed easing; `qa-tester` on a phone: the filters' sheet, reduced motion                                     |
| AC2  | `catalog-browser.test.tsx` (the sheet opens, rows with counts, «Все товары», the query kept); `qa-tester` at 390 px                                                                               |
| AC3  | `header-search-toggle.test.tsx` (open state, focus at the click, Z30); `qa-tester` on a phone                                                                                                     |
| AC4  | `tabs.test.tsx` (the indicator's vars follow the active tab); `qa-tester` on `/customer/fittings`                                                                                                 |
| AC5  | `gallery.test.tsx` (`scrollTo` called with `behavior: 'smooth'`)                                                                                                                                  |
| AC6  | `product-buy-box.test.tsx` (variant and size, disabled at the limit); `/ui-kit`                                                                                                                   |
| AC7  | `routes.test.ts`; `curl -I` of `/icon.svg`, `/icon1` and `/apple-icon` locally and on the site; the tab in three browsers (owner)                                                                 |
| AC8  | `header.test.tsx`, `count-badge.test.tsx` (box and centring by computed style); `qa-tester` screenshot                                                                                            |
| AC9  | `header-menu.test.tsx` (the heading «Каталог» and its order, signed in and out)                                                                                                                   |
| AC10 | `outfit-slot.test.tsx` (the chip), `fitting-room-drawer.test.tsx` (`rows`, the heights by computed style)                                                                                         |
| AC11 | `try-on.test.tsx`, `try-on-look.test.tsx`, `limit-meter.test.tsx`, `fitting-error-card.test.tsx` texts; `item-row` alignment by class                                                             |
| AC12 | `look-item-row.test.tsx`, `look-result.test.tsx` (one colour, the line's condition, one markup on a phone)                                                                                        |
| AC13 | `saved-note.test.tsx`, `info-tip.test.tsx` (hover and tap)                                                                                                                                        |
| AC14 | `look-result.test.tsx` («Заменить» → `onOpenRoom(slot)`, the heart's tooltip), `fitting-room-drawer.test.tsx` (scroll to the slot); `qa-tester` desktop bottom alignment                          |
| AC15 | `fitting-wait.test.tsx` (texts, 72×96, the button); `qa-tester` at 320 px                                                                                                                         |
| AC16 | `try-on.test.tsx` (the replace list without the chosen one; no link); `catalog.test.ts`                                                                                                           |
| AC17 | `try-on.test.tsx` («Примерить на другом фото» → empty zone, start disabled)                                                                                                                       |
| AC18 | `stores-view.test.tsx` with fake timers (500 ms, clear at once, the event's second)                                                                                                               |
| AC19 | `try-on.test.tsx` (the wait appears before the mutation resolves; progress origin kept; a refusal returns to the picker)                                                                          |
| AC20 | `mutations.test.tsx` (retry once for network, timeout, 503; not for 400/409/401/429/500; `Fitting Start Retried`); `qa-tester` with a stubbed 503 for one attempt (Z27)                           |
| AC21 | `qa-tester` on a phone: the button at the bottom while scrolling, the content's end visible                                                                                                       |
| AC22 | api `me-photos.e2e-spec` (keep, unkeep, the limit's 409, 404s, the default rule); web `save-photo-switch.test.tsx`, `try-on.test.tsx` (kept photo not dropped on close)                           |
| AC23 | `result-media.test.tsx` (the viewer opens, ×, Escape; the icons' visibility by pointer); `qa-tester` with a mouse and touch emulation                                                             |
| AC24 | `use-fitting-share.test.ts` (`canShare` true → `share` with the file; false → download and toast; `AbortError` silent); the owner on an iPhone, Safari and Chrome desktop                         |
| AC25 | `try-on.test.tsx` («Добавить к образу» in the right column, `result.to-look`)                                                                                                                     |
| AC26 | `regenerate-popover.test.tsx` (opens anchored, Escape, backdrop; a look's «Какая именно?»); `try-on-look.test.tsx` on a phone width                                                               |
| AC27 | `heic.test.ts` (`isHeic`, the decoder mocked), `upload-photo.test.tsx` (a HEIC drop decodes then uploads; `accept` by pointer); `policy.test.ts` (`wasm-unsafe-eval`); the owner with a real HEIC |
| AC28 | `upload-photo.test.tsx` (a paste event with an image item uploads with `source: paste`; text ignored; a focused field ignored)                                                                    |
| AC29 | `upload-photo.test.tsx` (the zone's texts, `dragging` class); `/ui-kit`; `qa-tester` with a drag                                                                                                  |
| AC30 | api `fittings.e2e-spec` (seen writes, `unseen` count); web `use-fitting-events.test.tsx` (+1 and the toast), `header-profile.test.tsx` (the badge, `9+`), `fittings-page.test.tsx` (all seen)     |
| AC31 | `catalog.test.ts`, `EVENTS.md` regenerated, `estimateMonthly` under 80 %                                                                                                                          |
| AC32 | `npm run verify` after a clean install at each phase's end                                                                                                                                        |

## 8. Dependencies

- `libheif-js@1.23.5` (web): libheif compiled to WebAssembly, LGPL-3.0, published 2026-10-04,
  repository `catdad-experiments/libheif-js`, used by `heic-decode` and `heic-convert`; no install
  script. Loaded only by `import()` when a HEIC file arrives, as its own chunk (the LGPL's
  replaceable-library condition holds: the library is a separate file, unchanged). The
  `wasm-bundle` entry (about 2 MB) embeds the wasm, so no extra static file is served.
- No api dependency. Stylelint's rule needs no plugin.
