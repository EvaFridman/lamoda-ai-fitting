# 0024 ui-feedback-2: clarifications

Status: accepted (2026-10-29): Z1–Z16, Z18–Z23 and Z25 settled at the first answers, Z17 and
Z24 at the second; Z12 amended and Z26 (the plan's own choices) added at the plan and confirmed
with it. Z19–Z24 are the starting decisions of specs 0025 and 0026 (Z1). Decision ids `Z1`, `Z2`, …; the notes are `R1`–`R14`, `K1`–`K4`, `T1`–`T14`,
`H1`–`H6`, `S1`–`S3` and `D1` of [source/agentation-notes.md](source/agentation-notes.md).

## The canvas

The notes were checked board by board against the canvas «Онлайн-примерка 2.0» on 2026-10-29
(all 26 boards); the verdicts are the table "Differences from the canvas" of `spec.md`. As in
spec 0023 the notes win over the boards; the canvas is not redrawn.

## Settled at the first answers (2026-10-29)

**Z1. Parts 1 and 2 here; parts 3 and 4 are specs of their own.** This spec builds the look and
the motion (part 1) and the try-on flow (part 2). The ratings, the dislike's regenerations and the
slider comparison (part 3) become spec `0025`, the city (part 4) spec `0026`, each with its own
questions; the answers to Z19–Z24 below are carried into them as their starting decisions. One
pull request per part after the documents' one.

**Z2. The motion standard (K2, K4, H3, R2).** One easing for everything that moves (sheets,
drawers, the header's search row, the tabs' underline, the gallery viewer's scroll, the modals'
size changes): `cubic-bezier(0.45, 0, 0.55, 1)`, slow at both ends, the same in and out; fades
keep `ease`. Durations: the kit's `--duration-fast` 0.2 s and `--duration-slow` 0.3 s stay, a new
`--duration-long` 0.4 s is for the sheets and drawers that travel the screen; all three are zero
under `prefers-reduced-motion`.

**Z3. The catalog's category sheet on phones (K3).** Below 600 px «Все товары ▾» opens a bottom
sheet of the kit (`Sheet`, a grip, no ×) titled «Категории» with the rows the list has now («Все
товары» and the active categories, each with its count, the current one marked), each a link that
keeps the query; the sheet closes on the choice; the toggle keeps `catalog.category-toggle` with
`expanded`. Supersedes spec 0020 W27 and W28 (the list under the bar, scrolling with the page).
From 600 px nothing changes.

**Z4. The grey «Примерить» (R1).** The kit's variant `secondary` (grey `--color-background-secondary`
fill, dark text), which board 1 draws, at 48 px, the height of «Добавить в корзину»; «Добавить к
образу» stays outline, 48 beside it. The disabled state stays the kit's (paler, grey text), so it
tells from the enabled grey; the hover darkens a step if `secondary` has no hover yet; the loader's
spinner is dark on the grey. Supersedes spec 0019 A63.2's "primary 56".

**Z5. The favicon (K1).** The «la» mark the stores map's pins draw, white on black in the square
(as Lamoda's own tab icon): an SVG, a PNG fallback and an Apple touch icon through Next's metadata
files in `web/app`, not `public/`.

**Z6. The wishes field's height (T13).** Five visible lines on every width, growing with the text
up to eight, then scrolling.

**Z8. «Заменить» on the look's item card (R14).** Opens the fitting room drawer (the window
closes, as «Заменить вещь в примерочной» did) with that item's slot row brought into view.
`room.open` keeps `source: result`.

**Z9. The stores search's pause (S2).** 500 ms after the last keystroke; the field's clear button
applies at once; `Stores Searched` keeps its one second.

**Z10. The silent retry of the start (T2, R12).** A `POST /fittings` (and the regeneration and
the colour change, which go through the same start) that fails with a network error, a timeout or
a 502/503/504 (nginx's 503 of the api down too) is sent again once after 1 s with no change on
screen; a second failure shows the error card with «Попробовать ещё раз». A 400, 409, 401 and a
429 are never repeated. The repeat is safe: the api answers the running fitting of the same
fingerprint (spec 0019 A32), so a request that reached the api and lost its answer starts no
second generation. The optimistic waiting screen covers both attempts; its clock starts at the
click.

**Z11. The sticky «Примерить» on phones (T2).** In the window (the whole screen on a phone) the
button and the meter under it stay at the bottom edge, the picker's content scrolling under them
with a padding for their height; the error and limit cards keep their own buttons. The product
page's buy box stays in the flow (spec 0019 A87.2).

**Z12. The save switch on the result (T4).** An upload in the window makes a transient photo
(`save=false`, spec 0019 A24). The result of a fitting on a transient photo shows «Сохранить фото
для следующих примерок» in the right column of the window, where the item cards are, **on by
default**: the photo is kept as soon as the result opens with the switch on (the api keeps it; it
joins «Мои фото»), turning it off deletes it again while the result is open; a photo kept has no
switch on later results. At five saved photos the switch is off and disabled with the limit's
text. A transient photo whose hour passed shows «Фото уже удалено» in its place; the housekeeping
keeps a transient photo of a fitting of the last day as now, so the switch has at least a day.
«Мои фото» keeps uploading saved photos. The picker and «Заменить фото» have no switch.

**Z13. A working «Поделиться» (R4).** Share the file: the Web Share API with the picture as a
file (phones: the system sheet; Chrome and Safari on a desktop: the system sheet too); where it is
not available (Firefox, an old browser) the icon downloads the file and shows «Файл сохранён —
отправьте его из галереи». Board 7.4's public link («Скопировать ссылку», revoked from the
history) stays the backlog item «Share link of a result» for a later spec.

**Z14. «К образу» of the single result (H1).** A button in the right column under the item card,
beside «В корзину» and the heart (the row wraps on a narrow window), reading «Добавить к образу»
/ «В образе» as the buy box's; it keeps `result.to-look`.

**Z15. HEIC (D1).** The browser converts a HEIC/HEIF to JPEG before the upload with a WebAssembly
decoder (`libheif`'s js build, loaded only when such a file arrives; the CSP gets
`'wasm-unsafe-eval'` in `script-src`); the api keeps JPG, PNG and WebP. The pickers' `accept`
names `image/heic,image/heif`, so iOS hands over the original. Supersedes spec 0019 A31; returns
to board 4's «JPG, PNG или HEIC до 20 МБ».

**Z16. The paste (D1).** Ctrl/Cmd+V with an image in the clipboard, while the window is open, the
picker shows and no text field is focused, uploads it as the chosen photo (`source: paste`),
replacing a chosen one. Not on «Мои фото».

**Z18. The finished badge (T11).** "Unseen" lives on the server: a column `seen_at` on the
generation, set when the user opens the result; opening the history page marks every completed
result seen. The count comes with the quota's read on load and the push adds one at once; the
badge shows on the profile icon and on «Мои примерки» of the menu, tops at «9+», and goes when
the count is zero.

**Z19. The dislike's regeneration (H6; spec 0025).** The dislike's text goes into the generation
as the regeneration's comment does today (`POST /fittings/:id/regenerate` with the comment,
checked by the text check with the items' names, spec 0023 Y9, Y16). «Что поменять?» (the popover
of R13) stays beside the dislike: a wish is one thing, a verdict with its own allowance another.
The rating of a result that is then regenerated stays on it; the child starts unrated; a like
needs no window.

**Z20. The path and its count (H6; spec 0025).** "One such user path" is one try-on and the
regenerations that grew from it (the parent chain): the first and the second dislike regenerate,
the third and later open «Что не так?», keep the text and generate nothing. Only dislike
regenerations count on the chain, whatever «Что поменять?» did.

**Z21. Five cycles a month (H6; spec 0025).** Dislike regenerations spend none of the ten
try-ons. A month allows five dislike cycles per user, each being one try-on's chain with its two
regenerations of Z20 (so at most ten such regenerations a month); the first dislike on a sixth
chain opens the feedback window at once, keeps the text and says the month's allowance is spent.
(`FITTING_FEEDBACK_CYCLES_PER_MONTH`, 5.)

**Z22. A try-on for three ratings (H6; spec 0025).** Every third rating of a calendar month (a
like or a dislike, with or without text, on three different results) adds one to that month's
limit, at most three a month; the meters show the sum; the rating icons' tooltip: «Оцените
примерку: за каждые 3 оценки — примерка в подарок».

**Z23. The comparison (H4, H5; spec 0025).** The strip beside the result's picture shows the
user's other completed results on the same photo first, newest first, then, under a divider, the
rest; on a mouse it appears on hover, on a touch device through a «Сравнить» icon over the
picture. The slider: one frame of the result's size, both pictures at the same size, a handle
with «‹ ›» dragged with a mouse or a finger and moved by the arrow keys, the left picture clipped
at the handle; a caption with each side's date and items; «Чем отличаются» (the colours, the
photo, the price) under it. The history's «Сравнить», the selection mode, the compare page and
the elements `history.compare`, `history.compare-open`, `compare.*` go (Z25).

**Z25. The analytics' removals and the new elements.** Agreed to remove `try-on.my-photos` (T5),
`result.fullscreen` (the picture's click becomes `result.picture`), `history.compare`,
`history.compare-open`, `compare.open`, `compare.add-to-cart` (with spec 0025). The new elements
and events (`result.share`, `result.picture`, `result.save-photo`, `try-on.paste` as `Photo
Uploaded`'s `source: paste`, `header.profile-badge`, the category sheet's rows, and spec 0025's
and 0026's own) are proposed by the `analytics` agent at each plan and recorded there.

## Settled at the second answers (2026-10-29)

**Z7. The waiting screen's thumbnails (R12).** 72×96 px for
both (today the single item's thumbnail is 48×64 px and the look's strip 28×38 px, both 3:4),
the single item's with its name and colour beside it as now, the look's in one row with 8 px
gaps (five fit from 408 px; on a narrower phone the row scrolls sideways), the same on every
width.

**Z17. The drop zone (D1).** No pictogram (the owner declined the first proposal: «стильное и
премиальное, но минималистичное»). The zone is a tall card the frame's size with a hairline
border (`--color-border`, 1 px, not dashed) and the page's white, lots of air; in the centre a
thin-line «+» in a 56 px hairline circle; under it «Загрузите своё фото» in headline-s, then one
muted line «Перетащите, вставьте Ctrl+V или выберите файл» and the text link «Выбрать файл» (on
a touch device spec 0023 Y21's two tiles stay, drawn in the same hairline style); the formats
«JPG, PNG, WebP, HEIC · до 20 МБ» in caption at the card's bottom. On hover the circle's hairline
turns black; while a file is dragged over, the border turns black, the card fills with
`--color-background-secondary` and the circle scales to 1.1 over `--duration-fast`. It is built
on `/ui-kit` first, in part 2's first web task, so the owner sees it before the window changes.
(Declined alternative: a faint, blurred catalog look photo as the card's background.)

**Z24. The city (S1, S3; spec 0026).** No external geocoder. The browser's geolocation gives
coordinates only; turning them into a city's name normally takes a geocoding service (Yandex's
Geocoder HTTP API, DaData), a request to a third party with a key, its limits and the visitor's
coordinates sent out. Instead, the stores table holds each store's coordinates and city, so the
browser picks the nearest of the cities that have stores, and the header's list offers the same
cities; the coordinates never leave the browser and no key is needed. The price, accepted: a
visitor in a city with no Lamoda Sport store sees the nearest city that has one (or «Рядом с вами
пока нет магазинов» past 100 km), and the header offers only cities with stores. The choice lives
in the browser (`localStorage`, shared by tabs), never on the server; the permission is asked on
the first open of `/customer/stores` and on «Определить автоматически» in the header's window,
never on another page by itself.

## Amended at the plan (2026-10-29)

**Z12, amended.** Its point (c) described the housekeeping wrongly: a transient photo is deleted
an hour after its last generation ended (only a running generation holds it, up to a day), not
kept for a day. The rule stays as it is; the result's switch, on by default, keeps the photo the
moment the result opens, which is minutes after the generation in the usual flow; a result opened
later than an hour (from the history, a late toast) finds it gone and shows «Фото уже удалено».
Turning the switch off returns the photo to a one-time one (deleted when the window closes or by
the housekeeping), which is the "deletes it again" of the decision.

**Z26. The plan's own choices (to confirm with the plan).**

1. **The badge on phones.** The profile icon is hidden below 600 px, so there the burger's icon
   carries the unseen count and the burger menu's «Мои примерки» row shows it; the desktop keeps
   the profile icon and the menu's row (Z18).
2. **HEIC only where it helps.** The file input asks for HEIC (`accept`) only with a mouse
   (`MOUSE_QUERY`): iOS converts a HEIC to JPEG itself when the input does not name it, which is
   faster than the browser's wasm decoder on a phone; a HEIC dropped or pasted on any device is
   decoded. Refines Z15.
3. **Smooth scroll's easing.** The gallery viewer's and `ScrollRow`'s arrows scroll with the
   browser's `behavior: 'smooth'`, whose curve is the browser's own: the one place Z2's easing
   does not apply (a hand-written scroll tween is not worth it).
4. **The switch off.** `DELETE /me/photos/:id/keep` returns the photo to transient instead of
   deleting the row at once, so the user can turn it on again while the result is open.
5. **Analytics** as the `analytics` agent proposed (plan §6): the event `Fitting Start Retried`
   of type `service`; the element `profile-menu.open` (zone `auth`) with `signed_in` and
   `unseen` instead of Z25's draft name `header.profile-badge`; `result.share.method`; the new
   property `format` on `Photo Uploaded` and `Photo Refused`; `room.open` keeps `source: result`
   with no slot; `catalog.category-toggle.expanded` stays.
6. **The retry's pause is 1.5 s**, not Z10's 1 s: the expensive tier allows one request a second,
   and a repeat at exactly a second can meet the same window's 429.
7. **Review at phase boundaries**, as spec 0023 Y10: a task ends with `finish-task`, `typecheck`,
   `lint` and its own tests and is committed without a stop; `qa-tester` once per phase at its
   last task; the full `verify` after a clean install at the phase's end, then the push, the pull
   request and one stop. One exception: the drop zone's task (Z17) stops once for the owner's
   look at `/ui-kit` before the window changes.
