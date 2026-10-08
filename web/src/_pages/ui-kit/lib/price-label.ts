import { formatAmount, formatPrice } from '@/shared/lib';
import type { PriceRange } from '@/shared/ui';

// The text of an applied price chip (D7k): "от 1 500 до 9 000 ₽", "от 1 500 ₽", "до 9 000 ₽", or
// "3 000 ₽" when both thumbs stand on one price; undefined while the range is the whole of the
// bounds, so the chip is not applied.
export function priceLabel([min, max]: PriceRange, [from, to]: PriceRange): string | undefined {
  if (from === to) return formatPrice(from);
  if (from !== min && to !== max) return `от ${formatAmount(from)} до ${formatPrice(to)}`;
  if (from !== min) return `от ${formatPrice(from)}`;
  if (to !== max) return `до ${formatPrice(to)}`;
  return undefined;
}
