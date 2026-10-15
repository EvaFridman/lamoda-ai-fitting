# 0009 entity UI: plan

Status: accepted (2026-10-15).

Implements [spec.md](spec.md). Decisions: [clarifications.md](clarifications.md) (K1–K16).

## 1. Swatch colour in the api (K12, AC1, AC2)

- **Column.** A new migration `<timestamp>_attribute_values_color_hex`:
  - `ALTER TABLE "attribute_values" ADD COLUMN "color_hex" VARCHAR(7)` (nullable);
  - `-- AddCheck` `attribute_values_color_hex_check CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$')`;
  - an `UPDATE` that sets the ten seed colours of the attribute `Цвет`, matched by attribute name and
    value (rows that are missing are skipped, so it runs on any database).
    The previous release never reads the column, so it is compatible (CLAUDE.md, migrations).
- **Prisma.** `colorHex String? @map("color_hex") @db.VarChar(7)` on `AttributeValue`; the rule
  goes into the model's note.
- **Constraint.** `attribute_values_color_hex_check: ['colorHex']` in `constraint-fields.ts`.
- **DTOs.**
  - `CreateAttributeValueDto`: optional `colorHex?: string | null`, `@Matches(/^#[0-9A-Fa-f]{6}$/)`
    unless null, `@ApiProperty({ nullable: true, example: '#000000' })`. The update DTO inherits it
    (`PartialType`), so `null` clears it.
  - `AttributeValueResponseDto.colorHex: string | null`. The service returns the Prisma row, so
    it carries the field with no mapper change.
  - `FacetAttributeValueDto.colorHex: string | null`. `product-facets.ts` selects
    `av.color_hex AS "colorHex"` in `countAttributes` and pushes it with the value.
  - The product detail's attribute values (`{ id, value }`) do not change: the card does not need
    the colour.
- **Seed.** `SeedAttribute.values` becomes `{ value, colorHex? }[]`; the colour list carries the
  hex of the kit's swatch tokens:

  | value      | hex       | token     |
  | ---------- | --------- | --------- |
  | чёрный     | `#000000` | black     |
  | белый      | `#FFFFFF` | white     |
  | синий      | `#3972FC` | navy-blue |
  | голубой    | `#8BCDFF` | blue      |
  | бежевый    | `#DFBD93` | beige     |
  | зелёный    | `#3DB801` | green     |
  | серый      | `#B6B6B6` | gray      |
  | коричневый | `#743D02` | brown     |
  | жёлтый     | `#FFEC1C` | yellow    |
  | оранжевый  | `#FF7A01` | orange    |

  `createMany` writes `colorHex` for new rows. An existing row is still never changed (0004 E29):
  that is the migration's job.

- **Snapshot.** `api/openapi.json` rewritten with `npm --prefix api test -- -u`.
- **web's schemas, in the same pull request.** web's contract tests fail on a field the api sends
  and web's schema lacks, so the schema part of §2 ships here: `colorHex` in
  `attributeValueSchema` and `facetAttributeValueSchema`, with their fixtures. Safe because api and
  web deploy as one copy that nginx switches together, after the migration (`deploy/README.md`):
  the new web never meets the old api (found in T4).
- **Tests.**
  - `attributes.e2e-spec.ts`: create, update, clear and a bad colour (400 `VALIDATION_FAILED`). A
    raw SQL insert of a bad colour is refused by the CHECK.
  - `product-facets.e2e-spec.ts`: values carry `colorHex`.
  - `seed.e2e-spec.ts`: seed colours have their hex.
  - A migration check: after `migrate deploy` on an existing seeded database the ten colours have
    their hex.

## 2. web schemas and the kit (AC3, AC6)

- **Schemas.** `colorHex: z.string().regex(HEX).nullable()` in `attributeValueSchema` and in
  `facetAttributeValueSchema`. The contract tests compare them with the new `openapi.json`. Done
  with the api change (§1, "web's schemas").
- **`ColorSwatch`** (`shared/ui`) takes a hex as well as a token, and no colour:
  - `color?: SwatchColor | HexColor`, where `HexColor = \`#${string}\``.
  - A token keeps today's hand-made `light`/`bordered` sets (D7o).
  - A hex sets `background` to the hex. The tick takes black or white, whichever contrasts more
    (WCAG relative luminance), and the circle gets the border when its luminance is above 0.9
    (white and near-white). Lamoda's sets do not follow one luminance threshold (orange is light,
    turquoise is not), so tokens keep their sets.
  - No colour: an empty circle with the border, so the row keeps its checkbox and its alignment.
    This is how a value with no colour is listed "without a swatch" (AC6).
- **`CheckboxFilter`** (`shared/ui`) gets an optional `swatches` prop. With it, each row is a
  `ColorSwatch` with the option's `color` instead of a `Checkbox`; search, counts, draft and
  "Применить" stay one code path. `CheckboxFilterOption` gets `color?: SwatchColor | HexColor`.
- `/ui-kit`'s "Размеры и цвета" section gains a hex swatch and a colourless one, and the filter
  section gains a colour filter with search (kit level, no entity data).

## 3. Entity UI (K4–K11, K13, K15, K16)

All components are client components where they hold state (dropdown drafts), take entity data
and callbacks, and import only `@/shared/ui` and their own slice (K7). Each slice exposes them from
`index.ts`.

### `entities/product/lib`

- `compareSizes` / `sortSizes` (K13): letter sizes in the order `XXS, XS, S, M, L, XL, XXL, 3XL`
  (`XXXL` equals `3XL`), case-insensitive; then numbers ascending (`26`, `27.5`); then the rest by
  `localeCompare('ru')`.
- `splitFacetAttributes(attributes)`: colour attributes (at least one value has `colorHex`) and the
  rest, each in the api's order.
- `chipValue(names)`: the chip's text after the title: the one chosen name, or the number chosen
  when more than one (`"Цвет 2"`).
- `productSortLabels`: Russian labels for `PRODUCT_SORTS`, in Lamoda's order:
  `new` "Новинки", `price_desc` "Сначала дороже", `price_asc` "Сначала дешевле", `discount`
  "По величине скидки", `rating` "По рейтингу".

### `entities/product/ui`

- **`CatalogProductCard`**
  - Props: `product: ProductListItem`, `href: string` (K15; the code comment points at the backlog
    item), `action?: ReactNode`, `className?`.
  - Layout as on Lamoda: photo 236:341, then price, brand, name (two lines, then an ellipsis),
    rating.
  - Photo: `next/image` with `fill`, `sizes` and `unoptimized`. The api's URLs are absolute and the
    files are already webp, so no `remotePatterns`. `null` gives a grey box with "Нет фото".
  - Badge: `Badges` with `−{discount}%` (tone `discount`) in the photo's lower left when
    `discount > 0`.
  - Price: `Price` with `price={finalPrice}` and `oldPrices={[price]}` when discounted.
  - `Rating` (renders nothing for `null`).
  - The link (`next/link`) covers the photo and the text. `action` sits in the photo's upper right
    as a sibling of the link, not inside it: no nested interactive elements, and a click on it does
    not follow the link (AC5).
- **`CatalogProductCardSkeleton`**: the same box: `Skeleton` for the photo and three text lines.
- **Filters.** Each is a `FilterDropdown` over a kit filter. Each gets its slice of
  `ProductFacets`, `value` and `onApply`, and passes `applied`, `value` (via `chipValue`) and
  `onClear={() => onApply([])}` to the chip.
  - `ColorFilter({ attribute, value, onApply })`: `CheckboxFilter swatches`, searchable,
    placeholder "Найдите цвет".
  - `AttributeFilter({ attribute, value, onApply })`: material, season, and any attribute added
    later (K5). Searchable above 7 values, placeholder "Введите наименование", as on Lamoda.
  - `BrandFilter({ brands, value, onApply })`: searchable, "Найдите бренд" (no tabs: K5).
  - `SizeFilter({ sizes, value, onApply })`: `CheckboxFilter` over `sortSizes`. Lamoda's size
    dropdown is a plain checkbox list with counts, so not `SizePicker`.
  - `PriceRangeFilter({ price, value, onApply })`: `PriceFilter` from `facets.price`. Renders
    nothing when `price` is `null` (no products). The chip shows "от … до …" when applied.
  - `DiscountFilter({ checked, onCheckedChange })`: `FilterChip` "Только со скидкой".
  - `ProductSortFilter({ value, onValueChange })`: `SortFilter` with `productSortLabels`; the chip's
    title is the current sort's label, as on Lamoda.

### `entities/category/ui`

- **`CatalogCategoryList({ categories, value, getHref })`**: `categories: { id; name; count }[]`,
  a type of its own, so the slice does not import `product` (FSD). The page passes
  `facets.categories`. Not `CategoryList`: that is the slice's paginated type, like `BrandList`.
  - Each row is a link (`getHref(id)`): name and a grey count.
  - The chosen one is the black block of Lamoda's tree.

## 4. `/ui-kit` (K14, AC4–AC12)

- **Fixtures.** `_pages/ui-kit/config/catalog.ts`:
  - five `ProductListItem`s: discounted, full price, no photo, no rating, long name;
  - one `ProductFacets` with the seed's attributes (colour with hex and one value without, material,
    season), brands, unordered sizes, price and categories.
  - Image URLs are the production `/media/` addresses of seed photos: the schema wants absolute
    URLs and the page has no api.
- **Test.** `config/catalog.test.ts` parses the fixtures with `productListItemSchema` and
  `productFacetsSchema` (AC12).
- **Sections.** Two new sections in `ui/sections.ts`, after "Товар и заказ":
  - `catalog-card` "Карточка товара в каталоге": the five cards in a 4-column grid that becomes 2
    columns at 375 px (K16), one with `FavoriteToggle` in the slot, and the skeleton;
  - `catalog-filters` "Фильтры каталога": the chip row (sort, colour, material, season, brand, size,
    price, discount) and the category list, live, showing the last `onApply` value under it.
    Props captions as in the other sections.
- **Tests.**
  - Section tests (`catalog-card-section.test.tsx`, `catalog-filters-section.test.tsx`) for
    AC4–AC10.
  - Component tests next to each component in `entities`.
  - `ui-kit-page.test.tsx` still checks that the table of contents matches the sections.

## Values

- Card photo 236×341 (Lamoda's catalog image); search in attribute filters above 7 values; hex
  border above luminance 0.9.

## Backlog

- The commit of task 1 (api) removes "Colour swatches".
- The size-order commit removes "Size order".
- "Product card link" and "Mobile filters" stay for the catalog page.

## Docs

At close, `CLAUDE.md`:

- the spec list gets 0009;
- Structure: entity slices have a `ui` segment that only displays (K7);
- Conventions: attribute values' `colorHex`.

## Risks

- **0008 also edits `/ui-kit`** (a tracked button in "Кнопки"). The later branch rebases (K1).
- **Fixture photos load from production.** Locally the section shows them only online; a broken
  image does not fail any check.
- **`CheckboxFilter` grows a variant.** Its existing tests must stay green; the colour rows get
  their own.
- **Contract break.** web's schemas require `colorHex`, so web must not reach production before the
  api that sends it. Both change in one pull request: api and web deploy as one copy, after the
  migration, and the contract tests fail on a field one side lacks (§1, "web's schemas").

## How each criterion is verified

| AC   | Check                                                                                         |
| ---- | --------------------------------------------------------------------------------------------- |
| AC1  | api e2e (facets, values, seed); after deploy `curl /api/products/facets` on production        |
| AC2  | api e2e: bad colour 400 `VALIDATION_FAILED`; raw insert refused by the CHECK                  |
| AC3  | `schemas.contract.test.ts` of product and attribute                                           |
| AC4  | `catalog-card-section.test.tsx` + qa-tester on `/ui-kit`                                      |
| AC5  | card test: click on the action calls its handler and does not navigate; qa-tester             |
| AC6  | `ColorFilter` test: swatches, counts, two picks reported on "Применить", colourless value row |
| AC7  | `AttributeFilter` with material and season; `BrandFilter` search by part of a name            |
| AC8  | `sortSizes` unit test and `SizeFilter` test with shuffled input                               |
| AC9  | `PriceRangeFilter`, `DiscountFilter`, `ProductSortFilter` tests                               |
| AC10 | `CatalogCategoryList` test                                                                    |
| AC11 | `ui-kit-page.test.tsx`; qa-tester at 375 px; `next build` in `npm run verify` with no api     |
| AC12 | `config/catalog.test.ts` fails on a fixture that breaks a schema                              |
| AC13 | `npm run verify`; `rg "Colour swatches\|Size order" specs/backlog.md` finds nothing           |
