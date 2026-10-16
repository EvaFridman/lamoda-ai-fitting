# 0010 web header

Status: accepted (2026-10-16); amended 2026-10-16 at the plan: working search field (L8, AC7a),
gender switch and city on narrow screens (L6), typed text out of attributes (L9); amended
2026-10-16 at T8: text typed before hydration is kept (L10), a query is at most 100 characters
(L11).

Issue #39. Decisions: `clarifications.md` (L1–L11).

## Goal

The site has Lamoda's footer (0008) but no header. This spec adds Lamoda's desktop header to every
page: the logo, the gender switch, the city, the profile, favourites and cart icons, the search
field and a row of catalog categories. Only the categories the catalog really has are shown (L3).
The search field works and keeps its query in the URL (L8); the rest is shown as on Lamoda but
does nothing yet (L5).

## In scope

- A header widget copied from the owner's screenshots and the saved Lamoda catalog page (L2),
  without the black announcement bar.
- The category row from the api's active categories, in their order (L3), as plain text (L4).
- Lamoda's logo, linking to `/` (L7).
- The gender switch, the city and the profile, favourites and cart icons, drawn as on Lamoda and
  inert (L5).
- The search field: typing, reset and submitting, with the query as `?q=` in the current URL (L8),
  and typed text kept out of element attributes (L9).
- A layout for narrow screens (L6).
- The header in the root layout, above every page, next to the footer.

## Non-goals

- Lamoda's other menu items ("Идеи", "Новинки", "Бренды", "Premium", "Скидки", …) and the
  drop-down menus that open under them.
- Links from the categories: they come with the catalog page spec (L4); a nested category tree
  (backlog "Category tree").
- Switching gender, choosing a city, an account, favourites and a cart (L5); search results and
  suggestions (L8).
- A burger menu and Lamoda's separate mobile header (L6); a header that sticks on scroll.
- Analytics events from the header.

## Acceptance criteria

### Look

- **AC1.** On every page (`/`, `/privacy`, `/ui-kit`, `/dev/catalog`) the header is above the page
  content and, at 1440 px, matches the owner's screenshots: gender switch and city on the left, the
  logo in the centre, profile, favourites and cart on the right; below them the category row and the
  search field. There is no announcement bar and no "15 лет" text.
- **AC2.** At 900 px and 375 px the page does not scroll sideways; the gender switch and the city
  are in a row above the logo and icons, which share one row, the search field is below them, and
  the category row scrolls sideways when it does not fit (L6).

### Categories

- **AC3.** The category row shows every active category of the api, in the api's category order
  and nothing else; a category made inactive through the api disappears on the next page load, and
  a new active one appears.
- **AC4.** Categories are not links: clicking one does not change the URL.
- **AC5.** With the api stopped, every page still answers 200 and shows the header without the
  category row; the rest of the header and the page render.

### Inert elements, the logo and search

- **AC6.** The logo links to `/`.
- **AC7.** Clicking the gender switch, the city or an icon changes neither the URL nor the page,
  and sends no request.
- **AC7a.** Typing " платье " in the search field and pressing Enter (or "Найти") adds `q=платье`
  to the current page's URL, keeping its other parameters; on reload, and on any page opened with
  `?q=`, the field shows the query. Submitting an empty or blank field changes nothing; the reset
  button empties the field.
- **AC8.** Neither text typed into the search field nor the query it shows from the URL appears in
  any attribute of any element.

### Build

- **AC9.** `npm run verify` passes; web's image builds with no api running.

## Owner actions (Claude cannot do them)

- Compare `qa-tester`'s screenshots at 1440, 900 and 375 px with Lamoda's header (AC1, AC2).

## Assumptions

- The categories stay a flat list of a few items (six in the demo catalog) that fits one row at
  1440 px.
- The profile icon is drawn as on the product page screenshot, without the "агент" badge of the
  catalog screenshot.
- Lamoda's CDN (a.lmcdn.ru) still serves the icon modules and CSS used by 0003 for the profile and
  bag icons and the header's sizes.
