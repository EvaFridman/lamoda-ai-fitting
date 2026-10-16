# 0010 web header: clarifications

Status: done (2026-10-16). History, not instructions.

The owner's decisions for this spec. Ids `L1`, `L2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-16.

## Order

- **L1. Number and branch.** This spec is 0010, for issue #39, written while 0009 is in progress.
  Its branches start from `main`; where both change the UI kit's icons or `/ui-kit`, the later
  branch is rebased onto the earlier one when it merges.

## Scope

- **L2. Lamoda's desktop header.** The header copies Lamoda's, from the owner's two screenshots
  (catalog page and product page) and the saved catalog page HTML of 2026-10-16. The black
  announcement bar ("Lamoda 15 лет! …") is left out.
- **L3. Categories from the api.** The menu row holds the catalog's categories instead of Lamoda's
  items: the active categories of `GET /categories`, in the api's order, read on the server at
  request time. If the request fails, the row is empty and the rest of the header renders.
- **L4. Categories are text.** No catalog page exists yet, so each category is plain text, as the
  footer's items are (0008 J22). They become links with the catalog page spec.
- **L5. Inert elements look as on Lamoda.** "Женщинам" with its chevron, the city ("Укажите ваш
  населенный пункт") and the profile, favourites and cart icons are drawn as on Lamoda and do
  nothing: they are disabled for assistive technology. Each gets its behaviour with the spec that
  brings it. (The search field was inert here too; L8 makes it work.)
- **L6. Narrow screens.** Below 1024 px: "Женщинам" and the city in a row of their own, then the
  logo and icons in one row, the search field under them, then the category row, which scrolls
  sideways. No burger menu. (Amended at the plan: the gender switch and the city stay visible.)
- **L7. Lamoda's logo.** The header shows Lamoda's logo, the SVG from the saved page, linking to
  `/`. This lifts 0003 D2 ("No Lamoda logo") for the logo; the risk is the one accepted for the
  icons in 0003 D3: someone else's graphics in a public repository and on the production site.
- **L8. The search field works, results come later.** Typing, the reset button and submitting
  (Enter or "Найти") work. Submitting a non-empty query puts it into the current page's URL as
  `?q=<query>` (trimmed; other parameters stay), and the field shows `q` from the URL on any page.
  No page shows results yet: they come with the catalog page spec. (Owner, at the plan.)
- **L9. Typed text stays out of attributes.** The kit's `SearchField`, when not given a `value`,
  keeps what is typed, and the query it starts from, out of the input's `value` attribute, so
  recordings and the SDK's click events cannot carry it (CLAUDE.md, analytics). (Owner, at the
  plan.)
- **L10. Text typed before hydration is kept.** In the prerendered shell `useSearchParams` makes
  React render the search in the browser and throw away the fallback field, with what was typed
  into it and its focus. The search renders per request instead, after `connection()`, so the server
  sends it with the real `q` in the same response, the browser hydrates it, and the kit keeps text
  typed before hydration. What is typed in the few milliseconds between the shell and that part of
  the stream is still lost; accepted. (Owner, at T8.)
- **L11. A query is at most 100 characters.** The api's limit for the product search: the field
  takes no more (`maxLength`), and a longer `q` in the URL is shown cut to 100. Without a limit a
  query of a few thousand characters made the URL too long and the server answered 431 with the
  browser's error page. (Owner, at T8.)
