# 0024 ui-feedback-2: the owner's second round of UI notes on the try-on window, the result, the header and the catalog's motion

Status: accepted (2026-10-29), with the owner's answers Z1–Z25, the plan's choices Z26 and Z12's
amendment; amended at the review of PR 1 (AC20: Z26.6; AC22: Z29; AC27: the CSP) and at PR 3's QA (AC20:
Z48). By Z1 the ratings and the comparison (notes H4–H6) are spec `0025` and the city (S1,
S3) spec `0026`; their questions Z19–Z24 are answered here and carried there.

Source: the owner's Agentation notes of 2026-10-29, kept verbatim in
[source/agentation-notes.md](source/agentation-notes.md) (ids `R1`–`R14` the look result's window
on a product page, `K1`–`K4` the catalog page, `T1`–`T14` the try-on window, the header and the
fitting room, `H1`–`H6` the history page and the result opened from it, `S1`–`S3` the stores page,
`D1` the drop zone). Design: the owner's canvas «Онлайн-примерка 2.0» (26 boards), read only. As
in spec 0023, where a note and a board disagree, the note wins: the canvas is not redrawn, and
every such difference is listed under "Differences from the canvas". Decisions: `Z1`… in
[clarifications.md](clarifications.md).

## Goal

The owner looked through the site again on a 1386 px window and on a phone, after spec 0023's
changes, and wrote down what still reads badly, moves abruptly or asks too much of the visitor,
plus four things the prototype lacks to feel finished: a working «Поделиться», a rating of each
result that feeds the next generation, a comparison that sits on the result itself, and the
visitor's city. This spec turns the first of them and all the smaller notes into observable
changes, in two parts; the other three are specs 0025 and 0026 (Z1):

- **Part 1, the look and the motion** (web only): one easing on every animation of the site, the
  catalog's category list and the header's search row on phones, the history's tabs, the gallery's
  full screen, the product page's «Примерить» in a quieter colour, the favicon, the header's chips
  and badges, the burger menu's catalog heading, the fitting room's accessory chip and wishes
  field, and the texts and alignments the notes name in the try-on window, the waiting screen
  and both results.
- **Part 2, the try-on flow** (web, with small api changes): the waiting screen shown the moment
  «Примерить» is pressed and a silent retry of a request that failed for a reason not of the photo,
  the sticky «Примерить» on phones, the picker with no «Перейти в «Мои фото»», no copy of the one
  photo being replaced and no save switch (the switch moves to the result), the result's picture
  as the way to the full screen with the download and the share as icons over it, a real share,
  HEIC files, pasting a photo and a drop zone one wants to drop a photo on, the regeneration as a
  popover over the result on every width, and a badge on the profile icon and on «Мои примерки»
  for a result finished while the user looked elsewhere.
  The notes' two larger features are specs of their own (Z1): **spec 0025, ratings and the
  comparison** (H4–H6: a like or a dislike on every result, a dislike's comment sent back into the
  generation with its own limits, feedback kept when no more regenerations are left, a try-on given
  for three ratings, and the comparison rebuilt as a strip of the user's other results beside the
  picture and a before/after slider, replacing the history's «Сравнить» and the compare page) and
  **spec 0026, the city** (S1, S3: the visitor's city from the browser's geolocation or chosen by
  hand in the header, and the stores page opened on it). Their first decisions are Z19–Z24 of this
  spec's `clarifications.md`.

## In scope

### Part 1: the look and the motion

- **Motion (K2, K4, H3, R2).** One easing, slow at the start and slow at the end, and a shared set
  of durations on every animated thing of the site: the drawers and sheets (the filters' sheet on
  phones first), the modals and their size changes, the toasts, the header's search row on
  phones, which now slides open and closed instead of appearing, the history's tabs, whose
  underline slides from the old tab to the new one instead of jumping, and the gallery's full
  screen, whose «‹» «›» and arrow keys glide to the next photo instead of jumping. `prefers-reduced-motion`
  keeps turning them all off (Z2).
- **Catalog category list on phones (K3).** «Все товары ▾» below 600 px opens the categories as a
  bottom sheet, like «Фильтры», instead of a list that pushes the products down; a row keeps the
  query and closes the sheet (Z3).
- **Product page (R1).** «Примерить» in the buy box is a quiet grey button of the kit, visibly
  enabled, so «Добавить в корзину» is the loudest button; at the limit it stays the disabled one
  (Z4).
- **Favicon (K1).** Every page of the site has a tab icon; the mark is Z5.
- **Header (T8, T9, T10, T11, T14).** The «скоро» chips of «Избранное» and «Корзина» are grey and
  sit where the fitting room's count sits (left of the icon's right edge, lower); the count's digit
  is centred in its badge; the burger menu separates the profile's sections from the catalog with
  one hairline, the heading «Каталог» and room. The badge of a finished fitting (T11) is part 2.
- **Fitting room drawer (T12, T13).** The accessory slot carries the «скоро» chip; the wishes
  field is taller (five lines before it scrolls, Z6).
- **Try-on window texts and alignments (T1, T6, T7, R7, R8, R9, R12).** The caption on the chosen
  photo reads «Ваше фото, видите только вы»; every meter of the window and of the pages ends in «в
  этом месяце» («Образ целиком — 1 примерка · осталось 7 в этом месяце», «Осталось 7 в этом
  месяце»); on every item card of the picker and of the results «В корзину» and the heart sit at
  the card's top, aligned with each other; «один цвет» is not written for an item with one colour,
  and the look result's line «Смена цвета одной вещи перегенерирует весь образ на этом же фото»
  shows only while at least one item has another colour to choose; on the waiting screen the
  stage text beside the percent is smaller, so on a phone it never runs into the percent, the
  items' thumbnails are larger (Z7), and the phone's button reads «Закрыть и продолжить покупки»
  as the desktop's.
- **Look result's layout (R5, R6, R10, R11, R13, R14).** On a phone the look's items are the same
  full cards as on a desktop (no strip, no «Вещи образа» screen); the caption «Изображение
  приблизительное, могут быть неточности в посадке, длине и цвете» leaves the result and becomes a
  tooltip of an «!» mark after «Сохранено в «Мои примерки»» (a tap on touch devices); «Добавить
  образ в избранное» becomes a heart beside «Добавить образ в корзину» whose tooltip says that
  every item of the look will be added; the column of buttons under the items is aligned to the
  bottom of the picture; «Заменить вещь в примерочной» leaves the result and every item card gets
  «Заменить» (Z8); «Хотите что-то поменять в образе?» and its popover (part 2) exist on phones too.
- **Picker (T3, T5, H2).** The «Заменить фото» window lists only the saved photos other than the
  one chosen, so with one saved photo it shows no list; «Перейти в «Мои фото»» goes (this reverses
  spec 0023 Y4); «Примерить на другом фото» returns to the picker with the empty drop zone, no
  photo preselected.
- **Stores search (S2).** The list and the map follow the search text after a short pause in
  typing, not on every keystroke (Z9).

### Part 2: the try-on flow

- **The start (R12, T2).** The waiting screen appears the moment «Примерить» (or «Примерить
  образ») is pressed, before the api has answered, and its progress starts then; a request that
  fails for a reason not of the photo or the text (a network error, no answer, the api down or
  busy) is sent again once in silence, and only a second failure brings the picker back with its
  notice (Z48); a refusal of the text, the limit and a 4xx show their cards at once (Z10). On phones the window's
  «Примерить» sticks to the bottom of the screen while the picker scrolls (Z11).
- **The save switch (T4).** «Сохранить фото для следующих примерок» leaves the picker and the
  «Заменить фото» window; a photo uploaded in the window is not saved by itself, and the result
  screen offers the switch for the photo the fitting used, while it can still be saved; «Мои
  фото» keeps uploading saved photos (Z12).
- **The picture's actions (R3, R4, H1).** The tiles «Во весь экран» / «Экран», «Скачать» and
  «Поделиться» leave both results; a click on the result's picture opens it on the whole screen,
  with a × and Escape to close; «Скачать» and «Поделиться» are icons over the picture, shown on
  hover with a mouse and always on a touch device, each with its tooltip; the download works as
  before (spec 0023 Y8); «Поделиться» works (Z13). The single result's «К образу» moves to the
  right column, beside the item's «В корзину» (Z14).
- **Regeneration as a popover (R13).** «Что поменять?» opens as a panel rising over the button on
  the result itself, the rest of the window dimmed, on every width; the fields, the item choice
  and the request stay as spec 0023 left them.
- **Photos in (D1).** A HEIC file is accepted by the pickers, the drop zone and the paste (Z15);
  Ctrl/Cmd+V with an image in the clipboard uploads it while the picker is open (Z16); the drop
  zone is redrawn to invite a photo (Z17).
- **The finished badge (T11).** When a fitting ends while the user is not looking at it, the
  header's profile icon and the menu's «Мои примерки» carry a count of such results, shown with
  the toast and cleared when the user opens the history or the result (Z18).

## Non-goals

- Real favourites or a real cart: every heart and cart button stays the stub of spec 0019 A33
  (the toast «В прототипе нет корзины и избранного»).
- Redrawing the canvas; new boards.
- The crop step and «Мы ошиблись? Сообщить» (backlog items of spec 0019 A41).
- A public page of a shared result (board 7.4's link): «Поделиться» shares the file (Z13); the
  link stays the backlog item «Share link of a result».
- The ratings, the dislike's regenerations, the slider comparison (H4–H6) and the city (S1, S3):
  specs 0025 and 0026 (Z1). The history's «Сравнить» and the compare page stay until 0025.

## Acceptance criteria

Widths: a phone is below 600 px, a tablet 600–1023 px, a large tablet 1024–1279 px, a desktop from
1280 px. "A touch device" and "a mouse" are the primary pointer (spec 0023 Y13). Criteria marked
(Zn) take their final shape from that answer.

### Part 1

- **AC1.** Every transition and animation of the site's own components (the kit's drawers,
  sheets, modals, toasts, tabs, the header's search row, the gallery viewer's arrows and keys)
  uses the same easing, slow at both ends, and one of the shared durations; the filters' sheet on
  a phone opens and closes without a jump at either end; with `prefers-reduced-motion: reduce`
  none of them animates.
- **AC2.** On a phone, «Все товары ▾» on `/catalog` opens the categories in a bottom sheet of the
  kit; the product grid does not move; choosing a category closes the sheet and opens it with the
  query kept.
- **AC3.** On a phone, the loupe opens and closes the header's search row with a slide of the
  shared duration; the row's field is focused once open; with `q` in the address the row is open
  with no animation on load.
- **AC4.** On `/customer/fittings`, switching the tabs moves the underline from the old tab to the
  new one in one motion.
- **AC5.** In the gallery's full screen, «›», «‹» and the arrow keys move to the next photo with a
  smooth scroll; a swipe behaves as before.
- **AC6.** On every product page «Примерить» is the kit's grey `secondary` button of 48 px, the
  height of «Добавить в корзину»: enabled it reads as a button (grey fill, dark text, a hover
  state), «Добавить в корзину» beside it stays the black primary; at the limit «Примерить» is
  disabled and tells from the enabled one (Z4).
- **AC7.** Every page of the site answers a tab icon the browser shows (`/catalog`, a product page,
  `/customer/...`, `/privacy`, the not-found page), with no 404 of its address in the console.
- **AC8.** In the header, «скоро» on «Избранное» and «Корзина» is a grey chip at the position of
  the fitting room's count badge; the count badge's digit is centred (1 and 2 alike) on every
  width.
- **AC9.** In the burger menu, signed in, after the sign-outs come one hairline, the heading
  «Каталог» with room above it, then «Все товары» and the categories; signed out the heading
  stands between «Войти» and «Все товары».
- **AC10.** In the fitting room drawer, the empty accessory slot carries the «скоро» chip; the
  wishes field shows five lines before it scrolls, on every width.
- **AC11.** In the picker, the chosen photo's caption reads «Ваше фото, видите только вы»; every
  meter («Осталось N», the look's «Образ целиком — 1 примерка · осталось N», the limit card's and
  the pages' lines) ends in «в этом месяце»; on every item card of the picker and of both results
  «В корзину» and the heart sit at the card's top edge, aligned on one line.
- **AC12.** In the look result, an item with one colour shows no «один цвет» and no swatches; the
  line «Смена цвета одной вещи…» shows only while some item has a second colour; on a phone the
  items are the same cards as on a desktop and «Вещи образа» is no separate screen.
- **AC13.** In both results, the caption «Изображение приблизительное…» is gone from the body and
  is the tooltip of an «!» after «Сохранено в «Мои примерки»» (hover with a mouse, a tap on a touch
  device, Escape closes).
- **AC14.** In the look result, «Добавить образ в избранное» is a heart beside «Добавить образ в
  корзину» whose tooltip says every item of the look will be added; the heart shows the stub toast;
  on a desktop the button column's bottom is level with the picture's bottom; «Заменить вещь в
  примерочной» is gone and each item card has «Заменить» doing what Z8 says.
- **AC15.** On the waiting screen on a phone (320 px wide too), the stage text and the percent
  never overlap; the items' thumbnails are 72×96 px, the single item's and the look's alike, on
  every width (Z7); the button reads «Закрыть и продолжить покупки».
- **AC16.** «Заменить фото» lists only the saved photos other than the chosen one; with one saved
  photo, which is the chosen one, it shows the pickers and no list; «Перейти в «Мои фото»» is
  nowhere in the window; `try-on.my-photos` is gone from the analytics catalog.
- **AC17.** «Примерить на другом фото» shows the picker with the empty drop zone and the saved
  photos unselected; «Примерить» is disabled until a photo is chosen or uploaded.
- **AC18.** On `/customer/stores`, typing fast changes the list once, 500 ms after the last
  keystroke (Z9), not on every keystroke; the clear button applies at once; `Stores Searched`
  keeps its one-second rule.

### Part 2

- **AC19.** Pressing «Примерить» shows the waiting screen at once, before `POST /fittings`
  answers; the progress starts from that moment; when the api answers the running fitting, the
  screen goes on without a restart; when it refuses the text or the limit, the picker comes back
  with that card and nothing of the wait remains.
- **AC20.** A `POST /fittings` that fails with a network error, a timeout, a 502/503/504 is sent
  again once after 1.5 s with no change on screen (Z10, Z26.6); a second failure brings back the
  screen the start came from with its notice, «Примерить» being the repeat (Z48); a 400 (the text refused), a 409 (the limit), a 401, a 429 and
  a bare 500 are not repeated (Z27); a repeat that reaches an already started fitting continues it (the api answers the
  running one of the same fingerprint, spec 0019 A32).
- **AC21.** On a phone, the picker's «Примерить» / «Примерить образ» stays at the bottom of the
  screen while the picker's content scrolls under it; the content's end is not hidden behind it.
- **AC22.** The picker and «Заменить фото» have no save switch; a photo uploaded there is a
  transient one; the result screen of a fitting on such a photo shows «Сохранить фото для
  следующих примерок» in the window's right column, with the item cards, on by default: the photo
  is kept when the result opens (it appears in «Мои фото»), turning the switch off deletes it
  again, and it stays on screen so it can be turned on again; at five saved photos the switch is
  off and disabled with no text, and nothing is saved (Z29); a result on a photo saved before it
  opened shows no switch; a transient photo already gone shows «Фото уже удалено»; «Мои фото»
  still uploads saved photos (Z12).
- **AC23.** Both results have no tiles «Во весь экран», «Скачать», «Поделиться»; a click on the
  picture opens it on the whole screen (black, the picture whole, a × top right, Escape and the ×
  close it); over the picture, two round icon buttons «Скачать» and «Поделиться» appear on hover
  with a mouse and are always visible on a touch device, each with a tooltip of its name; «Скачать»
  saves the file as before with the toast «Фото скачано».
- **AC24.** «Поделиться» does what Z13 says and works on a phone (Safari, Chrome) and on a desktop
  (Chrome, Safari, Firefox): where the chosen way is not available, the fallback of Z13 is offered,
  never a silent nothing.
- **AC25.** In the single result, the tile «К образу» is gone and a button «Добавить к образу» /
  «В образе» sits in the right column under the item card, beside «В корзину» and the heart
  (Z14), keeping its behaviour and its element `result.to-look`.
- **AC26.** «Хотите что-то поменять в образе?» / «…в примерке?» opens a popover that rises over
  the button inside the result, the rest of the window dimmed; it holds the hint, «Какая именно?»
  for a look, the comment and «Перегенерировать»; Escape, a click outside and × close it; it exists
  and works on a phone.
- **AC27.** A HEIC photo chosen, dropped or pasted uploads and shows as the chosen photo; the
  picker's `accept` names HEIC with a mouse (Z26.2); the formats line says «JPG, PNG, WebP или
  HEIC» (Z15); the site's `script-src` gains `'wasm-unsafe-eval'`, which lets WebAssembly
  compile and nothing else (no `eval` of scripts), on every page, since the try-on window opens
  from many; the policy's code says why.
- **AC28.** With the picker open and no field focused, Ctrl/Cmd+V with an image in the clipboard
  uploads it as the chosen photo (`source: paste`); a paste of text does nothing; the paste works
  with a photo already chosen too (it replaces it) (Z16).
- **AC29.** The empty drop zone is Z17's hairline card with the «+» circle, «Загрузите своё
  фото», the hint line, «Выбрать файл» and the formats, shown on `/ui-kit` too; a file dragged
  over it blackens the border and fills the card; a file
  of another type says «Нужно изображение JPG, PNG, WebP или HEIC».
- **AC30.** When a fitting completes while no window shows it, the header's profile icon gets a
  count badge and the profile menu's «Мои примерки» the same count, at the toast's moment; opening
  `/customer/fittings` or that result clears it; a page reload shows the badge again while the
  results are unseen (Z18).

### Analytics and build

- **AC31.** Every new or changed element and event is in the catalog with its estimate, the
  removed ones (`try-on.my-photos`, `result.fullscreen`, Z25) are gone, `EVENTS.md` is
  regenerated, and the monthly estimate stays under 80 %.
- **AC32.** `npm run verify` passes, a clean install included; `openapi.json`,
  `validation-codes.json` and `refusal-messages.json` are regenerated with the api changes.

## Differences from the canvas

The canvas stays as drawn; these notes change what it shows (the board check of 2026-10-29, all
26 boards read):

| Note   | Board           | The board shows                                                                                                  | Now                                                                                |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| R1     | 1, 1.1          | «Примерить» secondary 40, grey, under the primary «Добавить в корзину» (spec 0019 A63.2 took board 13's primary) | returns to board 1's grey `secondary`; the height is Z4; boards 11 and 13 depart   |
| R3, H1 | 7, 7.1, 8, 8.1  | equal tiles under the picture: «Поделиться», «Скачать», «Во весь экран» / «Экран», «К образу» (7 only)           | the tiles go; the picture's click opens the full screen with a ×; icons over it    |
| R4     | 7.4             | the share sheet: a public link («Скопировать ссылку», «Отправить в мессенджер», «Скачать изображение»)           | Z13: the file through the system's share sheet first, the link later or never      |
| R5     | 8.1, 8.2        | a strip of 40×54 thumbnails and «Вещи образа» as a screen of its own on phones                                   | full item cards on phones, no separate screen                                      |
| R6     | 7, 8, 7.1, 8.1  | the caption «Изображение приблизительное…» under the picture, above the tiles                                    | a tooltip of an «!» after «Сохранено в «Мои примерки»»                             |
| R7, T6 | 8, 3            | «В корзину» and the heart centred on the item row                                                                | at the card's top edge                                                             |
| R8     | 8               | «один цвет» under the one swatch                                                                                 | nothing for one colour                                                             |
| R10    | 8               | desktop: «Всё в избранное» outline 56 with the heart and the text                                                | the heart alone beside the cart button, a tooltip (phones already draw it so)      |
| R11    | 8               | the buttons follow the list; only the meter is pushed to the bottom                                              | the whole button column at the picture's bottom                                    |
| R12    | 6, 6.1, 6.2     | thumbnails 48×64 (phone 40×54); the phone's button «Свернуть»                                                    | larger thumbnails (Z7); «Закрыть и продолжить покупки» on every width              |
| R13    | 7.3, 8.3, 13    | «Что поменять?» a bottom sheet on phones («нижний лист (mobile)»), no desktop drawing                            | a popover over the button on every width, the window dimmed                        |
| R14    | 8, 8.2          | the centred link «Заменить вещь в примерочной»                                                                   | «Заменить» on each item card (Z8)                                                  |
| T1     | 3, 3.1, 4.2     | the chip «Видите только вы» (4.2: «Фото видите только вы»)                                                       | «Ваше фото, видите только вы»                                                      |
| T4     | 3, 3.3          | the save switch in the picker and during the upload; nothing on the result boards                                | the switch on the result (Z12)                                                     |
| T5     | 3               | desktop: «Управлять» beside «Ваши фото» (0023 Y4's «Перейти в «Мои фото»»)                                       | no link                                                                            |
| T7     | 3.2, 7, 7.2, 8  | short forms «Образ целиком — 1 примерка · осталось 12», «Осталось 11» (13's canonical has «в этом месяце»)       | every meter ends in «в этом месяце», as board 13                                   |
| T8, T9 | Main, 13        | `n-soon` a black pill (only on «Создать свой аватар»); no «скоро» on the header's icons                          | grey, at the count badge's position                                                |
| T12    | 2, 2.1          | the accessory slot drawn as an active empty slot with «Подобрать в каталоге»                                     | the «скоро» chip                                                                   |
| T13    | 2, 2.1          | the wishes field 64 px (phone 48 px)                                                                             | five lines (Z6)                                                                    |
| H2     | 7, 3            | «Примерить на другом фото» opens board 3 with the last photo preselected                                         | the empty drop zone, nothing preselected                                           |
| H4, H5 | 9, 9.x, compare | the comparison in the history (selection, «Сравнить») and the page with the tabs «Рядом» and «Наложением»        | the strip beside the result's picture and a slider (Z23, spec 0025); the page goes |

Silent boards (nothing drawn): R2, R9 (the line drawn unconditionally), K1–K4, T3, T10 (agrees),
T11 (the toast agrees, no badge), T14 (phones have a tab bar there, backlog), H3, H6, S1–S3 (the
header's city is a placeholder), D1's paste and zone. Agreeing boards: T2 (board 3's phone
picker pins «Примерить» at the bottom; the silent retry is not drawn), D1's HEIC (board 4's
«JPG, PNG или HEIC до 20 МБ», which spec 0019 A31 dropped), R10 on phones.

## Owner actions (Claude cannot do them)

- After each deploy: the changed screens on a phone, a tablet and a desktop; the share on a phone
  (Safari and Chrome) and on a desktop; a HEIC photo from an iPhone.

## Assumptions

- Both results (the single and the look) get the same treatment where a note names one of them:
  the tiles leave both (R3, R4, H1), both get the popover (R13) and the «!» tooltip (R6).
- "Серый" of R1 is the kit's existing `secondary` variant of `Button` (grey fill, dark text, the
  one board 1 draws), not the `outline` one, which «Добавить к образу» already uses (Z4: 48 px).
- The meter texts of T7 change everywhere the meter renders, the pages included («Мои примерки»'s
  aside, the limit card), not only in the window.
- The wait of R12 is shown optimistically for a regeneration and a colour change too, not only for
  the first start.
- A HEIC file is converted in the browser (Z15); the api keeps accepting JPG, PNG and WebP only.
- Tooltips on a touch device open on a tap and close on a tap outside or Escape (the kit's
  `Tooltip`).
- The waiting screen's items' thumbnails grow the same on every width.
