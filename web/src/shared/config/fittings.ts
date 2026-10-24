// The history of fittings, the account's section «Мои примерки».
export const FITTINGS_HREF = '/customer/fittings';

// Where a fitting opens: the try-on's temporary entry on the history's page (spec 0019 T15) until
// the history (T16) and the product page (T20) open it themselves. Its id is cut from the analytics'
// addresses (`strip-attributes.ts`).
export function fittingHref(id: string): string {
  return `${FITTINGS_HREF}?fitting=${encodeURIComponent(id)}`;
}
