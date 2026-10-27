# 0023 ui-feedback: clarifications

Status: accepted (2026-10-27) with Y1–Y15; Y16, Y17 added at the review of PR 1; later decisions
are added below as they are made. Decision ids `Y1`, `Y2`, …; the notes are `C1`–`C7` and
`P1`–`P36` of [source/agentation-notes.md](source/agentation-notes.md).

## The canvas

The notes were checked board by board against the canvas «Онлайн-примерка 2.0» on 2026-10-27; the
verdicts are the table "Differences from the canvas" of `spec.md`. The notes win over the boards;
the canvas is not redrawn.

## Settled at the first answers (2026-10-27)

**Y1. The photo consents are kept on the server (P23).** The user's row gets the time of the
consent and the version of its text (a migration); the first upload sends them with the photo, and
`GET /me` answers them, so the tips and the two consents show once per account, not per browser.
Each click of a checkbox is not sent: what counts is both boxes checked and a file chosen. Replaces
spec 0019 A60's `localStorage` key as the source of truth (the plan says what happens to it).

**Y3. The new hearts are stubs (P4, P12).** The picker's item cards and the room's filled slots get
the heart of spec 0019 A33: the toast «В прототипе нет корзины и избранного», never pressed. Real
favourites stay out of scope.

**Y6. The wishes field loses «· по желанию» and its hint (P19, P20).** The hint «Учтём при
генерации. Не меняет вещи и их цвета.» goes; the counter «N / 200» stays.

**Y7. Where the result is saved (P30).** The success screen (P26) says «Готово! Сохранили в «Мои
примерки»»; the result shows, under the picture, a line of its own with a check mark: «Сохранено в
«Мои примерки»», the name a link to the history. It replaces «сохранено в истории» of the look's
subtitle and «Сохранили в историю примерок» of the single result.

**Y8. «Скачать» saves through the api (P28).** A route of the api answers the result's picture from
the site's own origin; the browser saves it as a file and the toast confirms it once saved. The
history's «Скачать» does the same. The storage's CORS and the CSP stay as they are.

**Y9. The regeneration without chips (P33, P34).** `reasons` becomes optional in the api, the
comment stays optional: an empty request is one more attempt. A look keeps «Какая именно?» as an
optional choice of the item. The comment's label gives way to the hint (the owner's wording
accepted): «Можно попросить: изменить посадку, длину, заправить вещь, другую позу или фон. Нельзя:
заменить вещь или её цвет — для этого выберите другой цвет или вещь.» The hint promises a pose and a
background, which today's text check and prompt refuse: Y12 decides how far they open.

**Y10. Review at phase boundaries.** As spec 0019 A2 and A58: inside a phase a task runs
`finish-task`, ends with `typecheck`, `lint` and its own tests and is committed without a stop;
`qa-tester` runs once per phase at its last task; the full `verify` runs once at the phase's end,
after a clean install; then the push, the pull request and one stop with the summary. Pull
requests: PR 1 the four documents, PR 2 part 1, PR 3 part 2 (with its api changes).

**Y11. Analytics (the `analytics` agent's proposal of 2026-10-27, accepted whole).**

1. New elements `try-on.favourite` (`kind`: `single` | `look`) and `room.favourite` (`slot`), both
   `interaction` in the zone `fitting`.
2. A new area `gallery` in the zone `product`, element `gallery.photo` (`position`, the photo's
   number from 1): a click opens the full screen, a hover (desktop only) is the magnifier.
3. `Photo Uploaded.source` and `Photo Refused.source` gain `drop`; a click on the drop zone is
   `photos.upload` with `source: file`.
4. New elements `try-on.replace-photo` (`interaction`) and `try-on.my-photos` (`navigation`).
5. `Fitting Refused` gains `prompt_reason`, sent only with `reason: prompt_refused`, in coarse
   groups: `other_people`, `minors`, `unsafe`, `off_topic` (never `politics` or `nudity` on their
   own: a classification of a signed-in user's own text).
6. `result.reason` and the property `result.regenerate.reasons` are removed (their history ends
   here). `result.regenerate.with_item` stays and from this spec means "a look's item was chosen in
   «Какая именно?»", no longer tied to the chip «Вещь»: its reports are cut at the release's date.
7. The empty slot's «+» sends `room.fill` as «Подобрать в каталоге» does, with no new property.
8. `result.history` (`navigation`) on the link of Y7; «Добавить образ в избранное» stays untracked.

Descriptions of `buy-box.to-look`, `room.add-to-cart-all`, `result.add-to-cart-all`,
`photos.upload`, `photos.camera`, `try-on.photo`, `result.download`, `history.download`,
`result.fullscreen`, `buy-box.favourite`, `Fitting Completed` (sent when the success screen shows)
and of the zones `product`, `header`, `fitting` follow the new labels and behaviour; ids do not
change. Budget: about 118 K events a month after the change, against 800 K.

## Settled at the second answers (2026-10-27)

**Y2. OpenAI's refusal reasons are mapped to texts (P27).** _Its sentence on a refusal with no
category is superseded by the amended Y2 below: no text names who refused._ No refusal rule of our own is added
(the owner declined a "public figure" reason in the photo check). Instead every place where OpenAI
refuses keeps the reason OpenAI gives and the visitor reads a text per reason: the moderation
endpoint's flagged categories on the photo and on the texts, the image model's
`moderation_blocked` with its `moderation_details` (`moderation_stage`: `input` | `output` |
`unknown`, coarse `categories` such as `sexual`, `violence`, `self-harm`, `harassment`; OpenAI's
image generation guide, read 2026-10-27), and the photo and text checks' own reasons. A refusal with
no category gets a text that still says OpenAI's safety rules refused it and what usually helps.
The plan lists every reason and its text; a generation's reason is kept with the fitting so the
history and a reopened result show it too.

**Y4. «Управлять» becomes «Перейти в «Мои фото»» (P5).**

**Y12. The wishes and the comment open up.** Allowed besides the fit and the styling of the chosen
items: the background and the scene, the pose, the colour and style of the person's own clothes
that are not tried on, and small additions to the look (a scarf, a belt, rolled sleeves). Still
refused: changing the face, the body or the identity, other people, nudity, minors, violence,
politics, text and logos, and changing the tried-on items or their colour (that is the colour
choice). The text check's instructions and the generation's prompt change together, and the hint
of Y9 matches them. Replaces spec 0019 A16's limits on the wishes. The owner accepted the risk that
a freer request distorts a tried-on item more often.

**Y13. Device kind by the input, not the width.** «Сделать фото» shows on a device whose primary
pointer is a finger (`pointer: coarse`), of any width; the gallery's magnifier and the hover effects
work only with a mouse (`hover: hover` and `pointer: fine`). An iPad with a trackpad counts as a
mouse and gets no camera button. The spec's "phones and tablets" read this way wherever they decide
a control, not a layout.

## Settled at the third answers (2026-10-27)

**Y2 (amended). Texts by coarse categories, never naming who refused.** OpenAI's categories (of the
moderation endpoint and of the image model's `moderation_details`) are grouped into a few coarse
categories, each with one text; the photo check's own reasons keep theirs. No text says whether
OpenAI or the site refused: the visitor reads what is wrong and what to do.

**Y5. Slot names.** `top` «Верхний слой и платья», `bottom` «Нижний слой», `outerwear` «Верхняя
одежда», `shoes` «Обувь», `accessory` «Аксессуары». The owner kept them knowing «Верхний слой» may be
read as outerwear.

## Settled while the plan was reviewed (2026-10-27)

**Y14. The gallery's magnifier is a round lens (P2).** With a mouse, the cursor over a product photo
becomes a circle, and inside it the part of the photo under the cursor shows enlarged; the photo
itself does not zoom or move. (The plan's first draft scaled the whole photo inside its frame: not
what the owner meant.) The plan sets a 160 px lens and 2.5 times.

**Y15. The plan's own choices, confirmed by the owner with the plan.** (1) The room's toasts drop
the slot's name: «Заменили «<прежняя>» на «<новая>»», ««<вещь>» в примерочной». (2) The phone's
empty room cells read «верхний», «нижний», «пальто», «обувь», «аксесс.». (3) A user who consented
only in a browser before this release sees the consents once more. (4) The photo frame is 2:3, the
photo contained on a light grey, its size set by the window only. (5) The success screen lasts
1.5 s and follows a colour change and a regeneration too. (6) The refusal texts are the plan's §4.5
tables.

## Added at the review of PR 1 (2026-10-27)

**Y16. The text check knows the chosen items.** The classification of the wishes and of the comment
gets the chosen items' catalog names and categories (never the user's data) in its instructions,
so «сделай мою футболку синей» passes when no T-shirt is tried on and is refused (`unrelated`)
when one is: the tried-on items' colour is the colour choice (Y12).

**Y17. The api requires the consents.** `POST /me/photos` by a user with no stored consent of the
current version, and no `consent` field in the request, answers 400 with the detail
`CONSENT_REQUIRED` on `consent` and stores nothing. The server holds every consent the site relies
on (Y1); web's screen stays the way the user gives them.

## Settled during part 1 (2026-10-27)

**Y18. The buy box keeps board 1's 280 px (P11, T4).** Board 1 (1440) draws a 1200 px column: the
gallery 888 px, 32 px, the buy box 280 px. From 1024 px the buy box is `flex: 0 0 280px` and the
gallery `flex: 1 1 888px`, so from 1280 px the page is board 1 as it is and below that only the
photos shrink. The plan's 360 px misread the board and would have narrowed the desktop's gallery
to 808 px.

## Settled during part 2 (2026-10-27)

**Y19. An unreadable verdict of the text check is no answer (T9's review).** Until now the
classification of the wishes and of the comment counted an answer it could not read (an
incomplete one, a refusal, no JSON) as allowed with a warning (spec 0019 A16, A45). After Y12 a
text let through so may change the scene, the pose and the person's own clothes, and the result's
moderation does not see other people or a made-up inscription. So such an answer is now the check
not answering: 503 `SERVICE_UNAVAILABLE` with nothing stored or spent, as a timeout already is,
and it reaches Sentry as a dependency's 503 does. Its `max_output_tokens` goes from 200 to 500, so
a reasoning model's hidden tokens rarely cut the verdict. The photo check keeps counting an
unreadable verdict as accepted: the photo and the result both pass the moderation, and a refused
photo costs the user a new upload. A try-on with no wishes is never affected.

**Y20. The photo frame's height on a low window (T11's review).** The frame keeps the plan's 240 px
reserve, so it is one size through the picker, the wait and the result (P24, AC12): a result whose
caption and tiles do not fit under the frame scrolls inside the window, the photo whole in view. A
window from 600 px wide never makes it lower than 320 px (`max(320px, min(640px, 100svh - 240px))`,
560 px the same): on a low window (a phone turned sideways) the window scrolls instead of the photo
shrinking to nothing. `PhotoFrame` lives in `entities/fitting`, not `widgets/try-on`: the feature
`start-fitting`'s `TryOnLoader` uses it, and a feature imports no widget.

**Y21. Two pickers in the drop zone are tiles (PR 3's review, the owner's screenshots).** On a touch
device the zone's «Загрузить фото» and «Сделать фото» were two grey buttons side by side that
merged with the grey zone and did not fit a phone's or a tablet's frame. They become two equal
white tiles with a frame, the icon over the label, as board 3's «Загрузить» and «Снять» (the
owner's choice of three); «Заменить фото»'s window shares them. With a mouse the one «Загрузить
фото» button stays.

**Y22. Leaving the product page closes its try-on (PR 3's review).** Next keeps a page left by a
link hidden with its state, so the try-on window opened from the product page stayed mounted after
«Перейти в «Мои фото»» and came back open on Back (the owner read it as the link not working). The
window now closes when the page is hidden or left, as the look's try-on already did.

**Y23. «Мои фото» offers the camera only on a touch device (PR 3's review).** T12 kept «Сделать
фото» on «Мои фото» on every device; with a mouse it only opens the file picker again, so it goes,
as in the try-on (Y13).
