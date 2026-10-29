// What the scroll-up after a change reads, in page coordinates (top + window.scrollY).
export interface ScrollBoxes {
  // The heading row and the bar, while they stick to the window's top (below 600px, spec 0020
  // W28): their height. `null` while they do not stick.
  stuckHeight: number | null;
  // The bar's top, or `null` while it does not show (from 1024px).
  barTop: number | null;
  // The list's column's top.
  columnTop: number;
}

// Where the page goes up to after a filter, the sort or "Очистить фильтры" changes (0014 O82),
// when the visitor is below it: where the list starts under the stuck block below 600px, the
// "Фильтры" button from 600 to 1023px, the column with its chips from 1024px.
export function scrollTarget({ stuckHeight, barTop, columnTop }: ScrollBoxes): number {
  if (stuckHeight !== null) return underStuck(columnTop, stuckHeight);
  return barTop ?? columnTop;
}

// Where an element's top sits right under the stuck block (W28).
export function underStuck(top: number, stuckHeight: number): number {
  return Math.max(0, top - stuckHeight);
}
