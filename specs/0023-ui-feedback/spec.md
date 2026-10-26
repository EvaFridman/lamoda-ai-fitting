# 0023 ui-feedback: the owner's UI notes on the catalog, the header, the product page, the fitting room and the try-on window

Status: accepted (2026-10-27), with the owner's answers Y1–Y14; amended at the review of PR 1
(AC17: Y16; AC19: Y17).

Source: the owner's Agentation notes of 2026-10-27, kept verbatim in
[source/agentation-notes.md](source/agentation-notes.md) (ids `C1`–`C7` for the catalog page,
`P1`–`P36` for the product page and the windows opened from it). Design: the owner's canvas
«Онлайн-примерка 2.0» (26 boards), read only. Where a note and a board disagree, the note wins:
the canvas is not redrawn, and every such difference is listed below under "Differences from the
canvas". Decisions: `Y1`… in [clarifications.md](clarifications.md).

## Goal

The owner looked through the site on a 1386 px window and wrote down what reads badly, looks noisy
or works against the visitor. This spec turns those notes into observable changes, in two parts:

- **Part 1, the look and the labels**: the catalog card and category list, the header's icons, the
  product page's buy box and gallery, and the fitting room drawer.
- **Part 2, the try-on window**: choosing and uploading the photo (a drop zone, «Заменить фото»),
  the photo shown whole and steady through every step, the window resizing smoothly, a short
  success screen, a real download, a full screen that does not crop, the regeneration sheet
  without chips, freer wishes, clear reasons when a photo, a text or a generation is refused, and
  the consents kept on the server.

## In scope

### Part 1: the look and the labels

- **Catalog card (C1, C7).** With a mouse, the hanger gets a white outline on hover (the colour of
  the heart's fill), so it reads on a photo. The card loses its hover shadow; the photo's slight
  zoom stays the only hover effect. Applies wherever the card is shown (catalog grid, «С этим
  товаром выбирают»).
- **Header (C2–C5).** The profile and fitting-room icons lose their frame. «Избранное» and
  «Корзина» carry a «скоро» chip (the canvas's `SoonChip`), and stay inert.
- **Category list (C6).** More space between the category names in the catalog's left column.
- **Product page (P1, P2, P11).** The buy box's «К образу» reads «Добавить к образу» («В образе»
  when pressed stays). A gallery photo opens full screen on click (every device), and with a mouse
  the cursor over a photo becomes a round lens that shows enlarged the part of the photo under it,
  the photo itself unchanged (Y14; Y13: no lens on a touch device). On a large
  tablet (1024–1279 px) the buy box keeps a usable width: the photos shrink instead of the buttons,
  no label leaves its button, nothing overlaps.
- **Fitting room drawer (P12–P21, P35, P36).** A slot with an item gets the favourite heart (a stub,
  Y3). The counter line «N из 5 вещей · по одной в каждом слоте…» goes. The slots are named
  «Верхний слой и платья», «Нижний слой», «Верхняя одежда», «Обувь», «Аксессуары» (Y5). On an empty
  slot the «+» box opens the catalog as «Подобрать в каталоге» does, and the caption «Слот
  свободен» («…: сумка, шарф или головной убор» for the accessory) goes. The wishes field loses
  «· по желанию» and its hint line; the counter stays (Y6). «Всё в корзину» reads «Добавить образ
  в корзину».

### Part 2: the try-on window

- **Choosing the photo (P3, P5, P8, P9, P25).** With no saved photo, the photo's place is one large
  drop zone: a file dropped on it, or a click on it, starts the upload (the first one still passes
  the tips and the two consents). At the zone's bottom: «Загрузить фото» and the switch «Сохранить
  фото для следующих примерок»; on a touch device also «Сделать фото» (Y13). A desktop no longer
  offers «Сделать фото». Once a photo is chosen, the strip, the buttons and the switch give way to
  one button «Заменить фото» under the photo; it opens a window with the saved photos, the upload
  (and, on a touch device, the camera), the switch and the link «Перейти в «Мои фото»» in place of
  «Управлять» (Y4).
- **Texts removed (P6, P7).** The picker's subtitle «Изображение приблизительное: модель ещё
  учится» and the switch's caption («Касается нового фото…», «Выключено: …») go. The result's own
  caption «Изображение приблизительное, могут быть неточности…» stays.
- **The items (P4, P22).** A look's picker lists its items as the single try-on's item card
  (picture, name, colour, price), one under another, instead of the strip of thumbnails. Every item
  card in the picker gets the favourite heart (a stub, Y3).
- **The photo whole and steady (P24, P10).** The user's photo is never cropped: it is shown whole in
  one frame of the same size through the picker, the upload, the wait and the result. When the
  window still changes size between steps, it does so smoothly, not in a jump (no animation under
  `prefers-reduced-motion`).
- **Success (P26, P30).** When a generation the visitor is watching completes, a short success
  screen «Готово! Сохранили в «Мои примерки»» shows before the result. A result opened from the
  history or a toast shows at once. The result carries a line of its own under the picture,
  «Сохранено в «Мои примерки»», linking to the history, in place of «сохранено в истории» (Y7).
- **Result (P28, P29, P31, P32).** «Скачать» saves the picture as a file without opening a tab and
  confirms it with a message, in the result and in the history (Y8). «Во весь экран» shows the
  whole picture, not its middle. The look's «Всё в корзину · N вещи» reads «Добавить образ в
  корзину», «Всё в избранное» reads «Добавить образ в избранное».
- **Regeneration (P33, P34).** The sheet «Что поменять?» has no chips; the comment's label
  «Комментарий, по желанию» gives way to the hint «Можно попросить: изменить посадку, длину,
  заправить вещь, другую позу или фон. Нельзя: заменить вещь или её цвет — для этого выберите
  другой цвет или вещь.» The comment stays optional; a look keeps «Какая именно?» as an optional
  choice (Y9).
- **Freer wishes (Y12).** The wishes and the comment may ask for a background or a scene, a pose,
  another colour or style of the person's own clothes that are not tried on, and small additions
  (a scarf, a belt, rolled sleeves). Still refused: changing the face, the body or the identity,
  other people, nudity, minors, violence, politics, text and logos, and changing the tried-on items
  or their colour.
- **Refusals (P27).** A refused photo, a refused text (wishes or comment) and a failed generation
  each tell the visitor the reason in plain words and what to do next: the photo check's own
  reasons, and the safety refusals grouped into a few coarse categories (Y2). No text says who
  refused it.
- **Consents (P23).** The two consents of the first upload are recorded on the server with the
  user, so the tips and the consents show once per account (Y1); an upload without them is
  refused (Y17).

## Non-goals

- Real favourites or a real cart: every heart and cart button stays the stub of spec 0019 A33
  (the toast «В прототипе нет корзины и избранного»), Y3.
- Redrawing the canvas; new boards.
- The share link, the crop step and «Мы ошиблись? Сообщить» (backlog items of spec 0019 A41).
- A refusal rule of our own (such as "a public figure"): only how a refusal is told changes (Y2).

## Acceptance criteria

Widths: a phone is below 600 px, a tablet 600–1023 px, a large tablet 1024–1279 px, a desktop from
1280 px. "A touch device" and "a mouse" are the primary pointer (Y13: `pointer: coarse`; `hover:
hover` and `pointer: fine`).

### Part 1

- **AC1.** With a mouse, hovering a catalog card shows no shadow and zooms its photo; hovering its
  hanger draws a white outline around it (C1, C7).
- **AC2.** In the header, signed in, the profile and the fitting-room icons have no frame in any
  state but keyboard focus (C2, C3); «Избранное» and «Корзина» show «скоро» on every width and
  their accessible names stay «Избранное» and «Корзина» (C4, C5).
- **AC3.** The catalog's category list from 1024 px has the plan's larger spacing between names,
  and its loading placeholder matches it (C6).
- **AC4.** On the product page the button reads «Добавить к образу», pressed «В образе» (P1).
- **AC5.** A click (a tap) on a gallery photo opens it full screen, the whole photo, with every
  photo of the product reachable and a way to close it (a button, Escape); with a mouse the cursor
  over a photo is a round lens showing the part under it enlarged while the photo stays as it is; a
  touch device shows no lens (P2, Y14).
- **AC6.** At 1024, 1100, 1200 and 1279 px the buy box's buttons keep their labels inside and
  nothing overlaps; the gallery is narrower instead (P11).
- **AC7.** In the fitting room: a filled slot has a heart that answers the stub's toast; there is no
  counter line, no «Слот свободен…» caption, no «· по желанию» and no hint under the wishes (their
  counter stays); the slots read as Y5; a click on an empty slot's «+» opens the same catalog page
  as «Подобрать в каталоге» (the accessory has neither); the footer reads «Добавить образ в
  корзину» (P12–P21, P35, P36).

### Part 2

- **AC8.** With no saved photo, the picker shows one drop zone; dropping a JPG, PNG or WebP on it
  (or clicking it) uploads the photo as «Загрузить фото» does, consents first on the first upload;
  dropping anything else shows «Нужно изображение JPG, PNG или WebP»; «Загрузить фото» and the save
  switch sit in the zone's bottom, «Сделать фото» only on a touch device (P3, P8, P9).
- **AC9.** With a photo chosen, the picker shows only «Заменить фото» under it; the window it opens
  picks a saved photo, uploads a new one (the camera on a touch device) and links «Перейти в «Мои
  фото»» (P5, P25).
- **AC10.** The picker has no «Изображение приблизительное…» subtitle and no caption under the
  switch (P6, P7).
- **AC11.** A look's picker lists every item as a card with picture, name, colour and price, one
  under another; a single item and each look item carry a heart stub (P4, P22).
- **AC12.** A photo whose aspect is not the frame's (a landscape, a square) is shown whole, and the
  frame keeps its size on a given window from the picker through the wait to the result; any
  change of the window's size between steps is animated (P10, P24).
- **AC13.** A generation that completes while the window is open shows «Готово! Сохранили в «Мои
  примерки»» briefly, then the result with the line «Сохранено в «Мои примерки»» linking to the
  history; a completed fitting opened from the history shows the result at once (P26, P30).
- **AC14.** «Скачать» on a result and in the history's menu saves a file, opens no tab and shows a
  message once the file is there; «Во весь экран» shows the whole picture (P28, P29).
- **AC15.** The look's buttons read «Добавить образ в корзину» and «Добавить образ в избранное»
  (P31, P32).
- **AC16.** The sheet «Что поменять?» has no chips and shows the hint; «Перегенерировать» works with
  an empty comment or with a comment (P33, P34).
- **AC17.** The wishes «заменить фон на пляж», «сделать мою футболку синей» (no T-shirt tried on)
  and «повязать платок на джинсы» pass the text check (on the site, the owner's check); «замени моё
  лицо», «добавь второго человека» and «сделай футболку синей» while a T-shirt is tried on are
  refused (Y12, Y16).
- **AC18.** Each refusal shows its own text: every reason of the photo check, every coarse safety
  category of a photo, of a text and of a generation (before and after it), a generation's timeout
  and its other failure; the texts never say who refused; the fake provider's markers reproduce
  each one locally (P27, Y2).
- **AC19.** A user who gave the consents on one browser is not asked again on another; a user with
  none sees the tips and the consents before the first upload; an upload sent without the consents
  by such a user is refused and stores nothing (P23, Y1, Y17).

### Analytics and build

- **AC20.** The tracked elements and events of Y11 are in `catalog.ts` and `EVENTS.md`;
  `npm run verify` passes.

## Differences from the canvas

The canvas stays as drawn; these notes change what it shows (the board check of 2026-10-27):

| Note              | Board          | The board shows                                                                             | Now                                                      |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C1                | 13, Main       | the hanger's line turns black on hover, no outline                                          | adds a white outline on hover                            |
| C4, C5            | Main           | «Избранное» plain, «Корзина» with a count                                                   | «скоро» chip (the kit's `SoonChip` of board 3)           |
| C7                | 13             | no card hover drawn («без теней у карточек»)                                                | agrees: shadow removed, zoom kept                        |
| P1                | Main, 01       | «К образу»                                                                                  | «Добавить к образу» (as boards 11 and 14 already say)    |
| P3, P8, P9, P25   | 03             | thumbnails, «+ Новое», «Загрузить фото», «Сделать фото», switch, always expanded            | drop zone; «Заменить фото» once a photo is chosen        |
| P5                | 03             | «Управлять»                                                                                 | «Перейти в «Мои фото»» (Y4)                              |
| P6, P7            | 03             | the subtitle and the switch's captions                                                      | removed                                                  |
| P22               | 03 3.2         | the look as a strip of thumbnails                                                           | item cards one under another                             |
| P24               | 03, 06, 07, 08 | the photo `cover` in 3:4, 480→540 px wide                                                   | whole, one steady frame                                  |
| P26               | 06             | no success screen                                                                           | a short success screen                                   |
| P30               | 07, 08         | «Сохранили в историю примерок» / «сохранено в истории» in the subtitle                      | a line of its own under the picture (Y7)                 |
| P31, P32          | 08             | «Всё в корзину · 4 вещи», «Всё в избранное»                                                 | «Добавить образ в корзину», «Добавить образ в избранное» |
| P33, P34          | 07 7.3, 08 8.3 | chips «Лицо», «Фигура», «Вещь», «Фон», «Другое»; «Комментарий, по желанию»                  | no chips; the hint (Y9)                                  |
| P13–P21, P35, P36 | 02             | the counter line, «Верх»/«Низ», «Слот свободен…», «· по желанию», the hint, «Всё в корзину» | removed or reworded (Y5, Y6)                             |
| Y12               | 02             | the wishes' hint «Не меняет вещи и их цвета»                                                | wishes may change the scene, the pose, own clothes       |

Silent boards (nothing drawn): C6, P2, P10, P11, P12, P16, P23, P28, P29. P27 agrees with boards 5
and 12, which already give a text per reason.

## Owner actions (Claude cannot do them)

- After the deploy of part 2: the wishes of AC17 on the site (the real text check), and one photo
  the safety rules refuse, to see its text.
- After each deploy: the changed screens on a phone, a tablet and a desktop.

## Assumptions

- The heart's "light fill" of C1 is `--color-background` (#fff), the fill of the kit's heart.
- P17's "span" is the same «Слот свободен» caption as P18, P35 and P36; the slot's name and the «+»
  stay.
- The result's tile «К образу» keeps its short label (P1 names only the buy box's button).
- Every «Всё в корзину» of the look result (the phone's and its drawer's «Всё в корзину · 23 760 ₽»
  too) becomes «Добавить образ в корзину».
- A file dropped on the chosen photo (not only on the empty zone) uploads it too.
- A colour change or a regeneration that completes while the window is open also shows the success
  screen.
