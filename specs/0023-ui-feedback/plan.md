# 0023 ui-feedback: plan

Status: accepted (2026-10-27); its own choices confirmed as Y15; amended at the review of PR 1
(§3.1: Y17, the fields' order; §3.2: timeouts; §3.4: Y16; §3.5: the detail's shape, the CHECK).

Decisions: `Y1`… of [clarifications.md](clarifications.md); notes `C1`–`C7`, `P1`–`P36` of
[source/agentation-notes.md](source/agentation-notes.md). Paths: `web` = `web/src`, `api` =
`api/src`. No new dependency.

## 1. Overview

Part 1 is web only: styles, labels, the kit's `SoonChip` and the gallery's full screen and
magnifier. Part 2 touches both: web reworks the try-on window; api records the consents (one
migration), answers the result's picture for a download, makes the regeneration's `reasons`
optional, opens the wishes (Y12) and keeps the safety refusals' categories (a second migration).
Both migrations only add nullable columns and an enum, so the previous release runs on them.

Where the device kind decides a control (the camera, the magnifier, hover effects), web reads the
primary pointer (Y13): `COARSE_POINTER_QUERY = '(pointer: coarse)'` and `MOUSE_QUERY = '(hover:
hover) and (pointer: fine)'` in `@/shared/config` next to `PHONE_QUERY`, through `useMediaQuery`
where the DOM differs, else `@media` in CSS. A layout still follows the width.

## 2. Part 1: web

### 2.1 Catalog card (C1, C7)

- `entities/product/ui/look-toggle.module.scss`: under `@media (hover: hover) and (pointer: fine)`
  the hovered hanger gets a white outline, `filter: drop-shadow(0 0 1px var(--color-background))`
  twice (a 1–2 px halo around the line art, which has no fill to outline), with the existing
  `color` change; `transition` on `filter` too, `--duration-fast`.
- `entities/product/ui/catalog-product-card.module.scss`: the `box-shadow` and its transition go;
  the photo's `scale(1.03)` stays, moved under the same mouse query. Comments in
  `catalog-product-card.tsx:44` and the SCSS follow.

### 2.2 Header (C2–C5)

- `widgets/header/ui/header-profile.tsx`: the profile trigger takes `variant="plain"`;
  `entities/fitting-room/ui/fitting-room-button.tsx` sets `variant="plain"` itself (only the header
  places it). The kit's focus ring stays. `header.module.scss:188-196` drops the rule that only the
  disabled icons lost their border, and the comment at :177 becomes true.
- New kit piece `shared/ui/soon-chip` (`SoonChip`, the canvas's `.n-soon`: 18 px high, padding
  0 6 px, radius 9 px, `--color-text` background, white 11/16 px weight 500 text «скоро»),
  `aria-hidden`, placed by its parent like `CountBadge`. `header.tsx` puts it on «Избранное» and
  «Корзина» (top right of the icon, as the room's count). The icons stay `aria-disabled`, so the
  names in `header.test.tsx` hold. A section on `/ui-kit`.

### 2.3 Category list (C6)

`entities/category/ui/catalog-category-list.module.scss`: the desktop `.list` gap from `--space-1`
(4 px) to `--space-3` (12 px), the link's vertical padding stays (so a row is 32 px apart from the
next, 44 px pitch); `_pages/catalog/ui/catalog-page.module.scss` `.skeletonCategories` takes the
same pitch. The phone's rows already have 12 px padding and hairlines: unchanged.

### 2.4 Product page (P1, P2, P11)

- **P1.** `features/fitting-room/ui/to-look-button.tsx:42`: «Добавить к образу» / «В образе». The
  phone's empty room text «Добавляйте вещи кнопкой «К образу»…» (`fitting-room-drawer.tsx:148`)
  says «Добавить к образу». Tests that query the name, `catalog.ts` descriptions of
  `buy-box.to-look` and of the zone `product`, `EVENTS.md`, `CLAUDE.md` and `README.md` follow.
- **P11.** `_pages/product/ui/product-page.module.scss`: from 1024 px `.gallery` becomes
  `flex: 1 1 888px` and `.purchase` `flex: 0 0 280px` (the buy box's width on board 1, Y18), so
  the gallery gives way first. The kit's `Gallery`
  sizes its items by `aspect-ratio` (large 432:624, small 280:200) instead of fixed heights, so a
  narrower gallery keeps its proportions; its `sizes` follow. In `widgets/product-buy-box` the
  rows of two buttons wrap (`flex-wrap`, each button `min-width: max-content`), so «Примерить» and
  «Добавить к образу» stack when 280 px cannot hold both.
- **P2.** The kit's `Gallery` gains a full-screen viewer of its own, `GalleryViewer` (Base UI's
  Dialog, as the kit's `Modal`, whose white frame, heading and 1000 px it does not take: the whole
  window, black background): the photo whole (`object-fit: contain`), a swiped strip (scroll
  snap), «‹» «›» on a mouse device, the arrow keys on any, «N из M», a close button and Escape;
  it opens with the focus on the close button and gives it back to the photo it opened from. Each
  photo is a button «Открыть фото N из M» (with the photo's text); its click and hover reach the
  page through `photoEvents(index)`, made by a new `useTrackedElements` of `@/shared/analytics`
  (the props of any number of copies of one element, by their properties; T5). A click on any photo (the strip's
  slides too) opens it at that photo. The magnifier (Y14): under `MOUSE_QUERY`, while the pointer
  is over a large or small photo, the cursor is hidden (`cursor: none`) and a round lens of 160 px
  (a 2 px white border, the kit's `--shadow-box`) is centred on the pointer; inside it the part of
  the photo under the pointer shows enlarged 2.5 times (the same image as the lens's
  `background-image`, its `background-size` the frame's size times 2.5 and its `background-position`
  following `pointermove`); the photo itself does not move or scale. The lens stays inside the
  frame's box (`overflow: hidden`), leaves with the pointer, and is `aria-hidden` (a click still
  opens the viewer). The
  photos stay `unoptimized` `/media/` images, so the CSP is unchanged. `widgets/product-gallery`
  passes `gallery.photo`'s events by position (§6).

### 2.5 Fitting room drawer (P12–P21, P35, P36)

- **Slot names (Y5).** `entities/fitting-room/config/slots.ts`: `SLOT_TITLES` top «Верхний слой и
  платья», bottom «Нижний слой», outerwear «Верхняя одежда», shoes «Обувь», accessory «Аксессуары».
  The toasts lose the slot's name, which no longer fits a sentence: «Заменили «<прежняя>» на
  «<новая>»» (with «Вернуть») and ««<вещь>» в примерочной» (with «Открыть»); `SLOT_ACCUSATIVE`
  goes. The phone's empty room: the text «…до пяти вещей: верхний слой и платья, нижний слой,
  верхняя одежда, обувь и аксессуары» and the cells' short names `SLOT_SHORT` «верхний», «нижний»,
  «пальто», «обувь», «аксесс.» (only «верх» and «низ» change).
- **P13.** The subtitle paragraph (`fitting-room-drawer.tsx:302-306`) goes, on both widths.
- **P16–P18, P35, P36.** `EmptySlotRow` (`entities/fitting-room/ui/outfit-slot.tsx:72-89`) loses the
  caption and takes `href` for its «+» box too: with a link, the box is a `next/link` with
  `tabIndex={-1}` and `aria-hidden` (one tab stop, the text link's), sending the same `room.fill`
  and closing the drawer; the accessory (no link) keeps a plain box. `emptySlotCaption` goes.
- **P12.** `widgets/fitting-room-drawer/ui/room-slot.tsx`: a `FavoriteStub` size 32 in the slot's
  `aside`, before «В корзину» on a desktop and before × on a phone, with `room.favourite`'s events
  (`slot`).
- **P19, P20 (Y6).** `room-wishes.tsx`: the label is «Пожелания к образу»; the hint span goes, the
  counter stays.
- **P21.** The footer's `CartStubButton` reads «Добавить образ в корзину»; the footer row wraps if
  it and «Примерить образ» do not fit.

### 2.6 Part 1's other places

`CLAUDE.md` loses «it lifts with `--shadow-box`», gains the `SoonChip`, the gallery's viewer and
magnifier, the slot names; `catalog.ts`'s descriptions as §6.

## 3. Part 2: api

### 3.1 Consents (Y1, P23)

- Migration `…_photo_consent`: `users.photo_consent_at timestamptz NULL` and
  `users.photo_consent_version smallint NULL`, a CHECK that both are null or both set.
- `me/photos/photo-upload.ts` reads an optional multipart field `consent` with the other fields:
  the parser gathers every field until the body ends, so its place before or after the file does
  not matter (`fields: 4` still holds `save` and `consent`); web appends it before the file anyway.
  Its value must be `PHOTO_CONSENT_VERSION` (`me/photos/consent.ts`, `1` now; another value answers
  400 with the detail `IS_IN` on `consent`). When it is sent and the user's stored version is lower
  (or none), the service writes the time and the version once the body is read, in a statement of
  its own before the check, so a refused photo still keeps the consent the user gave.
- Y17: with no `consent` in the request and no stored consent of the current version, the upload
  answers 400 with the detail `CONSENT_REQUIRED` on `consent` before the check, storing nothing.
  `CONSENT_REQUIRED` is a detail code of its own; web's `DETAIL_TEXTS` gets «Подтвердите согласия
  перед загрузкой фото» and the upload shows the consents again (a stale tab).
- `UserResponseDto` (`GET /me`, `PATCH /me`) gains `photoConsentVersion: number | null` (the time
  stays in the database). `openapi.json` and `validation-codes.json` are rewritten.
- Account deletion deletes the row, so nothing else changes.

### 3.2 The result's picture for a download (Y8, P28)

`GET /fittings/:id/image` (`@SignedIn()`, the `read` tier, `FittingsController`): the user's
completed fitting's result streamed from storage (`StorageService.get`), `Content-Type:
image/webp`, `Content-Disposition: attachment; filename="primerka-<YYYY-MM-DD-HHmm>.webp"`
(Moscow time of `finishedAt`), `Cache-Control: private, no-store`; someone else's, a missing one or
one without a result answers 404; a storage failure 503. Swagger declares the binary answer; the
snapshot is rewritten; `access-markers` lists it under `SIGNED_IN_HANDLERS`. nginx's `/api/` serves
it as is (an answer, not a body limit); its `send_timeout 10s` is between two writes, not the whole
answer, so a slow client is not cut while bytes flow. T8 checks how `TimeoutInterceptor`
(`REQUEST_TIMEOUT_MS`, 6 s and more) treats a streamed answer to a slow client: the handler returns
once the stream starts, and an e2e reads a result slowly past the timeout to prove the file arrives
whole; if it does not, the route gets the timeout of its own the plan is then amended for.

### 3.3 Regeneration without reasons (Y9, P33)

`fittings/dto/regenerate-fitting.dto.ts`: `reasons` optional (`@IsOptional()`, still unique and of
`REGENERATION_REASONS`, at most 5), the service stores `[]` when absent. The prompt adds no reason
lines then. web stops sending them (its retry's `['other']` too). Snapshots rewritten.

### 3.4 Freer wishes (Y12)

- `ai/checks/prompt-checker.ts` `PROMPT_INSTRUCTIONS`: allowed, with reason none, are wishes about
  the fit and the styling of the chosen items, the background or the scene, the pose, the colour
  and style of the person's own clothes that are not replaced, and small additions to the look
  (a scarf, a belt, a bag in hand, rolled sleeves). Refused, with their reasons as today:
  `other_people` (another person, changing who is in the photo), `nudity`, `minors`, `violence`,
  `politics`, and `unrelated` now only for changing the face, the body or the identity, adding text
  or logos, changing the tried-on items' cut or colour, or anything not about the photo's look.
- `ai/prompts.ts`: "Keep unchanged" keeps the face, the features, the expression, the hair, the skin
  tone, the body's shape, proportions and identity, and the items as their images show them; the
  background, the camera angle, the framing, the pose and the rest of the outfit stay "unless the
  user's texts below ask otherwise" (the wishes or a regeneration's comment); "Add no accessories"
  becomes "add no text, logos or watermarks; add accessories only where the user's texts below ask
  for them" (Y12 refuses text and logos outright; tightened at T9's review). The wishes' and the
  comment's lead lines say they may change the scene, the pose, the person's own clothes and add
  small items, never the person or the items' cut or colour; `TEXT_LIMITS` says the same and adds
  no other people, text, logos or watermarks, the items' rule last. The prompt's unit tests follow.
- Y16: `checkPrompt(text, { items })` takes the chosen items as `{ name, category }` (the catalog's,
  as `PromptItem`); the classification's input names them, so "the person's own clothes" means
  clothes that are not one of these, and changing one of their colours is `unrelated`.
  `POST /fittings` passes its items, `/regenerate` the parent's.

### 3.5 Safety categories (Y2, P27)

- **Coarse categories.** `ai/safety-category.ts`: `SAFETY_CATEGORIES = ['sexual', 'minors',
'violence', 'self_harm', 'hate', 'illicit', 'unknown']` and `safetyCategory(names: string[])`,
  which maps OpenAI's names (the moderation endpoint's `sexual`, `sexual/minors`, `harassment*`,
  `hate*`, `illicit`, `illicit/violent`, `self-harm*`, `violence*`, and the image model's coarse
  labels, which use the same words) by a fixed priority: minors, sexual, violence, self_harm, hate,
  illicit; an empty or unknown list is `unknown`.
- **The client.** `OpenAiClient` parses `error.moderation_details` of an error answer
  (`moderation_stage`: `input` | `output` | `unknown`, `categories: string[]`, all optional, zod,
  unknown values kept as strings) into `AiProviderError.moderation`; the log line and Sentry carry
  the stage and the categories (labels, never the input).
- **A photo (`POST /me/photos`).** A moderation refusal answers the detail `PHOTO_REFUSED` with the
  message `photo was refused: moderation:<category>` (the photo check's own reasons unchanged).
- **A text (`POST /fittings`, `/regenerate`).** `PROMPT_REFUSED` keeps its code and message and gains
  one detail `{ field: 'promptText' | 'comment', code: 'PROMPT_REFUSED', message: '<field> was
refused: <reason>' }`, an English sentence in the shape the photo's detail already has (spec 0019
  A55), the reason one of the classification's or `moderation:<category>`. web takes the reason
  after `was refused: ` as `refusal.ts` does, an unknown one falling to the general text; a
  `*.contract.test.ts` pins the shape against an api e2e's answer of each kind. `DETAIL_TEXTS`
  keeps a general text for it by hand (it is not a DTO rule's code).
- **An unreadable verdict (Y19).** `PromptChecker.classify` throws an `AiProviderError` (operation
  `checkPrompt`, a reason of its own such as `unreadable_verdict`, never the answer's text) where it
  now warns and allows, so both routes answer 503 through `TextCheckUnavailableError`;
  `max_output_tokens` 500. The photo check is unchanged. Unit tests for an incomplete answer, a
  refusal and no JSON; an e2e of the 503 with nothing spent.
- **A generation.** `generate` answers `{ ok: false, reason: 'moderation', stage, category }` from
  the image model's refusal (stage from `moderation_details`, else `input`), and the `moderate`
  activity's refusal of the result is stage `output` with its category. Migration
  `…_fitting_failure_category`: an enum `safety_category` and `ai_generations.failure_category
safety_category NULL`, `failure_stage` (enum `moderation_stage`: `input`, `output`) NULL, a CHECK
  that both are null or both set, and set only with `failure_code = 'moderation'`. `endFitting` writes them; `FittingDto`
  gains `failureCategory` and `failureStage` (null otherwise). Older rows have none and read as
  `unknown`.
- **The fake provider.** A photo of one of the new solid colours of `REFUSAL_COLOURS` refuses as
  `moderation:<category>` (one colour per category); `refuse:moderation:<category>` in a text
  refuses the text; `fail:moderation:<stage>:<category>` in the wishes fails the generation so
  (A66's `fail:moderation` stays, as `input`/`unknown`). `test/support/photos.ts` makes the photos.

## 4. Part 2: web

### 4.1 One photo frame and a smooth window (P24, P10, P29)

- `entities/fitting/ui/photo-frame.tsx` (`PhotoFrame`, Y20): the one frame for the picker's photo, the
  pending upload, the drop zone, the waiting loader and the result: aspect 2:3 (the result's
  1024×1536), the picture `object-fit: contain` on `--color-background-secondary`, so any photo shows
  whole. Size from the window, not the step: from 1024 px `height: min(640px, 100svh - 240px)`,
  600–1023 px `min(560px, 100svh - 240px)`, never below 320 px from 600 px (Y20), a phone the
  whole width up to `60svh` high. The picker,
  `TryOnLoader` (`features/start-fitting`, its blur now over the contained photo), `FittingResult`
  and `LookResult` take it; their own 3:4 boxes and widths go.
- **P29.** The frame is what `requestFullscreen` opens; `:fullscreen` makes it the whole screen on
  black, the picture still `contain`.
- **P10.** The kit's `Modal` gains `animateSize`: a `ResizeObserver` on its content sets the popup's
  height, which transitions over `--duration-slow` (zero under `prefers-reduced-motion`, as the
  tokens do); `TryOnModal` passes it. The width is `wide`'s fixed one, so only the height moves.

### 4.2 The picker (P3–P9, P22, P25, Y1, Y13)

- **Without a saved photo.** The frame holds `PhotoDropZone` (`features/upload-photo`): a dashed
  frame with «+» and «Загрузите фото в полный рост: один человек в кадре», a button over its whole
  area (a click opens the file input, Enter and Space too) and, at its bottom, «Загрузить фото»,
  «Сделать фото» (only under `COARSE_POINTER_QUERY`) and the switch «Сохранить фото для следующих
  примерок», no caption (P7). `dragenter`/`dragover`/`drop` take the first file; while a file is
  dragged over, the frame darkens and says «Отпустите, чтобы загрузить». A file that is not JPG,
  PNG or WebP shows «Нужно изображение JPG, PNG или WebP» there; one over the limit the existing
  text. Before the consents, a dropped file waits while the tips and the consents show, then
  uploads (`Photo Uploaded`'s `source: drop`).
- **With a photo chosen.** The frame shows it; under it one button «Заменить фото»
  (`try-on.replace-photo`). A file dropped on the frame uploads as above. The button opens
  `ReplacePhoto` (a `Modal` over the try-on, a `Sheet` on a phone): the saved photos as
  `StripThumb`s (`try-on.photo`; a choice closes it), «Загрузить фото», «Сделать фото» (touch only),
  the switch, and the link «Перейти в «Мои фото»» (`try-on.my-photos`; it still leaves the page, so
  the window's one-time photos go as today). While an upload runs the frame shows the dimmed photo
  and «Загружаем и проверяем фото…» as now.
- `UploadPhoto`'s `strip` appearance is split into these two; `card` and `buttons` (the «Мои фото»
  page) stay. The desktop's «Сделать фото» goes everywhere in the try-on.
- **P6.** `try-on.tsx:277, 329`: no `description` on the picker.
- **P22, P4.** `LookSubject` lists `ItemRow`s, one per item, under «Образ · N вещей», the sum and
  «Изменить»; `LookItems.items` carry the name, the price, the final price and the colour (from the
  room's product, or the fitting's items for a fitting shown again). Each `ItemRow` (single and
  look) gets a `FavoriteStub` size 32 beside «В корзину» (`try-on.favourite` with `kind`).
- **Consents (Y1).** `entities/user`'s schema reads `photoConsentVersion`; `usePhotoConsent`
  (`features/upload-photo/model/consent.ts`) answers from `useMe` (consent given when the version is
  the current one), and `uploadPhoto` sends `consent=<version>` with the first upload after the
  boxes. The `localStorage` key `fitting-photo-consent:<userId>` is no longer read; a stale one is
  removed on sight. A user who consented only in a browser before this release sees the screen
  once more, so the server holds every consent it relies on. While `/me` loads, the upload controls
  wait (as the session's load does today).

### 4.3 Success, the result and the download (P26, P28, P30–P32)

- **P26.** `try-on.tsx`'s effect that sees a running fitting end (157-174) sets `celebrating` for a
  completed one; `FittingSuccess` (`features/start-fitting`) shows the frame with the result
  blurred, a check mark, «Готово!» and «Сохранили в «Мои примерки»» for 1.5 s, then the result. A
  fitting opened completed never passes through it. A colour or a regeneration run over a result
  shows it too.
- **P30 (Y7).** `SavedNote` (`entities/fitting`): a check icon and «Сохранено в «Мои примерки»», the
  name a `next/link` to `/customer/fittings` (`result.history`), under the picture in
  `FittingResult` and `LookResult`. The look's subtitle keeps «N вещи · <date>», the single
  result's line «Сохранили в историю примерок · <date>» becomes the date alone; the colour run's
  «… сохранён в истории» lines stay as they are (they follow a run).
- **P28.** `downloadFittingImage(id)` (`entities/fitting/api`): `clientFetch` gains a `blob`
  answer kind (same errors and reports, its own timeout of 30 s); the blob is saved through an
  object URL and an `<a download>` clicked and revoked, the name from `Content-Disposition`. The
  toast «Фото скачано» follows; a failure shows the error's text. `result-media.tsx:22-29` and
  `widgets/fitting-history/ui/card-actions.tsx:41-48` use it.
- **P31, P32.** `look-result.tsx`: «Добавить образ в корзину» (desktop, phone and its drawer, the
  count and the sum dropped) and «Добавить образ в избранное»; `.wide`'s widths are checked again.

### 4.4 Regeneration sheet (P33, P34, Y9)

`features/regenerate-fitting/ui/regenerate-sheet.tsx`: the `ChipGroup`, `ReasonChip`,
`REASON_TEXTS` and the description «Отметьте, что получилось неточно…» go. Above the textarea the
hint of Y9 (its `aria-describedby`); the textarea's label is «Что поменять» (visually hidden).
«Перегенерировать» is always enabled; the request sends the comment (with «<вещь>: » before it
when a look's item is chosen) and no `reasons`. «Какая именно?» shows for every look as an optional
choice.

### 4.5 Refusal texts (P27, Y2)

One table per place, no text naming who refused. The photo check's own reasons keep their texts
(`features/upload-photo/lib/refusal.ts`). New:

**A photo's safety category** (`refusal.ts`, title / advice):

| Category    | Title                                | Advice                                                                                                                                    |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sexual`    | Фото не подходит для примерки        | Похоже, на фото откровенный образ. Загрузите фото в одежде, в полный рост.                                                                |
| `minors`    | Похоже, на фото ребёнок              | Примерка работает только для взрослых. Загрузите своё фото, где вы одни в кадре.                                                          |
| `violence`  | На фото есть оружие или насилие      | Загрузите обычное фото в полный рост, без предметов в руках.                                                                              |
| `self_harm` | Фото не подходит для примерки        | Загрузите другое фото, где вы видны в полный рост.                                                                                        |
| `hate`      | На фото есть оскорбительные символы  | Загрузите фото без надписей, символов и жестов.                                                                                           |
| `illicit`   | На фото есть запрещённые предметы    | Загрузите фото без посторонних предметов.                                                                                                 |
| `unknown`   | Фото не прошло проверку безопасности | Так бывает с фото известных людей и персонажей, в костюме, с оружием или в откровенном образе. Загрузите своё обычное фото в полный рост. |

**A text's reason** (under the wishes or the comment, `entities/fitting/lib/prompt-refusal.ts`):

| Reason                  | Text                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `other_people`          | Пожелание не может касаться других людей на фото                                                  |
| `nudity`, `sexual`      | Пожелание не может касаться обнажённого тела                                                      |
| `minors`                | Пожелание не может касаться детей                                                                 |
| `violence`, `self_harm` | Пожелание не может касаться насилия                                                               |
| `politics`, `hate`      | Пожелание не может касаться политики, религии и оскорблений                                       |
| `illicit`               | Пожелание не может касаться запрещённых вещей                                                     |
| `unrelated`             | Опишите образ: посадку, стиль, фон, позу или дополнения. Лицо, фигуру и сами вещи изменить нельзя |
| other, `unknown`        | Текст не подходит для примерки: опишите посадку, стиль, фон или позу                              |

**A generation** (`features/start-fitting/ui/fitting-error-card.tsx`, title / text; buttons as
today: «Попробовать ещё раз», and «Другое фото» for a moderation refusal):

| Failure                               | Title                       | Text                                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model_timeout`                       | Не получилось примерить     | Сервис примерки не ответил вовремя. Так бывает при большой нагрузке — попробуйте ещё раз через минуту.                                                                                                                                                                             |
| `provider_error`                      | Сервис примерки недоступен  | Попробуйте ещё раз через несколько минут.                                                                                                                                                                                                                                          |
| `moderation`, stage `input`, category | Не можем сделать примерку   | The category's sentence of the photo table, with «фото или вещи» where the photo alone is named; `unknown`: «Фото или выбранные вещи не прошли проверку безопасности. Так бывает с фото известных людей и персонажей, в костюме или в откровенном образе. Попробуйте другое фото.» |
| `moderation`, stage `output`          | Не можем показать результат | Изображение не прошло проверку безопасности. Чаще всего помогает другое фото — в полный рост и в простой одежде.                                                                                                                                                                   |

The failure toast («Примерка … не удалась. Лимит не списан.») and the history's «Не получилось»
stay. `entities/fitting`'s schema reads `failureCategory` and `failureStage`.

## 5. Risks

- **Freer wishes distort the items more often (Y12).** The owner accepted it; the prompt keeps the
  items' rule last. AC17 is checked on the site, the fake provider cannot show it.
- **OpenAI's categories are coarse and undocumented as a list.** An unknown label falls to
  `unknown`, whose text still says what usually helps; the logs keep the raw labels to refine the
  mapping later.
- **The consent screen once more** for users who consented before this release (§4.2): a deliberate
  choice, so every consent the site relies on is on the server.
- **`ResizeObserver` and the modal's height** may jitter while images load: the frame's size is
  fixed per window (§4.1), so only the content around it moves.
- **Drag and drop in Safari on iPad** gives files from other apps; the zone's click stays the main
  path.

## 6. Analytics (Y11)

`web/src/shared/analytics/catalog.ts`, then `EVENTS.md` (`npm --prefix web test -- -u`) and
`catalog.test.ts`'s lists:

- New elements: `try-on.favourite` (zone `fitting`, `interaction`, `kind: single | look`, 0.003 /
  0.005), `room.favourite` (`fitting`, `interaction`, `slot`, 0.003 / 0.008), `gallery.photo`
  (zone `product`, new area `gallery`, `interaction`, `position: number`, 0.1 / 0.6),
  `try-on.replace-photo` (`interaction`, 0.01 / 0.008), `try-on.my-photos` (`navigation`, 0.002 /
  0.002), `result.history` (`navigation`, 0.003 / 0.003).
- `Photo Uploaded.source` and `Photo Refused.source` gain `drop` (`Photo Uploaded.perVisit` 0.01 →
  0.012).
- `Fitting Refused` gains `prompt_reason: other_people | minors | unsafe | off_topic`, sent only
  with `reason: prompt_refused`: `other_people` ← `other_people`; `minors` ← `minors` and the
  category `minors`; `unsafe` ← `nudity`, `violence`, `sexual`, `self_harm`, `hate`, `illicit`;
  `off_topic` ← `unrelated`, `politics`, `unknown`.
- `room.fill` also on the «+» (estimates 0.015 / 0.015).
- Removed: `result.reason`, `result.regenerate.reasons`. `result.regenerate.with_item` means "a
  look's item was chosen".
- Descriptions: `buy-box.to-look`, `room.add-to-cart-all`, `result.add-to-cart-all`,
  `photos.upload`, `photos.camera`, `try-on.photo`, `result.download`, `history.download`,
  `result.fullscreen`, `buy-box.favourite`, `Fitting Completed` (sent when the success screen
  shows) and the zones `product`, `header`, `fitting`.
- `sdkPerVisit` stays: the viewer and «Заменить фото» do not change the address.

Each part adds its own entries: part 1 `gallery.photo`, `room.favourite`, `room.fill`'s estimate
and its descriptions; part 2 the rest.

## 7. Acceptance criteria → checks

| AC             | Check                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1, AC2, AC3  | `qa-tester` at 1386 px with a mouse (hover states, the header signed in, the list's pitch); `header.test.tsx` names                                                                                                                                                                                                |
| AC4            | `to-look-button.test.tsx`, `product-buy-box.test.tsx`                                                                                                                                                                                                                                                              |
| AC5            | `gallery.test.tsx` (open at a photo, arrows, Escape); `qa-tester` with a mouse and with touch emulation                                                                                                                                                                                                            |
| AC6            | `qa-tester` at 1024, 1100, 1200, 1279 px: no button's text overflows (`scrollWidth`), nothing overlaps                                                                                                                                                                                                             |
| AC7            | `fitting-room-drawer.test.tsx`, `outfit-slot.test.tsx`, `slots.test.ts`, `use-room-actions.test.tsx`                                                                                                                                                                                                               |
| AC8, AC9, AC10 | `upload-photo` and `try-on` tests (a drop event with a file, a wrong type, consents first, the replace window); `qa-tester` with a real drag in the browser and touch emulation                                                                                                                                    |
| AC11           | `try-on-look.test.tsx`, `try-on.test.tsx`                                                                                                                                                                                                                                                                          |
| AC12           | `qa-tester`: a landscape and a square photo shown whole; the frame's box equal in picker, wait and result; the modal's height transitions                                                                                                                                                                          |
| AC13           | `try-on.test.tsx` (a running fitting ends: the success screen, then the result; `?fitting=` shows the result at once)                                                                                                                                                                                              |
| AC14           | api e2e of `GET /fittings/:id/image` (owner, another user, missing, no result); `result-media` and `card-actions` tests; `qa-tester`: a file saved, no tab                                                                                                                                                         |
| AC15, AC16     | `look-result.test.tsx`, `regenerate-sheet.test.tsx`; api e2e of a regeneration without `reasons`                                                                                                                                                                                                                   |
| AC17           | `prompt-checker` (the items in the classification's input, Y16) and `prompts` unit tests; the owner on the site                                                                                                                                                                                                    |
| AC18           | api unit tests of `safetyCategory` and the client's `moderation_details`; e2e with the fake's markers for each category and stage; web tests of every text                                                                                                                                                         |
| AC19           | api e2e (consent stored, answered by `GET /me`, a wrong version 400, `consent` after the file, none at all 400 `CONSENT_REQUIRED` with nothing stored, `consent` with a file that is not an image 400 `IS_IMAGE` with no consent stored and the next upload with `consent` passing); `upload-photo-first.test.tsx` |
| AC20           | `catalog.test.ts`, `npm run verify`                                                                                                                                                                                                                                                                                |
