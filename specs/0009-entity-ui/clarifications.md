# 0009 entity UI: clarifications

Status: done (2026-10-16). History, not instructions.

The owner's decisions for this spec. Ids `K1`, `K2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-15.

## Order

- **K1. Number and branch.** This spec is 0009, for issue #27, written while 0008 is in progress.
  Its branches start from `main`; where 0008 also changes `/ui-kit`, the later branch is rebased
  onto the earlier one when it merges.
- **K2. What is left of issue #27.** The api's CRUD routes and filter counts (0004), and web's
  schemas, types and loaders for every entity (0007), are done. This spec adds the last part: the
  `ui` segment of the entity slices.

## Scope

- **K3. Types stay inferred.** Entity types remain `z.infer` of their zod schemas, next to the
  schemas in `model/schemas.ts`: one source for the type and the check of the response. No separate
  type files.
- **K4. Components.** The product card for the catalog, the catalog's filters built from the filter
  counts, the sort, and the category list.
- **K5. Only what the data has.** A filter exists only for what the database holds: colour,
  material and season (the attributes of the seed), size, brand, price, "only with a discount" and
  category. No style, padding, details, country or "where to buy" filters, and no "Премиум" tab in
  the brand filter: brands have no such mark. An attribute added later gets its filter from the
  same generic component, with no new code.
- **K6. "Выбрать все".** Not added: the kit's checkbox filter has no such button, and this spec
  does not change it.
- **K7. Display only.** Entity components show entity data and report the visitor's choice through
  callbacks (`value`, `onApply`). They keep no state beyond their own open dropdown or unapplied
  choice, read no URL and make no requests. Putting them on a page, filter state in the URL and the
  requests belong to the catalog page spec.
- **K8. Category list.** A flat list with counts, as categories are flat (backlog "Category tree").
- **K16. Desktop only.** The filters keep the kit's desktop dropdowns (0003 D9); their mobile form
  (a bottom sheet on Lamoda) comes with the catalog page spec (backlog "Mobile filters"). The card
  stretches to its column, and `/ui-kit` does not scroll sideways at 375 px.

## Product card

- **K9. Name and content.** `CatalogProductCard`, built only from the product list item: the photo
  (a placeholder when there is none), a "−N%" badge when there is a discount, the price (old struck
  out, new in red when discounted), the brand, the name and the rating. The whole card is a link to
  the product. No review count, club discount, collection labels or second photo: the data has
  none of them.
- **K10. Action slot.** The card has a slot in the photo's corner for one action that a later
  feature fills (favourites, try-on). `/ui-kit` shows it with the favourite toggle.
- **K11. Skeleton.** The card has a loading skeleton of the same size.
- **K15. Link address from outside.** No product page exists yet, so the card takes the address of
  its link as a prop from whoever places it. Recorded for later specs in the backlog ("Product card
  link") and in the card's code comment.

## Data

- **K12. Swatch colours.** Attribute values get a nullable colour, `#RRGGBB` (backlog "Colour
  swatches"): the colour filter draws each value's swatch from it. The colour of the existing seed
  values is set by a migration, since the seed never changes existing rows (0004 E29); new seed
  values carry their colour. A value with no colour shows no swatch.
- **K13. Size order in web.** The size filter lists sizes in clothing order (backlog "Size order"):
  letter sizes from XS up, then numeric sizes ascending, then anything else as text. web sorts
  them; the api's answer does not change.

## Verification

- **K14. `/ui-kit` data.** The new components are shown on `/ui-kit` with fixed example data shaped
  like the api's answers and checked against web's schemas by a test. The page stays static and
  builds with no api running (0003).
