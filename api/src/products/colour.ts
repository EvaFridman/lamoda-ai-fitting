import type { Prisma } from '../generated/prisma/client.js';

// A colour of a product (spec 0019 A76, A91): a value of a colour attribute, one with at least one
// value that carries a swatch, as web's colour filter tells it. A value of it with no swatch
// («в полоску») is a colour; a season or a material is none. The fitting room and the fittings
// take only these as an item's colour.
export const COLOUR_VALUE = {
  attribute: { values: { some: { colorHex: { not: null } } } },
} satisfies Prisma.AttributeValueWhereInput;
