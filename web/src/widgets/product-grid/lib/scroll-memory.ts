// Where the list was, per address (path and query), kept for the tab's session, so going back to
// it shows the same place (spec 0014 O12): the window's scroll offset, a row's height, so the
// rows above it, not rendered on return, are counted at their real height, and how many products
// were loaded, so a page loaded anew loads as many before it scrolls. Storage may be off or full:
// then nothing is kept and nothing is restored.
const PREFIX = 'catalog-scroll:';

export interface ScrollMemory {
  offset: number;
  rowHeight?: number;
  count?: number;
}

// The address's key, its query in one encoding whether it comes from the router
// (`useSearchParams`) or from `location`.
export function scrollKey(pathname: string, search: string | URLSearchParams): string {
  const query = new URLSearchParams(search).toString();
  return `${PREFIX}${pathname}${query === '' ? '' : `?${query}`}`;
}

// The key of the address in the address bar now.
export function currentScrollKey(): string {
  return scrollKey(location.pathname, location.search);
}

export function saveScroll(key: string, { offset, rowHeight, count }: ScrollMemory): void {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        offset: Math.round(offset),
        rowHeight: rowHeight && Math.round(rowHeight),
        count,
      }),
    );
  } catch {
    // Not kept.
  }
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function readScroll(key: string): ScrollMemory | undefined {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (typeof value !== 'object' || value === null) return undefined;
    const fields = value as Record<string, unknown>;
    const offset = positive(fields.offset);
    const rowHeight = positive(fields.rowHeight);
    const count = positive(fields.count);
    return offset === undefined
      ? undefined
      : { offset, rowHeight, count: Number.isInteger(count) ? count : undefined };
  } catch {
    return undefined;
  }
}

// Whether this document was loaded anew by a step through the history ("Back", "Forward") to the
// list's address (`key`): only then does the list restore its place (O77). A client-side step needs
// nothing: Next shows again the list it kept hidden, with its batches, and the browser puts the
// scroll back itself. Only the first list that shows in the document counts, not one a link opens
// later.
let firstShow = true;

function loadedKey(entry: PerformanceEntry): string | undefined {
  try {
    const url = new URL(entry.name);
    return scrollKey(url.pathname, url.searchParams);
  } catch {
    return undefined;
  }
}

export function isLoadedByTraversal(key: string): boolean {
  return (
    firstShow &&
    performance
      .getEntriesByType('navigation')
      .some(
        (entry) =>
          (entry as PerformanceNavigationTiming).type === 'back_forward' &&
          loadedKey(entry) === key,
      )
  );
}

export function endFirstShow(): void {
  firstShow = false;
}
