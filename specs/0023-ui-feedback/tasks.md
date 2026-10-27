# 0023 ui-feedback: tasks

Status: done (2026-10-27): all 20 criteria pass (record below). History, not instructions.

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
- [x] **T10. Safety categories (Y2).** Plan §3.5: `safetyCategory`, the client's
      `moderation_details`, the photo's and the text's details, the migration and `FittingDto`'s
      `failureCategory`/`failureStage`, the fake provider's markers and colours, the text check's
      unreadable verdict as 503 (Y19), tests. About 4.5 h.
      Commit: `feat(api): keep the safety category of a refusal`.

### web

- [x] **T11. One photo frame and a smooth window (P10, P24, P29).** Plan §4.1: `PhotoFrame` in the
      picker, the loader and both results, `:fullscreen`, `Modal`'s `animateSize`. About 3 h.
      Commit: `feat(web): show the try-on photo whole in one steady frame`.
- [x] **T12. The picker (P3–P9, P22, P23, P25).** Plan §4.2: the drop zone, «Заменить фото» and its
      window, no desktop camera, no subtitle or caption, the item cards with hearts, the consents
      from `/me`; analytics `try-on.*`, `source: drop`. About 6 h. Commit:
      `feat(web): drop zone and photo replacement in the try-on`.
- [x] **T13. Success, the saved line, the download and the look's labels (P26, P28, P30–P32).** Plan
      §4.3: `FittingSuccess`, `SavedNote`, `clientFetch`'s blob, `downloadFittingImage` in the result
      and the history, the labels; `result.history`. About 3.5 h. Commit:
      `feat(web): success screen, saved note and real download`.
- [x] **T14. The regeneration sheet (P33, P34).** Plan §4.4; analytics removals. About 1.5 h.
      Commit: `feat(web): regeneration sheet without chips`.
- [x] **T15. Refusal texts (P27).** Plan §4.5: the three tables, the schema's new fields,
      `Fitting Refused.prompt_reason`. `qa-tester` on AC8–AC19 with the fake provider. About 3 h.
      Commit: `feat(web): clear reasons for refused photos, texts and fittings`.
- [x] **Phase end.** Clean install, `npm run verify`, push, PR 3, stop with the summary.

## PR 4 · docs/0023-close · closing

- [x] **T16. Close the spec.** After the owner's checks on the deployed site (AC17, a refused
      photo's text, the screens on a phone, a tablet and a desktop): every file `Status: done`, the
      acceptance record below, `CLAUDE.md` and `README.md` checked against what was built. About
      1 h. Commit: `docs(specs): close spec 0023`.

## Acceptance record

Checked 2026-10-27 after PR 3 (#119) was merged and deployed (`main` b14083e, CI with the deploy
green); PR 2 (#118) was merged and deployed before it. "Production" is lamoda-ai-fitting.ru.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | ✅     | T2: `catalog-product-card.test.tsx`, `look-toggle.test.tsx`; T6: qa-tester at 1386 px with a mouse (no shadow, the photo's zoom, the hanger's outline).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC2  | ✅     | T2: `header.test.tsx` (the names «Избранное» and «Корзина», «скоро» hidden from screen readers); T6: qa-tester signed in (no frame but keyboard focus).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC3  | ✅     | T3: the list's and the placeholder's spacing (CSS); T6: qa-tester at 1386 px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC4  | ✅     | T4: `to-look-button.test.tsx`, `product-buy-box.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AC5  | ✅     | T5: `gallery.test.tsx` (open at a photo, arrows, Escape, the last photo, the focus's return); T6: qa-tester with a mouse (the lens) and with touch emulation (no lens).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC6  | ✅     | T4 (the stacked buttons, Y18); T6: qa-tester at 1024, 1100, 1200 and 1279 px (no button's text overflows, nothing overlaps).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC7  | ✅     | T6: `fitting-room-drawer.test.tsx`, `outfit-slot.test.tsx`, `slots.test.ts`, `use-room-actions.test.tsx`; T6: qa-tester.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC8  | ✅     | T12: `upload-photo.test.tsx` (a drop with a file, a wrong type, consents first), `try-on.test.tsx`; T15: qa-tester with a real drag and touch emulation (Y21: the tiles under a coarse pointer).                                                                                                                                                                                                                                                                                                                                                                                              |
| AC9  | ✅     | T12: `upload-photo.test.tsx` (the replace window), `my-photos.test.tsx` (the camera under a coarse pointer, Y23 at PR 3's review); T15: qa-tester.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| AC10 | ✅     | T12: `try-on.test.tsx`, `upload-photo.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AC11 | ✅     | T12: `try-on-look.test.tsx`, `look-subject.test.tsx`, `try-on.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC12 | ✅     | T11: `photo-frame.test.tsx`; T15: qa-tester (a landscape and a square photo whole, the frame's box equal in picker, wait and result, the window's height animated; Y20).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC13 | ✅     | T13: `fitting-success.test.tsx`, `try-on.test.tsx` (a running fitting ends: the success screen, then the result with «Сохранено в «Мои примерки»»; `?fitting=` shows the result at once).                                                                                                                                                                                                                                                                                                                                                                                                     |
| AC14 | ✅     | T8: `fittings-image.e2e-spec.ts` (the owner, another user, missing, not completed), `result-file-name.spec.ts`; T13: `use-fitting-image-download.test.tsx`, `result-media.test.tsx`, `history-card.test.tsx`; T15: qa-tester (a file saved, no tab).                                                                                                                                                                                                                                                                                                                                          |
| AC15 | ✅     | T13: `look-result.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC16 | ✅     | T9: `fittings-routes.e2e-spec.ts` (a regeneration without `reasons`, with a comment); T14: `regenerate-sheet.test.tsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AC17 | ✅     | T9: `prompt-checker.spec.ts` (the items in the classification's input, Y16), `prompts.spec.ts`. The owner, 2026-10-27, on production: the three wishes pass, the three refused.                                                                                                                                                                                                                                                                                                                                                                                                               |
| AC18 | ✅     | T10: `safety-category.spec.ts`, `openai-client.spec.ts` (`moderation_details`), `ai-provider.spec.ts` (a colour per reason and category), e2e with the fake's markers for each category and stage (`fittings-routes`, `fitting-activities`, `generate-fitting-workflow`, `me-photos`); T15: `refusal.test.ts`, `prompt-refusal.test.ts`, `failure-text.test.ts`, the contract tests against `api/refusal-messages.json` (`refusal-messages.e2e-spec.ts`); qa-tester with the fake provider. The owner, 2026-10-27, on production: a photo the safety rules refused shows the snapshot's text. |
| AC19 | ✅     | T7: `me-photos.e2e-spec.ts` (consent stored and answered by `GET /me`, a wrong version 400, `consent` after the file, none 400 `CONSENT_REQUIRED` with nothing stored, a non-image with `consent` 400 `IS_IMAGE` and no consent stored), `photo-upload.spec.ts`, `users.e2e-spec.ts`; T12: `upload-photo-first.test.tsx`, `consent.test.ts`; T15: qa-tester.                                                                                                                                                                                                                                  |
| AC20 | ✅     | `catalog.test.ts`, `EVENTS.md` regenerated with Y11's elements and `Fitting Refused.prompt_reason`; `npm run verify` at each phase's end; CI green on #118, #119 and `main` b14083e.                                                                                                                                                                                                                                                                                                                                                                                                          |

Owner's checks after the deploys (2026-10-27): the changed screens on a phone, a tablet and a
desktop, OK; on a phone the pickers' two tiles and the try-on closing when «Перейти в «Мои фото»»
leaves the page (Y21, Y22), OK.
