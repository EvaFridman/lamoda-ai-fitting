interface ColouredAttribute {
  values: readonly { colorHex: string | null }[];
}

// A colour attribute: at least one value has a colour, so the filter draws swatches. Any attribute
// may be coloured, not only "Цвет" (K5).
export function isColourAttribute(attribute: ColouredAttribute): boolean {
  return attribute.values.some((value) => value.colorHex !== null);
}

// Colour attributes and the rest, each in the api's order.
export function splitFacetAttributes<T extends ColouredAttribute>(
  attributes: readonly T[],
): { colours: T[]; others: T[] } {
  const colours: T[] = [];
  const others: T[] = [];
  for (const attribute of attributes) {
    (isColourAttribute(attribute) ? colours : others).push(attribute);
  }
  return { colours, others };
}

// The chip's text after its title: the one chosen name, or how many are chosen ("Цвет 2"); nothing
// when none is.
export function chipValue(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  return names.length === 1 ? names[0] : String(names.length);
}
