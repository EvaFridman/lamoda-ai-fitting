# 0026 city: tasks

Status: accepted (2026-10-29).

## How the work flows

- Two pull requests: the documents (PR 1), then all the code with the spec's closing (PR 2).
  Merged with "Rebase and merge" once CI is green; PR 2's branch starts from a fresh `main`.
- Review at the phase's end (C11): each task gets a brief from `spec-finder`, a time estimate, the
  code, `finish-task` and its commit without a stop; a task inside the phase ends with
  `typecheck`, `lint` and its own tests, `qa-tester` runs once at T7 and the full `verify` once at
  the phase's end, after a clean install (as 0019 A58). The phase stops once, with the pull request
  and a summary.
- Reviewers beside `code-reviewer`: `fsd-reviewer` on every task (web only); `security-reviewer`
  on T3 and T4 (`localStorage`, geolocation, data in the DOM).
- Docker and `.env` of this worktree from T2 on: README, «Другие копии стека», project
  `ai-fitting-guards`, ports 4000/4001.
- 0026 does not touch the try-on window or the result screen (spec 0024's part 2).

## PR 1 · `docs/0026-city` · documents

- [x] **T1. Spec, clarifications, plan, tasks.** `spec.md`, `clarifications.md` (C0–C14),
      `plan.md`, this file.
      Check: the owner's acceptance of each; `npm run format:check`.
      Commit: `docs(specs): add spec 0026 city`
- 👤 merges PR 1.

## PR 2 · `feat/0026-city` · the code and the closing

- [x] **T2. The cities (plan §2).** `entities/store/lib/cities.ts`: `cityName`, `storeCities`,
      `storesOfCity`, `nearestCity`, `matchCities`; the word rule shared with `matchStores`.
      Check: tests pin today's 31 names and their order, the nearest city (real cities, Москва–
      Санкт-Петербург about 635 km, so swapped axes fail) and the 100 km bound.
      Commit: `feat(web): derive the stores' cities and the nearest one`
- [x] **T3. The choice and the window (plan §3, §7).** `features/choose-city`: the store of
      `city` and `city-asked`, `locateCity`, `CityModal`, `useAskCityOnce`; the analytics
      catalog's entries (C13) and `EVENTS.md`.
      Check: tests with a stubbed `navigator.geolocation` and `localStorage` (found, far,
      refused, timeout, no API, blocked storage, another tab's `storage` event).
      Commit: `feat(web): choose the visitor's city or find it by geolocation`
- [x] **T4. The header and the burger (plan §4).** `loadHeaderCities`, `HeaderCitySlot`,
      `HeaderCity`; the burger's row; the header's tests without the inert city.
      Check: `header.test.tsx`, `header-menu.test.tsx`.
      Commit: `feat(web): make the header's city live`
- [x] **T5. The stores page (plan §5).** The city's view and the switch, «Изменить город», the
      page's ask and its «Рядом с вами пока нет магазинов», «Искать во всех городах», the map's
      city's fit (`'stores'` with `singleZoom`), the search's 300 ms pause (C12), `Stores Searched`'s `scope`.
      Check: `stores-view.test.tsx` (fake timers), `fit.test.ts`.
      Commit: `feat(web): open the stores page on the visitor's city`
- [ ] **T6. `/privacy` (plan §6).** C10's paragraph.
      Check: `privacy-page.test.tsx`.
      Commit: `feat(web): say how the city is found on the privacy page`
- [ ] **T7. Closing.** `qa-tester` at 375 and 1280 px with a stubbed position (AC1–AC12);
      `CLAUDE.md` (plan §8); the acceptance record below; every file `Status: done`.
      Check: clean install, `npm run verify`.
      Commit: `docs(specs): close spec 0026`
- 👤 merges PR 2; after the deploy, checks the prompt and the city on a real phone and desktop
  (spec, owner actions). A failure there is a fix of its own.

## Acceptance record

Filled at T7, one line per AC with its evidence.
