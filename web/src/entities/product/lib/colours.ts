import type { ProductDetail } from '../model/schemas';

// A product's colours (spec 0019 A76, A91): every value of its colour attribute, the one whose
// values carry a swatch colour, as `splitFacetAttributes` tells a colour filter. A value of it with
// no swatch («в полоску») is a colour too, drawn as an empty circle; the api takes the same ones.
export function productColours(
  product: Pick<ProductDetail, 'attributes'> | undefined,
): ProductDetail['attributes'][number]['values'] {
  const attribute = product?.attributes.find(({ values }) =>
    values.some((value) => value.colorHex !== null),
  );
  return attribute ? attribute.values : [];
}
