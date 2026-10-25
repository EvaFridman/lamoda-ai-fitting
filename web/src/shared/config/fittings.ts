// The history of fittings, the account's section «Мои примерки».
export const FITTINGS_HREF = '/customer/fittings';

// Where a fitting opens in the try-on window: the history's page, for the toast's «Открыть», the
// history's cards and the product page's «Вы это примеряли» (spec 0019 A77.6, A82). Its id is cut
// from the analytics' addresses (`strip-attributes.ts`).
export function fittingHref(id: string): string {
  return `${FITTINGS_HREF}?fitting=${encodeURIComponent(id)}`;
}

// The page comparing two fittings side by side (spec 0019 A93).
export const FITTINGS_COMPARE_HREF = `${FITTINGS_HREF}/compare`;

// The compare page of two fittings; their ids are cut from the analytics' addresses too.
export function compareHref(a: string, b: string): string {
  return `${FITTINGS_COMPARE_HREF}?${new URLSearchParams({ a, b }).toString()}`;
}
