// The site's name (spec 0014 O25): titles, link previews and structured data.
export const SITE_NAME = 'Lamoda AI Fitting';

// A page's full title: "Платья — Виртуальная примерка | Lamoda AI Fitting" (O25).
export function siteTitle(pageTitle: string): string {
  return `${pageTitle} — Виртуальная примерка | ${SITE_NAME}`;
}

// The root layout's title template: the same title around Next's `%s`.
export const SITE_TITLE_TEMPLATE = siteTitle('%s');
