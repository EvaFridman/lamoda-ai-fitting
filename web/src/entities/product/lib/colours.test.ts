import { describe, expect, it } from 'vitest';

import { productColours } from './colours';

const value = (id: string, name: string, colorHex: string | null) => ({
  id,
  value: name,
  colorHex,
});
const attribute = (name: string, values: ReturnType<typeof value>[]) => ({
  attribute: { id: `attr-${name}`, name },
  values,
});

describe('productColours (spec 0019 A76, A91)', () => {
  it('is every value of the attribute with a coloured value, one with no swatch too', () => {
    const red = value('1', 'красный', '#FF0000');
    const striped = value('2', 'в полоску', null);
    const product = { attributes: [attribute('Цвет', [red, striped])] };

    expect(productColours(product)).toEqual([red, striped]);
  });

  it('takes the first colour attribute and ignores a season or a material', () => {
    const season = attribute('Сезон', [value('s', 'демисезон', null)]);
    const first = attribute('Цвет', [value('1', 'синий', '#0000FF')]);
    const second = attribute('Принт', [value('3', 'зелёный', '#00FF00')]);

    expect(productColours({ attributes: [season, first, second] })).toEqual(first.values);
  });

  it('is empty when no attribute has a coloured value', () => {
    const product = {
      attributes: [
        attribute('Сезон', [value('s', 'демисезон', null)]),
        attribute('Цвет', [value('2', 'в полоску', null)]),
      ],
    };

    expect(productColours(product)).toEqual([]);
  });

  it('is empty for a product without attributes or not yet read', () => {
    expect(productColours({ attributes: [] })).toEqual([]);
    expect(productColours(undefined)).toEqual([]);
  });
});
