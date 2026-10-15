interface ColouredAttribute {
  values: readonly { colorHex: string | null }[];
}

// Colour attributes (at least one value has a colour: the filter draws swatches) and the rest, each
// in the api's order. Any attribute may be coloured, not only "Цвет" (K5).
export function splitFacetAttributes<T extends ColouredAttribute>(
  attributes: readonly T[],
): { colours: T[]; others: T[] } {
  const colours: T[] = [];
  const others: T[] = [];
  for (const attribute of attributes) {
    (attribute.values.some((value) => value.colorHex !== null) ? colours : others).push(attribute);
  }
  return { colours, others };
}

// The chip's text after its title: the one chosen name, or how many are chosen ("Цвет 2"); nothing
// when none is.
export function chipValue(names: readonly string[]): string | undefined {
  if (names.length === 0) return undefined;
  return names.length === 1 ? names[0] : String(names.length);
}
