import { describe, expect, it } from 'vitest';

import { chipValue, splitFacetAttributes } from './facets';

const attribute = (name: string, hexes: (string | null)[]) => ({
  name,
  values: hexes.map((colorHex, index) => ({ name: `v${index}`, colorHex })),
});

describe('splitFacetAttributes', () => {
  it('puts an attribute with a coloured value into colours, the rest into others', () => {
    const colour = attribute('Цвет', ['#ff0000', '#00ff00']);
    const material = attribute('Материал', [null, null]);
    expect(splitFacetAttributes([material, colour])).toEqual({
      colours: [colour],
      others: [material],
    });
  });

  it('counts one coloured value among many', () => {
    const mixed = attribute('Принт', [null, null, '#123456']);
    expect(splitFacetAttributes([mixed])).toEqual({ colours: [mixed], others: [] });
  });

  it('is not tied to the name "Цвет"', () => {
    const shade = attribute('Оттенок', ['#abcdef']);
    const plain = attribute('Цвет', [null]);
    expect(splitFacetAttributes([shade, plain])).toEqual({ colours: [shade], others: [plain] });
  });

  it('keeps the input order in both lists', () => {
    const a = attribute('A', ['#111111']);
    const b = attribute('B', [null]);
    const c = attribute('C', ['#222222']);
    const d = attribute('D', [null]);
    const { colours, others } = splitFacetAttributes([a, b, c, d]);
    expect(colours).toEqual([a, c]);
    expect(others).toEqual([b, d]);
  });

  it('treats an attribute with no values as not coloured, and an empty input as empty', () => {
    const empty = attribute('Пусто', []);
    expect(splitFacetAttributes([empty])).toEqual({ colours: [], others: [empty] });
    expect(splitFacetAttributes([])).toEqual({ colours: [], others: [] });
  });
});

describe('chipValue', () => {
  it('is undefined when nothing is chosen', () => {
    expect(chipValue([])).toBeUndefined();
  });

  it('is the name when one is chosen', () => {
    expect(chipValue(['Красный'])).toBe('Красный');
  });

  it('is the count as a string when two or more are chosen', () => {
    expect(chipValue(['Красный', 'Синий'])).toBe('2');
    expect(chipValue(['a', 'b', 'c', 'd'])).toBe('4');
  });
});
