# 0009 entity UI

Status: done (2026-10-16): all 13 criteria pass (record in `tasks.md`). History, not instructions.

Issue #27. Decisions: `clarifications.md` (K1–K16).

## Goal

The catalog page needs parts that know the catalog's data: a product card and filters fed by the
api's filter counts. This spec builds them in web's entity slices on top of the UI kit (0003) and
the data layer (0007), and shows them on `/ui-kit`, so the catalog page spec only has to put them
on a page and connect them to the URL and the requests (K2, K7).

## In scope

- `CatalogProductCard`: photo, discount badge, price, brand, name, rating, a link to the product,
  an action slot and a skeleton (K9–K11).
- Catalog filters from the filter counts: colour with swatches, any other attribute (material,
  season, …), brand with search, size, price range, "only with a discount" (K4–K6).
- The sort over the api's sorts, and a flat category list with counts (K4, K8).
- A colour for attribute values in the api, and its data for the seed colours (K12, backlog
  "Colour swatches").
- Clothing order of sizes (K13, backlog "Size order").
- A `/ui-kit` section for each of them, on example data (K14).

## Non-goals

- The catalog and product pages, filter state in the URL, requests from these components (K7).
- Filters for data the database lacks: style, padding, details, country, premium brands (K5).
- "Выбрать все" in checkbox filters (K6); a nested category tree.
- Favourites, try-on and any other action behind the card's slot (K10).
- Mobile layouts of the filters (0003 D9, K16, backlog "Mobile filters").

## Acceptance criteria

### Data

- **AC1.** The attribute value routes and `GET /products/facets` return a colour (`#RRGGBB` or `null`)
  for every attribute value; after the migration each of the ten seed colours has one.
- **AC2.** Writing an attribute value with a colour that is not `#RRGGBB` answers 400 in the api's
  error format; the database refuses such a value too.
- **AC3.** web's schemas accept the new field and the contract check passes.

### Components on `/ui-kit`

- **AC4.** The card is shown with and without a discount, without a photo, without a rating, with
  a long name, with the favourite toggle in its slot, and as a skeleton; the discounted card shows
  the "−N%" badge, the old price struck out and the new price.
- **AC5.** Clicking the card goes to its link; clicking the toggle in the slot does not.
- **AC6.** The colour filter shows a swatch, the name and the count per value; choosing two and
  pressing "Применить" reports both ids; a value with no colour is listed without a swatch.
- **AC7.** One generic attribute filter shows material and season from the same component; the
  brand filter finds a brand by part of its name; each lists counts and reports the chosen ids on
  "Применить".
- **AC8.** The size filter lists `XS, S, M, L, XL` and `26 … 34` in that order whatever order the
  data gives.
- **AC9.** The price filter starts from the data's minimum and maximum and reports the chosen range;
  the discount filter toggles; the sort lists the api's five sorts in Russian and reports the
  chosen one.
- **AC10.** The category list shows each category with its count and marks the chosen one.
- **AC11.** The `/ui-kit` table of contents links to the new sections; at 375 px the page does not
  scroll sideways; `next build` prerenders it with no api running.

### Checks

- **AC12.** A test fails when the example data on `/ui-kit` does not match web's schemas.
- **AC13.** `npm run verify` passes; the backlog items "Colour swatches" and "Size order" are gone.

## Owner actions (Claude cannot do them)

- Merge the pull requests; after the deploy, check AC1 on production (the migration runs there).

## Assumptions

- The product page does not exist yet, so the card's link address is given by whoever places the
  card (K15, backlog "Product card link").
- The seed's attributes stay colour, material and season while this spec is in progress.
