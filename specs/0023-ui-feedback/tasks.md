# 0023 ui-feedback: tasks

Status: accepted (2026-10-27).

## How the work flows

Review at phase boundaries (Y10, as spec 0019 A2 and A58): each task is done in a fresh session
with its `spec-finder` brief, ends with `finish-task` (the task's own tests, `typecheck`, `lint`,
the reviewers) and is committed without a stop; `qa-tester` runs once per phase at its last task on
the phase's acceptance criteria; the phase ends with a clean install, the full `npm run verify`,
the push, the pull request and one stop with the summary. A task that shows the plan is wrong
stops the work. Every UI task re-reads its canvas board first, and keeps `CLAUDE.md` and
`catalog.ts` true in its own commit.

Pull requests: PR 1 the documents only; PR 2 part 1 (web only, nothing waits on it, but it ships
the quick visible fixes without waiting for part 2's api); PR 3 part 2 (api and web together: web's
new calls need the api of the same release); PR 4 the closing, which records the owner's checks on
the deployed site.

## PR 1 · docs/0023-ui-feedback · documents

- [x] **T1. The spec's documents.** `spec.md`, `clarifications.md`, `plan.md`, `tasks.md`,
      `source/agentation-notes.md`. Check: `npm run format:check`. Commit:
      `docs(specs): add spec 0023 ui feedback`.

## PR 2 · feat/0023-look-and-labels · part 1 (web)

- [x] **T2. The catalog card and the header (C1–C5).** Plan §2.1, §2.2: the hanger's outline, no card
      shadow, `variant="plain"` on the profile and the room's icon, the kit's `SoonChip` (with its
      `/ui-kit` section) on «Избранное» and «Корзина»; `COARSE_POINTER_QUERY` and `MOUSE_QUERY` in
      `@/shared/config`. About 1.5 h. Commit: `feat(web): calmer catalog card and header icons`.
- [x] **T3. The category list's spacing (C6).** Plan §2.3, the list and its placeholder. About
      0.5 h. Commit: `style(web): more space between catalog categories`.
- [x] **T4. The buy box (P1, P11).** Plan §2.4 P1 and P11: «Добавить к образу», the page's flex, the
      `Gallery`'s aspect-ratio sizing, the buy box's wrapping rows; descriptions in `catalog.ts`.
      About 2 h. Commit: `fix(web): keep the buy box usable on large tablets`.
- [x] **T5. The gallery's full screen and magnifier (P2).** Plan §2.4 P2: `photoEvents`, `GalleryViewer`,
      the magnifier under `MOUSE_QUERY`, `gallery.photo` (new area `gallery`). About 3 h. Commit:
      `feat(web): open product photos full screen and magnify on hover`.
- [x] **T6. The fitting room drawer (P12–P21, P35, P36).** Plan §2.5: slot names and toasts, no
      subtitle, captions or wishes' hint, «+» as a link, the slot's heart (`room.favourite`),
      «Добавить образ в корзину»; `room.fill`'s estimate and descriptions. `qa-tester` on AC1–AC7.
      About 2.5 h. Commit: `feat(web): tidy the fitting room drawer`.
- [x] **Phase end.** Clean install, `npm run verify`, push, PR 2, stop with the summary.

## PR 3 · feat/0023-try-on-window · part 2 (api and web)

### api

- [x] **T7. Consents on the server (Y1).** Plan §3.1: the migration, the multipart field `consent`,
      `PHOTO_CONSENT_VERSION`, `photoConsentVersion` in `UserResponseDto`, the snapshots, e2e.
      About 2 h. Commit: `feat(api): record the photo consents with the user`.
- [x] **T8. The result's picture for a download (Y8).** Plan §3.2: `GET /fittings/:id/image`,
      Swagger, the access lists, e2e. About 1.5 h. Commit:
      `feat(api): serve a fitting's result as a download`.
- [x] **T9. Regeneration without reasons and freer wishes (Y9, Y12).** Plan §3.3, §3.4: the DTO, the
      text check's instructions, the prompt, their tests and snapshots. About 2 h. Commit:
      `feat(api): optional regeneration reasons and freer wishes`.
- [ ] **T10. Safety categories (Y2).** Plan §3.5: `safetyCategory`, the client's
      `moderation_details`, the photo's and the text's details, the migration and `FittingDto`'s
      `failureCategory`/`failureStage`, the fake provider's markers and colours, tests. About 4 h.
      Commit: `feat(api): keep the safety category of a refusal`.

### web

- [ ] **T11. One photo frame and a smooth window (P10, P24, P29).** Plan §4.1: `PhotoFrame` in the
      picker, the loader and both results, `:fullscreen`, `Modal`'s `animateSize`. About 3 h.
      Commit: `feat(web): show the try-on photo whole in one steady frame`.
- [ ] **T12. The picker (P3–P9, P22, P23, P25).** Plan §4.2: the drop zone, «Заменить фото» and its
      window, no desktop camera, no subtitle or caption, the item cards with hearts, the consents
      from `/me`; analytics `try-on.*`, `source: drop`. About 6 h. Commit:
      `feat(web): drop zone and photo replacement in the try-on`.
- [ ] **T13. Success, the saved line, the download and the look's labels (P26, P28, P30–P32).** Plan
      §4.3: `FittingSuccess`, `SavedNote`, `clientFetch`'s blob, `downloadFittingImage` in the result
      and the history, the labels; `result.history`. About 3.5 h. Commit:
      `feat(web): success screen, saved note and real download`.
- [ ] **T14. The regeneration sheet (P33, P34).** Plan §4.4; analytics removals. About 1.5 h.
      Commit: `feat(web): regeneration sheet without chips`.
- [ ] **T15. Refusal texts (P27).** Plan §4.5: the three tables, the schema's new fields,
      `Fitting Refused.prompt_reason`. `qa-tester` on AC8–AC19 with the fake provider. About 3 h.
      Commit: `feat(web): clear reasons for refused photos, texts and fittings`.
- [ ] **Phase end.** Clean install, `npm run verify`, push, PR 3, stop with the summary.

## PR 4 · docs/0023-close · closing

- [ ] **T16. Close the spec.** After the owner's checks on the deployed site (AC17, a refused
      photo's text, the screens on a phone, a tablet and a desktop): every file `Status: done`, the
      acceptance record below, `CLAUDE.md` and `README.md` checked against what was built. About
      1 h. Commit: `docs(specs): close spec 0023`.

## Acceptance record

Filled at T16: each AC with its evidence (a test, a `qa-tester` run, the owner's check).
