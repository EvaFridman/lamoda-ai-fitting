// Where the heading's "←" leads (spec 0020 W4, plan §2): back in the history when the previous
// page was this site's, else to `/catalog`; on `/catalog` itself, with no earlier page of this
// site, there is no arrow (`null`).
export type BackTarget = 'history' | 'catalog';

export const CATALOG_PATH = '/catalog';

export interface BackTargetInput {
  // The page's path.
  pathname: string;
  // The current entry's index among the tab's adjacent entries of this site (the Navigation API's
  // `navigation.currentEntry.index`), when the browser has it: above 0, the previous entry is this
  // site's (W26). Without it, the three below decide.
  entryIndex?: number;
  // The tab has moved to another path since the document loaded (a client-side step); a filter's
  // `router.replace` keeps the path, so it does not count.
  stepped: boolean;
  // `document.referrer`: kept across a reload, empty after a redirect, a bookmark or a new tab.
  referrer: string;
  // This site's origin.
  origin: string;
  // The tab has an earlier entry (`history.length > 1`): a page a link of this site opened in a new
  // tab has the referrer and nowhere to go back to (W26).
  hasHistory: boolean;
}

export function backTarget({
  pathname,
  entryIndex,
  stepped,
  referrer,
  origin,
  hasHistory,
}: BackTargetInput): BackTarget | null {
  const back =
    entryIndex === undefined
      ? stepped || (hasHistory && isOrigin(referrer, origin))
      : entryIndex > 0;
  if (back) return 'history';
  return pathname === CATALOG_PATH ? null : 'catalog';
}

function isOrigin(address: string, origin: string): boolean {
  if (address === '') return false;
  try {
    return new URL(address).origin === origin;
  } catch {
    return false;
  }
}
