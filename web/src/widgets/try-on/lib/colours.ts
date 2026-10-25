import type { Fitting } from '@/entities/fitting';

// A product's colours: the entity's rule (spec 0019 A76, A91), shared with the buy box and the
// fitting room.
export { productColours } from '@/entities/product';

// The colours of the product already tried on the photo: completed try-ons of one item from the
// loaded history (A7: they open at once and spend nothing).
export function triedColours(
  fittings: readonly Fitting[],
  photoId: string | null,
  productId: string | undefined,
): Set<string> {
  const tried = new Set<string>();
  if (photoId === null || productId === undefined) return tried;
  for (const fitting of fittings) {
    const item = fitting.items[0];
    if (
      fitting.kind === 'single' &&
      fitting.status === 'completed' &&
      fitting.photoId === photoId &&
      item?.productId === productId &&
      item.attributeValueId !== null
    ) {
      tried.add(item.attributeValueId);
    }
  }
  return tried;
}
