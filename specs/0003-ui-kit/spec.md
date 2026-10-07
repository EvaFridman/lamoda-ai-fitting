# 0003 UI-kit

Status: accepted (2026-10-08).
Decisions this spec relies on: [clarifications.md](clarifications.md) (referred to by their ids, e.g. D5).

## Goal

`web` has no shared components yet: every page that follows (catalog, product, account, AI fitting)
would build its own buttons, filters and dialogs. This spec builds one set of components that look
and behave like lamoda.ru, and a showcase page at `/ui-kit` where each of them can be seen in every
state and tried out.

## In scope

- Design tokens: colours, type scale, spacing, borders, shadows, taken from the references (D1, D2).
  Light theme only (D8).
- The font (D4) and the icons (D3).
- The components of D5 and D5a. As seen in the references:
  - Filter chip: a rectangular bordered button with a chevron. Its states are default, open (darker
    border), applied (black fill, the filter name plus the chosen value, e.g. "Стиль вечерний", and
    a ×) and an on/off chip without a chevron ("Только со скидкой"). A "Очистить фильтры" link goes
    next to the chips.
  - Dropdowns opened from a chip:
    - sort: radio list, no button;
    - filter: checkbox list with counts and a black "Применить" button, with search for long lists;
    - price: a two-thumb slider, two underlined fields "Мин. цена" and "Макс. цена", and an
      "Применить" button that stays disabled until the range changes.
  - Buttons:
    - primary black in two sizes ("Добавить в корзину", "В корзину");
    - secondary with a border ("Оценить доставку", the full-width "Показать ещё");
    - square icon button with a border (favourite);
    - disabled grey.
  - Price:
    - current price alone in bold black;
    - with a discount, the current price in red after one or two struck-out old prices.
  - Badges: discount (red, "−40%"), club (light blue, "−7% club"), premium (black), promo (green,
    "до 25%").
  - Rating: "★ 4.7 (54)".
  - Tabs: large labels with an optional counter ("Отзывы 54"). The active tab is black and
    underlined; the others are grey.
  - Breadcrumbs: small grey links separated by "/".
  - Pagination: page numbers with the current one on a grey square, "Дальше →", and an "N из M"
    counter.
  - Order status (D5b).
  - Search field and select with a thumbnail (D5a).
  - Every other D5 component that the references do not show (TextField, Checkbox and Radio on
    their own, Switch, Spinner, colour swatches, size picker, Accordion, Modal, Drawer, Tooltip,
    Toast, Skeleton) follows the same tokens.
- The `/ui-kit` page (D10, D11).
- Component tests for `web` (D12).

## Non-goals

- Product card, order card (D6), header, footer, announcement bar, chat button and the other blocks
  of D6a.
- Mobile variants such as bottom sheets (D9) and a dark theme (D8).
- Real catalog, product or account pages, and any data from the api.
- The Lamoda logo and font files (D2).
- Screenshot (visual regression) tests.

## Acceptance criteria

### Page

- AC1. `GET /ui-kit` returns 200. The page has a section for every component of D5 and D5a, and
  the table of contents links to each section by anchor.
- AC2. The page carries `<meta name="robots" content="noindex">`.
- AC3. Each section shows every variant and state named in "In scope": default, hover, focus,
  disabled, error where the component has one, open or applied.
- AC4. The examples are live. A chip opens its dropdown, "Применить" turns the chip to applied, ×
  clears it, a tab switches its panel, the favourite toggle switches, a toast appears and goes
  away.
- AC5. At 375 px width the page does not scroll sideways.

### Look

- AC6. Side by side with the references, the components match in colour, size, spacing and copy.
  The owner accepts it on screenshots.
- AC7. The font is served from the site's own domain: loading `/ui-kit` makes no request to
  Google or any other host.

### Behaviour

- AC8. Keyboard only, with no mouse:
  - Tab reaches every control, and focus is visible;
  - Enter or Space opens a dropdown, select, dialog or drawer;
  - arrow keys move through options and tabs;
  - Esc closes the open layer, and focus returns to the control that opened it.
- AC9. A screen reader announces the role and state of chips, checkboxes, radios, switches, tabs,
  the dropdowns and dialogs (checked by the accessibility tree in the browser).

### Tooling

- AC10. Component tests for `web` run in `npm test` and in `npm run verify`. A broken component
  makes `verify` fail.
- AC11. The web image still builds with no api, Redis or database running.
- AC12. `git check-ignore specs/0003-ui-kit/references/<any file>` reports the file as ignored.

## Owner actions (Claude cannot do them)

- Save into `specs/0003-ui-kit/references/`:
  - the screenshots shared in chat on 2026-10-08 (order history, product page, catalog with the
    sort, filter and price dropdowns open, applied filters), so that later sessions can see them;
  - the three pages saved from the browser ("Save as…", complete page), for exact values and the
    icons;
  - screenshots of any component Lamoda shows that the set above misses (size picker, colour
    filter, a dialog, a toast, an error in a field), if you want them closer to the original.
    Personal data in the order history can stay: the folder is never committed (D1).
- Pick the font from the candidates in the plan (D4).
- Accept the screenshots of AC6.

## Assumptions

- References are desktop Chrome at about 1600 px wide.
- The Russian copy of the examples is taken from Lamoda.
- Components that Lamoda does not show in the references are designed by analogy with those it
  does, and the owner reviews them on the page.
