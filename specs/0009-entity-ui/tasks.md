# 0009 entity UI: tasks

Status: done (2026-10-16): all 13 criteria pass (record below); amended 2026-10-15 in T4 and 2026-10-16 in T10:
T4 carries web's `colorHex` schemas, so T5 only changes the swatches and PR 2 carries both sides;
T10 names the list `CatalogCategoryList`. History, not instructions.
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`. If a 0008 pull request merged meanwhile, rebase onto `main` first
  (K1).
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- PR 3 starts after PR 2 is deployed, so AC1 is checked in production before the UI. PR 2 carries
  web's schemas with the api change (plan, §1 and Risks).
- The last pull request carries `Closes #27` under "Что сделано".

## PR 1 · `docs/0009-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (K1–K16); backlog items
      "Product card link" and "Mobile filters".
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0009`
- [x] **T2. Plan.** `plan.md`.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0009`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0009`
- 👤 merges PR 1.

## PR 2 · `feat/0009-color-hex` · swatch colour in the api

- [x] **T4. `attribute_values.color_hex`.** The migration (column, CHECK, data of the ten seed
      colours), Prisma field and note, `constraint-fields.ts` row, create/update/response DTOs,
      facets SQL and DTO, seed data with hex, `api/openapi.json`, and `colorHex` in web's
      `attributeValueSchema` and `facetAttributeValueSchema` with their fixtures (plan §1). Removes
      the backlog item "Colour swatches".
      Check: web's contract tests pass (AC3); api e2e: - create, update, clear and a bad colour (400 `VALIDATION_FAILED`); - a raw SQL insert of a bad colour is refused; - facets values carry `colorHex`; - the seed's colours have their hex; - on a database seeded before the migration, `migrate deploy` sets the ten hex values.
      Locally: rebuild api and the worker with fresh volumes, `prisma migrate dev`, and
      `curl /products/facets` shows `colorHex`. AC1, AC2.
      Commit: `feat(api): add a swatch colour to attribute values`
- 👤 merges PR 2; it deploys. `curl https://lamoda-ai-fitting.ru/api/products/facets` shows the
  ten colours with hex (AC1 in production).

## PR 3 · `feat/0009-entity-ui` · entity components and `/ui-kit`

- [x] **T5. Hex swatches.** `ColorSwatch` takes a hex (contrast tick, border above luminance 0.9)
      or no colour (an empty bordered circle); the kit's "Размеры и цвета" section shows both
      (plan §2). The schemas already carry `colorHex` (T4).
      Check: `ColorSwatch` tests for a dark and a light hex, white, no colour, and the unchanged
      token sets.
      Commit: `feat(web): accept attribute value colours in swatches`
- [x] **T6. Colour rows in `CheckboxFilter`.** The `swatches` prop and the option's `color`; the
      kit's filter section shows a colour filter with search (plan §2).
      Check: the existing `CheckboxFilter` tests pass; new ones cover swatch rows, search and
      "Применить".
      Commit: `feat(web): show colour swatches in the checkbox filter`
- [x] **T7. Product lib.** `sortSizes`, `splitFacetAttributes`, `chipValue`, `productSortLabels`
      (plan §3). Removes the backlog item "Size order".
      Check: unit tests: shuffled `XL, S, XS, M, L` and `34, 26, 30` sort as AC8; `XXXL` equals
      `3XL`; unknown sizes go last by text; an attribute with one coloured value counts as a colour
      attribute.
      Commit: `feat(web): order sizes and sort labels for the catalog`
- [x] **T8. `CatalogProductCard`.** The card and its skeleton in `entities/product/ui` (plan §3,
      K9–K11, K15).
      Check: tests for discounted, full price, no photo, no rating; the link points at `href`; a
      click on the action calls its handler and does not navigate. AC4 (component), AC5.
      Commit: `feat(web): add the catalog product card`
- [x] **T9. Product filters.** `ColorFilter`, `AttributeFilter`, `BrandFilter`, `SizeFilter`,
      `PriceRangeFilter`, `DiscountFilter`, `ProductSortFilter` (plan §3).
      Check: a test per filter. Each reports the chosen ids on "Применить" and clears via the chip.
      Also: brand search by part of a name, size order, nothing rendered for `price: null`, the
      sort's five labels. AC6–AC9 (component).
      Commit: `feat(web): add the catalog filters built from the filter counts`
- [x] **T10. `CatalogCategoryList`.** In `entities/category/ui` (plan §3, K8).
      Check: rows link via `getHref` with their counts; the chosen one is marked. AC10 (component).
      Commit: `feat(web): add the catalog category list`
- [x] **T11. `/ui-kit` sections.** Fixtures `config/catalog.ts` with their schema test; sections
      "Карточка товара в каталоге" and "Фильтры каталога" (plan §4).
      Check: the fixture test fails on a broken fixture and passes on the real one; section tests;
      qa-tester on `/ui-kit` (desktop and 375 px); `npm run verify` builds the page with no api.
      AC4–AC12.
      Commit: `feat(web): show the entity components on the ui kit page`
- 👤 merges PR 3; it deploys.

## PR 4 · `docs/0009-close` · acceptance

- [x] **T12. Acceptance.** Every AC recorded below, AC11 on production `/ui-kit`. All files get
      `Status: done`. `CLAUDE.md` in line with what was built: 0009 in the spec list, the entity
      `ui` segment, `colorHex` (plan, Docs).
      Check: the acceptance record is complete.
      Commit: `docs(specs): record the acceptance of spec 0009`
- 👤 merges PR 4, which closes #27.

## Acceptance record

Checks on 2026-10-16 with main at `1f2f4a9` (PR 3 deployed: CI run 38823061552, "Deploy to
production" green); `npm run verify` on that commit passed (api 2117 tests, web 1601, guards and
scripts 420).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | production: `curl https://lamoda-ai-fitting.ru/api/products/facets` gives the ten colours their hex (бежевый `#DFBD93` … чёрный `#000000`) and `null` to the material and season values; api e2e: `product-facets` "carries the swatch colour of each attribute value", `attributes` "colorHex (spec 0009)" (create, list, update, clear), `seed` (the seed's colours have their hex), `migration-color-hex` "gives the ten seed colours their hex and leaves every other value null" |
| AC2  | pass   | api e2e `attributes`: a bad colour on create and update answers 400 `VALIDATION_FAILED` on `colorHex`; "refuses a raw insert and update of a bad colour with the CHECK"                                                                                                                                                                                                                                                                                                               |
| AC3  | pass   | `entities/attribute/model/schemas.contract.test.ts` and `entities/product/model/schemas.contract.test.ts`                                                                                                                                                                                                                                                                                                                                                                             |
| AC4  | pass   | `catalog-product-card.test.tsx` (discounted: badge, struck-out old price, new price; full price; "Нет фото"; no rating; long name; skeleton); `ui-kit/ui/catalog-card-section.test.tsx` (five cards and the skeleton, the favourite toggle in the slot)                                                                                                                                                                                                                               |
| AC5  | pass   | `catalog-product-card.test.tsx`: "is one link to href", "puts the action outside the link and a click on it does not reach the link"; `catalog-card-section.test.tsx`: "presses and releases the toggle on clicks"                                                                                                                                                                                                                                                                    |
| AC6  | pass   | `catalog-filters.test.tsx` `ColorFilter`: name and count per row, a value without a colour as an empty circle, two picks reported on "Применить"; `catalog-filters-section.test.tsx`: "applies two colours and reports both ids", "разноцветный" with no swatch                                                                                                                                                                                                                       |
| AC7  | pass   | `catalog-filters.test.tsx`: `AttributeFilter` "works for any attribute: "Материал" and "Сезон" with counts" and reports the ids; `BrandFilter` "finds a brand by part of its name, ignoring case" and reports the ids                                                                                                                                                                                                                                                                 |
| AC8  | pass   | `entities/product/lib/sizes.test.ts` (`sortSizes`: letters from XS up, numbers ascending, the rest by text); `SizeFilter` test with shuffled input; `catalog-filters-section.test.tsx` "lists the sizes in clothing order"                                                                                                                                                                                                                                                            |
| AC9  | pass   | `catalog-filters.test.tsx`: `PriceRangeFilter` (bounds as placeholders, a moved range reported), `DiscountFilter` (toggles, reports), `ProductSortFilter` (five sorts in order in Russian, reports the key)                                                                                                                                                                                                                                                                           |
| AC10 | pass   | `catalog-category-list.test.tsx`: each category a link with its count, only the chosen one marked `aria-current="page"`                                                                                                                                                                                                                                                                                                                                                               |
| AC11 | pass   | `ui-kit-page.test.tsx`: every section in the table of contents, every link to an existing section; production `/ui-kit`: the table of contents links `#catalog-card` and `#catalog-filters`, both sections rendered, `x-nextjs-prerender: 1` (curl); `next build` in `verify` and the CI image build (no api) mark `/ui-kit` prerendered (◐); production at 375 px (DevTools device mode, whole page): no sideways scroll (owner)                                                     |
| AC12 | pass   | `ui-kit/config/catalog.test.ts`: the fixtures match the schemas, "is refused when broken, so the checks above can fail"                                                                                                                                                                                                                                                                                                                                                               |
| AC13 | pass   | `npm run verify` above, exit 0; `rg "Colour swatches\|Size order" specs/backlog.md` finds nothing                                                                                                                                                                                                                                                                                                                                                                                     |
