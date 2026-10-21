# 0019 AI fitting v1

Status: accepted (2026-10-21).

Issue #69 («Собрать страницу товара»). Decisions: `clarifications.md` (A1–A45). Design: the
owner's canvas «Онлайн-примерка 2.0» (26 boards, the kit's design system), read only. This spec
replaces items 1–4 of spec 0016's roadmap (0016 S20): the product page, photos, generation, and
try-on with history, as one spec in four phases.

## Goal

A signed-in visitor opens a product, uploads a photo of themselves once, and gets a picture of
themselves in that item, or in a look of up to five items collected in a fitting room, within a
minute; every result stays in their history, repeats cost nothing, and a monthly counter shows what
is left. The product page every catalog card links to exists, is cached and warmed like the catalog,
and is indexable. The prototype shows Lamoda what the pitch of spec 0016 describes: better than
the current try-on (saved photos, history, hints, another colour in one tap, regeneration with a
reason) and looks of several catalog items.

## In scope

Four phases, one pull request each (A1):

1. **Photos.** Upload with hints and consent, a check with a named reason for a refusal, up to five
   saved photos with a default one, deletion, the page «Мои фото» in the account.
2. **Generation.** One item on a saved or one-time photo through OpenAI's image model behind a
   replaceable adapter, a background workflow with live status, moderation of the result, the monthly limit and
   its counter, repeats from history, regeneration with a reason, a push to the browser when a
   result is ready, the history list.
3. **Product page.** `/products/<id>` with the gallery, rating, price, colour and size, the
   purchase stubs, «Примерить» and «К образу», «Вы это примеряли», «С этим товаром выбирают», SEO
   metadata and structured data, the sitemap, the page cache and the warm-up of spec 0018.
4. **Looks, the fitting room and history.** The fitting room of five slots in the header on every
   page, looks tried on as one generation, another colour of an item, the history's actions (open,
   repeat, compare two side by side, delete), the limit and error screens.

Entry points, flows, texts and states follow the canvas; where the canvas and the decisions
differ, the decisions win (`clarifications.md`, «Canvas and decisions»).

## Non-goals

- The size in the picture, the size recommendation, the garment measurements and the scene (0016
  AC12, AC13, S10, S19): the next spec, with its own design (A8).
- The digital twin (0016 roadmap item 5), the wardrobe, «my things», videos, a sellers' studio.
- A cart, favourites, orders, Lamoda Club: their buttons are stubs that only count clicks (A9).
- A public link to a result: «Поделиться» is shown disabled; the link comes later (A14).
- Guests (0013 N9): «Примерить» and «К образу» open the sign-in window.
- The mobile tab bar (A10), cropping a photo, reporting a wrong photo check, comparing two results
  as an overlay, the avatar teaser («Создать свой аватар · скоро»): backlog.
- Reviews, questions, delivery terms, the model's measurements on the product page (A9).
- A budget fuse for the providers (0016 S13); billing.
- Removing the old routes of fitting sessions and generations (A21): backlog.

## Acceptance criteria

The criteria of spec 0016 this spec checks are marked «0016 ACn»; AC12 and AC13 of 0016 stay for
the next spec (A8).

### Photos

- **AC1 (0016 AC5).** A signed-in user uploads a JPG, PNG or WebP photo of up to 20 MB; it appears
  in «Мои фото» re-encoded, without its metadata, and its link answers 404 after the photo is
  deleted. A photo of two people, of a child, with no person, not full length or too dark is
  refused with that reason and is not stored.
- **AC2.** The first upload shows the hints and the two consents («На фото — я», the processing
  consent); the buttons stay disabled until both are checked; later uploads skip the screen.
- **AC3.** A sixth saved photo is refused; the first saved photo is the default, another can be
  made the default; the default is preselected in the try-on.
- **AC4.** A file that is not an image, a 21 MB file or a body of another type answers the api's
  error format; nginx lets the upload route take 20 MB and keeps 1 MB elsewhere.

### Try-on

- **AC5 (0016 AC6).** From the product page a user tries an item on a saved photo and sees the
  result with the item, its chosen colour and the «Сгенерировано ИИ» mark; the counter of try-ons
  left drops by one.
- **AC6.** A try-on with the save switch off uses the new photo once: the result stays in the
  history, the photo is in neither «Мои фото» nor the bucket afterwards.
- **AC7 (0016 AC8).** «Примерить другой цвет» on a result gives the same picture with the item in
  that colour and spends one try-on; a colour already tried opens its result at once and spends
  nothing.
- **AC8 (0016 AC9).** «Хотите что-то поменять в образе?» asks what went wrong (face, figure, item,
  background, other, with a comment); the new result is a new history entry; the first
  regeneration of a result is free, the next ones spend one try-on each.
- **AC9.** A comment or a wish that is not about the try-on (another person, nudity, a minor,
  anything unrelated) is refused before any generation with a text that says so and spends
  nothing.
- **AC10.** While a generation runs the user sees its stage and an estimate of the time left; a
  closed window loses nothing: the result appears in the history, and a toast «Примерка готова»
  with a link opens on whatever page of the site is open; a failed generation shows its toast
  too.
- **AC11.** A generation the model does not answer in time, or whose result is refused by
  moderation, shows the matching screen with «Попробовать ещё раз» and spends nothing.
- **AC12.** Two «Примерить» clicks in a second start one generation; a request repeated after a
  timeout does not start a second one.

### Looks and the fitting room

- **AC13.** «К образу» on a product, or the hanger on a card, puts it into its slot of the fitting
  room (top, bottom, outerwear, shoes; an accessory slot stays empty); the header's icon shows the
  count on every page and on every device of the account; an occupied slot is replaced with a
  toast «Вернуть» that puts the previous item back.
- **AC14 (0016 AC7).** «Примерить образ» with three items (top, bottom, shoes) gives one picture
  with all three and spends one try-on; the result lists the items with their prices, colours and
  the sum.
- **AC15.** Changing one item's colour on a look result regenerates the whole look on the same
  photo and spends one try-on.
- **AC16.** A product whose category has no slot shows no «К образу» and no hanger; a signed-out
  visitor's «Примерить» and «К образу» open the sign-in window and change nothing.

### History

- **AC17 (0016 AC10).** Every result is in the history after a reload and after signing in on
  another browser, newest first, with its type (one item, look, regeneration), items and date;
  «Примерить ещё раз» with the same photo, items and colours opens the existing result, says the
  limit was not spent and does not change the counter; deleting removes the entry and its files.
- **AC18.** Two entries can be compared side by side with what differs (colour, photo, price);
  the tabs «Все», «Одна вещь», «Образы» filter the list; an empty history offers to pick an item.

### Limits

- **AC19 (0016 AC14).** At the monthly limit «Примерить» is disabled with the renewal date; a
  try-on request is refused with that date and no model is called; the counter and the limit meter
  show the number left and turn to the caution colour at three or fewer.
- **AC20.** A refused photo, a refused text, a failed or moderated generation and a repeat leave
  the counter as it was; the limit's size comes from the environment.

### Product page

- **AC21.** `/products/<id>` of a product in an active category renders its gallery, brand, name,
  rating, price
  and discount, colour and size selects, «Добавить в корзину» and «В избранное» (stubs),
  «Примерить» and «К образу», the limit meter for a signed-in user, «О товаре» and «С этим товаром
  выбирают» with six items of other categories; an unknown id, or a product of an inactive
  category, answers 404.
- **AC22.** The page's metadata (title, description, canonical, Open Graph image), the structured
  data for search engines (the product and its breadcrumbs), the breadcrumbs and the sitemap's
  product entries are present; the catalog's cards lead to the page without a change of the
  catalog.
- **AC23.** The catalog part of the page is served from the page cache of spec 0018 and the warm-up
  requests the first products of every category; nothing of the visitor (session, history,
  fitting room, counter) is cached or rendered on the server.
- **AC24.** «Вы это примеряли» with the last result's thumbnail, date and colour shows on a product
  the user tried on, and opens that result.

### Realtime and safety

- **AC25.** The live connection delivers a push only to the signed-in user it belongs to; a push
  carries ids and a status, never a link or a photo; another user never receives it.
- **AC26.** Signed links of photos and results reach the browser only as image sources, appear in
  no attribute, Sentry event or Mixpanel property, and their containers are not recorded.
- **AC27.** `OPENAI_API_KEY` is in no image, log line or browser bundle; without it tests and CI
  run on the fake provider and never reach OpenAI; production refuses to start without it.
- **AC28 (0016 AC15).** Deleting the account removes the user's photos, results and fitting room;
  no file of theirs is left in the bucket.

### Analytics

- **AC29.** Every click on a purchase or favourites stub, every try-on started, finished and
  failed, every photo uploaded or refused and every look item added is counted with the
  properties of `plan.md` §9, with no id, link or user data in a property.

### Build

- **AC30.** `npm run verify` passes; the web image builds with no api running; `npm ci` is plain.

## Owner actions (Claude cannot do them)

- Create an OpenAI API key; set `OPENAI_API_KEY` as the GitHub secret of the Environment
  `production` and, for a check by hand before the merge, in the working copy's `.env` (A4).
- Run the reachability check of `api.openai.com` from the server (`ssh ai-fitting`) before phase
  2's merge: OpenAI does not list Russia among its supported countries, and a 403 there means the
  route to the model is the owner's decision; check with the main session, after the merge, the
  first generation on production (A4).
- Merge spec 0014's and spec 0018's pull requests before phase 3 starts (A1, A22).
- Approve the analytics entries of `plan.md` §9 with this spec (A13).
- Read the pitch's figures: the number of stub clicks and try-ons is the `analytics` agent's.

## Assumptions

- OpenAI's GPT-Image-2 stays available at a price within a factor of two of `research.md`; a
  result takes seconds to two minutes, so the time limit of one generation is three minutes.
- The demo catalog's six categories map to the slots top, bottom, outerwear and shoes (A18); the
  accessory slot waits for an accessories category.
- The kit covers the pages with `Modal`, `Drawer`, `Toast`, `Tabs`, `Checkbox`, `Switch`,
  `Select`, `Skeleton`, `Spinner`, `Button`; what it lacks (a count badge, a progress bar, a file
  input, a gallery, a bottom sheet, state cards, icons) is added to the kit and to `/ui-kit`.
- Spec 0014's catalog cards keep their one action slot (0009 K10), which the hanger fills.
- Lamoda's own numbers in the canvas (40 try-ons, 436 reviews, 23 try-ons in the history) are
  sample data; the limit is 10 (A5) and the counts are the user's own.
