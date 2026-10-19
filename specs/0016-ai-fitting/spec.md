# 0016 AI fitting

Status: accepted (2026-10-19).

Issue #84. Decisions: `clarifications.md` (S1–S19). Research (in Russian): `research.md`.

## Goal

A product vision and strategy for AI fitting, written as a pitch to Lamoda (S5) and shown working on
lamoda-ai-fitting.ru (S6). Lamoda already has a single-item try-on; this spec describes a try-on that
is clearly better: the user's saved photos and a digital twin made once, a history of every
generation, outfits of several catalog items in one picture, the scene and the user's own clothes
adapted to the item, and the chosen size reflected in the picture with a size recommendation beside it
(S8–S10). It also sets the money model Lamoda would use (S11), the risks, how the feature is released
and measured, and the follow-up specs that build it.

## Strategy

- **Where Lamoda stands.** Try-on on the product page is now standard in Russia (Lamoda, Wildberries,
  Yandex Market, Sela) and abroad (Google, Zara, ASOS). Everyone shows one item on one photo. Nobody
  ties try-on to size, which is the main reason for returns; almost nobody keeps a history; editing the
  user's photo to suit the item is an empty niche; the top complaint everywhere is "this is not me"
  (`research.md` §1, §7).
- **The bet (S8).** Three directions together:
  1. a better single-item try-on than Lamoda's current one;
  2. try-on tied to size;
  3. a digital twin made at onboarding.

  Outfits of several catalog items are in the core (S9).

- **Later (S9).** Try-on of looks from Lamoda's virtual wardrobe, "my things" and "buy the rest of the
  look" go to the roadmap.
- **Money (S11).** Free for the buyer. Lamoda pays for generations out of higher buyout and fewer returns
  and recovers part of it from sellers and brands.
- **Proof.** The pitch shows a calculator, not promised percentages: no competitor has published a
  measured effect of try-on on returns. Lamoda measures the effect with an A/B test from day one.

## Product

### Digital twin (onboarding)

- The user signs in with Google (no guests, N9) and is offered to create a twin; a try-on started
  before that leads through the same steps.
- **Photos.** One or more photos (a face photo and a full-length photo are recommended). Each photo is
  checked at upload; a refused photo names the reason (too dark, not full length, more than one person,
  a child, not a photo of a person). The user confirms the photos are of themselves and consents to their
  processing.
- **Clean base (on request, S16).** For any saved photo the user may ask for a "clean base": the
  person without outerwear and bulky items, on a neutral background, with the face and figure
  unchanged. The user sees it and keeps it as another saved photo or discards it; it spends one
  try-on (S17).
- **Body and size.** Height, usual size (letters, jeans, shoes) and optional body parameters. Optional
  appearance notes (skin, hair) so the model does not guess them.
- **Style.** A free-text description of style and lifestyle ("office on weekdays, hiking at weekends,
  no bright colours") and dislikes. It steers scenes and suggestions, never the user's face or figure.
- The user can edit any part later, add or delete photos, and delete the whole twin. Deleting removes the
  photos, the clean bases and the generations made from them.

### Try-on

- **Entry points.** A "Try on" button on the product page and on product cards; "Try on together" on a
  selection of several items.
- **What to try on.** One item, or an outfit of several catalog items (top, bottom, outerwear, shoes,
  accessories) in one picture. The user picks the colour and size before or after the result; another
  colour of the same item is one tap.
- **Which photo.** The twin's default photo, or another of the user's saved photos; a one-off photo can
  be uploaded and saved or not.
- **Scene.** Keep the photo's background, let the try-on pick a scene suited to the items (linen → a
  summer scene) or choose a preset (city, office, beach, evening). Clothes on the photo that the outfit
  replaces are removed; the rest stays.
- **Size (S10).** The picture reflects the chosen size relative to the user's usual one (for example one
  size larger). Next to the result: a size recommendation from the item's measurements and the user's
  size, and a plain note that the fit in the picture is approximate. The usual size comes from the twin
  or, for a user without one, is asked at the first try-on.
- **Waiting.** A progress indicator and an estimate of the time left; leaving the page does not lose the
  result.
- **Result.** The picture, the items with their prices and chosen sizes, "Add to cart" for the item or
  the whole outfit (in the prototype: favourites, since it has no cart), share, download, "try another
  colour", "try with other items".
- **Something wrong.** "Regenerate" asks what went wrong (face, figure, the item, the background,
  something else) and uses the answer.
- **Never idealised.** The try-on does not slim, retouch or otherwise "improve" the user.

### History

- Every generation is kept with its photo, items, sizes, scene and date, newest first, until the user
  deletes it. It is reachable from the profile and from the product page ("you tried this on").
- A generation can be opened, compared with another one, shared, deleted, or used as the start of a new
  try-on.
- Repeating a try-on that already exists (same photo, items, sizes and scene) opens the existing result
  and spends no try-on.

### Limits (S12, S13)

- Each user has a monthly try-on limit and sees the number left. Opening history and repeats do not
  spend it. When the limit is reached, the user sees when it renews.
- The prototype has no billing: no club levels, payments or top-ups (S12).

### Trust and safety

- The user's photos and generations are visible only to them; a share is an explicit action.
- Photos are not used to train models; the consent text says so.
- Inputs and results are moderated: no minors, no nudity, no try-on of underwear or swimwear on a photo
  that is not the user's own. A refused generation explains the reason and spends no try-on.
- Every result carries a visible "AI-generated" mark.

## Roadmap

Follow-up specs, in this order (preliminary, S15). Each one gets its number when it is written and inherits the
acceptance criteria of this spec marked with its name. The open items of `specs/backlog.md` in this area
(named by their titles there) go to the spec named next to them.

1. **Product page.** The page every catalog card links to (the catalog page's spec points the cards
   to it), with the gallery, sizes, a size chart with
   garment measurements (S10, measurements added to the demo catalog) and the "Try on" entry. Backlog:
   "Product card link".
2. **Photos.** Upload, checks, consent, saved photos, deletion. Backlog:
   - "Photo upload limits": size and type limits, WebP, snapshot retention;
   - "Outbox for file deletion": before the first user file (N37);
   - "Signed links in reports": photo links kept out of Sentry and Mixpanel;
   - "Storage backups": the bucket's backup once users upload photos;
   - "Deleted users in backups": the retention period checked against 152-ФЗ.
3. **Generation.** The three models (S7), each replaceable by another, generation in the background, results reused
   for repeats, moderation, limits and the counter, live status. It decides how the prototype reaches
   the models (S7), the size of the monthly limit (S12), and what makes two try-ons the same when the
   scene is picked by the try-on (a repeat spends nothing). Backlog:
   - "Long writes after a timeout": starting a paid generation answers at once and is never repeated
     by a retried request;
   - "Heartbeats for long activities": a cancellation stops a paid call;
   - "Temporal history backup";
   - "Fitting sessions per user" (N39);
   - "A revoked session on an open socket".
4. **Try-on and history.** Single item and outfit, colour, scene, size in the picture and the size
   recommendation (S19), regenerate with a reason, share, history. It decides where the usual size
   asked at the first try-on is kept and whether the twin's onboarding takes it over. Until the twin,
   scenes are picked by the items alone, without the user's style.
5. **Digital twin.** Onboarding, clean base, body and size, style.
6. **Later.** Try-on of looks from a wardrobe and "my things", "buy the rest of the look", a daily feed
   of looks on the twin, short videos, a virtual photo studio for sellers.

The backlog item "Guests" stays closed: try-on needs a sign-in (N9).

## Rollout at Lamoda (pitch)

1. **Pilot without customers.** 200–300 Lamoda items and photos of people who consented in writing
   (not customers). Compare the three models (S7): defects (face, figure, item, hands), blind pairwise
   preference, p50 and p95 time, moderation refusals, cost per shown result.
2. **A/B test.** A share of app users gets the new try-on, the rest keep the current one. Metrics:
   add-to-cart after try-on, buyout of tried items, returns for "size did not fit", repeat try-ons,
   shares, cost per user.
3. **Widen** by category and share of users while the metrics hold; then sellers' paid options (S11).

## Non-goals

- Lamoda's own systems: its app, cart, orders, Lamoda Club, payments. The prototype imitates none of
  them (S12).
- Billing in the prototype: club levels, top-ups, payments from sellers (S11 describes them for Lamoda
  only).
- Guests (N9).
- A guaranteed fit: the picture is approximate (S10).
- Choosing the legal scheme for cross-border transfer of photos: that is Lamoda's lawyers' decision; the
  pitch names the options.
- Our own model on Russian GPUs: named as Lamoda's fallback, not built.

## Acceptance criteria

AC1–AC4 are checked with the documents (T1). AC5 onwards describe the prototype; each is checked by
the follow-up spec named in brackets, and the spec of the digital twin closes this one (S18).

### This spec

- **AC1.** `research.md` has a source for every fact about a competitor, and no fact marked unverified
  remains in it.
- **AC2.** Each of the owner's four requirements is in "Product":
  - saved photos;
  - history;
  - outfits of several items;
  - the digital twin with style and photo edits.
- **AC3.** Every open item of `specs/backlog.md` about photos, generations or try-on is named in
  "Roadmap".
- **AC4.** `spec.md` holds no technical decisions; models, money and the prototype's scope come from
  `clarifications.md`.

### Prototype

- **AC5 (photos).** A signed-in user uploads a photo; a photo of two people or with no person is refused
  with the reason; an accepted one appears in their saved photos and can be deleted, after which its link
  answers 404.
- **AC6 (try-on).** From the product page a user tries an item on a saved photo and sees the result
  with the item, its size and the "AI-generated" mark; the counter of try-ons left drops by one.
- **AC7 (try-on).** A user selects three items (top, bottom, shoes) and gets one picture with all three.
- **AC8 (try-on).** "Another colour" on a result gives the same picture with the item in that colour.
- **AC9 (try-on).** "Regenerate" asks what went wrong; the new result is a new history entry.
- **AC10 (history).** Every result is in the history after a reload and after signing in on another
  browser; repeating an existing try-on opens it and does not change the counter; deleting removes it.
- **AC11 (digital twin).** A user completes onboarding with photos, height, usual size and a style
  description; asking for a clean base of a photo shows it, and keeping it adds it to the saved
  photos.
- **AC12 (try-on).** Trying on a winter photo with a summer item, with "scene suited to the
  items", gives a picture without the outerwear and with a summer background.
- **AC13 (try-on).** Choosing a size larger than the usual one changes the picture, and a size
  recommendation with the note about approximate fit is shown next to it.
- **AC14 (generation).** At the monthly limit, a try-on is refused with the renewal date and no model
  is called.
- **AC15 (photos).** Deleting the twin or the account removes all the user's photos and generations.

## Owner actions (Claude cannot do them)

- Accounts and keys of the model providers (OpenAI, Google, ByteDance or a reseller) and paying for them
  (S13).
- Checking the unverified numbers in person when a page will not open (for example, Lamoda's buyout in
  The Blueprint).
- Consent and personal-data texts: legal wording, if a lawyer reviews them.
- Presenting the pitch to Lamoda.

## Assumptions

- The three models (S7) keep working and keep their prices within a factor of two during the
  prototype; any of them can replace another.
- A result takes seconds, not minutes, for the prototype's models; the target time is set in the
  generation spec.
- A share of results will be defective; the pilot measures it, and limits count only shown results.
- Lamoda's figures (users, buyout, average order) are taken from the press and may differ from its
  internal data; the calculator takes Lamoda's own numbers.
