# 0014 catalog page

Status: accepted (2026-10-19); amended 2026-10-19 at the plan after the owner's Lamoda references:
the row of applied filters and the breadcrumbs (AC3, AC7, O5), search by article (AC8, O14);
amended 2026-10-19 after the check against 0012, 0013 and 0015 (AC6, AC15, AC18, O33–O39).

Issues #68 and #71. Decisions: `clarifications.md` (O1–O39).

## Goal

The site opens on the product catalog. A visitor scrolls through it and narrows it by category,
filters and search. Search engines and screen readers read it correctly. The bootstrap welcome
page goes.

## In scope

- `/catalog` and `/catalog/<slug>`; `/` redirects to `/catalog` (O3, O4).
- A Lamoda layout on desktop and a bottom sheet of filters on phones (O5, O6).
- Infinite scroll with virtualization, keyset paging of the product list, return to the same place
  (O10–O12).
- Every filter of 0009, the sort, and full-text search; all of them in the URL (O9, O14).
- Header search opens the catalog; header categories become links (O15, O16).
- Cards link to `/products/<id>` (O7).
- Indexes, a cache for the filter counts, the database pool with its timeouts (O17, O18, O36), a
  stable facets test (O38).
- nginx's rate limit for pages and for `/media/`, and a full CSP (O19, O20, O24, O39).
- The proxy secret tainted against reaching the browser (O37).
- Catalog analytics in the event catalog of spec 0015 (O22, O23, O35).
- SEO and accessibility of the catalog (O25–O30, O32).
- A development-only script for a large catalog (O13).
- Removal of the greeting, `/hello`, the Temporal `hello` workflow and `/dev/catalog`; web's own
  `/healthz` (O8, O33, O34).

## Non-goals

- The product page (the card's link answers 404 until then, O7).
- A category tree, sizes off the scale, cache warm-up on deploy and a page cache (O21).
- Search by relevance and typo tolerance (O14).
- Webmaster registration (O31).
- A larger production catalog (O13).

## Acceptance criteria

### Address and page

- **AC1.** `GET /` answers a permanent redirect to `/catalog`. `/catalog` shows every active
  product. `/catalog/<slug>` shows one category, with its name in the breadcrumbs and the title.
- **AC2.** `/catalog/<unknown slug>` and the slug of an inactive category answer 404.
- **AC3.** At 1440 px the page shows, in this order:
  - breadcrumbs "Каталог / <category>";
  - the title with the product count;
  - the category list on the left, the chosen one black;
  - the row of chips: the sort first, then the filters, an applied filter black with its value
    and a ×, and "Очистить фильтры" at the end while any filter is applied;
  - a grid of four cards per row.
- **AC4.** At 375 px the grid has two columns. "Фильтры" opens a bottom sheet with every filter as an
  accordion. Applying a filter there changes the list and the URL.
- **AC5.** Each card's link is `/products/<id>`.
- **AC6.** These are gone, from the code and from the api's OpenAPI document:
  - `/hello` and the Temporal `hello` workflow;
  - the greeting;
  - `/dev/catalog`.
    web's container health check uses `/healthz`, which answers 200 with the api stopped.

### Filters, sort and search

- **AC7.** Applying, changing or clearing any filter or the sort (in its dropdown or with a chip's ×)
  updates the list, the counts and the URL. Opening that URL in a new tab shows the same selection
  and products. "Очистить фильтры" clears every filter and the search and keeps the category and the
  sort.
- **AC8.** The search "платья" finds products named "Платье". "плат" finds them too. A brand's name
  finds that brand's products, and a category's name finds that category's products. A product's
  article, in any case, finds that product. "плтье" finds nothing and shows the empty result.
- **AC9.** The header search, submitted on `/privacy` or on `/catalog/<slug>?brandId=…`, opens
  `/catalog?q=<query>` with no category, filter or sort. Each header category links to its
  `/catalog/<slug>`.
- **AC10.** A selection with no products shows a "nothing found" message and a way to clear the
  filters.

### Scrolling

- **AC11.** With the large local catalog (O13), scrolling to the end loads the next batches until the
  last product. The page's DOM holds at most a few rows of cards beyond the visible ones.
- **AC12.** A product added while scrolling does not make any product appear twice or go missing in
  the list being scrolled. This is checked by a test on the api.
- **AC13.** After scrolling several batches, opening a card and going back, the same batches show at
  the same position.

### Performance and protection

- **AC14.** On the large local catalog, every sort and a search over the list use an index. This is
  checked with the query plan, recorded in `tasks.md`.
- **AC15.** A second identical request for filter counts within the cache period does not reach the
  database. With the database's statement timeout reached, or no free connection within the
  connection timeout, the request fails with the api's 503 and `/health` still answers.
- **AC16.** In production, a client over the page rate limit gets 429 in the api's error format. One
  ordinary catalog visit with its prefetches stays under the limit.
- **AC17.** In production the pages carry a Content Security Policy. The browser console shows no
  policy violation on `/catalog`, with and without analytics consent.

### Analytics

- **AC18.** With consent, applying a filter, sorting, searching and loading a batch each send their
  event (O22). Clicking or hovering over a card, a category or a filter sends a tracked element. No
  event carries the search text or a product's id, and every one passes 0015's catalog checks (O35).
  Without consent nothing is sent.

### SEO and accessibility

- **AC19.** `/catalog` and each category carry:
  - their title and description (O25);
  - a canonical address without parameters;
  - Open Graph and Twitter tags with an image that opens.
    An address with `q` or a filter carries `noindex`.
- **AC20.** `/sitemap.xml` lists `/catalog` and every active category. `/robots.txt` names the
  sitemap.
- **AC21.** The structured data (breadcrumbs, the product list, the site with its search, the
  organization) passes Google's Rich Results test and Yandex's validator.
- **AC22.** With JavaScript off, `/catalog` shows its first batch. "Дальше" opens the next batch as a
  page from the server.
- **AC23.** In production, Lighthouse gives 100 for SEO and 100 for Accessibility on `/catalog` and on
  one category. Screen readers and the keyboard:
  - a screen reader announces the result count after a filter is applied;
  - every filter, chip and the bottom sheet can be used with the keyboard alone;
  - focus does not jump when a batch loads.

### Build

- **AC24.** `npm run verify` passes, and the web image still builds with no api, Redis or database
  running.

## Owner actions (Claude cannot do them)

- Run Lighthouse and the structured-data validators in production and post the results (AC21, AC23),
  or confirm `qa-tester`'s run.
- Compare the screenshots at 1440 and 375 px with Lamoda's catalog (AC3, AC4).

## Assumptions

- Categories stay flat and few, and fit the left column without a tree.
- The cards, filters, category list and UI kit pieces of 0003 and 0009 are reused as they are,
  except for the phone forms of the filters (O6).
- Spec 0015's event catalog is on `main` before T20 (O35).
- Once spec 0012 is on `main`, a deploy with migrations (PR 2's) stores a database copy first, and a
  failed copy stops that deploy (0012 P3).
