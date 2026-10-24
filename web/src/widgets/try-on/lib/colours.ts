import type { Fitting } from '@/entities/fitting';
import type { ProductDetail } from '@/entities/product';
import type { TryColour } from '@/features/try-colour';

// A product's colours (spec 0019 A76): the values of its colour attribute, the one whose values
// carry a swatch colour (as `splitFacetAttributes` tells a colour filter).
export function productColours(product: ProductDetail | undefined): TryColour[] {
  const attribute = product?.attributes.find(({ values }) =>
    values.some((value) => value.colorHex !== null),
  );
  return attribute ? attribute.values : [];
}

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
