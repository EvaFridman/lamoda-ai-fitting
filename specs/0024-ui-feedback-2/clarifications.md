# 0024 ui-feedback-2: clarifications

Status: accepted (2026-10-29): Z1–Z16, Z18–Z23 and Z25 settled at the first answers, Z17 and
Z24 at the second; Z12 amended and Z26 (the plan's own choices) added at the plan and confirmed
with it; Z27–Z29 settled at the review of PR 1. Z19–Z24 are the starting decisions of specs 0025 and 0026 (Z1). Decision ids `Z1`, `Z2`, …; the notes are `R1`–`R14`, `K1`–`K4`, `T1`–`T14`,
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
the elements `history.compare`, `history.compare-open`, `compare.*` go (Z25). Spec 0025 takes
the backlog item «Compare as an overlay» (the slider is that overlay) and its commit removes it
from `backlog.md` (added at the review of PR 1).

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

## Settled at the review of PR 1 (2026-10-29)

**Z27. A bare 500 is not repeated (Z10).** The silent retry stays on a network error, a timeout
and 502/503/504. In production an api that is down answers nginx's 503; a bare 500 comes from an
api bug (repeating it doubles the request for nothing) or, locally, from `next dev`'s rewrite with
the api stopped. So `qa-tester` checks the retry with a stubbed 503 (as `CLAUDE.md` already does
for the 503 text), not by stopping the api.

**Z28. `profile-menu.open.unseen` is capped.** It sends the badge's value, not the raw count: 0–9,
and 10 for «9+». A value about the page, as the rules ask, not how many results a user has.

**Z29. The save switch at five saved photos (Z12).** The switch stays on by default; a photo
saved before the result opened is never saved twice (the keep answers 200 unchanged); at five
saved photos a new one is simply not saved: the switch shows off and disabled, with no text of
its own. The owner accepted that a result opened on a one-time photo fills «Мои фото» by itself
up to five.

The review's other notes were fixed in the documents of PR 1 without a decision: AC20's pause
(Z26.6), the switch shown after its own keep (plan §4.2), `format` naming the original file
(plan §6), the retry's departure from spec 0017's "a write is not repeated by itself" written at
`isStartRetryable` and in `CLAUDE.md` (T16), the CSP's `'wasm-unsafe-eval'` in AC27, the package
check of `libheif-js` (T18) and the header's quota read on every page (plan §5).

## Settled during the tasks

**Z30. The search row's field is focused at the loupe's click (T3, AC3).** Not after the slide
ends: iOS Safari opens the keyboard only for a focus called within the tap itself, so a focus at
`transitionend` would leave a phone with a focused field and no keyboard. The row turns visible
at the start of its slide and the field takes the focus at once (`preventScroll`), while the row
grows `0fr → 1fr`. Amends plan §2.1.

**Z31. The tab icon's PNG fallback (Z5, T6, AC7).** Plan §2.4 drew only `icon.svg` and the Apple
icon, short of Z5's PNG fallback, so a browser that shows no SVG icon would ask `/favicon.ico` and
get a 404. `web/app/icon1.tsx` adds a 32×32 PNG of the same mark through `ImageResponse`, drawn
with the Apple icon by `_app/icons/mark-icons.tsx`; `/icon1` joins `EXCLUDED`. Amends plan §2.4.

**Z32. A smaller «скоро» (T7, AC8).** At the count badge's place the 18 px chip, about 40 px
wide, covers the top of the 24 px icons of «Избранное» and «Корзина». The owner's answer at T7:
make it a little smaller. `SoonChip` is 16 px high, 4 px from the sides, an 8 px radius and 10 px
text, everywhere it is used. Amends plan §2.5.

**Z33. The meters' forms for few and none (T9, AC11, AC15).** T9's review found that the window's
own meter texts passed to `LimitMeter` skipped `triesLeftText`, so they read «Осталось 1 в этом
месяце» and «Осталось 0 в этом месяце». The owner's answer at T9: fix it. The result's plain meter
is `triesLeftText` itself («Осталось 17 примерок в этом месяце», «Осталось 2 — мало», «Примерки
закончились»); a longer text ends in `triesLeftTail` («· осталась 1 в этом месяце», «· осталось 7
в этом месяце», «· примерки закончились»). On a phone the wait's percent is body-s as the stage
beside it. Amends plan §2.7.

**Z34. «Другое фото» of the error screen chooses none too (T12, AC17).** T12's review found that
the error card's «Другое фото» went back to the picker with the failed fitting's photo still
chosen, so a refused photo stood in the frame with «Примерить» enabled. The owner's answer at T12:
it behaves as «Примерить на другом фото», the empty zone and no photo chosen. Amends plan §2.10.

**Z35. «Выбрать из сохранённых» under the empty zone (T12, AC17).** AC17 and plan §2.10 left the
empty zone with no way to the saved photos, since «Заменить фото» showed only under a chosen photo.
The owner's answer at T12: while there are photos to pick and none is chosen, the same button and
window stay under the zone, named «Выбрать из сохранённых», listing every photo; with a photo
chosen it is «Заменить фото» as before. `try-on.replace-photo` counts both. Amends plan §2.10.

**Z36. Z9 over spec 0026's pause (T13, AC18).** Spec 0026 (C12), merged while this one was in
progress, took note S2 as unassigned and shipped a 300 ms pause (`SEARCH_APPLY_MS`) written into
`StoresView`. The owner's answer at T13: Z9 stands, 500 ms through `useDebounced` of `shared/lib`.
Its `atOnce` applies an emptied field and a text the browser restored before hydration (0026's
own rule, kept) in the same render. `Stores Searched` keeps its 1 s on the typed text. Amends plan
§2.11.

**Z37. The look's item card on a narrow column (T13's QA, AC11, AC12).** Below 360 px of the
result's right column (a phone) «В корзину», the heart and «Заменить» did not fit beside the name,
so spec 0019's rule wrapped them under the text, short of AC11's actions at the card's top. The
owner's answer at T13: «В корзину» becomes the bag icon (`BagIcon`, a 32 px square, «В корзину»
kept as its name for screen readers) beside the heart at the card's top, and «Заменить» goes
under the text. A wider card keeps the label and the one line. Amends plan §2.7, §2.8.

**Z38. «в этом месяце» on the history's meter (T13's QA, AC11).** Plan §2.7 kept
`triesLeftOfText`, so «Мои примерки»'s aside read «Осталось 6 из 10 примерок», short of AC11's
pages' lines and the spec's assumption naming that aside. The owner's answer at T13: «Осталось 6
из 10 примерок в этом месяце»; «Обновится 1 ноября» and «Примерки закончились» stay. Amends plan
§2.7.

## Settled at the review of PR 2 (2026-10-29)

**Z39. The owner's look at the local PR 2.** (1) The header's «скоро» sits higher and further
right than the count badge, so it covers less of the icon: `top: 0; right: -4px` of the 48 px
button, below 600 px `right: 0`, since there the last icon's button ends 4 px from the screen's
edge; the count badge stays (amends Z32, AC8's «at the position of the count badge»). (2) The buy
box's «Примерить» keeps Z4's grey fill and gets «Добавить к образу»'s black frame; disabled at the
limit it keeps only its fill, while loading it keeps the frame. (3) `InfoTip`'s hint opens after a 100 ms rest of
the pointer instead of Base UI's default. Amends plan §2.5, §2.3, §2.9.

**Z40. The single result's item card as the look's (the owner's look at PR 2).** Its 56 px
«Добавить в корзину» and heart under a 72×96 `ItemRow` looked too large beside the look's cards.
The card becomes `ItemRow` at 60×80 (40×54 on a phone, where «В корзину» stays text, unlike Z37's
look card) with «В корзину» 32 and the heart 32 at its top
(`result.add-to-cart` of kind `single` stays; the heart is the untracked stub as before), the
size's stub under it. Amends plan §2.7.

**Z41. The owner's second look at PR 2.** (1) The buy box's «Примерить» is a shade darker:
`--color-background-tertiary` with Z39's black frame, `brightness(0.95)` on hover; disabled at the
limit it keeps the kit's lighter `--color-background-secondary` and no frame (amends Z4, Z39). (2)
The single result's size stub was a 50 px full-width field, too large for a secondary control: it
is a 32 px field in small text, as wide as its text, under the card's text beside the picture
(amends Z40). Amends plan §2.3, §2.7.

## Settled at T14 (2026-10-29)

**Z42. The result learns its photo's kind from the fitting (T14's review, AC22).** Plan §4.2 showed
the save switch when the photo was in the window's `transients` or `useMyPhotos` showed it
`transient: true`, but `GET /me/photos` lists only saved photos, so a result opened outside the
window that uploaded its photo (the history, a late toast) never showed the switch or «Фото уже
удалено». `FittingDto` gets `photoTransient`: `true` while the fitting's photo is a one-time one,
`false` while it is saved, `null` once it is gone (with `photoId` `null`). The switch renders
when the photo is in `transients` or `photoTransient` is `true`; «Фото уже удалено» shows when
`photoTransient` is `null` (the api cannot tell which kind a gone photo was, so a saved photo the
user deleted shows it too) or the keep answers 404; `false` shows nothing. The answer is still
taken once and kept as `ownPhoto` (§4.2). A new api task, T14a, in this phase. Amends plan §3.1,
§4.2.

## Settled at T14a (2026-10-29)

**Z43. web's fitting schema takes `photoTransient` in T14a (the owner, at T14a).** web's
`schemas.contract.test.ts` fails on any field of `FittingDto` its `fittingSchema` lacks, so the
api's new field left alone would keep `verify` red until T20. T14a adds `photoTransient:
z.boolean().nullable()` to `fittingSchema` and to the web tests' fittings, with no UI; T20 keeps
the rest of its web work. Amends tasks T14a, T20.
