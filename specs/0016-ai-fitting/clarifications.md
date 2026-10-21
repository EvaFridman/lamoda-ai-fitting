# 0016 AI fitting: clarifications

Status: open (2026-10-19): decisions are added while the spec stays accepted (S18).

The owner's decisions for this spec. Ids `S1`, `S2`, … are referred to by the spec, the research and
later specs. All decisions below: owner, 2026-10-19.

## Order and documents

- **S1. Documents only, not committed yet.** Spec 0016 is the product vision, strategy and roadmap of
  AI fitting; the code comes in the follow-up specs its roadmap names. The documents are
  committed on their own branch from `main` once the work of spec 0012 in the same worktree is
  committed; the prepared documents of spec 0015 stay uncommitted and out of that commit (amended by
  the owner, 2026-10-19: commit while the worktree is idle, before 0015).
- **S2. Research in Russian, spec in English.** `research.md` (competitors, Lamoda's flow,
  comparison, options, economics, our foundation) is in Russian; `spec.md` and this file are in
  English, per `specs/principles.md`.
- **S3. Four groups of competitors.** The Russian market, large global platforms, standalone apps,
  and B2B engines and model APIs.
- **S4. Lamoda's flow from the owner's screenshots.** The owner walked through Lamoda's try-on and
  virtual wardrobe in the Android app on 2026-10-19; the screenshots are not committed (they carry
  personal data), the research describes them in words.
- **S14. One pull request with the documents; no `plan.md`.** The spec holds no code, so `tasks.md`
  is one task and one pull request with the documents; there is no `plan.md`. Issue #84.
- **S15. The roadmap's order is preliminary.** Product page → photos → generation → try-on and
  history → digital twin; each follow-up spec may change it with the owner.
- **S18. The spec stays accepted until the core is built.** After its pull request the spec keeps
  `Status: accepted`, so its product description and roadmap stay binding for the follow-up specs;
  T1 records AC1–AC4. The spec of the digital twin, the last of the core, records AC5–AC15 (each from
  the spec that checked it) and closes this one. Rejected: closing the spec with its documents. The
  raw competitor cards of the research stay out of the repository (the owner keeps them);
  `research.md` keeps the summary and the key sources.

## Framing

- **S5. A pitch to Lamoda (B2B).** The strategy is written for Lamoda: its conversion, returns,
  average order value, cost per generation and where billing applies inside Lamoda. This replaces
  the "demo, no real customers" framing of J2 for this feature. Rejected: our own B2C app; a
  portfolio demo with "as if" economics.
- **S6. The site is a working prototype.** lamoda-ai-fitting.ru demonstrates the chosen strategy on
  the demo catalog, so Lamoda sees it work rather than only reads about it. Rejected: the document
  alone, with the site developed separately.
- **S7. Models: GPT-Image-2, Gemini image models (Nano Banana) and Seedream.** They put several items
  on a person in one call. Their APIs do not officially serve Russia; for Lamoda this stays a risk
  in the pitch (access route, payment, cross-border transfer of photos under 152-ФЗ), not a reason
  to pick other models. The prototype's access route is decided in the generation spec.

## Strategy

- **S8. The core bet combines three directions.**
  1. A better single-item try-on than Lamoda's current one: saved photos the user picks from and
     deletes, generation history, hints for a good photo, another colour of the item in one tap,
     and regenerating with a note of what went wrong.
  2. Try-on tied to size (S10).
  3. A digital twin made at onboarding: one or more photos, a style or lifestyle description that
     steers generations, and edits of the user's photo to suit the item (remove the coat, replace a
     mountain background with a summer scene).

  Rejected as the headline: try-on of looks from Lamoda's virtual wardrobe. It is the slowest to
  build at the project's current stage, so it goes to the roadmap (S9).

- **S9. Outfits in the core, the wardrobe later.** Picking several catalog items and trying them on
  together is in the core. In the roadmap: the outfit builder of Lamoda's virtual wardrobe, "my
  things" (purchased items tried on with new ones) and "buy the rest of the look".
- **S10. Size: a recommendation plus the size in the picture.** The digital twin keeps height, usual
  size and body parameters. A try-on uses the chosen size relative to the usual one (for example
  "one size larger than usual"), shows a size recommendation next to the result and says plainly
  that the fit in the picture is approximate. The demo catalog gets size charts with garment
  measurements. Rejected: a recommendation only, with the picture independent of the size;
  deciding after a pilot.
- **S16. The product behaviour of `spec.md` as proposed, with one change.** Accepted (owner,
  2026-10-19, at the review of the draft):
  - the twin is offered after sign-in, and a try-on started before it leads through the same steps;
  - a refused photo names the reason;
  - the style description steers scenes and suggestions, never the face or figure;
  - deleting the twin deletes the generations made from its photos;
  - a one-off photo may be used without saving it;
  - favourites stand in for the cart in the prototype;
  - waiting shows progress and the time left, and leaving the page keeps the result;
  - history entries can be compared, and repeating an existing try-on spends nothing;
  - the limit is monthly, and a refusal by moderation spends nothing;
  - moderation: no minors, no nudity, no underwear or swimwear on a photo the user has not confirmed
    as their own;
  - photos are not used for training, every result carries an "AI-generated" mark, the user is never
    idealised.

  Changed: the "clean base" (the person without outerwear, on a neutral background) is made only when
  the user asks for it, not for every photo by default. Rejected: a clean base of every photo at
  upload.

- **S17. A clean base spends one try-on.** Making it is a paid model call, so it counts against the
  monthly limit like a try-on.

## Money

- **S11. Billing recommended to Lamoda: free for the buyer, paid by sales and sellers.** All four
  together: a free monthly limit (history and repeats of the same try-on do not spend it); a larger
  limit for higher Lamoda Club levels; try-ons added for a bought-out order; sellers or brands pay to
  turn try-on on for their items or to promote them in looks, as part of an advertising tariff. A
  "virtual photo studio" for sellers on the same engine goes to the roadmap. Rejected: try-ons paid
  by the buyer.
- **S12. The prototype shows limits and a counter.** Real per-user limits with a visible counter of
  try-ons left; no club levels, payments or top-ups for orders (the project has no orders or cart).
  The other billing models of S11 are described in the documents only. Rejected: imitating levels
  and top-ups in the prototype.
- **S13. No budget cap for the prototype.** The owner pays the providers and sets no monthly budget
  or overall spending fuse; costs are held by the per-user limits of S12 and the `expensive` rate
  limit tier. Rejected: caps of $20, $50 or $200 a month; spending alerts in the providers' accounts
  as an owner action (owner, 2026-10-19, at the review of PR #86).

## Review of PR #86

- **S19. Size and scene come with the try-on, not the twin.** The main differences from Lamoda's
  try-on should show before the last spec of the core. The size in the picture, the size
  recommendation and the scene (AC12, AC13) move from the digital twin's spec to the try-on's; a
  user without a twin is asked for the usual size at the first try-on. The twin keeps onboarding,
  the clean base, body and size, and style (owner, 2026-10-19, at the review of PR #86). Amends S15's
  order. Rejected: keeping them in the twin's spec.

## Follow-up specs

- **S20. Spec 0019 replaces items 1–4 of the roadmap.** The product page, photos, generation, and
  try-on with history are one spec, `specs/0019-ai-fitting/`, in four phases and pull requests:
  photos, generation, the product page (after spec 0014's catalog), then looks and history; it
  checks AC5–AC10, AC14 and AC15 and records them in this spec's `tasks.md` acceptance record at
  its close. The size in the picture, the
  size recommendation and the scene (AC12, AC13, S19) wait for the next spec with its own design;
  the digital twin (item 5) still closes this spec (S18) (owner, 2026-10-21, at the start of spec
  0019). Amends S15's order. Rejected: four specs, one per roadmap item.
