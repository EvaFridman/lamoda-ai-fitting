// A page number, or a gap shown as "…" in place of the pages it hides: before the current page or
// after it.
export type PageItem = number | 'gap-start' | 'gap-end';

/**
 * The pages a pagination shows (D7x): the first, the last, the current one and its neighbours, a
 * gap for each run of hidden pages: "1 … 4 5 6 … 10". A gap never hides a single page: that page
 * is shown instead ("1 2 3 4 5 … 10", not "1 … 3 4 5 … 10").
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount < 1) return [];
  const current = Math.min(Math.max(page, 1), pageCount);
  const shown = [...new Set([1, current - 1, current, current + 1, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);

  const items: PageItem[] = [];
  let previous: number | undefined;
  for (const n of shown) {
    if (previous !== undefined && n - previous === 2) items.push(previous + 1);
    else if (previous !== undefined && n - previous > 2) {
      items.push(n > current ? 'gap-end' : 'gap-start');
    }
    items.push(n);
    previous = n;
  }
  return items;
}
