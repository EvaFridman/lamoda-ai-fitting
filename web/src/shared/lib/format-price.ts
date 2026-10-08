const format = (fractionDigits: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const wholeRubles = format(0);
const withKopecks = format(2);
const amount = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/**
 * A price in rubles as shown to the visitor: "1 299 ₽", "1 299,50 ₽" (spec 0003, D13). Kopecks show
 * only when there are any; the spaces are no-break (U+00A0), so a price never wraps. With
 * `currency: false` the same digits come without "₽": an old, struck-out price ("10 399", D7r).
 */
export function formatPrice(
  value: number,
  { currency = true }: { currency?: boolean } = {},
): string {
  const hasKopecks = Math.round(value * 100) % 100 !== 0;
  const formatter = hasKopecks ? withKopecks : wholeRubles;
  if (currency) return formatter.format(value);
  return formatter
    .formatToParts(value)
    .filter((part) => part.type !== 'currency')
    .map((part) => part.value)
    .join('')
    .trimEnd();
}

/**
 * Whole rubles without "₽", grouped as formatPrice groups them: "1 500" for a price field or the
 * first price of a range ("от 1 500 до 9 000 ₽").
 */
export function formatAmount(value: number): string {
  return amount.format(value);
}
